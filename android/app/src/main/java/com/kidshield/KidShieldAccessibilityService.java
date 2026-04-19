package com.kidshield;
import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.accessibility.AccessibilityEvent;
import org.json.JSONArray;

public class KidShieldAccessibilityService extends AccessibilityService {
    private static final String PREFS = "KidShieldPrefs";

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return;
        if (event.getPackageName() == null) return;

        String pkg = event.getPackageName().toString();
        if (pkg.equals(getPackageName())) return;

        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        String blockedJson = prefs.getString("blockedApps", "[]");

        try {
            JSONArray blocked = new JSONArray(blockedJson);
            for (int i = 0; i < blocked.length(); i++) {
                if (blocked.getString(i).equals(pkg)) {
                    Intent blockIntent = new Intent(this, BlockScreenActivity.class);
                    blockIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    blockIntent.putExtra("blockedApp", pkg);
                    startActivity(blockIntent);
                    return;
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @Override
    public void onInterrupt() {}
}