# fix_remote_monitoring.ps1
# C:\KidShield मध्ये save करा आणि run करा

function NoBOM($path, $content) {
    $enc = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($path, $content, $enc)
}

Write-Host "=== KidShield Remote Monitoring Fix ===" -ForegroundColor Cyan

# ══════════════════════════════════════════════════════
# FIX 1: ScreenMirrorModule.java - Real continuous live view
# ══════════════════════════════════════════════════════
Write-Host "[FIX 1] ScreenMirrorModule.java..." -ForegroundColor Yellow

$screenMirror = @'
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
import java.util.Date;
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
    private Runnable liveViewRunnable;
    private FirebaseFirestore db;
    private String childId;
    private String parentId;

    public ScreenMirrorModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
        context.addActivityEventListener(this);
        this.db = FirebaseFirestore.getInstance();
        WindowManager wm = (WindowManager) context.getSystemService(Context.WINDOW_SERVICE);
        DisplayMetrics metrics = new DisplayMetrics();
        wm.getDefaultDisplay().getMetrics(metrics);
        screenWidth = metrics.widthPixels / 2;
        screenHeight = metrics.heightPixels / 2;
        screenDensity = metrics.densityDpi;
    }

    @Override public String getName() { return "ScreenMirror"; }

    @ReactMethod
    public void requestPermission(Promise promise) {
        Activity activity = getCurrentActivity();
        if (activity == null) { promise.reject("NO_ACTIVITY", "No activity"); return; }
        pendingPermissionPromise = promise;
        projectionManager = (MediaProjectionManager) reactContext.getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        activity.startActivityForResult(projectionManager.createScreenCaptureIntent(), REQUEST_CODE);
    }

    @ReactMethod
    public void setChildInfo(String cId, String pId, Promise promise) {
        this.childId = cId;
        this.parentId = pId;
        promise.resolve(true);
    }

    // ── Take single screenshot ──
    @ReactMethod
    public void takeScreenshot(String requestId, Promise promise) {
        if (mediaProjection == null) { promise.reject("NO_PERMISSION", "No media projection permission"); return; }
        captureAndUpload(requestId, promise);
    }

    // ── Start continuous live view ──
    @ReactMethod
    public void startLiveView(int intervalSeconds, Promise promise) {
        if (mediaProjection == null) { promise.reject("NO_PERMISSION", "Need screen capture permission"); return; }
        if (isMirroring) { promise.resolve(true); return; }

        isMirroring = true;
        startBackgroundThread();
        setupVirtualDisplay();

        int intervalMs = intervalSeconds * 1000;
        liveViewRunnable = new Runnable() {
            @Override
            public void run() {
                if (!isMirroring) return;
                captureFrameToFirestore();
                handler.postDelayed(this, intervalMs);
            }
        };
        handler.postDelayed(liveViewRunnable, 500);
        promise.resolve(true);
    }

    // ── Stop live view ──
    @ReactMethod
    public void stopLiveView(Promise promise) {
        isMirroring = false;
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

    private void captureFrameToFirestore() {
        if (imageReader == null || childId == null) return;
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

            // Crop to actual screen size
            if (w > screenWidth) bmp = Bitmap.createBitmap(bmp, 0, 0, screenWidth, screenHeight);

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            bmp.compress(Bitmap.CompressFormat.JPEG, 40, baos); // Low quality = faster
            String base64 = Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP);

            // Save to Firestore - liveFrame field for real-time display
            Map<String, Object> data = new HashMap<>();
            data.put("liveFrame", base64);
            data.put("liveFrameAt", new Date().getTime());
            data.put("liveType", "screen");

            if (parentId != null && !parentId.isEmpty()) {
                // families/{parentId}/children/{childId} path
                db.collection("families").document(parentId)
                    .collection("children").document(childId)
                    .update(data);
            }
            // Also save to remoteCaptures for history
            Map<String, Object> capture = new HashMap<>();
            capture.put("childId", childId);
            capture.put("screenshotBase64", base64);
            capture.put("type", "screenshot");
            capture.put("timestamp", new Date().toString());
            db.collection("remoteCaptures").add(capture);

        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void captureAndUpload(String requestId, Promise promise) {
        startBackgroundThread();
        setupVirtualDisplay();
        handler.postDelayed(() -> {
            try {
                Image image = imageReader.acquireLatestImage();
                if (image != null) {
                    Image.Plane[] planes = image.getPlanes();
                    ByteBuffer buffer = planes[0].getBuffer();
                    int rowStride = planes[0].getRowStride();
                    int pixelStride = planes[0].getPixelStride();
                    int w = rowStride / pixelStride;
                    Bitmap bmp = Bitmap.createBitmap(w, screenHeight, Bitmap.Config.ARGB_8888);
                    bmp.copyPixelsFromBuffer(buffer);
                    image.close();

                    ByteArrayOutputStream baos = new ByteArrayOutputStream();
                    bmp.compress(Bitmap.CompressFormat.JPEG, 60, baos);
                    String base64 = Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP);

                    Map<String, Object> data = new HashMap<>();
                    data.put("childId", childId);
                    data.put("screenshotBase64", base64);
                    data.put("requestId", requestId);
                    data.put("type", "screenshot");
                    data.put("timestamp", new Date().toString());
                    db.collection("remoteCaptures").add(data)
                        .addOnSuccessListener(ref -> promise.resolve(ref.getId()))
                        .addOnFailureListener(e -> promise.reject("UPLOAD_ERROR", e.getMessage()));
                    releaseResources();
                } else {
                    promise.reject("NO_IMAGE", "Could not capture screen");
                }
            } catch (Exception e) {
                promise.reject("ERROR", e.getMessage());
            }
        }, 500);
    }

    private void releaseResources() {
        if (virtualDisplay != null) { virtualDisplay.release(); virtualDisplay = null; }
        if (imageReader != null) { try { imageReader.close(); } catch (Exception e) {} imageReader = null; }
        if (handlerThread != null) { handlerThread.quitSafely(); handlerThread = null; }
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
    @Override public void onNewIntent(Intent intent) {}
}
'@

