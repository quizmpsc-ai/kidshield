package com.kidshield;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;

public class SecretCodeReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if ("android.provider.Telephony.SECRET_CODE".equals(intent.getAction())) {
            PackageManager pm = context.getPackageManager();
            ComponentName comp = new ComponentName("com.kidshield", "com.kidshield.MainActivity");
            pm.setComponentEnabledSetting(comp, PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
            Intent launch = context.getPackageManager().getLaunchIntentForPackage("com.kidshield");
            if (launch != null) {
                launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                launch.putExtra("from_secret_code", true);
                context.startActivity(launch);
            }
        }
    }
}
