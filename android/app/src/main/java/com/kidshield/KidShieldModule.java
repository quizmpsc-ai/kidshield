package com.kidshield;

import java.util.List;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableArray;
import android.content.pm.ApplicationInfo;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import android.os.PowerManager;

public class KidShieldModule extends ReactContextBaseJavaModule {
    private static final String PREFS = "KidShieldPrefs";
    private final ReactApplicationContext reactContext;

    public KidShieldModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
    }

    @Override
    public String getName() { return "KidShieldModule"; }

    // 🔥 FIX: ॲपला बॅकग्राउंडमधून समोर (Foreground) आणण्यासाठी WakeLock
    @ReactMethod
    public void wakeApp(Promise promise) {
        try {
            PowerManager pm = (PowerManager) reactContext.getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                PowerManager.WakeLock wl = pm.newWakeLock(
                    PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP | PowerManager.ON_AFTER_RELEASE, 
                    "KidShield:WakeLock"
                );
                wl.acquire(3000); 
            }

            Intent intent = new Intent(reactContext, MainActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            reactContext.startActivity(intent);
            
            promise.resolve("woken");
        } catch (Exception e) { 
            promise.reject("ERROR", e.getMessage()); 
        }
    }

    @ReactMethod
    public void hideAppIcon(Promise promise) {
        try {
            PackageManager pm = reactContext.getPackageManager();
            pm.setComponentEnabledSetting(
                new ComponentName(reactContext, MainActivity.class),
                PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                PackageManager.DONT_KILL_APP
            );
            promise.resolve("hidden");
        } catch (Exception e) { promise.reject("ERROR", e.getMessage()); }
    }

    @ReactMethod
    public void showAppIcon(Promise promise) {
        try {
            PackageManager pm = reactContext.getPackageManager();
            pm.setComponentEnabledSetting(
                new ComponentName(reactContext, MainActivity.class),
                PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                PackageManager.DONT_KILL_APP
            );
            promise.resolve("shown");
        } catch (Exception e) { promise.reject("ERROR", e.getMessage()); }
    }

    @ReactMethod
    public void setBlockedApps(String appsJson, Promise promise) {
        try {
            SharedPreferences prefs = reactContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            prefs.edit().putString("blockedApps", appsJson).apply();
            promise.resolve("saved");
        } catch (Exception e) { promise.reject("ERROR", e.getMessage()); }
    }

    @ReactMethod
    public void setChildMode(boolean isChild, Promise promise) {
        try {
            SharedPreferences prefs = reactContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            prefs.edit().putBoolean("isChild", isChild).apply();
            promise.resolve("set");
        } catch (Exception e) { promise.reject("ERROR", e.getMessage()); }
    }

    @ReactMethod
    public void isDeviceAdminEnabled(Promise promise) {
        try {
            DevicePolicyManager dpm = (DevicePolicyManager) reactContext.getSystemService(Context.DEVICE_POLICY_SERVICE);
            ComponentName admin = new ComponentName(reactContext, KidShieldDeviceAdmin.class);
            promise.resolve(dpm.isAdminActive(admin));
        } catch (Exception e) { promise.resolve(false); }
    }

    @ReactMethod
    public void requestDeviceAdmin(Promise promise) {
        try {
            Intent intent = new Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN);
            intent.putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN,
                new ComponentName(reactContext, KidShieldDeviceAdmin.class));
            intent.putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                "Enable to prevent unauthorized uninstall of KidShield");
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            reactContext.startActivity(intent);
            promise.resolve("requested");
        } catch (Exception e) { promise.reject("ERROR", e.getMessage()); }
    }

    @ReactMethod
    public void openAccessibilitySettings(Promise promise) {
        try {
            Intent intent = new Intent(android.provider.Settings.ACTION_ACCESSIBILITY_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            reactContext.startActivity(intent);
            promise.resolve("opened");
        } catch (Exception e) { promise.reject("ERROR", e.getMessage()); }
    }

    @ReactMethod
    public void getInstalledApps(Promise promise) {
        try {
            PackageManager pm = getReactApplicationContext().getPackageManager();
            List<ApplicationInfo> packages = pm.getInstalledApplications(PackageManager.GET_META_DATA);
            WritableArray appList = Arguments.createArray();
            
            for (ApplicationInfo packageInfo : packages) {
                if (pm.getLaunchIntentForPackage(packageInfo.packageName) != null) {
                    WritableMap app = Arguments.createMap();
                    app.putString("packageName", packageInfo.packageName);
                    app.putString("appName", pm.getApplicationLabel(packageInfo).toString());
                    appList.pushMap(app);
                }
            }
            promise.resolve(appList);
        } catch (Exception e) {
            promise.reject("APP_ERROR", e.getMessage());
        }
    }
}