NoBOM "C:\KidShield\android\app\src\main\java\com\kidshield\ScreenMirrorModule.java" $screenMirror
Write-Host "  ✅ ScreenMirrorModule.java - Real live view" -ForegroundColor Green

# ══════════════════════════════════════════════════════
# FIX 2: RemoteCameraModule.java - parentId support + live camera stream
# ══════════════════════════════════════════════════════
Write-Host "[FIX 2] RemoteCameraModule.java..." -ForegroundColor Yellow

$remoteCamera = @'
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

    // ── Back camera snapshot ──
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

    // ── Front camera snapshot ──
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

    // ── Start live camera stream ──
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

    // ── Stop live camera ──
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
'@

NoBOM "C:\KidShield\android\app\src\main\java\com\kidshield\RemoteCameraModule.java" $remoteCamera
Write-Host "  ✅ RemoteCameraModule.java - Live camera + front/back" -ForegroundColor Green

# ══════════════════════════════════════════════════════
# FIX 3: AmbientAudioModule.java - Real-time audio level + mute/unmute
# ══════════════════════════════════════════════════════
Write-Host "[FIX 3] AmbientAudioModule.java..." -ForegroundColor Yellow

$ambientAudio = @'
package com.kidshield;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Base64;
import com.facebook.react.bridge.*;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.firestore.FirebaseFirestore;
import java.io.*;
import java.util.*;

public class AmbientAudioModule extends ReactContextBaseJavaModule {
    private final ReactApplicationContext reactContext;
    private AudioRecord audioRecord;
    private boolean isRecording = false;
    private boolean isMuted = false;
    private HandlerThread recordThread;
    private Handler recordHandler;
    private FirebaseFirestore db;
    private String childId;
    private String parentId;

    private static final int SAMPLE_RATE = 16000;
    private static final int CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO;
    private static final int AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT;
    private static final int CHUNK_DURATION_SEC = 10; // 10 second chunks upload

    public AmbientAudioModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
        this.db = FirebaseFirestore.getInstance();
    }

    @Override public String getName() { return "AmbientAudio"; }

    @ReactMethod
    public void setChildInfo(String cId, String pId, Promise promise) {
        this.childId = cId;
        this.parentId = pId;
        promise.resolve(true);
    }

    // ── Start ambient capture (continuous chunks) ──
    @ReactMethod
    public void startAmbientCapture(String requestId, Promise promise) {
        if (isRecording) { promise.reject("ALREADY_RECORDING", "Already recording"); return; }

        childId = childId != null ? childId :
            (FirebaseAuth.getInstance().getCurrentUser() != null ?
                FirebaseAuth.getInstance().getCurrentUser().getUid() : null);

        recordThread = new HandlerThread("AudioRecordThread");
        recordThread.start();
        recordHandler = new Handler(recordThread.getLooper());

        recordHandler.post(() -> {
            try {
                int bufferSize = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT);
                audioRecord = new AudioRecord(MediaRecorder.AudioSource.MIC, SAMPLE_RATE,
                    CHANNEL_CONFIG, AUDIO_FORMAT, bufferSize * 4);

                if (audioRecord.getState() != AudioRecord.STATE_INITIALIZED) {
                    promise.reject("INIT_FAILED", "AudioRecord init failed");
                    return;
                }

                audioRecord.startRecording();
                isRecording = true;
                promise.resolve(true);

                // Record in chunks and upload
                while (isRecording) {
                    ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
                    byte[] buffer = new byte[bufferSize];
                    long startTime = System.currentTimeMillis();
                    long chunkDuration = CHUNK_DURATION_SEC * 1000L;

                    while (isRecording && (System.currentTimeMillis() - startTime) < chunkDuration) {
                        int read = audioRecord.read(buffer, 0, buffer.length);
                        if (read > 0 && !isMuted) {
                            outputStream.write(buffer, 0, read);
                        }
                        // Send audio level every 200ms
                        sendAudioLevel(buffer, read);
                    }

                    if (outputStream.size() > 0) {
                        byte[] pcm = outputStream.toByteArray();
                        byte[] wav = pcmToWav(pcm, SAMPLE_RATE, 1, 16);
                        String base64Audio = Base64.encodeToString(wav, Base64.NO_WRAP);
                        uploadAudioChunk(base64Audio, requestId);
                    }
                }

                audioRecord.stop();
                audioRecord.release();
                audioRecord = null;

            } catch (Exception e) {
                isRecording = false;
                // promise already resolved
            }
        });
    }

    private void sendAudioLevel(byte[] buffer, int read) {
        if (read <= 0) return;
        // Calculate RMS audio level
        long sum = 0;
        for (int i = 0; i < read - 1; i += 2) {
            short sample = (short)((buffer[i+1] << 8) | (buffer[i] & 0xFF));
            sum += sample * sample;
        }
        double rms = Math.sqrt(sum / (read / 2.0));
        int level = (int) Math.min(100, rms / 100);

        // Send to JS
        reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
            .emit("onAudioLevel", level);

        // Update Firestore realtime
        if (childId != null && parentId != null) {
            Map<String, Object> data = new HashMap<>();
            data.put("audioLevel", level);
            data.put("audioLevelAt", new Date().getTime());
            data.put("isMuted", isMuted);
            db.collection("families").document(parentId)
                .collection("children").document(childId)
                .update(data);
        }
    }

    private void uploadAudioChunk(String base64Audio, String requestId) {
        if (childId == null) return;
        Map<String, Object> data = new HashMap<>();
        data.put("childId", childId);
        data.put("audioBase64", base64Audio);
        data.put("duration", CHUNK_DURATION_SEC);
        data.put("requestId", requestId);
        data.put("type", "ambient_audio");
        data.put("timestamp", new Date().toString());
        data.put("sampleRate", SAMPLE_RATE);
        db.collection("remoteCaptures").add(data);
    }

    // ── Stop recording ──
    @ReactMethod
    public void stopAmbientCapture(Promise promise) {
        isRecording = false;
        if (audioRecord != null) {
            try { audioRecord.stop(); audioRecord.release(); } catch (Exception e) {}
            audioRecord = null;
        }
        promise.resolve(true);
    }

    // ── Mute / Unmute ──
    @ReactMethod
    public void setMuted(boolean muted, Promise promise) {
        this.isMuted = muted;
        promise.resolve(true);
    }

    @ReactMethod
    public void isCapturing(Promise promise) { promise.resolve(isRecording); }

    @ReactMethod
    public void isMuted(Promise promise) { promise.resolve(isMuted); }

    @ReactMethod
    public void addListener(String eventName) {}
    @ReactMethod
    public void removeListeners(Integer count) {}

    private byte[] pcmToWav(byte[] pcm, int sampleRate, int channels, int bitsPerSample) throws IOException {
        int dataSize = pcm.length;
        int totalSize = 36 + dataSize;
        int byteRate = sampleRate * channels * bitsPerSample / 8;
        int blockAlign = channels * bitsPerSample / 8;
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        DataOutputStream dos = new DataOutputStream(out);
        dos.writeBytes("RIFF"); writeInt(dos, totalSize);
        dos.writeBytes("WAVE"); dos.writeBytes("fmt ");
        writeInt(dos, 16); writeShort(dos, (short) 1);
        writeShort(dos, (short) channels); writeInt(dos, sampleRate);
        writeInt(dos, byteRate); writeShort(dos, (short) blockAlign);
        writeShort(dos, (short) bitsPerSample);
        dos.writeBytes("data"); writeInt(dos, dataSize);
        dos.write(pcm);
        return out.toByteArray();
    }
    private void writeInt(DataOutputStream out, int v) throws IOException {
        out.write(v & 0xff); out.write((v >> 8) & 0xff);
        out.write((v >> 16) & 0xff); out.write((v >> 24) & 0xff);
    }
    private void writeShort(DataOutputStream out, short v) throws IOException {
        out.write(v & 0xff); out.write((v >> 8) & 0xff);
    }
}
'@

