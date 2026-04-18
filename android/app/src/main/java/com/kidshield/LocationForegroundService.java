package com.kidshield;

import android.app.Service;
import android.content.Intent;
import android.os.IBinder;
import android.util.Log;

public class LocationForegroundService extends Service {

    private static final String TAG = "LocationFgService";
    private static final int NOTIFICATION_ID = 1001;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.d(TAG, "LocationForegroundService started");

        // Show persistent notification (required for foreground service)
        startForeground(
            NOTIFICATION_ID,
            NotificationModule.buildServiceNotification(this, "Location tracking active")
        );

        // Service will be restarted if killed by system
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        Log.d(TAG, "LocationForegroundService destroyed");
    }
}
