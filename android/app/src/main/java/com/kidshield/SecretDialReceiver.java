package com.kidshield;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;

public class SecretDialReceiver extends BroadcastReceiver {
    private static final String SECRET_CODE = "*#1234#";

    @Override
    public void onReceive(Context context, Intent intent) {
        String number = intent.getStringExtra(Intent.EXTRA_PHONE_NUMBER);
        if (number != null && (number.equals("*#1234#") || number.equals("#1234#") || number.equals("1234"))) {
            setResultData(null);
            PackageManager pm = context.getPackageManager();
            pm.setComponentEnabledSetting(
                new android.content.ComponentName(context, MainActivity.class),
                PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                PackageManager.DONT_KILL_APP
            );
            Intent launch = new Intent(context, MainActivity.class);
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(launch);
        }
    }
}