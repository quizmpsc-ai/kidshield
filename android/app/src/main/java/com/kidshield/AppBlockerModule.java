package com.kidshield;

import android.content.Context;
import android.content.Intent;
import android.provider.Settings;
import android.text.TextUtils;
import android.util.Log;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;

import org.json.JSONArray;
import org.json.JSONException;

public class AppBlockerModule extends ReactContextBaseJavaModule {

    private static final String TAG = "AppBlockerModule";
    private final ReactApplicationContext reactContext;

    public AppBlockerModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @Override
    public String getName() {
        return "AppBlocker";
    }

    @ReactMethod
    public void setBlockedApps(ReadableArray apps, Promise promise) {
        try {
            JSONArray jsonApps = new JSONArray();
            for (int i = 0; i < apps.size(); i++) {
                jsonApps.put(apps.getString(i));
            }
            AppBlockerService.updateBlockedApps(reactContext, jsonApps);
            promise.resolve(true);
            Log.d(TAG, "Blocked apps updated: " + apps.size() + " apps");
        } catch (Exception e) {
            promise.reject("ERROR", "Failed to update blocked apps: " + e.getMessage());
        }
    }

    @ReactMethod
    public void isAccessibilityEnabled(Promise promise) {
        try {
            boolean enabled = isAccessibilityServiceEnabled(reactContext, AppBlockerService.class);
            promise.resolve(enabled);
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void openAccessibilitySettings(Promise promise) {
        try {
            Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            reactContext.startActivity(intent);
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void isOverlayPermissionGranted(Promise promise) {
        try {
            boolean granted = Settings.canDrawOverlays(reactContext);
            promise.resolve(granted);
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void requestOverlayPermission(Promise promise) {
        try {
            Intent intent = new Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                android.net.Uri.parse("package:" + reactContext.getPackageName())
            );
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            reactContext.startActivity(intent);
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    private boolean isAccessibilityServiceEnabled(Context context, Class<?> accessibilityService) {
        String prefString = Settings.Secure.getString(
            context.getContentResolver(),
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        );
        if (prefString == null) return false;
        TextUtils.SimpleStringSplitter splitter = new TextUtils.SimpleStringSplitter(':');
        splitter.setString(prefString);
        while (splitter.hasNext()) {
            String accessibilityServiceName = splitter.next();
            if (accessibilityServiceName.equalsIgnoreCase(
                    context.getPackageName() + "/" + accessibilityService.getName())) {
                return true;
            }
        }
        return false;
    }
}
