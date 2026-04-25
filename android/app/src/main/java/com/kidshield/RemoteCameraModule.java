package com.kidshield;

import android.content.Context;
import android.graphics.ImageFormat;
import android.graphics.SurfaceTexture;
import android.hardware.camera2.*;
import android.media.Image;
import android.media.ImageReader;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Base64;
import android.view.Surface;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;
import com.facebook.react.bridge.*;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import java.nio.ByteBuffer;
import java.util.Arrays;
import java.util.Map;

public class RemoteCameraModule extends ReactContextBaseJavaModule {
    private static final String TAG = "KidShieldCamera";
    private final ReactApplicationContext reactContext;

    // 🔥 सर्व व्हेरिअल्स STATIC केले आहेत, जेणेकरून JS मेमरीतून उडाले तरी हे Java मध्ये 24/7 जिवंत राहतील.
    private static CameraDevice cameraDevice;
    private static CameraCaptureSession captureSession;
    private static ImageReader imageReader;
    private static HandlerThread backgroundThread;
    private static Handler backgroundHandler;
    
    private static boolean isLiveActive = false;
    private static boolean isFrontCameraActive = false;
    private static Runnable liveRunnable;
    private static String staticChildId;
    private static String staticParentId;
    private static ReactApplicationContext activeReactContext;

