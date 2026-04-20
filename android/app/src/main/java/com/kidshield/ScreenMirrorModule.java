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
    private String childId, parentId, childDocId;

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
    public void setChildInfo(String cId, String pId, String docId, Promise promise) {
        this.childId = cId;
        this.parentId = pId;
        this.childDocId = docId;
        promise.resolve(true);
    }

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
        captureAndUpload(promise);
    }

    @ReactMethod
    public void startLiveView(int intervalSeconds, Promise promise) {
        if (mediaProjection == null) { promise.reject("NO_PERMISSION", "Call requestPermission first"); return; }
        isMirroring = true;
        startLiveLoop(intervalSeconds > 0 ? intervalSeconds : 3);
        promise.resolve(true);
    }

    @ReactMethod
    public void stopLiveView(Promise promise) {
        isMirroring = false;
        if (virtualDisplay != null) { virtualDisplay.release(); virtualDisplay = null; }
        if (handlerThread != null) { handlerThread.quitSafely(); handlerThread = null; }
        promise.resolve(true);
    }

    private void startLiveLoop(int intervalSeconds) {
        handlerThread = new HandlerThread("ScreenLiveThread");
        handlerThread.start();
        handler = new Handler(handlerThread.getLooper());
        Runnable captureRunnable = new Runnable() {
            @Override
            public void run() {
                if (isMirroring) {
                    captureAndUpload(null);
                    handler.postDelayed(this, intervalSeconds * 1000L);
                }
            }
        };
        handler.post(captureRunnable);
    }

    private void captureAndUpload(Promise promise) {
        try {
            if (mediaProjection == null) return;
            if (handlerThread == null || !handlerThread.isAlive()) {
                handlerThread = new HandlerThread("ScreenCaptureThread");
                handlerThread.start();
                handler = new Handler(handlerThread.getLooper());
            }
            int w = screenWidth / 2, h = screenHeight / 2;
            ImageReader reader = ImageReader.newInstance(w, h, PixelFormat.RGBA_8888, 2);
            VirtualDisplay vd = mediaProjection.createVirtualDisplay("KidShieldCapture", w, h, screenDensity,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, reader.getSurface(), null, handler);
            handler.postDelayed(() -> {
                try {
                    Image image = reader.acquireLatestImage();
                    if (image != null) {
                        Image.Plane[] planes = image.getPlanes();
                        ByteBuffer buffer = planes[0].getBuffer();
                        int rowStride = planes[0].getRowStride();
                        int pixelStride = planes[0].getPixelStride();
                        Bitmap bitmap = Bitmap.createBitmap(rowStride / pixelStride, h, Bitmap.Config.ARGB_8888);
                        bitmap.copyPixelsFromBuffer(buffer);
                        image.close();
                        ByteArrayOutputStream baos = new ByteArrayOutputStream();
                        bitmap.compress(Bitmap.CompressFormat.JPEG, 50, baos);
                        String base64 = Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP);
                        uploadFrame("data:image/jpeg;base64," + base64);
                        if (promise != null) promise.resolve(true);
                    }
                    vd.release();
                    reader.close();
                } catch (Exception e) {
                    if (promise != null) promise.reject("ERROR", e.getMessage());
                }
            }, 400);
        } catch (Exception e) {
            if (promise != null) promise.reject("ERROR", e.getMessage());
        }
    }

    private void uploadFrame(String base64Frame) {
        try {
            if (childId == null) childId = FirebaseAuth.getInstance().getCurrentUser() != null ?
                FirebaseAuth.getInstance().getCurrentUser().getUid() : null;
            if (childId == null) return;
            FirebaseFirestore db = FirebaseFirestore.getInstance();
            Map<String, Object> data = new HashMap<>();
            data.put("liveFrame", base64Frame);
            data.put("liveFrameType", "screen");
            data.put("liveFrameAt", com.google.firebase.Timestamp.now());
            if (parentId != null && childDocId != null) {
                db.collection("families").document(parentId)
                    .collection("children").document(childDocId)
                    .update(data);
            }
            db.collection("remoteCaptures").document(childId)
                .set(data);
        } catch (Exception e) { e.printStackTrace(); }
    }

    @Override
    public void onActivityResult(Activity activity, int requestCode, int resultCode, Intent data) {
        if (requestCode == REQUEST_CODE) {
            if (resultCode == Activity.RESULT_OK && data != null) {
                projectionManager = (MediaProjectionManager) reactContext.getSystemService(Context.MEDIA_PROJECTION_SERVICE);
                mediaProjection = projectionManager.getMediaProjection(resultCode, data);
                if (pendingPermissionPromise != null) { pendingPermissionPromise.resolve(true); pendingPermissionPromise = null; }
            } else {
                if (pendingPermissionPromise != null) { pendingPermissionPromise.reject("DENIED", "Screen capture denied"); pendingPermissionPromise = null; }
            }
        }
    }
    @Override public void onNewIntent(Intent intent) {}
}
