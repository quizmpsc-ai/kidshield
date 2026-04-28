package com.kidshield;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.ImageFormat;
import android.graphics.Matrix;
import android.graphics.Rect;
import android.graphics.YuvImage;
import android.media.Image;
import android.os.Build;
import android.os.PowerManager;
import android.util.Base64;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.ImageProxy;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import androidx.lifecycle.LifecycleService;

import com.google.common.util.concurrent.ListenableFuture;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class RemoteCameraService extends LifecycleService {
    private static final String TAG = "KidShieldCameraService";
    private static final String CHANNEL_ID = "kidshield_camera";

    private ProcessCameraProvider cameraProvider;
    private ExecutorService cameraExecutor;
    private PowerManager.WakeLock wakeLock; // 🔥 CPU Sleep रोखण्यासाठी
    private boolean isFrontCamera = false;

    @Override
    public void onCreate() {
        super.onCreate();
        cameraExecutor = Executors.newSingleThreadExecutor();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        super.onStartCommand(intent, flags, startId);
        Log.d(TAG, "AirDroid Style CameraX Service Started");
        
        isFrontCamera = intent != null && intent.getBooleanExtra("isFront", false);
        startForegroundWithCorrectType();
        acquireWakeLock(); // 🔥 Screen off असताना CPU जिवंत ठेवा
        
        // 🔥 RAM Clear झाल्यावरही IDs पुन्हा मिळवा आणि Socket कनेक्ट करा
        SharedPreferences prefs = getSharedPreferences("KidShieldPrefs", Context.MODE_PRIVATE);
        String childId = prefs.getString("childId", null);
        String parentId = prefs.getString("parentId", null);
        
        if (childId != null && parentId != null) {
            NativeSocketManager.getInstance().setIds(childId, parentId);
        }
        NativeSocketManager.getInstance().connect();

        // CameraX सुरु करा
        startCameraX(isFrontCamera);

        return START_STICKY; // 🔥 ॲप Kill झाल्यावर Service पुन्हा चालू करण्यासाठी
    }

    private void acquireWakeLock() {
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "KidShield:CameraBackgroundProcess");
                wakeLock.acquire(30 * 60 * 1000L); // Max 30 minutes
                Log.d(TAG, "✅ PARTIAL_WAKE_LOCK acquired");
            }
        } catch (Exception e) {
            Log.e(TAG, "WakeLock error", e);
        }
    }

    private void startForegroundWithCorrectType() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "Monitoring", NotificationManager.IMPORTANCE_LOW);
            channel.setShowBadge(false);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(channel);

            Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                    .setContentTitle("KidShield")
                    .setContentText("Monitoring active")
                    .setSmallIcon(android.R.drawable.ic_menu_camera)
                    .setOngoing(true)
                    .build();

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(1002, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA);
            } else {
                startForeground(1002, notification);
            }
        }
    }

    private void startCameraX(boolean isFront) {
        ListenableFuture<ProcessCameraProvider> cameraProviderFuture = ProcessCameraProvider.getInstance(this);
        
        cameraProviderFuture.addListener(() -> {
            try {
                cameraProvider = cameraProviderFuture.get();
                
                CameraSelector cameraSelector = isFront ? 
                        CameraSelector.DEFAULT_FRONT_CAMERA : CameraSelector.DEFAULT_BACK_CAMERA;

                ImageAnalysis imageAnalysis = new ImageAnalysis.Builder()
                        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                        .build();

                imageAnalysis.setAnalyzer(cameraExecutor, new ImageAnalysis.Analyzer() {
                    private long lastAnalyzedTimestamp = 0L;

                    @Override
                    public void analyze(@NonNull ImageProxy image) {
                        long currentTime = System.currentTimeMillis();
                        if (currentTime - lastAnalyzedTimestamp >= 1000) { // 1 Frame per second
                            String base64Frame = convertImageProxyToBase64(image);
                            if (base64Frame != null) {
                                // 🔥 Front आणि Back कॅमेरा प्रकार योग्यरित्या पाठवा
                                String type = isFrontCamera ? "camera_front" : "camera_back";
                                NativeSocketManager.getInstance().sendFrame(base64Frame, type);
                            }
                            lastAnalyzedTimestamp = currentTime;
                        }
                        image.close();
                    }
                });

                cameraProvider.unbindAll();
                cameraProvider.bindToLifecycle(this, cameraSelector, imageAnalysis);

            } catch (Exception e) {
                Log.e(TAG, "CameraX init failed", e);
            }
        }, ContextCompat.getMainExecutor(this));
    }

    private String convertImageProxyToBase64(ImageProxy image) {
        try {
            @SuppressWarnings("UnsafeOptInUsageError")
            Image mediaImage = image.getImage();
            if (mediaImage != null && mediaImage.getFormat() == ImageFormat.YUV_420_888) {
                ByteBuffer yBuffer = mediaImage.getPlanes()[0].getBuffer();
                ByteBuffer uBuffer = mediaImage.getPlanes()[1].getBuffer();
                ByteBuffer vBuffer = mediaImage.getPlanes()[2].getBuffer();

                int ySize = yBuffer.remaining();
                int uSize = uBuffer.remaining();
                int vSize = vBuffer.remaining();

                byte[] nv21 = new byte[ySize + uSize + vSize];
                yBuffer.get(nv21, 0, ySize);
                vBuffer.get(nv21, ySize, vSize);
                uBuffer.get(nv21, ySize + vSize, uSize);

                YuvImage yuvImage = new YuvImage(nv21, ImageFormat.NV21, image.getWidth(), image.getHeight(), null);
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                yuvImage.compressToJpeg(new Rect(0, 0, yuvImage.getWidth(), yuvImage.getHeight()), 30, out);

                byte[] imageBytes = out.toByteArray();
                Bitmap bitmap = BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.length);

                Matrix matrix = new Matrix();
                matrix.postRotate(image.getImageInfo().getRotationDegrees());
                Bitmap rotatedBitmap = Bitmap.createBitmap(bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), matrix, true);

                ByteArrayOutputStream rotatedOut = new ByteArrayOutputStream();
                rotatedBitmap.compress(Bitmap.CompressFormat.JPEG, 30, rotatedOut);

                return Base64.encodeToString(rotatedOut.toByteArray(), Base64.NO_WRAP);
            }
        } catch (Exception e) {}
        return null;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (cameraProvider != null) {
            cameraProvider.unbindAll();
        }
        if (cameraExecutor != null) {
            cameraExecutor.shutdown();
        }
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release(); // 🔥 Service बंद झाल्यावर बॅटरी वाचवण्यासाठी WakeLock सोडा
            Log.d(TAG, "✅ PARTIAL_WAKE_LOCK released");
        }
        Log.d(TAG, "CameraX Service Destroyed");
    }
}