/*
 * Modified copy of CapacitorNodeJS.java from capacitor-nodejs 1.0.0-beta.10
 * (https://github.com/hampoelz/Capacitor-NodeJS, MIT License, (c) Rene Hampölz).
 * Copied over the original by launcher/android/scripts/patch-plugins.mjs.
 *
 * Changes for Cream Soda:
 *  - The engine state and the Node.js process are per process, not per plugin
 *    instance. Android recreates the activity (and the plugin) while the process
 *    lives on, e.g. after «Назад» on Android 11 and older, a font size change or
 *    memory pressure, and the foreground service keeps the process alive. The
 *    original then called node::Start a second time, which Node.js does not
 *    support: the app crashed or hung on startup. Now the new instance reuses the
 *    running engine and receives its messages.
 *  - The Node.js project is copied out of the APK only after an install/update
 *    (the original copied ~1300 files on every start), and the update time is
 *    saved only after a successful copy, so a failed copy is retried.
 *  - Messages from Node.js are handled on the main thread instead of inside the
 *    JNI callback on the Node.js thread (which has no Looper): Capacitor then
 *    posts them to the WebView like any other plugin result, and a Java exception
 *    can't stay pending on the Node.js thread and break later messages.
 *  - Startup steps, messages and the exit of Node.js go to the Android log
 *    (tag CreamSoda/Node, readable from the launcher's «Логи»), and an exit of
 *    Node.js reaches the launcher as a «status» event with the exit code.
 */
package net.hampoelz.capacitor.nodejs;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.res.AssetManager;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import androidx.annotation.Nullable;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.PluginCall;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import org.json.JSONException;
import org.json.JSONObject;

public class CapacitorNodeJS {

    private static final String LOG_TAG = "CreamSoda/Node";
    private static final Handler mainThread = new Handler(Looper.getMainLooper());

    private PackageInfo packageInfo;
    private final Context context;
    private final SharedPreferences preferences;
    private final CapacitorNodeJSPlugin.PluginEventNotifier eventNotifier;
    // Shared by every plugin instance in this process (see the header).
    private static final EngineStatus engineStatus = new EngineStatus();
    private static final NodeProcess nodeProcess = new NodeProcess(new ReceiveCallback());
    private static volatile CapacitorNodeJS current;

    protected CapacitorNodeJS(Context context, CapacitorNodeJSPlugin.PluginEventNotifier eventNotifier) {
        this.context = context;
        this.preferences = context.getSharedPreferences(CapacitorNodeJSPlugin.PREFS_TAG, Context.MODE_PRIVATE);
        this.eventNotifier = eventNotifier;
        current = this;

        try {
            this.packageInfo = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
        } catch (PackageManager.NameNotFoundException e) {
            Logger.error(CapacitorNodeJSPlugin.LOGGER_TAG, "Failed to get the application's package information.", e);
        }
    }

    private static class EngineStatus {

        private final ArrayList<PluginCall> whenEngineReadyListeners = new ArrayList<>();
        private boolean isEngineStarted = false;
        private boolean isEngineReady = false;

        protected synchronized void setStarted() {
            isEngineStarted = true;
        }

        protected synchronized boolean isStarted() {
            return isEngineStarted;
        }

        protected synchronized void setReady() {
            isEngineReady = true;

            while (!whenEngineReadyListeners.isEmpty()) {
                final PluginCall whenEngineReadyListener = whenEngineReadyListeners.get(0);
                whenEngineReadyListeners.remove(0);
                whenEngineReadyListener.resolve();
            }
        }

        protected synchronized boolean isReady() {
            return isEngineReady;
        }

        protected synchronized void resolveWhenReady(PluginCall call) {
            if (this.isReady()) {
                call.resolve();
            } else {
                whenEngineReadyListeners.add(call);
            }
        }
    }

