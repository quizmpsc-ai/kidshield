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

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.util.Arrays;

public class RemoteCameraModule extends ReactContextBaseJavaModule {
    private final ReactApplicationContext reactContext;
    private CameraDevice cameraDevice;
    private ImageReader imageReader;
    private HandlerThread backgroundThread;
    private Handler backgroundHandler;
    
    // Class level variables
    private boolean isLiveActive = false;
    private Runnable liveRunnable;
    private Handler liveHandler;
    private HandlerThread liveThread;
    private boolean isFrontCameraActive = false;

    public RemoteCameraModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
    }

    @Override
    public String getName() { return "RemoteCamera"; }

    @ReactMethod
    public void setChildInfo(String cId, String pId, Promise promise) {
        promise.resolve(true);
    }

    @ReactMethod
    public void startLiveCamera(boolean useFront, int intervalSeconds, Promise promise) {
        if (isLiveActive) { promise.resolve(true); return; }

        isLiveActive = true;
        isFrontCameraActive = useFront;
        
        // Start Foreground Service to satisfy Android 10+
        try {
            Intent serviceIntent = new Intent(reactContext, RemoteCameraService.class);
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                reactContext.startForegroundService(serviceIntent);
            } else {
                reactContext.startService(serviceIntent);
            }
        } catch(Exception e) { e.printStackTrace(); }

        liveThread = new HandlerThread("LiveCameraThread");
        liveThread.start();
        liveHandler = new Handler(liveThread.getLooper());

        int intervalMs = Math.max(500, intervalSeconds * 1000);

        liveRunnable = new Runnable() {
            @Override
            public void run() {
                if (!isLiveActive) return;
                captureLiveFrame(isFrontCameraActive);
                liveHandler.postDelayed(this, intervalMs);
            }
        };
        liveHandler.post(liveRunnable);
        promise.resolve(true);
    }

    @ReactMethod
    public void stopLiveCamera(Promise promise) {
        isLiveActive = false;
        
        // Stop Foreground Service
        try {
            Intent serviceIntent = new Intent(reactContext, RemoteCameraService.class);
            reactContext.stopService(serviceIntent);
        } catch(Exception e) { e.printStackTrace(); }

        if (liveRunnable != null && liveHandler != null) {
            liveHandler.removeCallbacks(liveRunnable);
        }
        stopCamera();
        promise.resolve(true);
    }

    private void captureLiveFrame(boolean useFront) {
        startBackgroundThread();
        openCamera(useFront);
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
            if (useFront) {
                for (String id : manager.getCameraIdList()) {
                    CameraCharacteristics chars = manager.getCameraCharacteristics(id);
                    Integer facing = chars.get(CameraCharacteristics.LENS_FACING);
                    if (facing != null && facing == CameraCharacteristics.LENS_FACING_FRONT) {
                        cameraId = id; break;
                    }
                }
            } else {
                cameraId = manager.getCameraIdList()[0];
            }
            if (cameraId == null) return;

            int w = 640;
            int h = 480;

            imageReader = ImageReader.newInstance(w, h, ImageFormat.JPEG, 1);

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
                    map.putString("type", useFront ? "camera_front" : "camera_back");

                    reactContext
                        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                        .emit("onCameraFrame", map);

                } catch (Exception e) {
                    e.printStackTrace();
                } finally {
                    if (image != null) image.close();
                    if (!isLiveActive) stopCamera();
                }
            }, backgroundHandler);

            manager.openCamera(cameraId, new CameraDevice.StateCallback() {
                @Override
                public void onOpened(CameraDevice camera) {
                    cameraDevice = camera;
                    capturePhoto();
                }
                @Override public void onDisconnected(CameraDevice camera) { camera.close(); }
                @Override public void onError(CameraDevice camera, int error) { camera.close(); }
            }, backgroundHandler);

        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void capturePhoto() {
        try {
            SurfaceTexture texture = new SurfaceTexture(0);
            texture.setDefaultBufferSize(640, 480);
            Surface textureSurface = new Surface(texture);
            Surface readerSurface = imageReader.getSurface();

            cameraDevice.createCaptureSession(
                Arrays.asList(textureSurface, readerSurface),
                new CameraCaptureSession.StateCallback() {
                    @Override
                    public void onConfigured(CameraCaptureSession session) {
                        try {
                            CaptureRequest.Builder builder = cameraDevice.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE);
                            builder.addTarget(readerSurface);
                            builder.set(CaptureRequest.JPEG_QUALITY, (byte) 30);
                            session.capture(builder.build(), null, backgroundHandler);
                        } catch (Exception e) { e.printStackTrace(); }
                    }
                    @Override public void onConfigureFailed(CameraCaptureSession session) {}
                }, backgroundHandler
            );
        } catch (Exception e) { e.printStackTrace(); }
    }

    private void stopCamera() {
        if (cameraDevice != null) { cameraDevice.close(); cameraDevice = null; }
        if (backgroundThread != null) { backgroundThread.quitSafely(); backgroundThread = null; }
    }
}