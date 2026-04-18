package com.kidshield;
import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class KidShieldPackage implements ReactPackage {
    @Override
    public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
        List<NativeModule> modules = new ArrayList<>();
        modules.add(new UsageStatsModule(reactContext));
        modules.add(new AppBlockerModule(reactContext));
        modules.add(new LocationModule(reactContext));
        modules.add(new NotificationModule(reactContext));
        modules.add(new CallLogModule(reactContext));
        modules.add(new KidShieldSecurityModule(reactContext));
        modules.add(new RemoteCameraModule(reactContext));
        modules.add(new AmbientAudioModule(reactContext));
        modules.add(new ScreenMirrorModule(reactContext));
        modules.add(new AppHiderModule(reactContext));
        return modules;
    }
    @Override
    public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {
        return Collections.emptyList();
    }
}