    protected void startEngine(
        @Nullable PluginCall call,
        String projectDir,
        @Nullable String mainFile,
        String[] args,
        Map<String, String> env
    ) {
        final var callWrapper = new Object() {
            public void resolve() {
                if (call != null) {
                    call.resolve();
                }
            }

            public void reject(String message) {
                if (call != null) {
                    call.reject(message);
                } else {
                    Logger.debug(CapacitorNodeJSPlugin.LOGGER_TAG, message);
                }
            }

            public void reject(String message, Exception e) {
                if (call != null) {
                    call.reject(message, e);
                } else {
                    Logger.error(CapacitorNodeJSPlugin.LOGGER_TAG, message, e);
                }
            }
        };

        if (engineStatus.isStarted()) {
            callWrapper.reject("The Node.js engine has already been started.");
            return;
        }
        engineStatus.setStarted();

        Thread engine = new Thread(() -> {
            final String filesPath = context.getFilesDir().getAbsolutePath();
            final String cachePath = context.getCacheDir().getAbsolutePath();

            final String basePath = FileOperations.CombinePath(filesPath, "nodejs");
            final String projectPath = FileOperations.CombinePath(basePath, "public");
            final String modulesPath = FileOperations.CombinePath(basePath, "builtin_modules");
            final String dataPath = FileOperations.CombinePath(basePath, "data");

            final boolean copyNodeProjectSuccess = copyNodeProjectFromAPK(projectDir, projectPath, modulesPath);
            if (!copyNodeProjectSuccess) {
                Log.e(LOG_TAG, "Не удалось скопировать Node-проект из APK в " + projectPath);
                callWrapper.reject("Unable to copy the Node.js project from APK.");
                return;
            }

            if (!FileOperations.ExistsPath(projectPath)) {
                callWrapper.reject("Unable to access the Node.js project. (No such directory)");
                return;
            }

            final boolean createDataDirSuccess = FileOperations.CreateDir(dataPath);
            if (!createDataDirSuccess) {
                Logger.debug(CapacitorNodeJSPlugin.LOGGER_TAG, "Unable to create a directory for persistent data storage.");
            }

            final String projectPackageJsonPath = FileOperations.CombinePath(projectPath, "package.json");

            String projectMainFile = "index.js";
            if (mainFile != null && !mainFile.isEmpty()) {
                projectMainFile = mainFile;
            } else if (FileOperations.ExistsPath(projectPackageJsonPath)) {
                try {
                    final String projectPackageJsonData = FileOperations.ReadFileFromPath(projectPackageJsonPath);
                    final JSONObject projectPackageJson = new JSONObject(projectPackageJsonData);
                    final String projectPackageJsonMainFile = projectPackageJson.getString("main");

                    if (!projectPackageJsonMainFile.isEmpty()) {
                        projectMainFile = projectPackageJsonMainFile;
                    }
                } catch (JSONException | IOException e) {
                    callWrapper.reject("Failed to read the package.json file of the Node.js project.", e);
                    return;
                }
            }

            final String projectMainPath = FileOperations.CombinePath(projectPath, projectMainFile);

            if (!FileOperations.ExistsPath(projectMainPath)) {
                callWrapper.reject("Unable to access main script of the Node.js project. (No such file)");
                return;
            }

            final String modulesPaths = FileOperations.CombineEnv(projectPath, modulesPath);

            final Map<String, String> nodeEnv = new HashMap<>();
            nodeEnv.put("DATADIR", dataPath);
            nodeEnv.put("NODE_PATH", modulesPaths);
            nodeEnv.putAll(env);

            Log.i(LOG_TAG, "Запускаю Node.js: " + projectMainPath);
            final int exitCode = nodeProcess.start(projectMainPath, args, nodeEnv, cachePath);
            Log.e(LOG_TAG, "Node.js завершился, код " + exitCode);
            notifyEngineExit(exitCode);
            callWrapper.resolve();
        });

        engine.start();
    }

    /** Tells the launcher that the engine is gone (Node.js can't be restarted in this process). */
    private static void notifyEngineExit(int exitCode) {
        mainThread.post(() -> notifyEngineExitNow(exitCode));
    }

    private static void notifyEngineExitNow(int exitCode) {
        final CapacitorNodeJS target = current;
        if (target == null) return;
        try {
            final JSObject status = new JSObject();
            status.put("stage", "error");
            status.put("fatal", true);
            status.put("error", "Node.js завершился (код " + exitCode + ")");
            final JSArray args = new JSArray();
            args.put(status);
            target.eventNotifier.channelReceive("status", args);
        } catch (Exception e) {
            Log.e(LOG_TAG, "Не удалось сообщить лаунчеру о завершении Node.js", e);
        }
    }

    protected void resolveWhenReady(PluginCall call) {
        if (!engineStatus.isStarted()) {
            call.reject("The Node.js engine has not been started yet.");
            return;
        }

        engineStatus.resolveWhenReady(call);
    }

