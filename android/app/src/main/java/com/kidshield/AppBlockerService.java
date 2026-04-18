package com.kidshield;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.accessibility.AccessibilityEvent;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;

public class AppBlockerService extends AccessibilityService {

    private static final String TAG = "AppBlockerService";
    private static final String PREFS_NAME = "KidShieldPrefs";
    private static final String BLOCKED_APPS_KEY = "blocked_apps";

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event.getEventType() == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            String packageName = "";
            if (event.getPackageName() != null) {
                packageName = event.getPackageName().toString();
            }

            if (!packageName.isEmpty() && isAppBlocked(packageName)) {
                Log.d(TAG, "Blocked app detected: " + packageName);
                showBlockOverlay(packageName);
            }
        }
    }

    private boolean isAppBlocked(String packageName) {
        // Don't block our own app or system UI
        if (packageName.equals(getPackageName()) ||
            packageName.equals("com.android.systemui") ||
            packageName.equals("com.android.launcher3") ||
            packageName.equals("com.google.android.apps.nexuslauncher")) {
            return false;
        }

        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        String blockedAppsJson = prefs.getString(BLOCKED_APPS_KEY, "[]");

        try {
            JSONArray blockedApps = new JSONArray(blockedAppsJson);
            for (int i = 0; i < blockedApps.length(); i++) {
                if (blockedApps.getString(i).equals(packageName)) {
                    return true;
                }
            }
        } catch (JSONException e) {
            Log.e(TAG, "Error parsing blocked apps: " + e.getMessage());
        }

        return false;
    }

    private void showBlockOverlay(String packageName) {
        Intent overlayIntent = new Intent(this, BlockOverlayActivity.class);
        overlayIntent.putExtra("blocked_package", packageName);
        overlayIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        overlayIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
        startActivity(overlayIntent);
    }

    @Override
    public void onInterrupt() {
        Log.d(TAG, "AppBlockerService interrupted");
    }

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        AccessibilityServiceInfo info = new AccessibilityServiceInfo();
        info.eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED;
        info.feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC;
        info.flags = AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS |
                     AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;
        info.notificationTimeout = 100;
        setServiceInfo(info);
        Log.d(TAG, "AppBlockerService connected");
    }

    // Static method to update blocked apps list (called from RN bridge)
    public static void updateBlockedApps(android.content.Context context, JSONArray apps) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();
        editor.putString(BLOCKED_APPS_KEY, apps.toString());
        editor.apply();
        Log.d(TAG, "Updated blocked apps: " + apps.toString());
    }
}
