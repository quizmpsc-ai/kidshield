package com.kidshield;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class RemoteCameraModule extends ReactContextBaseJavaModule {
    private static final String TAG = "KidShieldCamera";
    private final ReactApplicationContext reactContext;

    public RemoteCameraModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
    }

    @Override
    public String getName() {
        return "RemoteCamera";
    }

    // 🔥 React Native Event Emitter ला लागणाऱ्या रिकाम्या मेथड्स (काढू नका)
    @ReactMethod
    public void addListener(String eventName) {}

    @ReactMethod
    public void removeListeners(double count) {}

    // Socket साठी Child आणि Parent ID सेव्ह करणे
    @ReactMethod
    public void setChildInfo(String cId, String pId, Promise promise) {
        SharedPreferences prefs = reactContext.getSharedPreferences("KidShieldPrefs", Context.MODE_PRIVATE);
        prefs.edit().putString("childId", cId).putString("parentId", pId).apply();
        
        NativeSocketManager.getInstance().setIds(cId, pId);
        Log.d(TAG, "Child info set for Native Socket: " + cId + " / " + pId);
        
        if (promise != null) promise.resolve(true);
    }

    // 🔥 नवीन: फक्त Service सुरु करणे (CameraX सर्व्हिसमध्ये चालेल)
    @ReactMethod
    public void startLiveCamera(String requestId, boolean isFront, Promise promise) {
        try {
            Intent serviceIntent = new Intent(reactContext, RemoteCameraService.class);
            serviceIntent.putExtra("isFront", isFront);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactContext.startForegroundService(serviceIntent);
            } else {
                reactContext.startService(serviceIntent);
            }
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    // 🔥 नवीन: फक्त Service बंद करणे
    @ReactMethod
    public void stopLiveCamera(Promise promise) {
        try {
            Intent serviceIntent = new Intent(reactContext, RemoteCameraService.class);
            reactContext.stopService(serviceIntent);
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }
}