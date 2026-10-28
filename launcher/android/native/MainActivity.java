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
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Cream Soda activity. Android's WebView ignores <a download>, so the interface saves
 * exported files (cards, chats, backups) through window.CreamSodaAndroid instead;
 * they land in Downloads/Cream Soda.
 *
 * Copied over the generated MainActivity by scripts/patch-android.mjs.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getBridge().getWebView().addJavascriptInterface(new FilesBridge(), "CreamSodaAndroid");
    }

    private class FilesBridge {

        /** Saves base64 data under the given file name. Returns where it went, or "error:<reason>". */
        @JavascriptInterface
        public String saveBase64(String data, String name, String mime) {
            try {
                return save(name, mime, new ByteArrayInputStream(Base64.decode(data, Base64.DEFAULT)));
            } catch (Exception e) {
                return fail(e);
            }
        }

        /** Copies a file from the app's private storage (e.g. a backup made by the server). */
        @JavascriptInterface
        public String exportFile(String path, String name, String mime) {
            try {
                File file = new File(path).getCanonicalFile();
                File appDir = getFilesDir().getParentFile().getCanonicalFile();
                if (!file.getPath().startsWith(appDir.getPath() + File.separator)) {
                    throw new IOException("файл вне данных приложения");
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
            if (uri == null) throw new IOException("не удалось создать файл в Загрузках");
            try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                if (out == null) throw new IOException("не удалось открыть файл для записи");
                copy(in, out);
            }
            shown = "Загрузки/Cream Soda/" + name;
        } else {
            // Before Android 10 public Downloads needs a storage permission; use the app's own folder.
            File dir = new File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "Cream Soda");
            if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("нет доступа к памяти");
            File file = new File(dir, name);
            try (OutputStream out = new FileOutputStream(file)) {
                copy(in, out);
            }
            shown = file.getPath();
        }
        showToast("Сохранено: " + shown);
        return shown;
    }

    private String fail(Exception e) {
        String reason = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
        showToast("Не удалось сохранить: " + reason);
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