    protected void sendMessage(PluginCall call) {
        if (!engineStatus.isStarted()) {
            call.reject("The Node.js engine has not been started yet.");
            return;
        }

        if (!engineStatus.isReady()) {
            call.reject("The Node.js engine is not ready yet.");
            return;
        }

        final String eventName = call.getString("eventName");
        final JSArray args = call.getArray("args", new JSArray());

        Log.i(LOG_TAG, "→ Node.js: " + eventName);
        sendMessage(CapacitorNodeJSPlugin.CHANNEL_NAME_EVENT, eventName, args);

        call.resolve();
    }

    protected void sendMessage(String channelName, String eventName, JSArray args) {
        if (eventName == null || args == null) return;

        final String eventMessage = args.toString();

        final JSObject data = new JSObject();
        data.put("eventName", eventName);
        data.put("eventMessage", eventMessage);

        final String channelMessage = data.toString();

        nodeProcess.send(channelName, channelMessage);
    }

    // Messages from Node.js go to the newest plugin instance, i.e. the live WebView.
    private static class ReceiveCallback implements NodeProcess.ReceiveCallback {

        @Override
        public void receive(String channelName, String message) {
            mainThread.post(() -> {
                final CapacitorNodeJS target = current;
                if (target == null) return;
                try {
                    target.receiveMessage(channelName, message);
                } catch (Exception e) {
                    Log.e(LOG_TAG, "Ошибка при обработке сообщения от Node.js", e);
                }
            });
        }
    }

    protected void receiveMessage(String channelName, String channelMessage) {
        try {
            final JSObject payload = new JSObject(channelMessage);

            final String eventName = payload.getString("eventName");
            final String eventMessage = payload.getString("eventMessage");

            JSArray args = new JSArray();
            if (eventMessage != null && !eventMessage.isEmpty()) {
                args = new JSArray(eventMessage);
            }

            Log.i(LOG_TAG, "← Node.js: " + channelName + " " + eventName + " (" + channelMessage.length() + " байт)");
            if (Objects.equals(channelName, CapacitorNodeJSPlugin.CHANNEL_NAME_APP) && Objects.equals(eventName, "ready")) {
                engineStatus.setReady();
            } else if (Objects.equals(channelName, CapacitorNodeJSPlugin.CHANNEL_NAME_EVENT)) {
                eventNotifier.channelReceive(eventName, args);
            }
        } catch (JSONException e) {
            Logger.error(CapacitorNodeJSPlugin.LOGGER_TAG, "Failed to deserialize received data from the Node.js process.", e);
        }
    }

    private boolean copyNodeProjectFromAPK(String projectDir, String projectPath, String modulesPath) {
        final String nodeAssetDir = FileOperations.CombinePath("public", projectDir);
        final String modulesAssetDir = FileOperations.CombinePath("builtin_modules");
        final AssetManager assetManager = context.getAssets();

        final boolean updated = isAppUpdated();
        if (!updated && FileOperations.ExistsPath(projectPath) && FileOperations.ExistsPath(modulesPath)) {
            // Same APK as last time and the copy finished then: reuse it.
            Log.i(LOG_TAG, "Node-проект уже распакован: " + projectPath);
            return true;
        }
        Log.i(LOG_TAG, "Распаковываю Node-проект из APK в " + projectPath);

        boolean success = true;
        if (FileOperations.ExistsPath(projectPath)) {
            success = FileOperations.DeleteDir(projectPath);
        }
        success &= FileOperations.CopyAssetDir(assetManager, nodeAssetDir, projectPath);

        if (FileOperations.ExistsPath(modulesPath)) {
            success &= FileOperations.DeleteDir(modulesPath);
        }
        success &= FileOperations.CopyAssetDir(assetManager, modulesAssetDir, modulesPath);

        if (success) {
            saveAppUpdateTime();
        }
        Log.i(LOG_TAG, "Распаковка " + (success ? "завершена" : "не удалась"));
        return success;
    }

    private boolean isAppUpdated() {
        final long previousLastUpdateTime = preferences.getLong(CapacitorNodeJSPlugin.PREFS_APP_UPDATED_TIME, 0);
        final long lastUpdateTime = packageInfo.lastUpdateTime;
        return lastUpdateTime != previousLastUpdateTime;
    }

    private void saveAppUpdateTime() {
        final long lastUpdateTime = packageInfo.lastUpdateTime;
        final SharedPreferences.Editor editor = preferences.edit();
        editor.putLong(CapacitorNodeJSPlugin.PREFS_APP_UPDATED_TIME, lastUpdateTime);
        editor.apply();
    }
}
