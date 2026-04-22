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
import com.facebook.react.bridge.*;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import java.nio.ByteBuffer;
import java.util.Arrays;

public class RemoteCameraModule extends ReactContextBaseJavaModule {
    private final ReactApplicationContext reactContext;
    private CameraDevice cameraDevice;
    private CameraCaptureSession captureSession;
    private ImageReader imageReader;
    private HandlerThread backgroundThread;
    private Handler backgroundHandler;
    
    private boolean isLiveActive = false;
    private boolean isFrontCameraActive = false;
    private Runnable liveRunnable;

    public RemoteCameraModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
    }

    @Override public String getName() { return "RemoteCamera"; }
    @ReactMethod public void addListener(String eventName) {}
    @ReactMethod public void removeListeners(double count) {}
    @ReactMethod public void setChildInfo(String cId, String pId, Promise promise) { promise.resolve(true); }

    @ReactMethod
    public void startLiveCamera(boolean useFront, int intervalSeconds, Promise promise) {
        if (isLiveActive) { promise.resolve(true); return; }
        isLiveActive = true;
        isFrontCameraActive = useFront;
        
        try {
            Intent serviceIntent = new Intent(reactContext, RemoteCameraService.class);
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                reactContext.startForegroundService(serviceIntent);
            } else {
                reactContext.startService(serviceIntent);
            }
        } catch(Exception e) {}

        startBackgroundThread();
        openCamera(useFront);
        promise.resolve(true);
    }

    @ReactMethod
    public void stopLiveCamera(Promise promise) {
        isLiveActive = false;
        try { reactContext.stopService(new Intent(reactContext, RemoteCameraService.class)); } catch(Exception e) {}
        stopCamera();
        promise.resolve(true);
    }

    private void startBackgroundThread() {
        if (backgroundThread != null && backgroundThread.isAlive()) return;
        backgroundThread = new HandlerThread("CameraBackground");
        backgroundThread.start();
        backgroundHandler = new Handler(backgroundThread.getLooper());
    }

    private void openCamera(boolean useFront) {
        CameraManager manager = (CameraManager) reactContext.getSystemService(Context.CAMERA_SERVICE);
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
                    WritableMap map = Arguments.createMap();
                    map.putString("frame", base64);
                    map.putString("type", isFrontCameraActive ? "camera_front" : "camera_back");
                    reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class).emit("onCameraFrame", map);
                } catch (Exception e) {} finally { if (image != null) image.close(); }
            }, backgroundHandler);

            manager.openCamera(cameraId, new CameraDevice.StateCallback() {
                @Override public void onOpened(CameraDevice camera) { cameraDevice = camera; startCaptureLoop(); }
                @Override public void onDisconnected(CameraDevice camera) { stopCamera(); }
                @Override public void onError(CameraDevice camera, int error) { stopCamera(); }
            }, backgroundHandler);
        } catch (Exception e) {}
    }

    private void startCaptureLoop() {
        if (cameraDevice == null || imageReader == null) return;
        try {
            SurfaceTexture dummyTexture = new SurfaceTexture(1);
            dummyTexture.setDefaultBufferSize(480, 640);
            Surface dummySurface = new Surface(dummyTexture);
            Surface readerSurface = imageReader.getSurface();

            cameraDevice.createCaptureSession(Arrays.asList(dummySurface, readerSurface), new CameraCaptureSession.StateCallback() {
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

    private void stopCamera() {
        if (liveRunnable != null && backgroundHandler != null) { backgroundHandler.removeCallbacks(liveRunnable); liveRunnable = null; }
        if (captureSession != null) { captureSession.close(); captureSession = null; }
        if (cameraDevice != null) { cameraDevice.close(); cameraDevice = null; }
        if (imageReader != null) { imageReader.close(); imageReader = null; }
        if (backgroundThread != null) { backgroundThread.quitSafely(); backgroundThread = null; }
    }
}