package com.kidshield;

import android.content.Intent;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import androidx.localbroadcastmanager.content.LocalBroadcastManager;

public class KidShieldNotificationService extends NotificationListenerService {
    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || sbn.getNotification() == null) return;

        String packageName = sbn.getPackageName();
        
        // सिस्टीमचे फालतू नोटिफिकेशन टाळण्यासाठी
        if (packageName.equals("android") || packageName.equals("com.android.systemui")) return;

        Bundle extras = sbn.getNotification().extras;
        String title = extras.getString("android.title", "");
        CharSequence textChar = extras.getCharSequence("android.text");
        String text = textChar != null ? textChar.toString() : "";

        if (title.isEmpty() && text.isEmpty()) return;

        // नोटिफिकेशनचा डेटा React Native कडे पाठवणे
        Intent intent = new Intent("KidShield_Notification");
        intent.putExtra("package", packageName);
        intent.putExtra("title", title);
        intent.putExtra("text", text);
        LocalBroadcastManager.getInstance(this).sendBroadcast(intent);
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        // मुलाने नोटिफिकेशन डिलीट केले तरी आपण काहीच करणार नाही, 
        // कारण ते आधीच Firebase वर सेव्ह झालेले असेल!
    }
}