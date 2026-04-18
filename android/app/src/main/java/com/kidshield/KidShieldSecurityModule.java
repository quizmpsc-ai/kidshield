// KidShield — KidShieldSecurityModule.java (Session 6)
// Root Detection + Device Admin + Accessibility Check (Native Android)

package com.kidshield;

import android.app.Activity;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.provider.Settings;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;

import java.io.File;
import java.io.IOException;

public class KidShieldSecurityModule extends ReactContextBaseJavaModule {

    private static final int DEVICE_ADMIN_REQUEST_CODE = 9001;

    private final ReactApplicationContext reactContext;

    // Root indicator paths
    private static final String[] ROOT_PATHS = {
        "/system/app/Superuser.apk",
        "/sbin/su", "/system/bin/su", "/system/xbin/su",
        "/data/local/xbin/su", "/data/local/bin/su",
        "/system/sd/xbin/su", "/system/bin/failsafe/su",
        "/data/local/su", "/su/bin/su",
        "/system/xbin/daemonsu",
    };

    // Known rooting/magisk app packages
    private static final String[] ROOT_PACKAGES = {
        "com.noshufou.android.su",
        "com.noshufou.android.su.elite",
        "eu.chainfire.supersu",
        "com.koushikdutta.superuser",
        "com.thirdparty.superuser",
        "com.yellowes.su",
        "com.topjohnwu.magisk",
        "io.github.huskydg.magisk",
        "com.kingroot.kinguser",
        "com.kingo.android.root",
        "com.smedialink.oneclickroot",
        "com.zhiqupk.root.global",
        "com.alephzain.framaroot",
    };

    public KidShieldSecurityModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @Override
    public String getName() {
        return "KidShieldSecurity";
    }

    // ══════════════════════════════════════════
    // ROOT DETECTION
    // ══════════════════════════════════════════

    @ReactMethod
    public void checkRootStatus(Promise promise) {
        try {
            WritableMap result = Arguments.createMap();
            boolean isRooted = false;
            String reason = "none";

            // 1. Root binary paths check
            if (!isRooted) {
                for (String path : ROOT_PATHS) {
                    if (new File(path).exists()) {
                        isRooted = true;
                        reason = "root_binary_found:" + path;
                        break;
                    }
                }
            }

            // 2. Root package installed check
            if (!isRooted) {
                PackageManager pm = reactContext.getPackageManager();
                for (String pkg : ROOT_PACKAGES) {
                    try {
                        pm.getPackageInfo(pkg, 0);
                        isRooted = true;
                        reason = "root_package_found:" + pkg;
                        break;
                    } catch (PackageManager.NameNotFoundException ignored) {
                        // Package नाही — good
                    }
                }
            }

            // 3. 'su' command execute check
            if (!isRooted) {
                isRooted = canExecuteSu();
                if (isRooted) reason = "su_executable";
            }

            // 4. Build tags check (test-keys = rooted ROM)
            if (!isRooted) {
                String buildTags = android.os.Build.TAGS;
                if (buildTags != null && buildTags.contains("test-keys")) {
                    isRooted = true;
                    reason = "test_keys_found";
                }
            }

            // 5. /system writeable check (on non-rooted devices it's read-only)
            if (!isRooted) {
                try {
                    Process process = Runtime.getRuntime().exec(new String[]{"mount"});
                    byte[] bytes = new byte[1024];
                    process.getInputStream().read(bytes);
                    String mountOutput = new String(bytes);
                    if (mountOutput.contains("/system rw") || mountOutput.contains("/system/ rw")) {
                        isRooted = true;
                        reason = "system_writable";
                    }
                } catch (IOException ignored) {}
            }

            result.putBoolean("isRooted", isRooted);
            result.putString("reason", reason);
            result.putString("deviceModel", android.os.Build.MODEL);
            result.putString("manufacturer", android.os.Build.MANUFACTURER);
            promise.resolve(result);

        } catch (Exception e) {
            promise.reject("ROOT_CHECK_ERROR", e.getMessage());
        }
    }

