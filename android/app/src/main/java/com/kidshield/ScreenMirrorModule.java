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
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;

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
    
    // Class level variables
    private boolean isMirroring = false;
    private int screenWidth, screenHeight, screenDensity;
    private Runnable liveViewRunnable;

    public ScreenMirrorModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
        context.addActivityEventListener(this);

        WindowManager wm = (WindowManager) context.getSystemService(Context.WINDOW_SERVICE);
        DisplayMetrics metrics = new DisplayMetrics();
        wm.getDefaultDisplay().getMetrics(metrics);
        screenWidth = metrics.widthPixels / 2;
        screenHeight = metrics.heightPixels / 2;
        screenDensity = metrics.densityDpi;
    }

    @Override
    public String getName() { return "ScreenMirror"; }

    @ReactMethod
    public void setChildInfo(String cId, String pId, Promise promise) {
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
    public void startLiveView(int intervalSeconds, Promise promise) {
        if (mediaProjection == null) { promise.reject("NO_PERMISSION", "Need screen capture permission"); return; }
        if (isMirroring) { promise.resolve(true); return; }

        isMirroring = true;
        
        // Start Foreground Service to satisfy Android 10+
        try {
            Intent serviceIntent = new Intent(reactContext, ScreenCaptureService.class);
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                reactContext.startForegroundService(serviceIntent);
            } else {
                reactContext.startService(serviceIntent);
            }
        } catch(Exception e) { e.printStackTrace(); }

        startBackgroundThread();
        setupVirtualDisplay();

        int intervalMs = Math.max(500, intervalSeconds * 1000);
        liveViewRunnable = new Runnable() {
            @Override
            public void run() {
                if (!isMirroring) return;
                captureFrameAndEmit();
                handler.postDelayed(this, intervalMs);
            }
        };
        handler.postDelayed(liveViewRunnable, 500);
        promise.resolve(true);
    }

    @ReactMethod
    public void stopLiveView(Promise promise) {
        isMirroring = false;
        
        // Stop Foreground Service
        try {
            Intent serviceIntent = new Intent(reactContext, ScreenCaptureService.class);
            reactContext.stopService(serviceIntent);
        } catch(Exception e) { e.printStackTrace(); }

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

    private void captureFrameAndEmit() {
        if (imageReader == null) return;
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

            if (w > screenWidth) bmp = Bitmap.createBitmap(bmp, 0, 0, screenWidth, screenHeight);

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            bmp.compress(Bitmap.CompressFormat.JPEG, 30, baos);
            String base64 = Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP);

            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit("onScreenFrame", base64);

        } catch (Exception e) {
            e.printStackTrace();
        }
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

    private void releaseResources() {
        if (virtualDisplay != null) { virtualDisplay.release(); virtualDisplay = null; }
        if (imageReader != null) { try { imageReader.close(); } catch (Exception e) {} imageReader = null; }
        if (handlerThread != null) { handlerThread.quitSafely(); handlerThread = null; }
    }

    @Override public void onNewIntent(Intent intent) {}
}