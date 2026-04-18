// android/app/src/main/java/com/kidshield/ScreenMirrorModule.java
// AirDroid-style screen capture using MediaProjection API

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
import java.util.*;

public class ScreenMirrorModule extends ReactContextBaseJavaModule
    implements ActivityEventListener {

    private final ReactApplicationContext reactContext;
    private MediaProjectionManager projectionManager;
    private MediaProjection mediaProjection;
    private VirtualDisplay virtualDisplay;
    private ImageReader imageReader;
    private HandlerThread handlerThread;
    private Handler handler;
    private FirebaseFirestore db;

    private static final int REQUEST_CODE_SCREEN_CAPTURE = 1001;
    private Promise pendingPermissionPromise;
    private boolean isMirroring = false;

    // Screen dimensions
    private int screenWidth;
    private int screenHeight;
    private int screenDensity;

    public ScreenMirrorModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
        this.db = FirebaseFirestore.getInstance();
        context.addActivityEventListener(this);

        // Screen metrics
        WindowManager wm = (WindowManager) context.getSystemService(Context.WINDOW_SERVICE);
        DisplayMetrics metrics = new DisplayMetrics();
        wm.getDefaultDisplay().getMetrics(metrics);
        screenWidth = metrics.widthPixels;
        screenHeight = metrics.heightPixels;
        screenDensity = metrics.densityDpi;
    }

    @Override
    public String getName() { return "ScreenMirror"; }

    // ── Request MediaProjection permission (एकदाच setup वेळी) ──
    @ReactMethod
    public void requestPermission(Promise promise) {
        Activity activity = getCurrentActivity();
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No activity");
            return;
        }
        pendingPermissionPromise = promise;
        projectionManager = (MediaProjectionManager)
            reactContext.getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        Intent permissionIntent = projectionManager.createScreenCaptureIntent();
        activity.startActivityForResult(permissionIntent, REQUEST_CODE_SCREEN_CAPTURE);
    }

    // ── Take single screenshot ──
    @ReactMethod
    public void takeScreenshot(String requestId, Promise promise) {
        if (mediaProjection == null) {
            promise.reject("NO_PERMISSION", "MediaProjection permission नाही. Setup मध्ये allow करा.");
            return;
        }

        handlerThread = new HandlerThread("ScreenCaptureThread");
        handlerThread.start();
        handler = new Handler(handlerThread.getLooper());

        // Capture at half resolution for performance
        int captureWidth = screenWidth / 2;
        int captureHeight = screenHeight / 2;

        imageReader = ImageReader.newInstance(captureWidth, captureHeight, PixelFormat.RGBA_8888, 2);

        virtualDisplay = mediaProjection.createVirtualDisplay(
            "KidShieldCapture",
            captureWidth, captureHeight, screenDensity,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            imageReader.getSurface(), null, handler
        );

        // Wait for frame
        handler.postDelayed(() -> {
            try {
                Image image = imageReader.acquireLatestImage();
                if (image != null) {
                    Image.Plane[] planes = image.getPlanes();
                    ByteBuffer buffer = planes[0].getBuffer();
                    int pixelStride = planes[0].getPixelStride();
                    int rowStride = planes[0].getRowStride();
                    int rowPadding = rowStride - pixelStride * captureWidth;

                    Bitmap bitmap = Bitmap.createBitmap(
                        captureWidth + rowPadding / pixelStride,
                        captureHeight, Bitmap.Config.ARGB_8888
                    );
                    bitmap.copyPixelsFromBuffer(buffer);
                    image.close();

                    // Compress to JPEG
                    ByteArrayOutputStream baos = new ByteArrayOutputStream();
                    bitmap.compress(Bitmap.CompressFormat.JPEG, 60, baos);
                    byte[] jpegData = baos.toByteArray();
                    String base64 = Base64.encodeToString(jpegData, Base64.DEFAULT);

                    // Upload to Firebase
                    uploadScreenshot(base64, requestId, promise);

                    virtualDisplay.release();
                    imageReader.close();
                    handlerThread.quitSafely();
                } else {
                    promise.reject("NO_IMAGE", "Screenshot capture failed");
                }
            } catch (Exception e) {
                promise.reject("CAPTURE_ERROR", e.getMessage());
            }
        }, 500);
    }

    // ── Start continuous screen streaming (intervals) ──
    @ReactMethod
    public void startLiveView(int intervalSeconds, Promise promise) {
        if (mediaProjection == null) {
            promise.reject("NO_PERMISSION", "Permission नाही");
            return;
        }
        isMirroring = true;
        startContinuousCapture(intervalSeconds);
        promise.resolve(true);
    }

    @ReactMethod
    public void stopLiveView(Promise promise) {
        isMirroring = false;
        if (virtualDisplay != null) virtualDisplay.release();
        promise.resolve(true);
    }

    private void startContinuousCapture(int intervalSeconds) {
        handlerThread = new HandlerThread("LiveScreenThread");
        handlerThread.start();
        handler = new Handler(handlerThread.getLooper());

        Runnable captureRunnable = new Runnable() {
            @Override
            public void run() {
                if (!isMirroring) return;
                takeScreenshot("live_" + System.currentTimeMillis(),
                    new Promise() {
                        public void resolve(Object value) {}
                        public void reject(String code, String msg) {}
                        public void reject(String code, Throwable e) {}
                        public void reject(String code, String msg, Throwable e) {}
                        public void reject(Throwable e) {}
                        public void reject(String msg) {}
                    });
                handler.postDelayed(this, intervalSeconds * 1000L);
            }
        };
        handler.post(captureRunnable);
    }

    private void uploadScreenshot(String base64, String requestId, Promise promise) {
        String childId = FirebaseAuth.getInstance().getCurrentUser().getUid();
        Map<String, Object> data = new HashMap<>();
        data.put("childId", childId);
        data.put("screenshotBase64", base64);
        data.put("requestId", requestId);
        data.put("type", "screenshot");
        data.put("timestamp", new Date().toString());
        data.put("width", screenWidth / 2);
        data.put("height", screenHeight / 2);

        db.collection("remoteCaptures")
            .add(data)
            .addOnSuccessListener(ref -> {
                if (promise != null) promise.resolve(ref.getId());
            })
            .addOnFailureListener(e -> {
                if (promise != null) promise.reject("UPLOAD_ERROR", e.getMessage());
            });
    }

    // ── Activity Result Handler ──
    @Override
    public void onActivityResult(Activity activity, int requestCode, int resultCode, Intent data) {
        if (requestCode == REQUEST_CODE_SCREEN_CAPTURE) {
            if (resultCode == Activity.RESULT_OK && data != null) {
                mediaProjection = projectionManager.getMediaProjection(resultCode, data);
                if (pendingPermissionPromise != null) {
                    pendingPermissionPromise.resolve(true);
                    pendingPermissionPromise = null;
                }
            } else {
                if (pendingPermissionPromise != null) {
                    pendingPermissionPromise.reject("DENIED", "User ने permission नाकारली");
                    pendingPermissionPromise = null;
                }
            }
        }
    }

    @Override
    public void onNewIntent(Intent intent) {}
}
