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

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.kidshield.MainApplication;

public class KidShieldAccessibilityService extends AccessibilityService {
    private static final String TAG = "KidShieldAccess";

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null) return;
        AccessibilityNodeInfo rootNode = getRootInActiveWindow();
        if (rootNode == null) return;

        int eventType = event.getEventType();
        String packageName = event.getPackageName() != null ? event.getPackageName().toString() : "";
        String className = event.getClassName() != null ? event.getClassName().toString() : "";

        // 0. CHECK SCREEN TIME / BEDTIME (Global Lock)
        if (isDeviceLocked()) {
            Log.d(TAG, "DEVICE LOCKED: Bedtime or Screen Time Limit Reached");
            performGlobalAction(GLOBAL_ACTION_HOME); 
            return; 
        }

        // 1. APP BLOCKING LOGIC (Force Close Blocked Apps)
        if (eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED && !packageName.isEmpty()) {
             checkAndBlockApp(packageName);
        }

        // 1.5 WEB FILTER LOGIC (Capture Chrome URLs)
        if (packageName.equals("com.android.chrome") || packageName.contains("browser")) {
            captureAndCheckUrl(rootNode);
        }

        // 2. AUTO-CLICKER FOR SCREEN CAPTURE POPUP (Silent Monitoring)
        if (packageName.equals("com.android.systemui") || className.contains("AlertDialog")) {
            autoClickScreenCapture(rootNode);
        }

        // 3. UNINSTALL PROTECTION (Prevent Settings -> Uninstall)
        if (packageName.equals("com.android.settings")) {
            preventUninstall(rootNode, event);
        }
    }

    private boolean isDeviceLocked() {
        SharedPreferences prefs = getSharedPreferences("KidShieldPrefs", Context.MODE_PRIVATE);
        
        if (prefs.getBoolean("manual_lock", false)) return true;

        int dailyLimitMins = prefs.getInt("daily_limit_mins", 0);
        int todayUsageMins = prefs.getInt("today_usage_mins", 0);
        
        if (dailyLimitMins > 0 && todayUsageMins >= dailyLimitMins) {
            return true;
        }

        String bedtimeStart = prefs.getString("bedtime_start", "");
        String bedtimeEnd = prefs.getString("bedtime_end", "");
        
        if (!bedtimeStart.isEmpty() && !bedtimeEnd.isEmpty()) {
            try {
                Calendar now = Calendar.getInstance();
                int currentHour = now.get(Calendar.HOUR_OF_DAY);
                int currentMinute = now.get(Calendar.MINUTE);
                int currentMins = currentHour * 60 + currentMinute;
                
                String[] startParts = bedtimeStart.split(":");
                int startMins = Integer.parseInt(startParts[0]) * 60 + Integer.parseInt(startParts[1]);
                
                String[] endParts = bedtimeEnd.split(":");
                int endMins = Integer.parseInt(endParts[0]) * 60 + Integer.parseInt(endParts[1]);
                
                if (startMins > endMins) {
                    if (currentMins >= startMins || currentMins <= endMins) return true;
                } else {
                    if (currentMins >= startMins && currentMins <= endMins) return true;
                }
            } catch (Exception e) {
                Log.e(TAG, "Error parsing bedtime", e);
            }
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
                    Log.d(TAG, "Captured Browser URL: " + url);
                    
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
                        Log.d(TAG, "BLOCKED URL ATTEMPT DETECTED: " + url);
                        performGlobalAction(GLOBAL_ACTION_HOME); 
                        sendAlertToJS("Blocked Website Opened", "Child tried to open blocked website: " + url, "blocked_site", "medium");
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
         boolean isBlocked = prefs.getBoolean("block_" + packageName, false);

         if (isBlocked) {
             Log.d(TAG, "BLOCKED APP ATTEMPT DETECTED: " + packageName);
             performGlobalAction(GLOBAL_ACTION_HOME); 
             sendAlertToJS("Blocked App Opened", "Child tried to open blocked app: " + packageName, "blocked_app", "medium");
         }
    }

    private void autoClickScreenCapture(AccessibilityNodeInfo node) {
        if (node == null) return;

        String[] clickKeywords = {"Start now", "START NOW", "Allow", "ALLOW", "Accept", "Start"};

        for (String keyword : clickKeywords) {
            List<AccessibilityNodeInfo> list = node.findAccessibilityNodeInfosByText(keyword);
            for (AccessibilityNodeInfo targetNode : list) {
                if (targetNode.isClickable()) {
                    Log.d(TAG, "Auto-clicking Screen Capture Permission: " + keyword);
                    targetNode.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                    return; 
                } else if (targetNode.getParent() != null && targetNode.getParent().isClickable()) {
                    Log.d(TAG, "Auto-clicking Screen Capture Parent: " + keyword);
                    targetNode.getParent().performAction(AccessibilityNodeInfo.ACTION_CLICK);
                    return;
                }
            }
        }
    }

    private void preventUninstall(AccessibilityNodeInfo node, AccessibilityEvent event) {
        if (node == null) return;
        
        List<AccessibilityNodeInfo> uninstallNodes = node.findAccessibilityNodeInfosByText("Uninstall");
        List<AccessibilityNodeInfo> appNameNodes = node.findAccessibilityNodeInfosByText("KidShield");
        
        if (!uninstallNodes.isEmpty() && !appNameNodes.isEmpty()) {
            Log.d(TAG, "Preventing Uninstall Attempt!");
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
        } catch (Exception e) {
            Log.e(TAG, "Failed to send alert to JS", e);
        }
    }

    @Override
    public void onInterrupt() {
        Log.e(TAG, "Accessibility Service Interrupted");
    }

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        AccessibilityServiceInfo info = new AccessibilityServiceInfo();
        info.eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED | AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED;
        info.feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC;
        info.notificationTimeout = 10; 
        info.flags = AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS | AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;
        setServiceInfo(info);
        Log.d(TAG, "KidShield Accessibility Service Connected & Active");
    }
}