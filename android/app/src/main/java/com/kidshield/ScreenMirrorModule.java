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
import android.os.Looper;
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
    private VirtualDisplay virtualDisplay;
    private ImageReader imageReader;
    private HandlerThread handlerThread;
    private Handler handler;
    private static final int REQUEST_CODE = 1001;
    private Promise pendingPermissionPromise;
    
    public static MediaProjection mediaProjection; 
    
    private boolean isMirroring = false;
    private int screenWidth, screenHeight, screenDensity;
    private long lastFrameTime = 0;

    public ScreenMirrorModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
        context.addActivityEventListener(this);

        WindowManager wm = (WindowManager) context.getSystemService(Context.WINDOW_SERVICE);
        DisplayMetrics metrics = new DisplayMetrics();
        wm.getDefaultDisplay().getMetrics(metrics);
        screenWidth = (metrics.widthPixels / 3) & ~1;
        screenHeight = (metrics.heightPixels / 3) & ~1;
        screenDensity = metrics.densityDpi;
    }

    @Override public String getName() { return "ScreenMirror"; }
    @ReactMethod public void addListener(String eventName) {}
    @ReactMethod public void removeListeners(double count) {}
    @ReactMethod public void setChildInfo(String cId, String pId, Promise promise) { promise.resolve(true); }

    @ReactMethod
    public void requestPermission(Promise promise) {
        Activity activity = getCurrentActivity();
        if (activity == null) { promise.reject("NO_ACTIVITY", "No activity"); return; }
        pendingPermissionPromise = promise;
        projectionManager = (MediaProjectionManager) reactContext.getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        activity.startActivityForResult(projectionManager.createScreenCaptureIntent(), REQUEST_CODE);
    }

    @Override
    public void onActivityResult(Activity activity, int requestCode, int resultCode, Intent data) {
        if (requestCode == REQUEST_CODE) {
            if (resultCode == Activity.RESULT_OK && data != null) {
                try {
                    Intent serviceIntent = new Intent(reactContext, ScreenCaptureService.class);
                    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                        reactContext.startForegroundService(serviceIntent);
                    } else {
                        reactContext.startService(serviceIntent);
                    }

                    new Handler(Looper.getMainLooper()).postDelayed(() -> {
                        try {
                            mediaProjection = projectionManager.getMediaProjection(resultCode, data);
                            if (pendingPermissionPromise != null) {
                                pendingPermissionPromise.resolve(true);
                                pendingPermissionPromise = null;
                            }
                        } catch (Exception e) {}
                    }, 500);
                } catch(Exception e) {}
            } else {
                if (pendingPermissionPromise != null) {
                    pendingPermissionPromise.reject("DENIED", "Denied");
                    pendingPermissionPromise = null;
                }
            }
        }
    }

    @ReactMethod
    public void startLiveView(int intervalSeconds, Promise promise) {
        if (mediaProjection == null) { promise.reject("NO_PERMISSION", "Need permission"); return; }
        if (isMirroring) { promise.resolve(true); return; }
        isMirroring = true;
        lastFrameTime = 0;
        startBackgroundThread();
        setupVirtualDisplay();
        promise.resolve(true);
    }

    @ReactMethod
    public void stopLiveView(Promise promise) {
        isMirroring = false;
        try { reactContext.stopService(new Intent(reactContext, ScreenCaptureService.class)); } catch(Exception e) {}
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

        imageReader.setOnImageAvailableListener(reader -> {
            if (!isMirroring) return;
            Image image = null;
            try {
                image = reader.acquireLatestImage();
                if (image == null) return;

                long currentTime = System.currentTimeMillis();
                if (currentTime - lastFrameTime >= 500) { 
                    lastFrameTime = currentTime;
                    Image.Plane[] planes = image.getPlanes();
                    ByteBuffer buffer = planes[0].getBuffer();
                    int pixelStride = planes[0].getPixelStride();
                    int rowStride = planes[0].getRowStride();
                    int w = rowStride / pixelStride;

                    Bitmap bmp = Bitmap.createBitmap(w, screenHeight, Bitmap.Config.ARGB_8888);
                    bmp.copyPixelsFromBuffer(buffer);
                    Bitmap scaledBmp = w > screenWidth ? Bitmap.createBitmap(bmp, 0, 0, screenWidth, screenHeight) : bmp;

                    ByteArrayOutputStream baos = new ByteArrayOutputStream();
                    scaledBmp.compress(Bitmap.CompressFormat.JPEG, 40, baos);
                    String base64 = Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP);
                    reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class).emit("onScreenFrame", base64);
                }
            } catch (Exception e) { } finally { if (image != null) { try { image.close(); } catch (Exception e) {} } }
        }, handler);

        virtualDisplay = mediaProjection.createVirtualDisplay("KidShield", screenWidth, screenHeight, screenDensity, DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, imageReader.getSurface(), null, handler);
    }

    private void releaseResources() {
        if (virtualDisplay != null) { virtualDisplay.release(); virtualDisplay = null; }
        if (imageReader != null) { try { imageReader.close(); } catch (Exception e) {} imageReader = null; }
        if (handlerThread != null) { handlerThread.quitSafely(); handlerThread = null; }
        mediaProjection = null;
    }

    @Override public void onNewIntent(Intent intent) {}
}