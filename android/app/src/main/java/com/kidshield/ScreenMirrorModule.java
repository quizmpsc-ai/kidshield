package com.kidshield;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.view.WindowManager;
import com.facebook.react.bridge.*;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.firestore.FirebaseFirestore;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;

public class ScreenMirrorModule extends ReactContextBaseJavaModule implements ActivityEventListener {
    private final ReactApplicationContext reactContext;
    private MediaProjectionManager projectionManager;
    private MediaProjection mediaProjection;
    private VirtualDisplay virtualDisplay;
    private ImageReader imageReader;
    private HandlerThread handlerThread;
    private Handler handler;
    private static final int REQUEST_CODE = 1001;
    private Promise pendingPermissionPromise;
    private boolean isMirroring = false;
    private int screenWidth, screenHeight, screenDensity;

    public ScreenMirrorModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
        context.addActivityEventListener(this);
        WindowManager wm = (WindowManager) context.getSystemService(Context.WINDOW_SERVICE);
        DisplayMetrics metrics = new DisplayMetrics();
        wm.getDefaultDisplay().getMetrics(metrics);
        screenWidth = metrics.widthPixels;
        screenHeight = metrics.heightPixels;
        screenDensity = metrics.densityDpi;
    }
    @Override public String getName() { return "ScreenMirror"; }

    @ReactMethod
    public void requestPermission(Promise promise) {
        Activity activity = getCurrentActivity();
        if (activity == null) { promise.reject("NO_ACTIVITY", "No activity"); return; }
        pendingPermissionPromise = promise;
        projectionManager = (MediaProjectionManager) reactContext.getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        activity.startActivityForResult(projectionManager.createScreenCaptureIntent(), REQUEST_CODE);
    }

    @ReactMethod
    public void takeScreenshot(String requestId, Promise promise) {
        if (mediaProjection == null) { promise.reject("NO_PERMISSION", "No permission"); return; }
        handlerThread = new HandlerThread("ScreenCaptureThread");
        handlerThread.start();
        handler = new Handler(handlerThread.getLooper());
        int w = screenWidth / 2, h = screenHeight / 2;
        imageReader = ImageReader.newInstance(w, h, PixelFormat.RGBA_8888, 2);
        virtualDisplay = mediaProjection.createVirtualDisplay("KidShieldCapture", w, h, screenDensity,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, imageReader.getSurface(), null, handler);
        handler.postDelayed(() -> {
            try {
                Image image = imageReader.acquireLatestImage();
                if (image != null) {
                    Image.Plane[] planes = image.getPlanes();
                    ByteBuffer buffer = planes[0].getBuffer();
                    int rowStride = planes[0].getRowStride();
                    int pixelStride = planes[0].getPixelStride();
                    Bitmap bitmap = Bitmap.createBitmap(rowStride / pixelStride, h, Bitmap.Config.ARGB_8888);
                    bitmap.copyPixelsFromBuffer(buffer);
                    image.close();
                    ByteArrayOutputStream baos = new ByteArrayOutputStream();
                    bitmap.compress(Bitmap.CompressFormat.JPEG, 60, baos);
                    String base64 = Base64.encodeToString(baos.toByteArray(), Base64.DEFAULT);
                    uploadScreenshot(base64, requestId);
                    promise.resolve(requestId);
                    if (virtualDisplay != null) virtualDisplay.release();
                    imageReader.close();
                    handlerThread.quitSafely();
                } else { promise.reject("NO_IMAGE", "Failed"); }
            } catch (Exception e) { promise.reject("ERROR", e.getMessage()); }
        }, 500);
    }

    @ReactMethod
    public void startLiveView(int intervalSeconds, Promise promise) {
        isMirroring = true;
        promise.resolve(true);
    }

    @ReactMethod
    public void stopLiveView(Promise promise) {
        isMirroring = false;
        if (virtualDisplay != null) { virtualDisplay.release(); virtualDisplay = null; }
        promise.resolve(true);
    }

    private void uploadScreenshot(String base64, String requestId) {
        try {
            String childId = FirebaseAuth.getInstance().getCurrentUser() != null ?
                FirebaseAuth.getInstance().getCurrentUser().getUid() : "unknown";
            Map<String, Object> data = new HashMap<>();
            data.put("childId", childId);
            data.put("screenshotBase64", base64);
            data.put("requestId", requestId);
            data.put("type", "screenshot");
            data.put("timestamp", new Date().toString());
            FirebaseFirestore.getInstance().collection("remoteCaptures").add(data);
        } catch (Exception e) { e.printStackTrace(); }
    }

    @Override
    public void onActivityResult(Activity activity, int requestCode, int resultCode, Intent data) {
        if (requestCode == REQUEST_CODE) {
            if (resultCode == Activity.RESULT_OK && data != null) {
                mediaProjection = projectionManager.getMediaProjection(resultCode, data);
                if (pendingPermissionPromise != null) { pendingPermissionPromise.resolve(true); pendingPermissionPromise = null; }
            } else {
                if (pendingPermissionPromise != null) { pendingPermissionPromise.reject("DENIED", "Denied"); pendingPermissionPromise = null; }
            }
        }
    }
    @Override public void onNewIntent(Intent intent) {}
}