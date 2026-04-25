package com.kidshield;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import java.util.List;
import java.util.Calendar;
import android.content.Intent;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.PowerManager;
import android.os.Handler;
import android.os.Looper;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.kidshield.MainApplication;

// 🔥 Background Wake-up आणि Firebase साठी Imports
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;
import com.google.firebase.firestore.FirebaseFirestore;
import com.google.firebase.firestore.DocumentChange;
import com.google.firebase.firestore.ListenerRegistration;

public class KidShieldAccessibilityService extends AccessibilityService {
    private static final String TAG = "KidShieldAccess";
    
    // 🔥 २४/७ कमांड्स ऐकण्यासाठी
    private ListenerRegistration commandListener; 

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null) return;
        
        String packageName = event.getPackageName() != null ? event.getPackageName().toString() : "";
        String className = event.getClassName() != null ? event.getClassName().toString() : "";

        // 1. 🔥 AGGRESSIVE AUTO-CLICKER FOR SCREEN CAPTURE POPUP (200ms Delay)
        // System UI किंवा कोणत्याही डायलॉगमधून पॉपअप आला तरी तो कॅच करेल
        if (packageName.contains("systemui") || packageName.contains("permission") || className.contains("Dialog") || className.contains("AlertDialog")) {
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                AccessibilityNodeInfo rootNode = getRootInActiveWindow();
                if (rootNode != null) {
                    autoClickScreenCapture(rootNode);
                }
            }, 200); // पॉपअप पूर्ण रेंडर होण्यासाठी 200ms थांबा
        }

        AccessibilityNodeInfo rootNode = getRootInActiveWindow();
        int eventType = event.getEventType();

        // 2. Screen Time / Bedtime Lock
        if (isDeviceLocked()) {
            performGlobalAction(GLOBAL_ACTION_HOME); 
            return; 
        }

        // 3. App Blocking
        if (eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED && !packageName.isEmpty()) {
             checkAndBlockApp(packageName);
        }

        // 4. Web Filter
        if (packageName.equals("com.android.chrome") || packageName.contains("browser")) {
            if (rootNode != null) captureAndCheckUrl(rootNode);
        }

        // 5. Uninstall Protection
        if (packageName.equals("com.android.settings")) {
            if (rootNode != null) preventUninstall(rootNode, event);
        }
    }

    // ════════════════════════════════════════════════════════════
    // 🔥 PROFESSIONAL AUTO-CLICKER LOGIC
    // ════════════════════════════════════════════════════════════
    private boolean autoClickScreenCapture(AccessibilityNodeInfo node) {
        if (node == null) return false;
        
        // विविध फोन्सवर येणारे सर्व शक्य शब्द
        String[] clickKeywords = {"Start now", "START NOW", "Allow", "ALLOW", "Accept", "Start", "प्रारंभ करा"};
        
        for (String keyword : clickKeywords) {
            List<AccessibilityNodeInfo> list = node.findAccessibilityNodeInfosByText(keyword);
            for (AccessibilityNodeInfo targetNode : list) {
                AccessibilityNodeInfo clickableNode = targetNode;
                
                // 🔥 जोपर्यंत 'Clickable' Parent मिळत नाही, तोपर्यंत वरच्या लेव्हलवर जा
                while (clickableNode != null && !clickableNode.isClickable()) {
                    clickableNode = clickableNode.getParent();
                }
                
                if (clickableNode != null) {
                    Log.d(TAG, "🔥 Screen Mirror Popup Auto-Clicked: " + keyword);
                    clickableNode.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                    return true; // क्लिक झाले, थांबवा.
                }
            }
        }
        
        // जर वरील लूपने काम केले नाही, तर सर्व Children चेक करा
        for (int i = 0; i < node.getChildCount(); i++) {
            if (autoClickScreenCapture(node.getChild(i))) return true;
        }
        return false;
    }

    // ════════════════════════════════════════════════════════════
    // 🔥 AIRDROID-LEVEL BACKGROUND WAKE-UP (FIREBASE NATIVE LISTENER)
    // ════════════════════════════════════════════════════════════
    private void startBackgroundCommandListener() {
        FirebaseUser user = FirebaseAuth.getInstance().getCurrentUser();
        if (user == null) return;
        String uid = user.getUid();

        // ॲप बंद असतानाही हे सर्व्हरशी कनेक्ट राहते
        FirebaseFirestore.getInstance().collection("users").document(uid).get()
            .addOnSuccessListener(documentSnapshot -> {
                String childId = uid;
                if (documentSnapshot.exists() && documentSnapshot.getString("childId") != null) {
                    childId = documentSnapshot.getString("childId");
                }
                
                commandListener = FirebaseFirestore.getInstance()
                    .collection("commands")
                    .whereEqualTo("childId", childId)
                    .whereEqualTo("status", "pending")
                    .addSnapshotListener((snapshots, e) -> {
                        if (e != null || snapshots == null) return;
                        
                        for (DocumentChange dc : snapshots.getDocumentChanges()) {
                            if (dc.getType() == DocumentChange.Type.ADDED) {
                                Log.d(TAG, "🔥 Background Command Received! Forcing App Wake Up...");
                                wakeUpAppForCommand();
                            }
                        }
                    });
            });
    }

    private void wakeUpAppForCommand() {
        try {
            // १. फोनची स्क्रीन १००% चालू करा
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                PowerManager.WakeLock wl = pm.newWakeLock(
                    PowerManager.FULL_WAKE_LOCK |
                    PowerManager.ACQUIRE_CAUSES_WAKEUP |
                    PowerManager.ON_AFTER_RELEASE, 
                    "KidShield:BackgroundWake"
                );
                wl.acquire(10000); // ॲप लोड होईपर्यंत (१० सेकंद) स्क्रीन चालू ठेवा
                wl.release();
            }

            // २. ॲपला फोर्सफुली समोर आणा (No Animation, Clear Top)
            Intent intent = new Intent(this, MainActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | 
                            Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | 
                            Intent.FLAG_ACTIVITY_SINGLE_TOP |
                            Intent.FLAG_ACTIVITY_CLEAR_TOP |
                            Intent.FLAG_ACTIVITY_NO_ANIMATION); 
            startActivity(intent);
            
        } catch (Exception e) {
            Log.e(TAG, "Failed to wake app", e);
        }
    }

    // ════════════════════════════════════════════════════════════
    // EXISTING LOGIC (Blocking, Web Filter, Uninstall)
    // ════════════════════════════════════════════════════════════
    private boolean isDeviceLocked() {
        SharedPreferences prefs = getSharedPreferences("KidShieldPrefs", Context.MODE_PRIVATE);
        if (prefs.getBoolean("manual_lock", false)) return true;
        int dailyLimitMins = prefs.getInt("daily_limit_mins", 0);
        int todayUsageMins = prefs.getInt("today_usage_mins", 0);
        if (dailyLimitMins > 0 && todayUsageMins >= dailyLimitMins) return true;
        // Bedtime check
        String bedtimeStart = prefs.getString("bedtime_start", "");
        String bedtimeEnd = prefs.getString("bedtime_end", "");
        if (!bedtimeStart.isEmpty() && !bedtimeEnd.isEmpty()) {
            try {
                Calendar now = Calendar.getInstance();
                int currentMins = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE);
                String[] startParts = bedtimeStart.split(":");
                int startMins = Integer.parseInt(startParts[0]) * 60 + Integer.parseInt(startParts[1]);
                String[] endParts = bedtimeEnd.split(":");
                int endMins = Integer.parseInt(endParts[0]) * 60 + Integer.parseInt(endParts[1]);
                if (startMins > endMins) {
                    if (currentMins >= startMins || currentMins <= endMins) return true;
                } else {
                    if (currentMins >= startMins && currentMins <= endMins) return true;
                }
            } catch (Exception e) { Log.e(TAG, "Error parsing bedtime", e); }
        }
        return false;
    }

    private void captureAndCheckUrl(AccessibilityNodeInfo nodeInfo) {
        if (nodeInfo == null) return;
        if (nodeInfo.getClassName() != null && "android.widget.EditText".equals(nodeInfo.getClassName().toString())) {
            String viewId = nodeInfo.getViewIdResourceName();
            if (viewId != null && viewId.equals("com.android.chrome:id/url_bar")) {
                String url = nodeInfo.getText() != null ? nodeInfo.getText().toString() : "";
                if (!url.isEmpty()) {
                    SharedPreferences prefs = getSharedPreferences("KidShieldPrefs", Context.MODE_PRIVATE);
                    String blockedDomains = prefs.getString("blocked_domains", ""); 
                    boolean blockAdult = prefs.getBoolean("filter_adult", false);
                    String[] adultKeywords = {"porn", "sex", "xxx", "xvideos"}; 
                    boolean shouldBlock = false;
                    
                    if (blockAdult) {
                        for (String kw : adultKeywords) {
                            if (url.toLowerCase().contains(kw)) { shouldBlock = true; break; }
                        }
                    }
                    if (!shouldBlock && !blockedDomains.isEmpty() && blockedDomains.contains(url.toLowerCase())) {
                        shouldBlock = true;
                    }
                    if (shouldBlock) {
                        performGlobalAction(GLOBAL_ACTION_HOME); 
                        sendAlertToJS("Blocked Website Opened", "Child tried to open: " + url, "blocked_site", "medium");
                    }
                }
            }
        }
        for (int i = 0; i < nodeInfo.getChildCount(); i++) {
            captureAndCheckUrl(nodeInfo.getChild(i));
        }
    }

    private void checkAndBlockApp(String packageName) {
         SharedPreferences prefs = getSharedPreferences("KidShieldPrefs", Context.MODE_PRIVATE);
         if (prefs.getBoolean("block_" + packageName, false)) {
             performGlobalAction(GLOBAL_ACTION_HOME); 
             sendAlertToJS("Blocked App Opened", "Tried to open: " + packageName, "blocked_app", "medium");
         }
    }

    private void preventUninstall(AccessibilityNodeInfo node, AccessibilityEvent event) {
        if (node == null) return;
        List<AccessibilityNodeInfo> uninstallNodes = node.findAccessibilityNodeInfosByText("Uninstall");
        List<AccessibilityNodeInfo> appNameNodes = node.findAccessibilityNodeInfosByText("KidShield");
        if (!uninstallNodes.isEmpty() && !appNameNodes.isEmpty()) {
            performGlobalAction(GLOBAL_ACTION_BACK);
            performGlobalAction(GLOBAL_ACTION_HOME);
            sendAlertToJS("Uninstall Attempt", "Child tried to uninstall KidShield!", "security", "high");
            Intent launchIntent = getPackageManager().getLaunchIntentForPackage("com.kidshield");
            if (launchIntent != null) {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(launchIntent);
            }
        }
    }

    private void sendAlertToJS(String title, String message, String type, String severity) {
        try {
            ReactContext reactContext = MainApplication.getReactContext();
            if (reactContext != null) {
                WritableMap params = Arguments.createMap();
                params.putString("title", title);
                params.putString("message", message);
                params.putString("type", type);
                params.putString("severity", severity);
                reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                        .emit("onSecurityAlert", params);
            }
        } catch (Exception e) {}
    }

    @Override
    public void onInterrupt() { Log.e(TAG, "Accessibility Service Interrupted"); }

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        AccessibilityServiceInfo info = new AccessibilityServiceInfo();
        info.eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED | AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED;
        info.feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC;
        // 🔥 पॉपअप लगेच कॅच करण्यासाठी Timeout कमी केला आहे (10ms)
        info.notificationTimeout = 10; 
        info.flags = AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS |
                     AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS |
                     AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS; // 🔥 पॉपअप्स पाहण्यासाठी खूप महत्वाचे
        setServiceInfo(info);
        
        // 🔥 सर्व्हिस चालू होताच Firebase Listener सुरू करा
        startBackgroundCommandListener();
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (commandListener != null) {
            commandListener.remove();
        }
    }
}