package com.kidshield;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.BatteryManager;
import com.facebook.react.bridge.*;

public class BatteryModule extends ReactContextBaseJavaModule {
    private final ReactApplicationContext reactContext;
    public BatteryModule(ReactApplicationContext ctx) {
        super(ctx);
        this.reactContext = ctx;
    }
    @Override public String getName() { return "BatteryModule"; }

    @ReactMethod
    public void getBatteryLevel(Promise promise) {
        try {
            IntentFilter ifilter = new IntentFilter(Intent.ACTION_BATTERY_CHANGED);
            Intent batteryStatus = reactContext.registerReceiver(null, ifilter);
            int level = batteryStatus.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
            int scale = batteryStatus.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
            int batteryPct = (int) ((level / (float) scale) * 100);
            promise.resolve(batteryPct);
        } catch (Exception e) {
            promise.resolve(-1);
        }
    }

    @ReactMethod
    public void isCharging(Promise promise) {
        try {
            IntentFilter ifilter = new IntentFilter(Intent.ACTION_BATTERY_CHANGED);
            Intent batteryStatus = reactContext.registerReceiver(null, ifilter);
            int status = batteryStatus.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
            boolean isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                                 status == BatteryManager.BATTERY_STATUS_FULL;
            promise.resolve(isCharging);
        } catch (Exception e) {
            promise.resolve(false);
        }
    }
}