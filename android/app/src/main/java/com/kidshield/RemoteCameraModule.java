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
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.firestore.FirebaseFirestore;
import java.nio.ByteBuffer;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;

public class RemoteCameraModule extends ReactContextBaseJavaModule {
    private final ReactApplicationContext reactContext;
    private CameraDevice cameraDevice;
    private ImageReader imageReader;
    private HandlerThread backgroundThread;
    private Handler backgroundHandler;
    private String childId, parentId, childDocId;

    public RemoteCameraModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
    }
    @Override public String getName() { return "RemoteCamera"; }

    @ReactMethod
    public void setChildInfo(String cId, String pId, String docId, Promise promise) {
        this.childId = cId; this.parentId = pId; this.childDocId = docId;
        promise.resolve(true);
    }

    @ReactMethod
    public void takeSnapshot(String requestId, Promise promise) {
        openCamera(false, requestId, promise);
    }

    @ReactMethod
    public void takeFrontSnapshot(String requestId, Promise promise) {
        openCamera(true, requestId, promise);
    }

    private void startBackgroundThread() {
        backgroundThread = new HandlerThread("CameraBackground");
        backgroundThread.start();
        backgroundHandler = new Handler(backgroundThread.getLooper());
    }

    private void openCamera(boolean front, String requestId, Promise promise) {
        try {
            if (childId == null && FirebaseAuth.getInstance().getCurrentUser() != null)
                childId = FirebaseAuth.getInstance().getCurrentUser().getUid();
            startBackgroundThread();
            CameraManager manager = (CameraManager) reactContext.getSystemService(Context.CAMERA_SERVICE);
            String cameraId = null;
            for (String id : manager.getCameraIdList()) {
                CameraCharacteristics chars = manager.getCameraCharacteristics(id);
                Integer facing = chars.get(CameraCharacteristics.LENS_FACING);
                if (front && facing != null && facing == CameraCharacteristics.LENS_FACING_FRONT) { cameraId = id; break; }
                if (!front && facing != null && facing == CameraCharacteristics.LENS_FACING_BACK) { cameraId = id; break; }
            }
            if (cameraId == null) cameraId = manager.getCameraIdList()[0];
            int w = front ? 640 : 1280, h = front ? 480 : 720;
            imageReader = ImageReader.newInstance(w, h, ImageFormat.JPEG, 1);
            imageReader.setOnImageAvailableListener(reader -> {
                Image image = null;
                try {
                    image = reader.acquireLatestImage();
                    ByteBuffer buffer = image.getPlanes()[0].getBuffer();
                    byte[] bytes = new byte[buffer.capacity()];
                    buffer.get(bytes);
                    String base64 = Base64.encodeToString(bytes, Base64.NO_WRAP);
                    uploadFrame("data:image/jpeg;base64," + base64, front ? "camera_front" : "camera_back", promise);
                } catch (Exception e) { promise.reject("CAPTURE_ERROR", e.getMessage()); }
                finally { if (image != null) image.close(); stopCamera(); }
            }, backgroundHandler);
            final String finalId = cameraId;
            manager.openCamera(finalId, new CameraDevice.StateCallback() {
                @Override public void onOpened(CameraDevice camera) { cameraDevice = camera; capturePhoto(); }
                @Override public void onDisconnected(CameraDevice camera) { camera.close(); }
                @Override public void onError(CameraDevice camera, int error) { camera.close(); promise.reject("CAMERA_OPEN_ERROR", "Error: " + error); }
            }, backgroundHandler);
        } catch (Exception e) { promise.reject("CAMERA_ERROR", e.getMessage()); }
    }

    private void capturePhoto() {
        try {
            SurfaceTexture texture = new SurfaceTexture(0);
            texture.setDefaultBufferSize(imageReader.getWidth(), imageReader.getHeight());
            Surface textureSurface = new Surface(texture);
            Surface readerSurface = imageReader.getSurface();
            cameraDevice.createCaptureSession(Arrays.asList(textureSurface, readerSurface),
                new CameraCaptureSession.StateCallback() {
                    @Override public void onConfigured(CameraCaptureSession session) {
                        try {
                            CaptureRequest.Builder builder = cameraDevice.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE);
                            builder.addTarget(readerSurface);
                            builder.set(CaptureRequest.CONTROL_MODE, CameraMetadata.CONTROL_MODE_AUTO);
                            session.capture(builder.build(), null, backgroundHandler);
                        } catch (Exception e) { e.printStackTrace(); }
                    }
                    @Override public void onConfigureFailed(CameraCaptureSession session) {}
                }, backgroundHandler);
        } catch (Exception e) { e.printStackTrace(); }
    }

    private void uploadFrame(String base64Frame, String type, Promise promise) {
        try {
            FirebaseFirestore db = FirebaseFirestore.getInstance();
            Map<String, Object> data = new HashMap<>();
            data.put("liveFrame", base64Frame);
            data.put("liveFrameType", type);
            data.put("liveFrameAt", com.google.firebase.Timestamp.now());
            if (parentId != null && childDocId != null) {
                db.collection("families").document(parentId)
                    .collection("children").document(childDocId)
                    .update(data)
                    .addOnSuccessListener(v -> promise.resolve(true))
                    .addOnFailureListener(e -> promise.reject("UPLOAD_ERROR", e.getMessage()));
            } else {
                if (childId != null) db.collection("remoteCaptures").document(childId).set(data);
                promise.resolve(true);
            }
        } catch (Exception e) { promise.reject("UPLOAD_ERROR", e.getMessage()); }
    }

    private void stopCamera() {
        if (cameraDevice != null) { cameraDevice.close(); cameraDevice = null; }
        if (backgroundThread != null) { backgroundThread.quitSafely(); backgroundThread = null; }
    }
}
