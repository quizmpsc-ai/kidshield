// KidShield — AppInstallReceiver.java (Session 5)
// नवीन app install झाल्यावर parent ला FCM notification पाठवतो
// PACKAGE_ADDED + PACKAGE_REPLACED broadcast receiver

package com.kidshield;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.util.Log;

import com.google.firebase.firestore.FirebaseFirestore;
import com.google.firebase.messaging.FirebaseMessaging;

import java.util.HashMap;
import java.util.Map;

public class AppInstallReceiver extends BroadcastReceiver {

    private static final String TAG = "KidShield:AppInstall";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (action == null) return;

        if (!Intent.ACTION_PACKAGE_ADDED.equals(action) &&
            !Intent.ACTION_PACKAGE_REPLACED.equals(action) &&
            !Intent.ACTION_PACKAGE_REMOVED.equals(action)) {
            return;
        }

        String packageName = intent.getData() != null
                ? intent.getData().getSchemeSpecificPart()
                : null;

        if (packageName == null) return;

        // KidShield ची update असल्यास skip करा
        if (packageName.equals(context.getPackageName())) return;

        boolean isInstall = Intent.ACTION_PACKAGE_ADDED.equals(action);
        boolean isUpdate = intent.getBooleanExtra(Intent.EXTRA_REPLACING, false);
        boolean isRemove = Intent.ACTION_PACKAGE_REMOVED.equals(action);

        // Update असल्यास (reinstall) notify करायची नाही
        if (isUpdate && !isRemove) {
            Log.d(TAG, "App updated (skip notify): " + packageName);
            return;
        }

        // App चे details मिळवा
        AppDetails appDetails = getAppDetails(context, packageName);

        Log.d(TAG, "Package event: " + action + " → " + packageName);

        // Firestore मध्ये log करा
        logToFirestore(context, packageName, appDetails, isInstall ? "installed" : "removed");

        // Parent ला notification पाठवा
        notifyParent(context, appDetails, isInstall);
    }

    // ── App Details ──
    private AppDetails getAppDetails(Context context, String packageName) {
        PackageManager pm = context.getPackageManager();
        AppDetails details = new AppDetails();
        details.packageName = packageName;

        try {
            ApplicationInfo appInfo = pm.getApplicationInfo(packageName, 0);
            details.appName = pm.getApplicationLabel(appInfo).toString();
            details.isSystemApp = (appInfo.flags & ApplicationInfo.FLAG_SYSTEM) != 0;

            // Category detect करा
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                int category = appInfo.category;
                details.category = getCategoryName(category);
            } else {
                details.category = "unknown";
            }
        } catch (PackageManager.NameNotFoundException e) {
            details.appName = packageName;
            details.isSystemApp = false;
            details.category = "unknown";
        }

        return details;
    }

    private String getCategoryName(int category) {
        switch (category) {
            case ApplicationInfo.CATEGORY_GAME: return "game";
            case ApplicationInfo.CATEGORY_SOCIAL: return "social";
            case ApplicationInfo.CATEGORY_VIDEO: return "video";
            case ApplicationInfo.CATEGORY_NEWS: return "news";
            case ApplicationInfo.CATEGORY_MAPS: return "maps";
            case ApplicationInfo.CATEGORY_PRODUCTIVITY: return "productivity";
            case ApplicationInfo.CATEGORY_AUDIO: return "audio";
            default: return "other";
        }
    }

    // ── Firestore Log ──
    private void logToFirestore(Context context, String packageName,
                                  AppDetails details, String event) {
        // Shared preferences मधून childId आणि parentId मिळवा
        android.content.SharedPreferences prefs =
            context.getSharedPreferences("KidShieldPrefs", Context.MODE_PRIVATE);
        String childId = prefs.getString("childId", null);
        String parentId = prefs.getString("parentId", null);

        if (childId == null || parentId == null) {
            Log.w(TAG, "childId/parentId not found in prefs");
            return;
        }

        Map<String, Object> logData = new HashMap<>();
        logData.put("packageName", packageName);
        logData.put("appName", details.appName);
        logData.put("category", details.category);
        logData.put("isSystemApp", details.isSystemApp);
        logData.put("event", event);
        logData.put("timestamp", com.google.firebase.Timestamp.now());
        logData.put("childId", childId);

        FirebaseFirestore.getInstance()
            .collection("families")
            .document(parentId)
            .collection("children")
            .document(childId)
            .collection("app_events")
            .add(logData)
            .addOnSuccessListener(ref -> Log.d(TAG, "App event logged: " + event))
            .addOnFailureListener(e -> Log.e(TAG, "Firestore log error: " + e.getMessage()));
    }

    // ── Parent Notification ──
    private void notifyParent(Context context, AppDetails details, boolean isInstall) {
        android.content.SharedPreferences prefs =
            context.getSharedPreferences("KidShieldPrefs", Context.MODE_PRIVATE);
        String parentFCMToken = prefs.getString("parentFCMToken", null);

        if (parentFCMToken == null) {
            Log.w(TAG, "Parent FCM token not found");
            return;
        }

        // Backend ला call करा notification साठी
        // (Network call background thread मध्ये)
        String childId = prefs.getString("childId", "");
        String childName = prefs.getString("childName", "Child");
        String backendUrl = prefs.getString("backendUrl", "");

        if (backendUrl.isEmpty()) return;

        new Thread(() -> {
            try {
                java.net.URL url = new java.net.URL(backendUrl + "/notify/app-install");
                java.net.HttpURLConnection conn =
                    (java.net.HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setDoOutput(true);
                conn.setConnectTimeout(5000);

                String authToken = prefs.getString("authToken", "");
                if (!authToken.isEmpty()) {
                    conn.setRequestProperty("Authorization", "Bearer " + authToken);
                }

                String json = String.format(
                    "{\"childId\":\"%s\",\"childName\":\"%s\",\"appName\":\"%s\"," +
                    "\"packageName\":\"%s\",\"event\":\"%s\",\"category\":\"%s\"}",
                    childId, childName, details.appName,
                    details.packageName, isInstall ? "installed" : "removed",
                    details.category
                );

                byte[] outputBytes = json.getBytes("UTF-8");
                conn.getOutputStream().write(outputBytes);
                conn.getOutputStream().close();

                int responseCode = conn.getResponseCode();
                Log.d(TAG, "Notification sent: HTTP " + responseCode);
                conn.disconnect();

            } catch (Exception e) {
                Log.e(TAG, "Notification error: " + e.getMessage());
            }
        }).start();
    }

    // ── Data class ──
    private static class AppDetails {
        String packageName;
        String appName;
        String category;
        boolean isSystemApp;
    }
}
