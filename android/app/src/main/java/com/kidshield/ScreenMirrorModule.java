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
    private Runnable liveViewRunnable;
    private FirebaseFirestore db;
    private String childId;
    private String parentId;

    public ScreenMirrorModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
        context.addActivityEventListener(this);
        this.db = FirebaseFirestore.getInstance();
        WindowManager wm = (WindowManager) context.getSystemService(Context.WINDOW_SERVICE);
        DisplayMetrics metrics = new DisplayMetrics();
        wm.getDefaultDisplay().getMetrics(metrics);
        screenWidth = metrics.widthPixels / 2;
        screenHeight = metrics.heightPixels / 2;
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
    public void setChildInfo(String cId, String pId, Promise promise) {
        this.childId = cId;
        this.parentId = pId;
        promise.resolve(true);
    }

    // â”€â”€ Take single screenshot â”€â”€
    @ReactMethod
    public void takeScreenshot(String requestId, Promise promise) {
        if (mediaProjection == null) { promise.reject("NO_PERMISSION", "No media projection permission"); return; }
        captureAndUpload(requestId, promise);
    }

    // â”€â”€ Start continuous live view â”€â”€
    @ReactMethod
    public void startLiveView(int intervalSeconds, Promise promise) {
        if (mediaProjection == null) { promise.reject("NO_PERMISSION", "Need screen capture permission"); return; }
        if (isMirroring) { promise.resolve(true); return; }

        isMirroring = true;
        startBackgroundThread();
        setupVirtualDisplay();

        int intervalMs = intervalSeconds * 1000;
        liveViewRunnable = new Runnable() {
            @Override
            public void run() {
                if (!isMirroring) return;
                captureFrameToFirestore();
                handler.postDelayed(this, intervalMs);
            }
        };
        handler.postDelayed(liveViewRunnable, 500);
        promise.resolve(true);
    }

    // â”€â”€ Stop live view â”€â”€
    @ReactMethod
    public void stopLiveView(Promise promise) {
        isMirroring = false;
        if (liveViewRunnable != null && handler != null) {
            handler.removeCallbacks(liveViewRunnable);
        }
        releaseResources();
        promise.resolve(true);
    }

    private void startBackgroundThread() {
        handlerThread = new HandlerThread("ScreenCaptureThread");
        handlerThread.start();
        handler = new Handler(handlerThread.getLooper());
    }

    private void setupVirtualDisplay() {
        if (imageReader != null) { try { imageReader.close(); } catch (Exception e) {} }
        imageReader = ImageReader.newInstance(screenWidth, screenHeight, PixelFormat.RGBA_8888, 2);
        virtualDisplay = mediaProjection.createVirtualDisplay(
            "KidShieldLive", screenWidth, screenHeight, screenDensity,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            imageReader.getSurface(), null, handler
        );
    }

    private void captureFrameToFirestore() {
        if (imageReader == null || childId == null) return;
        try {
            Image image = imageReader.acquireLatestImage();
            if (image == null) return;

            Image.Plane[] planes = image.getPlanes();
            ByteBuffer buffer = planes[0].getBuffer();
            int rowStride = planes[0].getRowStride();
            int pixelStride = planes[0].getPixelStride();
            int w = rowStride / pixelStride;
            Bitmap bmp = Bitmap.createBitmap(w, screenHeight, Bitmap.Config.ARGB_8888);
            bmp.copyPixelsFromBuffer(buffer);
            image.close();

            // Crop to actual screen size
            if (w > screenWidth) bmp = Bitmap.createBitmap(bmp, 0, 0, screenWidth, screenHeight);

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            bmp.compress(Bitmap.CompressFormat.JPEG, 40, baos); // Low quality = faster
            String base64 = Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP);

            // Save to Firestore - liveFrame field for real-time display
            Map<String, Object> data = new HashMap<>();
            data.put("liveFrame", base64);
            data.put("liveFrameAt", new Date().getTime());
            data.put("liveType", "screen");

            if (parentId != null && !parentId.isEmpty()) {
                // families/{parentId}/children/{childId} path
                db.collection("families").document(parentId)
                    .collection("children").document(childId)
                    .update(data);
            }
            // Also save to remoteCaptures for history
            Map<String, Object> capture = new HashMap<>();
            capture.put("childId", childId);
            capture.put("screenshotBase64", base64);
            capture.put("type", "screenshot");
            capture.put("timestamp", new Date().toString());
            db.collection("remoteCaptures").add(capture);

        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void captureAndUpload(String requestId, Promise promise) {
        startBackgroundThread();
        setupVirtualDisplay();
        handler.postDelayed(() -> {
            try {
                Image image = imageReader.acquireLatestImage();
                if (image != null) {
                    Image.Plane[] planes = image.getPlanes();
                    ByteBuffer buffer = planes[0].getBuffer();
                    int rowStride = planes[0].getRowStride();
                    int pixelStride = planes[0].getPixelStride();
                    int w = rowStride / pixelStride;
                    Bitmap bmp = Bitmap.createBitmap(w, screenHeight, Bitmap.Config.ARGB_8888);
                    bmp.copyPixelsFromBuffer(buffer);
                    image.close();

                    ByteArrayOutputStream baos = new ByteArrayOutputStream();
                    bmp.compress(Bitmap.CompressFormat.JPEG, 60, baos);
                    String base64 = Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP);

                    Map<String, Object> data = new HashMap<>();
                    data.put("childId", childId);
                    data.put("screenshotBase64", base64);
                    data.put("requestId", requestId);
                    data.put("type", "screenshot");
                    data.put("timestamp", new Date().toString());
                    db.collection("remoteCaptures").add(data)
                        .addOnSuccessListener(ref -> promise.resolve(ref.getId()))
                        .addOnFailureListener(e -> promise.reject("UPLOAD_ERROR", e.getMessage()));
                    releaseResources();
                } else {
                    promise.reject("NO_IMAGE", "Could not capture screen");
                }
            } catch (Exception e) {
                promise.reject("ERROR", e.getMessage());
            }
        }, 500);
    }

    private void releaseResources() {
        if (virtualDisplay != null) { virtualDisplay.release(); virtualDisplay = null; }
        if (imageReader != null) { try { imageReader.close(); } catch (Exception e) {} imageReader = null; }
        if (handlerThread != null) { handlerThread.quitSafely(); handlerThread = null; }
    }

    @Override
    public void onActivityResult(Activity activity, int requestCode, int resultCode, Intent data) {
        if (requestCode == REQUEST_CODE) {
            if (resultCode == Activity.RESULT_OK && data != null) {
                mediaProjection = projectionManager.getMediaProjection(resultCode, data);
                if (pendingPermissionPromise != null) {
                    pendingPermissionPromise.resolve(true);
                    pendingPermissionPromise = null;
                }
            } else {
                if (pendingPermissionPromise != null) {
                    pendingPermissionPromise.reject("DENIED", "Screen capture permission denied");
                    pendingPermissionPromise = null;
                }
            }
        }
    }
    @Override public void onNewIntent(Intent intent) {}
}