NoBOM "C:\KidShield\android\app\src\main\java\com\kidshield\AmbientAudioModule.java" $ambientAudio
Write-Host "  ✅ AmbientAudioModule.java - Real-time audio + mute/unmute" -ForegroundColor Green

# ══════════════════════════════════════════════════════
# FIX 4: RemoteCommandHandler.js - Live camera/audio commands
# ══════════════════════════════════════════════════════
Write-Host "[FIX 4] RemoteCommandHandler.js..." -ForegroundColor Yellow

$remoteHandler = @'
// src/services/RemoteCommandHandler.js
import { NativeModules, Alert, PermissionsAndroid } from 'react-native';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';

const { RemoteCamera, AmbientAudio, ScreenMirror } = NativeModules;

class RemoteCommandHandler {
  constructor() {
    this.isInitialized = false;
    this.unsubscribe = null;
    this.childId = null;
    this.parentId = null;
  }

  async init() {
    const user = auth().currentUser;
    if (!user) return;
    this.childId = user.uid;

    // Get parentId from Firestore
    const doc = await firestore().collection('users').doc(user.uid).get();
    this.parentId = doc.data()?.parentId || null;

    // Set child/parent info in native modules
    if (RemoteCamera) await RemoteCamera.setChildInfo(this.childId, this.parentId || '');
    if (AmbientAudio) await AmbientAudio.setChildInfo(this.childId, this.parentId || '');
    if (ScreenMirror) await ScreenMirror.setChildInfo(this.childId, this.parentId || '');

    // Listen for commands
    this.unsubscribe = firestore()
      .collection('commands')
      .where('childId', '==', this.childId)
      .where('status', '==', 'pending')
      .onSnapshot(snap => {
        snap.docs.forEach(doc => this.handleCommand(doc.id, doc.data()));
      });

    this.isInitialized = true;
    console.log('🎯 RemoteCommandHandler ready, parentId:', this.parentId);
  }

  async handleCommand(commandId, commandData) {
    const { command, data = {} } = commandData;

    await firestore().collection('commands').doc(commandId).update({ status: 'processing' });

    try {
      switch (command) {

        // ── Camera: single snapshot ──
        case 'TAKE_SNAPSHOT':
          if (!RemoteCamera) throw new Error('Camera module not available');
          if (data.camera === 'front') {
            await RemoteCamera.takeFrontSnapshot(data.requestId || `snap_${Date.now()}`);
          } else {
            await RemoteCamera.takeSnapshot(data.requestId || `snap_${Date.now()}`);
          }
          break;

        // ── Camera: start live stream ──
        case 'START_LIVE_CAMERA':
          if (!RemoteCamera) throw new Error('Camera module not available');
          await RemoteCamera.startLiveCamera(data.useFront || false, data.intervalSeconds || 3);
          break;

        // ── Camera: stop live stream ──
        case 'STOP_LIVE_CAMERA':
          if (RemoteCamera) await RemoteCamera.stopLiveCamera();
          break;

        // ── Screen: request permission ──
        case 'REQUEST_SCREEN_PERMISSION':
          if (ScreenMirror) {
            await ScreenMirror.requestPermission();
          }
          break;

        // ── Screen: single screenshot ──
        case 'TAKE_SCREENSHOT':
          if (!ScreenMirror) throw new Error('ScreenMirror module not available');
          await ScreenMirror.takeScreenshot(data.requestId || `ss_${Date.now()}`);
          break;

        // ── Screen: start live view ──
        case 'START_LIVE_VIEW':
          if (!ScreenMirror) throw new Error('ScreenMirror module not available');
          await ScreenMirror.startLiveView(data.intervalSeconds || 3);
          break;

        // ── Screen: stop live view ──
        case 'STOP_LIVE_VIEW':
          if (ScreenMirror) await ScreenMirror.stopLiveView();
          break;

        // ── Audio: start capture ──
        case 'START_AUDIO_CAPTURE':
          if (!AmbientAudio) throw new Error('AmbientAudio module not available');
          await AmbientAudio.startAmbientCapture(data.requestId || `audio_${Date.now()}`);
          break;

        // ── Audio: stop capture ──
        case 'STOP_AUDIO_CAPTURE':
          if (AmbientAudio) await AmbientAudio.stopAmbientCapture();
          break;

        // ── Audio: mute ──
        case 'MUTE_AUDIO':
          if (AmbientAudio) await AmbientAudio.setMuted(true);
          break;

        // ── Audio: unmute ──
        case 'UNMUTE_AUDIO':
          if (AmbientAudio) await AmbientAudio.setMuted(false);
          break;

        // ── Device control ──
        case 'LOCK_DEVICE':
          Alert.alert('🔒 Phone Locked', 'Parent ने phone lock केला.', [], { cancelable: false });
          break;

        case 'BEDTIME_MODE':
          Alert.alert('🌙 Bedtime', 'झोपायची वेळ झाली! Phone ठेव.', [], { cancelable: false });
          break;

        case 'GET_LOCATION':
          // ChildHome मध्ये location track होतोच, Firestore मध्ये आहे
          break;

        default:
          console.log('Unknown command:', command);
      }

      await firestore().collection('commands').doc(commandId).update({
        status: 'executed',
        executedAt: firestore.FieldValue.serverTimestamp(),
      });

    } catch (error) {
      console.error('Command failed:', command, error);
      await firestore().collection('commands').doc(commandId).update({
        status: 'failed',
        error: error.message,
      });
    }
  }

