package com.kidshield;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import java.util.List;
import android.content.Intent;
import android.content.Context;
import android.content.SharedPreferences;

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
            performGlobalAction(GLOBAL_ACTION_HOME); // Lock them to Home Screen
            
            // Optional: You can trigger a full-screen "Locked" Activity here
            /* Intent lockIntent = new Intent(this, LockScreenActivity.class);
            lockIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(lockIntent); */
            return; // Stop processing other events if locked
        }

        // 1. APP BLOCKING LOGIC (Force Close Blocked Apps) (Force Close Blocked Apps)
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

        private void checkAndBlockApp(String packageName) {
         SharedPreferences prefs = getSharedPreferences("KidShieldPrefs", Context.MODE_PRIVATE);
         boolean isBlocked = prefs.getBoolean("block_" + packageName, false);

         if (isBlocked) {
             Log.d(TAG, "BLOCKED APP ATTEMPT DETECTED: " + packageName);
             performGlobalAction(GLOBAL_ACTION_HOME); 
             
             // Send Event to JS for Parent Alert
             sendAlertToJS("Blocked App Opened", "Child tried to open blocked app: " + packageName, "blocked_app", "medium");
         }
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
            
            // Send Event to JS for Parent Alert
            sendAlertToJS("Uninstall Attempt", "Child tried to uninstall KidShield!", "security", "high");
            
            Intent launchIntent = getPackageManager().getLaunchIntentForPackage("com.kidshield");
            if (launchIntent != null) {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(launchIntent);
            }
        }
    }
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