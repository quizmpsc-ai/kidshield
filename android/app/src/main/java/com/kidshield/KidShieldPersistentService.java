package com.kidshield;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;
import androidx.core.app.NotificationCompat;

import com.google.firebase.firestore.DocumentChange;
import com.google.firebase.firestore.FirebaseFirestore;
import com.google.firebase.firestore.ListenerRegistration;

// ✅ BUG FIXES in this file:
// 1. childId SharedPreferences madhun yeto (child_XXXXX format) - commands collection match karil
// 2. wakeUpAppForCommand() only for non-camera commands (camera native chalto)
// 3. START_STICKY so service persists after kill
// 4. Firestore listener restart on reconnect

public class KidShieldPersistentService extends Service {
    private static final String TAG = "KidShieldImmortal";
    private static final String CHANNEL_ID = "KidShieldBackgroundChannel";
    private ListenerRegistration commandListener;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("KidShield Security")
                .setContentText("Device is protected")
                .setSmallIcon(R.mipmap.ic_launcher)
                .setPriority(NotificationCompat.PRIORITY_MIN)
                .setOngoing(true)
                .build();
        startForeground(1001, notification);
        Log.d(TAG, "✅ KidShieldPersistentService Created!");
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startFirebaseListener();
        return START_STICKY; // ✅ App kill zhale tari restart hoil
    }

    private void startFirebaseListener() {
        // ✅ BUG FIX: SharedPreferences madhun childId yeto
        // He "child_XXXXX" format madhe aahe - commands collection match karil
        // (Junyaa code madhe: firebase auth UID vaparla jato jya spashi match hot navhata)
        SharedPreferences prefs = getSharedPreferences("KidShieldPrefs", Context.MODE_PRIVATE);
        String childId = prefs.getString("childId", null);
        String parentId = prefs.getString("parentId", null);

        if (childId == null) {
            Log.w(TAG, "childId not found in SharedPrefs - waiting for pairing");
            return;
        }

        Log.d(TAG, "✅ Starting Firebase listener for childId: " + childId);

        if (commandListener != null) commandListener.remove();

        commandListener = FirebaseFirestore.getInstance()
                .collection("commands")
                .whereEqualTo("childId", childId) // ✅ "child_XXXXX" format - correct match!
                .whereEqualTo("status", "pending")
                .addSnapshotListener((snapshots, e) -> {
                    if (e != null) {
                        Log.e(TAG, "Listener error: " + e.getMessage());
                        return;
                    }
                    if (snapshots == null) return;

                    for (DocumentChange dc : snapshots.getDocumentChanges()) {
                        if (dc.getType() == DocumentChange.Type.ADDED) {
                            String cmdId = dc.getDocument().getId();
                            String command = dc.getDocument().getString("command");
                            Log.d(TAG, "🔥 Background Command: " + command);

                            if ("PING".equals(command)) {
                                handlePing(cmdId, childId, parentId);

                            } else if ("START_LIVE_CAMERA".equals(command)) {
                                // ✅ NATIVE camera start - App kill astana paN chalel!
                                // React Native bridge nastat Java level var camera chalto
                                boolean useFront = false;
                                try {
                                    java.util.Map<String, Object> data =
                                        (java.util.Map<String, Object>) dc.getDocument().get("data");
                                    if (data != null && data.containsKey("useFront")) {
                                        useFront = Boolean.TRUE.equals(data.get("useFront"));
                                    }
                                } catch (Exception ex) {
                                    Log.w(TAG, "useFront parse error: " + ex.getMessage());
                                }

                                Log.d(TAG, "Starting camera natively (no app wakeup needed)...");
                                // 🔥 नवीन CameraX सर्व्हिस चालू करण्याचा कोड:
Intent cameraIntent = new Intent(KidShieldPersistentService.this, RemoteCameraService.class);
cameraIntent.putExtra("isFront", isFront);
if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
    startForegroundService(cameraIntent);
} else {
    startService(cameraIntent);
}
                                FirebaseFirestore.getInstance()
                                    .collection("commands")
                                    .document(cmdId)
                                    .update("status", "processing");

                            } else if ("STOP_LIVE_CAMERA".equals(command)) {
                                Log.d(TAG, "Stopping camera natively...");
                                // 🔥 नवीन CameraX सर्व्हिस बंद करण्याचा कोड:
Intent stopCameraIntent = new Intent(KidShieldPersistentService.this, RemoteCameraService.class);
stopService(stopCameraIntent);
                                FirebaseFirestore.getInstance()
                                    .collection("commands")
                                    .document(cmdId)
                                    .update("status", "executed");

                            } else {
                                // ✅ Screen Mirror, Audio etc. sathi app ughadave lagate
                                // (He commands React Native bridge require karatat)
                                Log.d(TAG, "Non-camera command - waking app: " + command);
                                wakeUpAppForCommand();
                            }
                        }
                    }
                });
    }

    private void handlePing(String cmdId, String childId, String parentId) {
        // Ping silently answer kara - app ughadaychi garaj nahi
        FirebaseFirestore.getInstance()
            .collection("commands")
            .document(cmdId)
            .update("status", "executed");

        // Online status update kara
        if (parentId != null && childId != null) {
            try {
                FirebaseFirestore.getInstance()
                    .collection("families")
                    .document(parentId)
                    .collection("children")
                    .document(childId)
                    .update("deviceOnline", true);
            } catch (Exception e) {}
        }
        Log.d(TAG, "✅ Ping answered silently");
    }

    private void wakeUpAppForCommand() {
        try {
            // Screen on kara
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                PowerManager.WakeLock wl = pm.newWakeLock(
                    PowerManager.FULL_WAKE_LOCK |
                    PowerManager.ACQUIRE_CAUSES_WAKEUP |
                    PowerManager.ON_AFTER_RELEASE,
                    "KidShield:WakeFromService"
                );
                wl.acquire(10000); // 10 seconds
                wl.release();
            }

            // App foreground var ana
            Intent intent = new Intent(this, MainActivity.class);
            intent.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK |
                Intent.FLAG_ACTIVITY_REORDER_TO_FRONT |
                Intent.FLAG_ACTIVITY_SINGLE_TOP |
                Intent.FLAG_ACTIVITY_CLEAR_TOP
            );
            startActivity(intent);
            Log.d(TAG, "✅ App wake triggered for non-camera command");

        } catch (Exception e) {
            Log.e(TAG, "wakeUpApp error: " + e.getMessage());
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Background Service",
                    NotificationManager.IMPORTANCE_MIN
            );
            channel.setShowBadge(false);
            channel.setSound(null, null);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onDestroy() {
        if (commandListener != null) commandListener.remove();
        super.onDestroy();
        Log.d(TAG, "Service destroyed - START_STICKY will revive");
    }

    // ✅ App swipe-kill zhale tari 1 second nantar restart kara
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        Log.e(TAG, "💀 App killed! Scheduling revival in 1 second...");

        Intent restartServiceIntent = new Intent(getApplicationContext(), this.getClass());
        restartServiceIntent.setPackage(getPackageName());

        android.app.PendingIntent restartPI = android.app.PendingIntent.getService(
                getApplicationContext(), 1, restartServiceIntent,
                android.app.PendingIntent.FLAG_ONE_SHOT | android.app.PendingIntent.FLAG_IMMUTABLE
        );

        android.app.AlarmManager alarmService =
            (android.app.AlarmManager) getApplicationContext().getSystemService(Context.ALARM_SERVICE);
        if (alarmService != null) {
            alarmService.set(
                android.app.AlarmManager.ELAPSED_REALTIME,
                android.os.SystemClock.elapsedRealtime() + 1000,
                restartPI
            );
        }
        super.onTaskRemoved(rootIntent);
    }
}
