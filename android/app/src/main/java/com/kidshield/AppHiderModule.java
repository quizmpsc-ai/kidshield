package com.kidshield;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import com.facebook.react.bridge.*;

public class AppHiderModule extends ReactContextBaseJavaModule {
    private final ReactApplicationContext reactContext;
    public AppHiderModule(ReactApplicationContext context) { super(context); this.reactContext = context; }
    @Override public String getName() { return "AppHider"; }

    @ReactMethod
    public void hideAppIcon(Promise promise) {
        try {
            PackageManager pm = reactContext.getPackageManager();
            ComponentName launcher = new ComponentName(reactContext, "com.kidshield.MainActivity");
            pm.setComponentEnabledSetting(launcher, PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
            promise.resolve(true);
        } catch (Exception e) { promise.reject("HIDE_ERROR", e.getMessage()); }
    }
    @ReactMethod
    public void showAppIcon(Promise promise) {
        try {
            PackageManager pm = reactContext.getPackageManager();
            ComponentName launcher = new ComponentName(reactContext, "com.kidshield.MainActivity");
            pm.setComponentEnabledSetting(launcher, PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
            promise.resolve(true);
        } catch (Exception e) { promise.reject("SHOW_ERROR", e.getMessage()); }
    }
    @ReactMethod
    public void isIconHidden(Promise promise) {
        try {
            PackageManager pm = reactContext.getPackageManager();
            ComponentName launcher = new ComponentName(reactContext, "com.kidshield.MainActivity");
            int state = pm.getComponentEnabledSetting(launcher);
            promise.resolve(state == PackageManager.COMPONENT_ENABLED_STATE_DISABLED);
        } catch (Exception e) { promise.reject("CHECK_ERROR", e.getMessage()); }
    }
    @ReactMethod
    public void isDeviceAdminActive(Promise promise) {
        promise.resolve(KidShieldAdminReceiver.isAdminActive(reactContext));
    }
    @ReactMethod
    public void requestDeviceAdmin(Promise promise) {
        try {
            Intent intent = new Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN);
            intent.putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, KidShieldAdminReceiver.getComponentName(reactContext));
            intent.putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION, "App uninstall रोखण्यासाठी Device Admin activate करा.");
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            reactContext.startActivity(intent);
            promise.resolve(true);
        } catch (Exception e) { promise.reject("ADMIN_ERROR", e.getMessage()); }
    }
    @ReactMethod
    public void lockPhone(Promise promise) {
        try { KidShieldAdminReceiver.lockDevice(reactContext); promise.resolve(true); }
        catch (Exception e) { promise.reject("LOCK_ERROR", e.getMessage()); }
    }
}