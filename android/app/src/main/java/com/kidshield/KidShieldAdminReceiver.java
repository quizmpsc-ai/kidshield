package com.kidshield;
import android.app.admin.DeviceAdminReceiver;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.Toast;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.firestore.FirebaseFirestore;
import java.util.HashMap;
import java.util.Map;

public class KidShieldAdminReceiver extends DeviceAdminReceiver {
    @Override
    public void onEnabled(Context context, Intent intent) {
        super.onEnabled(context, intent);
        Toast.makeText(context, "KidShield Protection Active", Toast.LENGTH_SHORT).show();
        try {
            String uid = FirebaseAuth.getInstance().getCurrentUser() != null ?
                FirebaseAuth.getInstance().getCurrentUser().getUid() : null;
            if (uid != null) {
                Map<String, Object> data = new HashMap<>();
                data.put("deviceAdminEnabled", true);
                FirebaseFirestore.getInstance().collection("users").document(uid).update(data);
            }
        } catch (Exception e) { e.printStackTrace(); }
    }
    @Override
    public CharSequence onDisableRequested(Context context, Intent intent) {
        try {
            String uid = FirebaseAuth.getInstance().getCurrentUser() != null ?
                FirebaseAuth.getInstance().getCurrentUser().getUid() : null;
            if (uid != null) {
                Map<String, Object> alert = new HashMap<>();
                alert.put("childId", uid);
                alert.put("title", "Tamper Alert!");
                alert.put("body", "KidShield remove attempt!");
                alert.put("type", "TAMPER_ALERT");
                alert.put("read", false);
                FirebaseFirestore.getInstance().collection("alerts").add(alert);
            }
        } catch (Exception e) { e.printStackTrace(); }
        return "KidShield Admin password शिवाय remove करता येणार नाही!";
    }
    @Override
    public void onDisabled(Context context, Intent intent) { super.onDisabled(context, intent); }
    public static ComponentName getComponentName(Context context) {
        return new ComponentName(context, KidShieldAdminReceiver.class);
    }
    public static boolean isAdminActive(Context context) {
        DevicePolicyManager dpm = (DevicePolicyManager) context.getSystemService(Context.DEVICE_POLICY_SERVICE);
        return dpm != null && dpm.isAdminActive(getComponentName(context));
    }
    public static void lockDevice(Context context) {
        DevicePolicyManager dpm = (DevicePolicyManager) context.getSystemService(Context.DEVICE_POLICY_SERVICE);
        if (dpm != null && dpm.isAdminActive(getComponentName(context))) { dpm.lockNow(); }
    }
}