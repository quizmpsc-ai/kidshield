// android/app/src/main/java/com/kidshield/UsageStatsModule.java
// Android Native Module - App Usage Tracking

package com.kidshield;

import android.app.AppOpsManager;
import android.app.usage.UsageStats;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.provider.Settings;

import com.facebook.react.bridge.*;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.*;

public class UsageStatsModule extends ReactContextBaseJavaModule {

    private final ReactApplicationContext reactContext;

    public UsageStatsModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
    }

    @Override
    public String getName() { return "UsageStats"; }

    // ── Check if permission granted ──
    @ReactMethod
    public void hasUsagePermission(Promise promise) {
        try {
            AppOpsManager appOps = (AppOpsManager) reactContext.getSystemService(Context.APP_OPS_SERVICE);
            int mode = appOps.checkOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                android.os.Process.myUid(),
                reactContext.getPackageName()
            );
            promise.resolve(mode == AppOpsManager.MODE_ALLOWED);
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    // ── Open permission settings ──
    @ReactMethod
    public void requestUsagePermission() {
        Intent intent = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        reactContext.startActivity(intent);
    }

    // ── Get today's app usage ──
    @ReactMethod
    public void getTodayUsage(Promise promise) {
        try {
            UsageStatsManager usageStatsManager =
                (UsageStatsManager) reactContext.getSystemService(Context.USAGE_STATS_SERVICE);

            Calendar cal = Calendar.getInstance();
            cal.set(Calendar.HOUR_OF_DAY, 0);
            cal.set(Calendar.MINUTE, 0);
            cal.set(Calendar.SECOND, 0);
            long startTime = cal.getTimeInMillis();
            long endTime = System.currentTimeMillis();

            List<UsageStats> stats = usageStatsManager.queryUsageStats(
                UsageStatsManager.INTERVAL_DAILY, startTime, endTime
            );

            WritableArray result = Arguments.createArray();
            long totalMs = 0;

            if (stats != null) {
                // Sort by time used descending
                stats.sort((a, b) -> Long.compare(b.getTotalTimeInForeground(), a.getTotalTimeInForeground()));

                for (UsageStats stat : stats) {
                    long timeMs = stat.getTotalTimeInForeground();
                    if (timeMs < 1000) continue; // Skip if less than 1 second

                    WritableMap appData = Arguments.createMap();
                    appData.putString("packageName", stat.getPackageName());
                    appData.putDouble("minutesUsed", timeMs / 60000.0);
                    appData.putDouble("lastUsed", stat.getLastTimeUsed());

                    // Get app name
                    try {
                        android.content.pm.ApplicationInfo appInfo = reactContext.getPackageManager()
                            .getApplicationInfo(stat.getPackageName(), 0);
                        String appName = reactContext.getPackageManager().getApplicationLabel(appInfo).toString();
                        appData.putString("appName", appName);
                    } catch (Exception e) {
                        appData.putString("appName", stat.getPackageName());
                    }

                    totalMs += timeMs;
                    result.pushMap(appData);
                }
            }

            WritableMap response = Arguments.createMap();
            response.putArray("apps", result);
            response.putDouble("totalMinutes", totalMs / 60000.0);
            response.putString("date", new java.text.SimpleDateFormat("yyyy-MM-dd").format(new Date()));
            promise.resolve(response);

        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    // ── Get installed apps list ──
    @ReactMethod
    public void getInstalledApps(Promise promise) {
        try {
            List<android.content.pm.ApplicationInfo> packages =
                reactContext.getPackageManager().getInstalledApplications(0);

            WritableArray result = Arguments.createArray();
            for (android.content.pm.ApplicationInfo app : packages) {
                // Skip system apps
                if ((app.flags & android.content.pm.ApplicationInfo.FLAG_SYSTEM) != 0) continue;

                WritableMap appData = Arguments.createMap();
                appData.putString("packageName", app.packageName);
                appData.putString("appName",
                    reactContext.getPackageManager().getApplicationLabel(app).toString());
                result.pushMap(appData);
            }
            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }
}
