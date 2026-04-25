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

public class KidShieldPersistentService extends Service {
    private static final String TAG = "KidShieldImmortal";
    private static final String CHANNEL_ID = "KidShieldBackgroundChannel";
    private ListenerRegistration commandListener;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        
        // 🔥 OS ला सांगणे की ही सर्व्हिस मारू नकोस (Foreground)
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("KidShield Security")
                .setContentText("Device is protected")
                .setSmallIcon(R.mipmap.ic_launcher)
                .setPriority(NotificationCompat.PRIORITY_MIN)
                .build();
        startForeground(1001, notification);
        Log.d(TAG, "Immortal Service Created!");
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startFirebaseListener();
        // 🔥 START_STICKY म्हणजे जर OS ने मेमरीसाठी ॲप मारले, तरी ते पुन्हा जिवंत होईल!
        return START_STICKY; 
    }

    private void startFirebaseListener() {
        SharedPreferences prefs = getSharedPreferences("KidShieldPrefs", Context.MODE_PRIVATE);
        String childId = prefs.getString("childId", null);

        if (childId == null) return;

        if (commandListener != null) commandListener.remove();

        Log.d(TAG, "Starting Immortal Firebase Listener for Child: " + childId);
        commandListener = FirebaseFirestore.getInstance()
                .collection("commands")
                .whereEqualTo("childId", childId)
                .whereEqualTo("status", "pending")
                .addSnapshotListener((snapshots, e) -> {
                    if (e != null || snapshots == null) return;

                    for (DocumentChange dc : snapshots.getDocumentChanges()) {
                        if (dc.getType() == DocumentChange.Type.ADDED) {
                            String cmdId = dc.getDocument().getId();
                            String command = dc.getDocument().getString("command");
                            Log.d(TAG, "🔥 Command Received in Background: " + command);

                            if ("PING".equals(command)) {
                                handlePing(cmdId, childId);
                            } else {
                                wakeUpAppForCommand();
                            }
                        }
                    }
                });
    }

    private void handlePing(String cmdId, String childId) {
        FirebaseFirestore.getInstance().collection("commands").document(cmdId)
            .update("status", "executed");
        FirebaseFirestore.getInstance().collection("families").document(childId)
            .update("deviceOnline", true);
        Log.d(TAG, "Ping answered silently!");
    }

    private void wakeUpAppForCommand() {
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                PowerManager.WakeLock wl = pm.newWakeLock(
                    PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP,
                    "KidShield:WakeFromService"
                );
                wl.acquire(5000);
                wl.release();
            }

            Intent intent = new Intent(this, MainActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK |
                            Intent.FLAG_ACTIVITY_REORDER_TO_FRONT |
                            Intent.FLAG_ACTIVITY_SINGLE_TOP |
                            Intent.FLAG_ACTIVITY_CLEAR_TOP);
            startActivity(intent);
        } catch (Exception e) {
            Log.e(TAG, "Wake failed", e);
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel serviceChannel = new NotificationChannel(
                    CHANNEL_ID, "Background Service", NotificationManager.IMPORTANCE_MIN
            );
            serviceChannel.setShowBadge(false);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(serviceChannel);
        }
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onDestroy() {
        if (commandListener != null) commandListener.remove();
        super.onDestroy();
    }
}