package com.kidshield;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.os.IBinder;

public class RemoteCameraService extends Service {
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel("kidshield_camera", "Camera Active", NotificationManager.IMPORTANCE_LOW);
            getSystemService(NotificationManager.class).createNotificationChannel(channel);
            Notification notification = new Notification.Builder(this, "kidshield_camera")
                    .setContentTitle("KidShield")
                    .setContentText("Camera is active")
                    .setSmallIcon(android.R.drawable.ic_menu_camera)
                    .build();
            startForeground(1002, notification);
        }
        return START_NOT_STICKY;
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}