    private boolean canExecuteSu() {
        Process process = null;
        try {
            process = Runtime.getRuntime().exec(new String[]{"/system/xbin/which", "su"});
            process.waitFor();
            return process.exitValue() == 0;
        } catch (Exception ignored) {
            return false;
        } finally {
            if (process != null) process.destroy();
        }
    }

    // ══════════════════════════════════════════
    // DEVICE ADMIN CHECK
    // ══════════════════════════════════════════

    @ReactMethod
    public void isDeviceAdminActive(Promise promise) {
        try {
            DevicePolicyManager dpm = (DevicePolicyManager) reactContext
                .getSystemService(Context.DEVICE_POLICY_SERVICE);
            ComponentName adminComponent = new ComponentName(
                reactContext, KidShieldAdminReceiver.class
            );
            promise.resolve(dpm.isAdminActive(adminComponent));
        } catch (Exception e) {
            promise.reject("DEVICE_ADMIN_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void requestDeviceAdmin(Promise promise) {
        try {
            Activity currentActivity = getCurrentActivity();
            if (currentActivity == null) {
                promise.reject("NO_ACTIVITY", "No activity available");
                return;
            }

            Intent intent = new Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN);
            ComponentName adminComponent = new ComponentName(
                reactContext, KidShieldAdminReceiver.class
            );
            intent.putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent);
            intent.putExtra(
                DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                "KidShield needs Device Administrator access to prevent unauthorized uninstallation."
            );
            currentActivity.startActivityForResult(intent, DEVICE_ADMIN_REQUEST_CODE);
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("REQUEST_ADMIN_ERROR", e.getMessage());
        }
    }

    // ══════════════════════════════════════════
    // ACCESSIBILITY SERVICE CHECK
    // ══════════════════════════════════════════

    @ReactMethod
    public void isAccessibilityServiceEnabled(Promise promise) {
        try {
            int accessibilityEnabled = 0;
            final String service = reactContext.getPackageName() +
                "/" + AppBlockerService.class.getCanonicalName();

            try {
                accessibilityEnabled = Settings.Secure.getInt(
                    reactContext.getContentResolver(),
                    Settings.Secure.ACCESSIBILITY_ENABLED
                );
            } catch (Settings.SettingNotFoundException ignored) {}

            if (accessibilityEnabled == 1) {
                String settingValue = Settings.Secure.getString(
                    reactContext.getContentResolver(),
                    Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
                );
                if (settingValue != null) {
                    promise.resolve(settingValue.toLowerCase().contains(service.toLowerCase()));
                    return;
                }
            }
            promise.resolve(false);
        } catch (Exception e) {
            promise.reject("ACCESSIBILITY_CHECK_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void openAccessibilitySettings(Promise promise) {
        try {
            Activity activity = getCurrentActivity();
            if (activity != null) {
                Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                activity.startActivity(intent);
            }
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("OPEN_SETTINGS_ERROR", e.getMessage());
        }
    }

    // ══════════════════════════════════════════
    // USAGE STATS PERMISSION CHECK
    // ══════════════════════════════════════════

    @ReactMethod
    public void hasUsageStatsPermission(Promise promise) {
        try {
            android.app.AppOpsManager appOps = (android.app.AppOpsManager) reactContext
                .getSystemService(Context.APP_OPS_SERVICE);
            int mode = appOps.checkOpNoThrow(
                android.app.AppOpsManager.OPSTR_GET_USAGE_STATS,
                android.os.Process.myUid(),
                reactContext.getPackageName()
            );
            promise.resolve(mode == android.app.AppOpsManager.MODE_ALLOWED);
        } catch (Exception e) {
            promise.reject("USAGE_STATS_CHECK_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void openUsageStatsSettings(Promise promise) {
        try {
            Activity activity = getCurrentActivity();
            if (activity != null) {
                Intent intent = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                activity.startActivity(intent);
            }
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("OPEN_USAGE_SETTINGS_ERROR", e.getMessage());
        }
    }
}
