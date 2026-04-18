// android/app/src/main/java/com/kidshield/RemoteCameraModule.java
// AirDroid-style remote camera snapshot

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

import com.facebook.react.bridge.*;
import com.google.firebase.firestore.FirebaseFirestore;
import com.google.firebase.auth.FirebaseAuth;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.text.SimpleDateFormat;
import java.util.*;

public class RemoteCameraModule extends ReactContextBaseJavaModule {

    private final ReactApplicationContext reactContext;
    private CameraDevice cameraDevice;
    private ImageReader imageReader;
    private HandlerThread backgroundThread;
    private Handler backgroundHandler;
    private FirebaseFirestore db;
    private String childId;

    public RemoteCameraModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
        this.db = FirebaseFirestore.getInstance();
    }

    @Override
    public String getName() { return "RemoteCamera"; }

    // ── Take snapshot and upload to Firebase ──
    @ReactMethod
    public void takeSnapshot(String requestId, Promise promise) {
        try {
            childId = FirebaseAuth.getInstance().getCurrentUser().getUid();
            startBackgroundThread();
            openCamera(requestId, promise);
        } catch (Exception e) {
            promise.reject("CAMERA_ERROR", e.getMessage());
        }
    }

    private void startBackgroundThread() {
        backgroundThread = new HandlerThread("CameraBackground");
        backgroundThread.start();
        backgroundHandler = new Handler(backgroundThread.getLooper());
    }

    private void openCamera(String requestId, Promise promise) {
        CameraManager manager = (CameraManager) reactContext.getSystemService(Context.CAMERA_SERVICE);
        try {
            // Back camera use करा
            String cameraId = manager.getCameraIdList()[0];
            CameraCharacteristics characteristics = manager.getCameraCharacteristics(cameraId);

            // Image reader setup
            imageReader = ImageReader.newInstance(1280, 720, ImageFormat.JPEG, 1);
            imageReader.setOnImageAvailableListener(reader -> {
                Image image = null;
                try {
                    image = reader.acquireLatestImage();
                    ByteBuffer buffer = image.getPlanes()[0].getBuffer();
                    byte[] bytes = new byte[buffer.capacity()];
                    buffer.get(bytes);

                    // Base64 encode
                    String base64Image = Base64.encodeToString(bytes, Base64.DEFAULT);

                    // Firebase वर upload
                    uploadToFirebase(base64Image, requestId, promise);

                } catch (Exception e) {
                    promise.reject("CAPTURE_ERROR", e.getMessage());
                } finally {
                    if (image != null) image.close();
                    stopCamera();
                }
            }, backgroundHandler);

            // Camera open
            manager.openCamera(cameraId, new CameraDevice.StateCallback() {
                @Override
                public void onOpened(CameraDevice camera) {
                    cameraDevice = camera;
                    capturePhoto();
                }
                @Override
                public void onDisconnected(CameraDevice camera) { camera.close(); }
                @Override
                public void onError(CameraDevice camera, int error) {
                    camera.close();
                    promise.reject("CAMERA_OPEN_ERROR", "Camera open failed: " + error);
                }
            }, backgroundHandler);

        } catch (Exception e) {
            promise.reject("CAMERA_ERROR", e.getMessage());
        }
    }

    private void capturePhoto() {
        try {
            SurfaceTexture texture = new SurfaceTexture(0);
            texture.setDefaultBufferSize(1280, 720);
            Surface textureSurface = new Surface(texture);
            Surface readerSurface = imageReader.getSurface();

            cameraDevice.createCaptureSession(
                Arrays.asList(textureSurface, readerSurface),
                new CameraCaptureSession.StateCallback() {
                    @Override
                    public void onConfigured(CameraCaptureSession session) {
                        try {
                            CaptureRequest.Builder builder =
                                cameraDevice.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE);
                            builder.addTarget(readerSurface);
                            builder.set(CaptureRequest.CONTROL_MODE, CameraMetadata.CONTROL_MODE_AUTO);
                            session.capture(builder.build(), null, backgroundHandler);
                        } catch (Exception e) { e.printStackTrace(); }
                    }
                    @Override
                    public void onConfigureFailed(CameraCaptureSession session) {}
                },
                backgroundHandler
            );
        } catch (Exception e) { e.printStackTrace(); }
    }

    private void uploadToFirebase(String base64Image, String requestId, Promise promise) {
        String timestamp = new SimpleDateFormat("yyyy-MM-dd_HH:mm:ss", Locale.getDefault())
            .format(new Date());

        Map<String, Object> data = new HashMap<>();
        data.put("childId", childId);
        data.put("imageBase64", base64Image);
        data.put("timestamp", timestamp);
        data.put("requestId", requestId);
        data.put("type", "camera_snapshot");

        db.collection("remoteCaptures")
            .add(data)
            .addOnSuccessListener(ref -> {
                promise.resolve(ref.getId());
            })
            .addOnFailureListener(e -> {
                promise.reject("UPLOAD_ERROR", e.getMessage());
            });
    }

    private void stopCamera() {
        if (cameraDevice != null) {
            cameraDevice.close();
            cameraDevice = null;
        }
        if (backgroundThread != null) {
            backgroundThread.quitSafely();
        }
    }

    // ── Front camera snapshot ──
    @ReactMethod
    public void takeFrontSnapshot(String requestId, Promise promise) {
        try {
            childId = FirebaseAuth.getInstance().getCurrentUser().getUid();
            startBackgroundThread();
            openFrontCamera(requestId, promise);
        } catch (Exception e) {
            promise.reject("CAMERA_ERROR", e.getMessage());
        }
    }

    private void openFrontCamera(String requestId, Promise promise) {
        CameraManager manager = (CameraManager) reactContext.getSystemService(Context.CAMERA_SERVICE);
        try {
            String frontCameraId = null;
            for (String id : manager.getCameraIdList()) {
                CameraCharacteristics chars = manager.getCameraCharacteristics(id);
                Integer facing = chars.get(CameraCharacteristics.LENS_FACING);
                if (facing != null && facing == CameraCharacteristics.LENS_FACING_FRONT) {
                    frontCameraId = id;
                    break;
                }
            }
            if (frontCameraId == null) {
                promise.reject("NO_FRONT_CAMERA", "Front camera not found");
                return;
            }

            imageReader = ImageReader.newInstance(640, 480, ImageFormat.JPEG, 1);
            imageReader.setOnImageAvailableListener(reader -> {
                Image image = null;
                try {
                    image = reader.acquireLatestImage();
                    ByteBuffer buffer = image.getPlanes()[0].getBuffer();
                    byte[] bytes = new byte[buffer.capacity()];
                    buffer.get(bytes);
                    String base64Image = Base64.encodeToString(bytes, Base64.DEFAULT);
                    uploadToFirebase(base64Image, requestId, promise);
                } catch (Exception e) {
                    promise.reject("CAPTURE_ERROR", e.getMessage());
                } finally {
                    if (image != null) image.close();
                    stopCamera();
                }
            }, backgroundHandler);

            final String finalCameraId = frontCameraId;
            manager.openCamera(finalCameraId, new CameraDevice.StateCallback() {
                @Override
                public void onOpened(CameraDevice camera) {
                    cameraDevice = camera;
                    capturePhoto();
                }
                @Override
                public void onDisconnected(CameraDevice camera) { camera.close(); }
                @Override
                public void onError(CameraDevice camera, int error) {
                    camera.close();
                    promise.reject("CAMERA_OPEN_ERROR", "Camera open failed: " + error);
                }
            }, backgroundHandler);

        } catch (Exception e) {
            promise.reject("CAMERA_ERROR", e.getMessage());
        }
    }
}
