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
    private String parentId;
    private boolean isLiveActive = false;
    private Runnable liveRunnable;
    private Handler liveHandler;
    private HandlerThread liveThread;
    private String currentCameraId = null;

    public RemoteCameraModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
        this.db = FirebaseFirestore.getInstance();
    }

    @Override public String getName() { return "RemoteCamera"; }

    @ReactMethod
    public void setChildInfo(String cId, String pId, Promise promise) {
        this.childId = cId;
        this.parentId = pId;
        promise.resolve(true);
    }

    // â”€â”€ Back camera snapshot â”€â”€
    @ReactMethod
    public void takeSnapshot(String requestId, Promise promise) {
        try {
            childId = childId != null ? childId :
                (FirebaseAuth.getInstance().getCurrentUser() != null ?
                    FirebaseAuth.getInstance().getCurrentUser().getUid() : null);
            startBackgroundThread();
            openCamera(false, requestId, promise, false);
        } catch (Exception e) { promise.reject("CAMERA_ERROR", e.getMessage()); }
    }

    // â”€â”€ Front camera snapshot â”€â”€
    @ReactMethod
    public void takeFrontSnapshot(String requestId, Promise promise) {
        try {
            childId = childId != null ? childId :
                (FirebaseAuth.getInstance().getCurrentUser() != null ?
                    FirebaseAuth.getInstance().getCurrentUser().getUid() : null);
            startBackgroundThread();
            openCamera(true, requestId, promise, false);
        } catch (Exception e) { promise.reject("CAMERA_ERROR", e.getMessage()); }
    }

    // â”€â”€ Start live camera stream â”€â”€
    @ReactMethod
    public void startLiveCamera(boolean useFront, int intervalSeconds, Promise promise) {
        if (isLiveActive) { promise.resolve(true); return; }
        childId = childId != null ? childId :
            (FirebaseAuth.getInstance().getCurrentUser() != null ?
                FirebaseAuth.getInstance().getCurrentUser().getUid() : null);
        isLiveActive = true;
        liveThread = new HandlerThread("LiveCameraThread");
        liveThread.start();
        liveHandler = new Handler(liveThread.getLooper());

        liveRunnable = new Runnable() {
            @Override
            public void run() {
                if (!isLiveActive) return;
                captureLiveFrame(useFront);
                liveHandler.postDelayed(this, intervalSeconds * 1000L);
            }
        };
        liveHandler.post(liveRunnable);
        promise.resolve(true);
    }

    // â”€â”€ Stop live camera â”€â”€
    @ReactMethod
    public void stopLiveCamera(Promise promise) {
        isLiveActive = false;
        if (liveRunnable != null && liveHandler != null) {
            liveHandler.removeCallbacks(liveRunnable);
        }
        stopCamera();
        promise.resolve(true);
    }

    private void captureLiveFrame(boolean useFront) {
        startBackgroundThread();
        openCamera(useFront, "live_" + System.currentTimeMillis(), null, true);
    }

    private void startBackgroundThread() {
        if (backgroundThread != null && backgroundThread.isAlive()) return;
        backgroundThread = new HandlerThread("CameraBackground");
        backgroundThread.start();
        backgroundHandler = new Handler(backgroundThread.getLooper());
    }

    private void openCamera(boolean useFront, String requestId, Promise promise, boolean isLive) {
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
            if (cameraId == null) {
                if (promise != null) promise.reject("NO_CAMERA", "Camera not found");
                return;
            }
            currentCameraId = cameraId;
            int w = useFront ? 640 : 1280;
            int h = useFront ? 480 : 720;
            imageReader = ImageReader.newInstance(w, h, ImageFormat.JPEG, 1);
            final String finalCameraId = cameraId;
            imageReader.setOnImageAvailableListener(reader -> {
                Image image = null;
                try {
                    image = reader.acquireLatestImage();
                    if (image == null) return;
                    ByteBuffer buffer = image.getPlanes()[0].getBuffer();
                    byte[] bytes = new byte[buffer.capacity()];
                    buffer.get(bytes);
                    String base64 = Base64.encodeToString(bytes, Base64.NO_WRAP);
                    if (isLive) {
                        uploadLiveFrame(base64, useFront);
                    } else {
                        uploadToFirebase(base64, requestId, promise, useFront);
                    }
                } catch (Exception e) {
                    if (promise != null) promise.reject("CAPTURE_ERROR", e.getMessage());
                } finally {
                    if (image != null) image.close();
                    if (!isLive) stopCamera();
                }
            }, backgroundHandler);

            manager.openCamera(cameraId, new CameraDevice.StateCallback() {
                @Override
                public void onOpened(CameraDevice camera) {
                    cameraDevice = camera;
                    capturePhoto();
                }
                @Override public void onDisconnected(CameraDevice camera) { camera.close(); }
                @Override public void onError(CameraDevice camera, int error) {
                    camera.close();
                    if (promise != null) promise.reject("CAMERA_OPEN_ERROR", "Error: " + error);
                }
            }, backgroundHandler);

        } catch (Exception e) {
            if (promise != null) promise.reject("CAMERA_ERROR", e.getMessage());
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
                    @Override public void onConfigureFailed(CameraCaptureSession session) {}
                }, backgroundHandler
            );
        } catch (Exception e) { e.printStackTrace(); }
    }

    private void uploadLiveFrame(String base64, boolean isFront) {
        if (childId == null) return;
        Map<String, Object> data = new HashMap<>();
        data.put("liveFrame", base64);
        data.put("liveFrameAt", new Date().getTime());
        data.put("liveType", isFront ? "camera_front" : "camera_back");

        if (parentId != null && !parentId.isEmpty()) {
            db.collection("families").document(parentId)
                .collection("children").document(childId)
                .update(data);
        }
        // History
        Map<String, Object> history = new HashMap<>();
        history.put("childId", childId);
        history.put("imageBase64", base64);
        history.put("type", isFront ? "camera_front" : "camera_snapshot");
        history.put("timestamp", new Date().toString());
        db.collection("remoteCaptures").add(history);
    }

    private void uploadToFirebase(String base64, String requestId, Promise promise, boolean isFront) {
        Map<String, Object> data = new HashMap<>();
        data.put("childId", childId);
        data.put("imageBase64", base64);
        data.put("timestamp", new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()).format(new Date()));
        data.put("requestId", requestId);
        data.put("type", isFront ? "camera_front" : "camera_snapshot");
        db.collection("remoteCaptures").add(data)
            .addOnSuccessListener(ref -> { if (promise != null) promise.resolve(ref.getId()); })
            .addOnFailureListener(e -> { if (promise != null) promise.reject("UPLOAD_ERROR", e.getMessage()); });
    }

    private void stopCamera() {
        if (cameraDevice != null) { cameraDevice.close(); cameraDevice = null; }
        if (backgroundThread != null) { backgroundThread.quitSafely(); backgroundThread = null; }
    }
}