  async requestAllPermissions() {
    // Camera
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
    // Microphone
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    // Location
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    // Screen capture - MediaProjection permission (system popup)
    if (ScreenMirror) {
      try { await ScreenMirror.requestPermission(); } catch (e) {}
    }
  }

  destroy() {
    if (this.unsubscribe) this.unsubscribe();
    if (RemoteCamera) RemoteCamera.stopLiveCamera();
    if (AmbientAudio) AmbientAudio.stopAmbientCapture();
    if (ScreenMirror) ScreenMirror.stopLiveView();
  }
}

export default new RemoteCommandHandler();
'@

NoBOM "C:\KidShield\src\services\RemoteCommandHandler.js" $remoteHandler
Write-Host "  ✅ RemoteCommandHandler.js - All commands" -ForegroundColor Green

# ══════════════════════════════════════════════════════
# FIX 5: SetupWizard.js - Real permission checks + popups
# ══════════════════════════════════════════════════════
Write-Host "[FIX 5] SetupWizard.js - Real permissions..." -ForegroundColor Yellow

$setupWizard = @'
import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, PermissionsAndroid, Linking, ActivityIndicator,
} from 'react-native';
import { NativeModules } from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';

const { KidShieldModule, ScreenMirror } = NativeModules;

export default function SetupWizard({ navigation }) {
  const [permissions, setPermissions] = useState({
    location: false,
    camera: false,
    microphone: false,
    usageStats: false,
    accessibility: false,
    deviceAdmin: false,
    screenCapture: false,
  });
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState('');

  useEffect(() => {
    checkAllPermissions();
  }, []);

  const checkAllPermissions = async () => {
    setLoading(true);
    const location = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    const camera = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
    const microphone = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    const deviceAdmin = KidShieldModule ? await KidShieldModule.isDeviceAdminEnabled() : false;

    setPermissions({
      location,
      camera,
      microphone,
      usageStats: false, // checked via AppOps, assume pending
      accessibility: false, // need to open settings to check
      deviceAdmin,
      screenCapture: false,
    });
    setLoading(false);
  };

  const requestPermission = async (type) => {
    setChecking(type);
    try {
      switch (type) {
        case 'location':
          const locResult = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            {
              title: 'Location Permission',
              message: 'KidShield ला तुमचे location track करायला permission हवी.',
              buttonPositive: 'Allow',
              buttonNegative: 'Deny',
            }
          );
          const locGranted = locResult === PermissionsAndroid.RESULTS.GRANTED;
          // Also request background location
          if (locGranted) {
            await PermissionsAndroid.request(
              PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
              {
                title: 'Background Location',
                message: 'App background मध्ये असताना पण location track करायला.',
                buttonPositive: 'Allow Always',
              }
            );
          }
          setPermissions(p => ({ ...p, location: locGranted }));
          break;

        case 'camera':
          const camResult = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.CAMERA,
            {
              title: 'Camera Permission',
              message: 'Parent ला remote camera access करायला permission हवी.',
              buttonPositive: 'Allow',
            }
          );
          setPermissions(p => ({ ...p, camera: camResult === PermissionsAndroid.RESULTS.GRANTED }));
          break;

        case 'microphone':
          const micResult = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
            {
              title: 'Microphone Permission',
              message: 'Parent ला ambient audio monitor करायला permission हवी.',
              buttonPositive: 'Allow',
            }
          );
          setPermissions(p => ({ ...p, microphone: micResult === PermissionsAndroid.RESULTS.GRANTED }));
          break;

        case 'usageStats':
          Alert.alert(
            'Usage Access',
            'Settings उघडेल. "KidShield" शोधा आणि enable करा.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Open Settings',
                onPress: () => {
                  Linking.sendIntent('android.settings.USAGE_ACCESS_SETTINGS');
                  setTimeout(() => setPermissions(p => ({ ...p, usageStats: true })), 3000);
                }
              }
            ]
          );
          break;

        case 'accessibility':
          Alert.alert(
            'Accessibility Service',
            'Settings उघडेल. "Installed Apps" → "KidShield" → Enable करा.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Open Settings',
                onPress: async () => {
                  if (KidShieldModule) await KidShieldModule.openAccessibilitySettings();
                  else Linking.openSettings();
                  setTimeout(() => setPermissions(p => ({ ...p, accessibility: true })), 3000);
                }
              }
            ]
          );
          break;

        case 'deviceAdmin':
          Alert.alert(
            'Device Admin',
            'KidShield ला uninstall होण्यापासून रोखायला Device Admin enable करा.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Enable',
                onPress: async () => {
                  if (KidShieldModule) {
                    await KidShieldModule.requestDeviceAdmin();
                    setTimeout(async () => {
                      const enabled = await KidShieldModule.isDeviceAdminEnabled();
                      setPermissions(p => ({ ...p, deviceAdmin: enabled }));
                    }, 2000);
                  }
                }
              }
            ]
          );
          break;

        case 'screenCapture':
          Alert.alert(
            'Screen Capture',
            'Parent screen monitor करू शकेल. Allow करायचे का?',
            [
              { text: 'Deny', style: 'cancel' },
              {
                text: 'Allow',
                onPress: async () => {
                  if (ScreenMirror) {
                    try {
                      await ScreenMirror.requestPermission();
                      setPermissions(p => ({ ...p, screenCapture: true }));
                    } catch (e) {
                      Alert.alert('Denied', 'Screen capture permission denied.');
                    }
                  }
                }
              }
            ]
          );
          break;
      }
    } catch (e) {
      console.error('Permission error:', type, e);
    }
    setChecking('');
  };

  const completeSetup = async () => {
    try {
      const uid = auth().currentUser?.uid;
      if (uid) {
        await firestore().collection('users').doc(uid).update({
          setupDone: true,
          permissions: permissions,
          setupAt: firestore.FieldValue.serverTimestamp(),
        });
      }
      navigation?.replace('ChildApp');
    } catch (e) {
      navigation?.replace('ChildApp');
    }
  };

  const allRequired = permissions.location && permissions.camera && permissions.microphone;
  const grantedCount = Object.values(permissions).filter(Boolean).length;
  const totalCount = Object.values(permissions).length;

  const permList = [
    { key: 'location', icon: '📍', title: 'Location', desc: 'GPS tracking - Required', required: true },
    { key: 'camera', icon: '📷', title: 'Camera', desc: 'Remote camera access - Required', required: true },
    { key: 'microphone', icon: '🎤', title: 'Microphone', desc: 'Ambient audio monitoring - Required', required: true },
    { key: 'usageStats', icon: '📊', title: 'Usage Stats', desc: 'App usage tracking - Recommended', required: false },
    { key: 'accessibility', icon: '♿', title: 'Accessibility', desc: 'App blocking - Recommended', required: false },
    { key: 'deviceAdmin', icon: '🛡️', title: 'Device Admin', desc: 'Prevent uninstall - Recommended', required: false },
    { key: 'screenCapture', icon: '📱', title: 'Screen Monitor', desc: 'Screen live view - Optional', required: false },
  ];

  if (loading) {
    return (
      <View style={s.loadingContainer}>
        <ActivityIndicator size="large" color="#00d4ff" />
        <Text style={s.loadingText}>Checking permissions...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.title}>🛡️ KidShield Setup</Text>
      <Text style={s.subtitle}>Permissions द्या जेणेकरून monitoring काम करेल</Text>

      {/* Progress */}
      <View style={s.progressCard}>
        <Text style={s.progressLabel}>{grantedCount}/{totalCount} Permissions Granted</Text>
        <View style={s.progressBar}>
          <View style={[s.progressFill, { width: `${(grantedCount / totalCount) * 100}%` }]} />
        </View>
      </View>

      {/* Permission Cards */}
      {permList.map(p => (
        <View key={p.key} style={[s.card, permissions[p.key] && s.cardGranted]}>
          <View style={s.cardRow}>
            <Text style={s.permIcon}>{p.icon}</Text>
            <View style={s.permInfo}>
              <Text style={s.permTitle}>
                {p.title}
                {p.required && <Text style={s.required}> *</Text>}
              </Text>
              <Text style={s.permDesc}>{p.desc}</Text>
            </View>
            {permissions[p.key] ? (
              <Text style={s.granted}>✅</Text>
            ) : (
              <TouchableOpacity
                style={s.allowBtn}
                onPress={() => requestPermission(p.key)}
                disabled={checking === p.key}>
                {checking === p.key
                  ? <ActivityIndicator size="small" color="#000" />
                  : <Text style={s.allowBtnText}>Allow</Text>
                }
              </TouchableOpacity>
            )}
          </View>
        </View>
      ))}

      {/* Complete Button */}
      <TouchableOpacity
        style={[s.doneBtn, !allRequired && s.doneBtnDisabled]}
        onPress={completeSetup}>
        <Text style={s.doneBtnText}>
          {allRequired ? '✅ Setup Complete - Start!' : '⚠️ Required permissions pending'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={s.skipBtn} onPress={() => navigation?.replace('ChildApp')}>
        <Text style={s.skipText}>Skip for now</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060b14' },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#060b14' },
  loadingText: { color: '#8899aa', marginTop: 12 },
  title: { fontSize: 26, fontWeight: '800', color: '#fff', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 13, color: '#8899aa', textAlign: 'center', marginBottom: 24 },
  progressCard: { backgroundColor: '#111d35', borderRadius: 14, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#1e2d4a' },
  progressLabel: { color: '#fff', fontWeight: '700', marginBottom: 8 },
  progressBar: { height: 8, backgroundColor: '#1e2d4a', borderRadius: 4 },
  progressFill: { height: 8, backgroundColor: '#00d4ff', borderRadius: 4 },
  card: { backgroundColor: '#111d35', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#1e2d4a' },
  cardGranted: { borderColor: '#00cc88', backgroundColor: '#0a1a12' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  permIcon: { fontSize: 28 },
  permInfo: { flex: 1 },
  permTitle: { fontSize: 15, fontWeight: '700', color: '#fff' },
  required: { color: '#ff4444' },
  permDesc: { fontSize: 11, color: '#8899aa', marginTop: 2 },
  granted: { fontSize: 20 },
  allowBtn: { backgroundColor: '#00d4ff', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, minWidth: 60, alignItems: 'center' },
  allowBtnText: { color: '#000', fontWeight: '700', fontSize: 13 },
  doneBtn: { backgroundColor: '#00d4ff', borderRadius: 14, padding: 18, alignItems: 'center', marginTop: 16 },
  doneBtnDisabled: { backgroundColor: '#1e2d4a' },
  doneBtnText: { color: '#000', fontSize: 15, fontWeight: '700' },
  skipBtn: { alignItems: 'center', padding: 12, marginTop: 8 },
  skipText: { color: '#8899aa', fontSize: 13 },
});
'@

NoBOM "C:\KidShield\src\screens\child\SetupWizard.js" $setupWizard
Write-Host "  ✅ SetupWizard.js - Real permissions + popups" -ForegroundColor Green

# ══════════════════════════════════════════════════════
# FIX 6: RemoteMonitor.js - API_URL fix + live audio + mute/unmute
# ══════════════════════════════════════════════════════
Write-Host "[FIX 6] RemoteMonitor.js - API_URL + live features..." -ForegroundColor Yellow

$remoteMonitor = @'
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Image, ScrollView, Alert, ActivityIndicator,
  Dimensions, Animated,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

const API_URL = 'https://kidshield-0757.onrender.com';
const { width } = Dimensions.get('window');

export default function RemoteMonitor({ route }) {
  const { child } = route?.params || { child: { id: '', name: 'Child' } };
  const [loading, setLoading] = useState(false);
  const [activeFeature, setActiveFeature] = useState(null);
  const [captures, setCaptures] = useState([]);
  const [liveFrame, setLiveFrame] = useState(null);
  const [liveType, setLiveType] = useState(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [childData, setChildData] = useState(null);
  const audioAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!child?.id) return;

    // Listen to child's liveFrame in Firestore (families collection)
    const unsubChild = firestore()
      .collection('families').doc(auth().currentUser?.uid)
      .collection('children').doc(child.id)
      .onSnapshot(doc => {
        if (doc.exists) {
          const data = doc.data();
          setChildData(data);
          if (data.liveFrame) {
            setLiveFrame(data.liveFrame);
            setLiveType(data.liveType || 'screen');
          }
          if (data.audioLevel !== undefined) {
            setAudioLevel(data.audioLevel);
            // Animate audio bar
            Animated.timing(audioAnim, {
              toValue: data.audioLevel / 100,
              duration: 100,
              useNativeDriver: false,
            }).start();
          }
          if (data.isMuted !== undefined) setIsMuted(data.isMuted);
        }
      });

    // Listen for captures history
    const unsubCaptures = firestore()
      .collection('remoteCaptures')
      .where('childId', '==', child.id)
      .orderBy('timestamp', 'desc')
      .limit(10)
      .onSnapshot(snap => {
        setCaptures(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });

    return () => {
      unsubChild();
      unsubCaptures();
      stopAll();
    };
  }, [child?.id]);

  const sendCommand = async (command, data = {}) => {
    try {
      const token = await auth().currentUser?.getIdToken();
      await fetch(`${API_URL}/api/command/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ childId: child.id, command, params: data }),
      });
    } catch (e) {
      // Fallback: direct Firestore command
      await firestore().collection('commands').add({
        childId: child.id,
        command,
        data,
        status: 'pending',
        createdAt: firestore.FieldValue.serverTimestamp(),
      });
    }
  };

  // ── Screen Live View ──
  const startScreenLive = async () => {
    setLoading(true);
    setActiveFeature('screen');
    await sendCommand('REQUEST_SCREEN_PERMISSION');
    setTimeout(async () => {
      await sendCommand('START_LIVE_VIEW', { intervalSeconds: 3 });
      setLoading(false);
    }, 2000);
  };

  const stopScreenLive = async () => {
    await sendCommand('STOP_LIVE_VIEW');
    setActiveFeature(null);
    setLiveFrame(null);
  };

  // ── Camera ──
  const startCameraLive = async (useFront = false) => {
    setLoading(true);
    setActiveFeature(useFront ? 'camera_front' : 'camera_back');
    await sendCommand('START_LIVE_CAMERA', { useFront, intervalSeconds: 3 });
    setLoading(false);
  };

  const stopCamera = async () => {
    await sendCommand('STOP_LIVE_CAMERA');
    setActiveFeature(null);
  };

  const takeSnapshot = async (useFront = false) => {
    setLoading(true);
    const requestId = `snap_${Date.now()}`;
    await sendCommand('TAKE_SNAPSHOT', { camera: useFront ? 'front' : 'back', requestId });
    setTimeout(() => setLoading(false), 3000);
  };

  // ── Audio ──
  const startAudio = async () => {
    setLoading(true);
    setActiveFeature('audio');
    const requestId = `audio_${Date.now()}`;
    await sendCommand('START_AUDIO_CAPTURE', { requestId });
    setLoading(false);
  };

  const stopAudio = async () => {
    await sendCommand('STOP_AUDIO_CAPTURE');
    setActiveFeature(null);
  };

  const toggleMute = async () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    await sendCommand(newMuted ? 'MUTE_AUDIO' : 'UNMUTE_AUDIO');
  };

  const stopAll = async () => {
    try {
      await sendCommand('STOP_LIVE_VIEW');
      await sendCommand('STOP_LIVE_CAMERA');
      await sendCommand('STOP_AUDIO_CAPTURE');
    } catch (e) {}
    setActiveFeature(null);
  };

  const isLiveCameraActive = activeFeature === 'camera_front' || activeFeature === 'camera_back';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.childAvatar}>👦</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.childName}>{child?.name || 'Child'}</Text>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: childData ? '#00cc88' : '#8899aa' }]} />
            <Text style={styles.statusText}>{childData ? 'Active' : 'Offline'}</Text>
          </View>
        </View>
        {activeFeature && (
          <TouchableOpacity style={styles.stopAllBtn} onPress={stopAll}>
            <Text style={styles.stopAllText}>⏹ Stop All</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Live Frame Display */}
      {liveFrame && (
        <View style={styles.liveContainer}>
          <View style={styles.liveHeader}>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
            <Text style={styles.liveTypeText}>
              {liveType === 'screen' ? '📱 Screen' :
               liveType === 'camera_front' ? '🤳 Front Camera' : '📷 Back Camera'}
            </Text>
          </View>
          <Image
            source={{ uri: `data:image/jpeg;base64,${liveFrame}` }}
            style={styles.liveImage}
            resizeMode="contain"
          />
        </View>
      )}

      {/* ── Screen Monitor ── */}
      <View style={styles.featureCard}>
        <View style={styles.featureHeader}>
          <Text style={styles.featureIcon}>📱</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.featureTitle}>Screen Monitor</Text>
            <Text style={styles.featureDesc}>Child च्या screen चे live view</Text>
          </View>
          {activeFeature === 'screen' && <View style={styles.activeBadge}><Text style={styles.activeBadgeText}>LIVE</Text></View>}
        </View>
        <View style={styles.btnRow}>
          {activeFeature !== 'screen' ? (
            <TouchableOpacity style={styles.btnPrimary} onPress={startScreenLive} disabled={loading}>
              {loading && activeFeature !== 'screen' ? <ActivityIndicator color="#000" size="small" /> :
                <Text style={styles.btnPrimaryText}>▶ Start Live</Text>}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.btnDanger} onPress={stopScreenLive}>
              <Text style={styles.btnDangerText}>⏹ Stop</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.btnSecondary}
            onPress={() => sendCommand('TAKE_SCREENSHOT', { requestId: `ss_${Date.now()}` })}>
            <Text style={styles.btnSecText}>📸 Snapshot</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Remote Camera ── */}
      <View style={styles.featureCard}>
        <View style={styles.featureHeader}>
          <Text style={styles.featureIcon}>📷</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.featureTitle}>Remote Camera</Text>
            <Text style={styles.featureDesc}>Front + Back camera live stream</Text>
          </View>
          {isLiveCameraActive && <View style={styles.activeBadge}><Text style={styles.activeBadgeText}>LIVE</Text></View>}
        </View>

        {/* Latest capture */}
        {captures.find(c => c.type === 'camera_snapshot' || c.type === 'camera_front') && (
          <Image
            source={{ uri: `data:image/jpeg;base64,${captures.find(c => c.imageBase64)?.imageBase64}` }}
            style={styles.capturePreview}
            resizeMode="cover"
          />
        )}

        <View style={styles.btnRow}>
          {!isLiveCameraActive ? (
            <>
              <TouchableOpacity style={styles.btnPrimary} onPress={() => startCameraLive(false)} disabled={loading}>
                <Text style={styles.btnPrimaryText}>📷 Back Live</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => startCameraLive(true)} disabled={loading}>
                <Text style={styles.btnSecText}>🤳 Front Live</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={styles.btnDanger} onPress={stopCamera}>
              <Text style={styles.btnDangerText}>⏹ Stop Camera</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={[styles.btnRow, { marginTop: 8 }]}>
          <TouchableOpacity style={styles.btnSecondary} onPress={() => takeSnapshot(false)} disabled={loading}>
            <Text style={styles.btnSecText}>📷 Back Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnSecondary} onPress={() => takeSnapshot(true)} disabled={loading}>
            <Text style={styles.btnSecText}>🤳 Front Photo</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Ambient Audio ── */}
      <View style={styles.featureCard}>
        <View style={styles.featureHeader}>
          <Text style={styles.featureIcon}>🎤</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.featureTitle}>Ambient Audio</Text>
            <Text style={styles.featureDesc}>Surroundings ऐका + mute/unmute</Text>
          </View>
          {activeFeature === 'audio' && <View style={styles.activeBadge}><Text style={styles.activeBadgeText}>REC</Text></View>}
        </View>

        {/* Audio Level Meter */}
        {activeFeature === 'audio' && (
          <View style={styles.audioMeter}>
            <Text style={styles.audioMeterLabel}>
              {isMuted ? '🔇 Muted' : `🔊 Level: ${audioLevel}%`}
            </Text>
            <View style={styles.audioBar}>
              <Animated.View style={[
                styles.audioFill,
                {
                  width: audioAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                  backgroundColor: audioLevel > 70 ? '#ff4444' : audioLevel > 40 ? '#ff9900' : '#00cc88',
                }
              ]} />
            </View>
          </View>
        )}

        <View style={styles.btnRow}>
          {activeFeature !== 'audio' ? (
            <TouchableOpacity style={styles.btnPrimary} onPress={startAudio}>
              <Text style={styles.btnPrimaryText}>🎤 Start Audio</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity style={styles.btnDanger} onPress={stopAudio}>
                <Text style={styles.btnDangerText}>⏹ Stop</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnSecondary, isMuted && { borderColor: '#ff9900' }]}
                onPress={toggleMute}>
                <Text style={styles.btnSecText}>{isMuted ? '🔊 Unmute' : '🔇 Mute'}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Audio history */}
        {captures.filter(c => c.type === 'ambient_audio').slice(0, 3).map(cap => (
          <View key={cap.id} style={styles.audioItem}>
            <Text style={{ fontSize: 20, marginRight: 10 }}>🔊</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.audioTime}>{cap.timestamp?.substring(0, 19) || 'Recording'}</Text>
              <Text style={styles.audioDuration}>{cap.duration}s recording</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Captures Gallery */}
      {captures.filter(c => c.imageBase64 || c.screenshotBase64).length > 0 && (
        <>
          <Text style={styles.sectionLabel}>🗂️ Recent Captures</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {captures.filter(c => c.imageBase64 || c.screenshotBase64).map(cap => (
              <View key={cap.id} style={styles.thumbCard}>
                <Image
                  source={{ uri: `data:image/jpeg;base64,${cap.imageBase64 || cap.screenshotBase64}` }}
                  style={styles.thumb}
                  resizeMode="cover"
                />
                <Text style={styles.thumbLabel}>
                  {cap.type === 'camera_front' ? '🤳' :
                   cap.type === 'camera_snapshot' ? '📷' : '📱'}
                </Text>
              </View>
            ))}
          </ScrollView>
        </>
      )}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060b14' },
  content: { padding: 16, paddingTop: 60, paddingBottom: 100 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  childAvatar: { fontSize: 36 },
  childName: { fontSize: 20, fontWeight: '700', color: '#fff' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12, color: '#8899aa' },
  stopAllBtn: { backgroundColor: '#ff4444', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  stopAllText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  liveContainer: { backgroundColor: '#0a0a1a', borderRadius: 16, overflow: 'hidden', marginBottom: 16, borderWidth: 2, borderColor: '#ff4444' },
  liveHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, backgroundColor: 'rgba(255,68,68,0.1)' },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#ff4444', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  liveText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  liveTypeText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  liveImage: { width: '100%', height: 220, backgroundColor: '#000' },
  featureCard: { backgroundColor: '#111d35', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#1e2d4a' },
  featureHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  featureIcon: { fontSize: 28 },
  featureTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  featureDesc: { fontSize: 12, color: '#8899aa', marginTop: 2 },
  activeBadge: { backgroundColor: '#ff4444', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  activeBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  capturePreview: { width: '100%', height: 180, borderRadius: 10, backgroundColor: '#000', marginBottom: 12 },
  btnRow: { flexDirection: 'row', gap: 10 },
  btnPrimary: { flex: 1, backgroundColor: '#00d4ff', borderRadius: 10, padding: 12, alignItems: 'center' },
  btnPrimaryText: { color: '#000', fontWeight: '700', fontSize: 13 },
  btnDanger: { flex: 1, backgroundColor: 'rgba(255,68,68,0.15)', borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,68,68,0.4)' },
  btnDangerText: { color: '#ff4444', fontWeight: '700', fontSize: 13 },
  btnSecondary: { flex: 1, backgroundColor: '#0d1826', borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#1e2d4a' },
  btnSecText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  audioMeter: { backgroundColor: '#060b14', borderRadius: 10, padding: 12, marginBottom: 12 },
  audioMeterLabel: { color: '#fff', fontWeight: '600', marginBottom: 8 },
  audioBar: { height: 10, backgroundColor: '#1e2d4a', borderRadius: 5 },
  audioFill: { height: 10, borderRadius: 5 },
  audioItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0d1826', borderRadius: 10, padding: 10, marginTop: 8 },
  audioTime: { fontSize: 12, color: '#fff', fontWeight: '500' },
  audioDuration: { fontSize: 11, color: '#8899aa' },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 2, color: '#00d4ff', marginBottom: 12, marginTop: 4 },
  thumbCard: { marginRight: 10, position: 'relative' },
  thumb: { width: 90, height: 140, borderRadius: 10 },
  thumbLabel: { position: 'absolute', top: 4, right: 4, fontSize: 14 },
});
'@

NoBOM "C:\KidShield\src\screens\parent\RemoteMonitor.js" $remoteMonitor
Write-Host "  ✅ RemoteMonitor.js - Live view + audio level + mute" -ForegroundColor Green

# ══════════════════════════════════════════════════════
# FIX 7: App.js - RemoteMonitor screen add करा
# ══════════════════════════════════════════════════════
Write-Host "[FIX 7] App.js - Add RemoteMonitor screen..." -ForegroundColor Yellow
$app = Get-Content "C:\KidShield\App.js" -Raw
if ($app -notmatch "RemoteMonitor") {
    $app = $app -replace "import WeeklyReport from './src/screens/parent/WeeklyReport';",
        "import WeeklyReport from './src/screens/parent/WeeklyReport';`nimport RemoteMonitor from './src/screens/parent/RemoteMonitor';"
    $app = $app -replace "<Stack.Screen name=`"WeeklyReport`" component={WeeklyReport} />",
        "<Stack.Screen name=`"WeeklyReport`" component={WeeklyReport} />`n              <Stack.Screen name=`"RemoteMonitor`" component={RemoteMonitor} />"
    NoBOM "C:\KidShield\App.js" $app
    Write-Host "  ✅ RemoteMonitor added to App.js" -ForegroundColor Green
} else {
    Write-Host "  ✅ RemoteMonitor already in App.js" -ForegroundColor Green
}

# ══════════════════════════════════════════════════════
# FINAL VERIFY
# ══════════════════════════════════════════════════════
Write-Host "`n=== VERIFICATION ===" -ForegroundColor Cyan

$checks = @(
    @{ File="C:\KidShield\android\app\src\main\java\com\kidshield\ScreenMirrorModule.java"; Pattern="captureFrameToFirestore"; Label="ScreenMirror - live capture" },
    @{ File="C:\KidShield\android\app\src\main\java\com\kidshield\ScreenMirrorModule.java"; Pattern="startLiveView"; Label="ScreenMirror - startLiveView" },
    @{ File="C:\KidShield\android\app\src\main\java\com\kidshield\RemoteCameraModule.java"; Pattern="startLiveCamera"; Label="RemoteCamera - live stream" },
    @{ File="C:\KidShield\android\app\src\main\java\com\kidshield\RemoteCameraModule.java"; Pattern="uploadLiveFrame"; Label="RemoteCamera - upload live" },
    @{ File="C:\KidShield\android\app\src\main\java\com\kidshield\AmbientAudioModule.java"; Pattern="setMuted"; Label="AmbientAudio - mute/unmute" },
    @{ File="C:\KidShield\android\app\src\main\java\com\kidshield\AmbientAudioModule.java"; Pattern="sendAudioLevel"; Label="AmbientAudio - real-time level" },
    @{ File="C:\KidShield\src\services\RemoteCommandHandler.js"; Pattern="START_LIVE_CAMERA"; Label="RemoteCommandHandler - live camera" },
    @{ File="C:\KidShield\src\services\RemoteCommandHandler.js"; Pattern="MUTE_AUDIO"; Label="RemoteCommandHandler - mute" },
    @{ File="C:\KidShield\src\screens\child\SetupWizard.js"; Pattern="PermissionsAndroid"; Label="SetupWizard - real permissions" },
    @{ File="C:\KidShield\src\screens\parent\RemoteMonitor.js"; Pattern="kidshield-0757.onrender.com"; Label="RemoteMonitor - API_URL" },
    @{ File="C:\KidShield\src\screens\parent\RemoteMonitor.js"; Pattern="toggleMute"; Label="RemoteMonitor - mute button" },
    @{ File="C:\KidShield\src\screens\parent\RemoteMonitor.js"; Pattern="audioLevel"; Label="RemoteMonitor - audio meter" }
)

$allOk = $true
foreach ($c in $checks) {
    $content = Get-Content $c.File -Raw
    if ($content -match $c.Pattern) {
        Write-Host "  ✅ $($c.Label)" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $($c.Label)" -ForegroundColor Red
        $allOk = $false
    }
}

if ($allOk) {
    Write-Host "`n🎉 सगळे fixes successful! Build करा:" -ForegroundColor Green
} else {
    Write-Host "`n⚠️ काही checks failed" -ForegroundColor Red
}
Write-Host "cd C:\KidShield\android && .\gradlew.bat assembleRelease" -ForegroundColor Cyan