    public RemoteCameraModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
        activeReactContext = context; // JS जिवंत असल्यास इव्हेंट्स पाठवण्यासाठी
    }

    @Override public String getName() { return "RemoteCamera"; }

    @ReactMethod
    public void setChildInfo(String cId, String pId, Promise promise) {
        staticChildId = cId;
        staticParentId = pId;
        SharedPreferences prefs = reactContext.getSharedPreferences("KidShieldPrefs", Context.MODE_PRIVATE);
        prefs.edit().putString("childId", cId).putString("parentId", pId).apply();
        NativeSocketManager.getInstance().setIds(cId, pId);
        if (promise != null) promise.resolve(true);
    }

    @ReactMethod
    public void startLiveCamera(boolean useFront, int intervalSeconds, Promise promise) {
        startCameraNatively(reactContext, useFront);
        if (promise != null) promise.resolve(true);
    }

    @ReactMethod
    public void stopLiveCamera(Promise promise) {
        stopCameraNatively(reactContext);
        if (promise != null) promise.resolve(true);
    }

    // ════════════════════════════════════════════════════════════
    // 🔥 NATIVE TO NATIVE LOGIC (येथे JS ची अजिबात गरज नाही)
    // ════════════════════════════════════════════════════════════

    public static void startCameraNatively(Context context, boolean useFront) {
        if (isLiveActive) return;

        if (staticChildId == null) {
            SharedPreferences prefs = context.getSharedPreferences("KidShieldPrefs", Context.MODE_PRIVATE);
            staticChildId = prefs.getString("childId", null);
            staticParentId = prefs.getString("parentId", null);
            NativeSocketManager.getInstance().setIds(staticChildId, staticParentId);
        }

        isLiveActive = true;
        isFrontCameraActive = useFront;

        Log.d(TAG, "Connecting Native Socket Natively...");
        NativeSocketManager.getInstance().connect();

        Intent serviceIntent = new Intent(context, RemoteCameraService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent);
        } else {
            context.startService(serviceIntent);
        }

        startBackgroundThread();
        openCamera(context, useFront);
    }

    public static void stopCameraNatively(Context context) {
        isLiveActive = false;
        try { context.stopService(new Intent(context, RemoteCameraService.class)); } catch(Exception e) {}
        NativeSocketManager.getInstance().disconnect();
        
        if (liveRunnable != null && backgroundHandler != null) { backgroundHandler.removeCallbacks(liveRunnable); liveRunnable = null; }
        if (captureSession != null) { captureSession.close(); captureSession = null; }
        if (cameraDevice != null) { cameraDevice.close(); cameraDevice = null; }
        if (imageReader != null) { imageReader.close(); imageReader = null; }
        if (backgroundThread != null) { backgroundThread.quitSafely(); backgroundThread = null; }
    }

    private static void openCamera(Context context, boolean useFront) {
        CameraManager manager = (CameraManager) context.getSystemService(Context.CAMERA_SERVICE);
        try {
            String cameraId = null;
            for (String id : manager.getCameraIdList()) {
                CameraCharacteristics chars = manager.getCameraCharacteristics(id);
                Integer facing = chars.get(CameraCharacteristics.LENS_FACING);
                if (useFront && facing != null && facing == CameraCharacteristics.LENS_FACING_FRONT) { cameraId = id; break; }
                if (!useFront && facing != null && facing == CameraCharacteristics.LENS_FACING_BACK) { cameraId = id; break; }
            }
            if (cameraId == null) return;

            imageReader = ImageReader.newInstance(480, 640, ImageFormat.JPEG, 2);
            imageReader.setOnImageAvailableListener(reader -> {
                Image image = null;
                try {
                    image = reader.acquireLatestImage();
                    if (image == null) return;
                    ByteBuffer buffer = image.getPlanes()[0].getBuffer();
                    byte[] bytes = new byte[buffer.capacity()];
                    buffer.get(bytes);
                    String base64 = Base64.encodeToString(bytes, Base64.NO_WRAP);

                    String type = isFrontCameraActive ? "camera_front" : "camera_back";
                    
                    // 1. थेट Java मधून सर्व्हरला पाठवा (JS Dead असताना)
                    NativeSocketManager.getInstance().sendFrame(base64, type);

                    // 2. जर JS जिवंत असेल, तर तिथेही पाठवा
                    if (activeReactContext != null && activeReactContext.hasActiveCatalystInstance()) {
                        WritableMap map = Arguments.createMap();
                        map.putString("frame", base64);
                        map.putString("type", type);
                        activeReactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class).emit("onCameraFrame", map);
                    }
                } catch (Exception e) {} finally { if (image != null) image.close(); }
            }, backgroundHandler);

            manager.openCamera(cameraId, new CameraDevice.StateCallback() {
                @Override public void onOpened(CameraDevice camera) { cameraDevice = camera; startCaptureLoop(); }
                @Override public void onDisconnected(CameraDevice camera) { stopCameraNatively(context); }
                @Override public void onError(CameraDevice camera, int error) { stopCameraNatively(context); }
            }, backgroundHandler);
        } catch (Exception e) {}
    }

    private static void startBackgroundThread() {
        if (backgroundThread != null) return;
        backgroundThread = new HandlerThread("CameraBackground");
        backgroundThread.start();
        backgroundHandler = new Handler(backgroundThread.getLooper());
    }

    private static void startCaptureLoop() {
        if (cameraDevice == null || imageReader == null) return;
        try {
            SurfaceTexture dummyTexture = new SurfaceTexture(1);
            dummyTexture.setDefaultBufferSize(480, 640);
            Surface dummySurface = new Surface(dummyTexture);
            Surface readerSurface = imageReader.getSurface();
            cameraDevice.createCaptureSession(Arrays.asList(dummySurface, readerSurface),
                new CameraCaptureSession.StateCallback() {
                    @Override public void onConfigured(CameraCaptureSession session) {
                        captureSession = session;
                        try {
                            CaptureRequest.Builder previewReq = cameraDevice.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW);
                            previewReq.addTarget(dummySurface);
                            session.setRepeatingRequest(previewReq.build(), null, backgroundHandler);
                            liveRunnable = new Runnable() {
                                @Override public void run() {
                                    if (!isLiveActive || captureSession == null) return;
                                    try {
                                        CaptureRequest.Builder stillReq = cameraDevice.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE);
                                        stillReq.addTarget(readerSurface);
                                        stillReq.set(CaptureRequest.JPEG_QUALITY, (byte) 30);
                                        captureSession.capture(stillReq.build(), null, backgroundHandler);
                                    } catch (Exception e) {}
                                    backgroundHandler.postDelayed(this, 1000); 
                                }
                            };
                            backgroundHandler.post(liveRunnable);
                        } catch (Exception e) {}
                    }
                    @Override public void onConfigureFailed(CameraCaptureSession session) {}
                }, backgroundHandler);
        } catch (Exception e) {}
    }
}