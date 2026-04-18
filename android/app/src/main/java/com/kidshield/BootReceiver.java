package com.kidshield;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;

public class BootReceiver extends BroadcastReceiver {

    private static final String TAG = "BootReceiver";
    private static final String PREFS_NAME = "KidShieldPrefs";
    private static final String IS_CHILD_DEVICE_KEY = "is_child_device";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action) ||
            "android.intent.action.QUICKBOOT_POWERON".equals(action)) {

            Log.d(TAG, "Device booted - checking if child device");

            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            boolean isChildDevice = prefs.getBoolean(IS_CHILD_DEVICE_KEY, false);

            if (isChildDevice) {
                Log.d(TAG, "Child device - starting location service");
                // Start location foreground service
                Intent serviceIntent = new Intent(context, LocationForegroundService.class);
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent);
                } else {
                    context.startService(serviceIntent);
                }
            }
        }
    }
}
