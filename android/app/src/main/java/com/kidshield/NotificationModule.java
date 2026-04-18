package com.kidshield;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;

public class NotificationModule extends ReactContextBaseJavaModule {

    private static final String TAG = "NotificationModule";

    // Channel IDs
    public static final String CHANNEL_ALERTS    = "kidshield_alerts";
    public static final String CHANNEL_LOCATION  = "kidshield_location";
    public static final String CHANNEL_SERVICE   = "kidshield_service";
    public static final String CHANNEL_SOS       = "kidshield_sos";

    private final ReactApplicationContext reactContext;

    public NotificationModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
        createChannels();
    }

    @Override
    public String getName() {
        return "KidShieldNotifications";
    }

    // Called once on module init
    private void createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager nm =
            (NotificationManager) reactContext.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        // High-priority alerts (geofence breach, SOS, blocked app attempt)
        NotificationChannel alerts = new NotificationChannel(
            CHANNEL_ALERTS,
            "KidShield Alerts",
            NotificationManager.IMPORTANCE_HIGH
        );
        alerts.setDescription("Important alerts from KidShield");
        alerts.enableVibration(true);
        alerts.setShowBadge(true);
        nm.createNotificationChannel(alerts);

        // SOS — max importance
        NotificationChannel sos = new NotificationChannel(
            CHANNEL_SOS,
            "SOS Alerts",
            NotificationManager.IMPORTANCE_MAX
        );
        sos.setDescription("Child SOS button alerts");
        sos.enableVibration(true);
        sos.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(sos);

        // Silent foreground-service channel (location tracking)
        NotificationChannel location = new NotificationChannel(
            CHANNEL_LOCATION,
            "Location Tracking",
            NotificationManager.IMPORTANCE_LOW
        );
        location.setDescription("Background location tracking");
        location.setShowBadge(false);
        nm.createNotificationChannel(location);

        // Silent persistent service channel
        NotificationChannel service = new NotificationChannel(
            CHANNEL_SERVICE,
            "KidShield Service",
            NotificationManager.IMPORTANCE_MIN
        );
        service.setDescription("KidShield background service");
        service.setShowBadge(false);
        nm.createNotificationChannel(service);

        Log.d(TAG, "Notification channels created");
    }

    @ReactMethod
    public void showAlert(ReadableMap options, Promise promise) {
        try {
            String title   = options.hasKey("title")   ? options.getString("title")   : "KidShield Alert";
            String message = options.hasKey("message") ? options.getString("message") : "";
            String type    = options.hasKey("type")    ? options.getString("type")    : "alert";
            int    id      = options.hasKey("id")      ? options.getInt("id")         : (int)(Math.random() * 10000);

            String channelId = type.equals("sos") ? CHANNEL_SOS : CHANNEL_ALERTS;

            Intent intent = new Intent(reactContext, MainActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            if (options.hasKey("screen")) {
                intent.putExtra("screen", options.getString("screen"));
            }

            PendingIntent pi = PendingIntent.getActivity(
                reactContext, id, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

            NotificationCompat.Builder builder = new NotificationCompat.Builder(reactContext, channelId)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(title)
                .setContentText(message)
                .setAutoCancel(true)
                .setContentIntent(pi)
                .setPriority(type.equals("sos")
                    ? NotificationCompat.PRIORITY_MAX
                    : NotificationCompat.PRIORITY_HIGH);

            NotificationManager nm =
                (NotificationManager) reactContext.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(id, builder.build());

            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void cancelNotification(int id, Promise promise) {
        NotificationManager nm =
            (NotificationManager) reactContext.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(id);
        promise.resolve(true);
    }

    @ReactMethod
    public void cancelAll(Promise promise) {
        NotificationManager nm =
            (NotificationManager) reactContext.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancelAll();
        promise.resolve(true);
    }

    // Build a persistent foreground-service notification (called from Java services)
    public static Notification buildServiceNotification(Context ctx, String text) {
        Intent intent = new Intent(ctx, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(
            ctx, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        return new NotificationCompat.Builder(ctx, CHANNEL_SERVICE)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("KidShield Active")
            .setContentText(text)
            .setOngoing(true)
            .setContentIntent(pi)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .build();
    }
}
