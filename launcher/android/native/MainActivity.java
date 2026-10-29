package rp.creamsoda.app;

import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.widget.Toast;
import com.getcapacitor.BridgeActivity;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Cream Soda activity. Android's WebView ignores <a download>, so the interface saves
 * exported files (cards, chats, backups) through window.CreamSodaAndroid instead;
 * they land in Downloads/Cream Soda. The same object lets the launcher read this
 * app's own Android log, which is where Node.js prints its errors.
 *
 * Copied over the generated MainActivity by scripts/patch-android.mjs.
 */
public class MainActivity extends BridgeActivity {

    /** Language of the toasts below: the launcher and the interface set it ("en" or "ru"). */
    private volatile boolean russian = false;

    private String tr(String en, String ru) {
        return russian ? ru : en;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getBridge().getWebView().addJavascriptInterface(new FilesBridge(), "CreamSodaAndroid");
    }

    private class FilesBridge {

        @JavascriptInterface
        public void setLanguage(String lang) {
            russian = "ru".equals(lang);
        }

        /** Saves base64 data under the given file name. Returns where it went, or "error:<reason>". */
        @JavascriptInterface
        public String saveBase64(String data, String name, String mime) {
            try {
                return save(name, mime, new ByteArrayInputStream(Base64.decode(data, Base64.DEFAULT)));
            } catch (Exception e) {
                return fail(e);
            }
        }

        /** Last lines of this app's own Android log (no permission needed for own process). */
        @JavascriptInterface
        public String readLogs() {
            try {
                Process logcat = new ProcessBuilder(
                    "logcat", "-d", "-v", "time", "-t", "3000", "--pid", String.valueOf(android.os.Process.myPid())
                )
                    .redirectErrorStream(true)
                    .start();
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                try (InputStream in = logcat.getInputStream()) {
                    copy(in, out);
                }
                logcat.waitFor();
                return new String(out.toByteArray(), StandardCharsets.UTF_8);
            } catch (Exception e) {
                return "error:" + e.getMessage();
            }
        }

        /** Copies a file from the app's private storage (e.g. a backup made by the server). */
        @JavascriptInterface
        public String exportFile(String path, String name, String mime) {
            try {
                File file = new File(path).getCanonicalFile();
                File appDir = getFilesDir().getParentFile().getCanonicalFile();
                if (!file.getPath().startsWith(appDir.getPath() + File.separator)) {
                    throw new IOException(tr("the file is outside the app data", "файл вне данных приложения"));
                }
                try (InputStream in = new FileInputStream(file)) {
                    return save(name, mime, in);
                }
            } catch (Exception e) {
                return fail(e);
            }
        }
    }

    private String save(String rawName, String mime, InputStream in) throws IOException {
        String name = rawName == null ? "" : rawName.replaceAll("[\\\\/:*?\"<>|\\x00-\\x1f]", "_").trim();
        if (name.isEmpty()) name = "cream-soda-file";
        if (mime == null || mime.isEmpty()) mime = "application/octet-stream";

        String shown;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, name);
            values.put(MediaStore.Downloads.MIME_TYPE, mime);
            values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Cream Soda");
            Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new IOException(tr("could not create the file in Downloads", "не удалось создать файл в Загрузках"));
            try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                if (out == null) throw new IOException(tr("could not open the file for writing", "не удалось открыть файл для записи"));
                copy(in, out);
            }
            shown = tr("Downloads", "Загрузки") + "/Cream Soda/" + name;
        } else {
            // Before Android 10 public Downloads needs a storage permission; use the app's own folder.
            File dir = new File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "Cream Soda");
            if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException(tr("no access to storage", "нет доступа к памяти"));
            File file = new File(dir, name);
            try (OutputStream out = new FileOutputStream(file)) {
                copy(in, out);
            }
            shown = file.getPath();
        }
        showToast(tr("Saved: ", "Сохранено: ") + shown);
        return shown;
    }

    private String fail(Exception e) {
        String reason = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
        showToast(tr("Could not save: ", "Не удалось сохранить: ") + reason);
        return "error:" + reason;
    }

    private void showToast(String text) {
        runOnUiThread(() -> Toast.makeText(this, text, Toast.LENGTH_LONG).show());
    }

    private static void copy(InputStream in, OutputStream out) throws IOException {
        byte[] buf = new byte[64 * 1024];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
    }
}
