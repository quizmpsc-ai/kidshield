// KidShield — CallLogModule.java (Session 5)
// Call Log Monitor — Number + Duration फक्त (content नाही)
// Parent ला कोणाशी call झाला ते दिसतो

package com.kidshield;

import android.Manifest;
import android.content.ContentResolver;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.provider.CallLog;
import android.provider.ContactsContract;

import androidx.core.content.ContextCompat;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;

import java.util.HashMap;
import java.util.Map;

public class CallLogModule extends ReactContextBaseJavaModule {

    private static final String MODULE_NAME = "CallLogModule";
    private final ReactApplicationContext reactContext;

    public CallLogModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
    }

    @Override
    public String getName() {
        return MODULE_NAME;
    }

    // ── Recent Calls मिळवा ──
    @ReactMethod
    public void getRecentCalls(int limit, Promise promise) {
        // Permission check
        if (ContextCompat.checkSelfPermission(reactContext, Manifest.permission.READ_CALL_LOG)
                != PackageManager.PERMISSION_GRANTED) {
            promise.reject("PERMISSION_DENIED", "READ_CALL_LOG permission नाही");
            return;
        }

        WritableArray calls = Arguments.createArray();

        try {
            ContentResolver cr = reactContext.getContentResolver();
            Cursor cursor = cr.query(
                CallLog.Calls.CONTENT_URI,
                new String[]{
                    CallLog.Calls.NUMBER,
                    CallLog.Calls.TYPE,
                    CallLog.Calls.DATE,
                    CallLog.Calls.DURATION,
                    CallLog.Calls.CACHED_NAME,
                },
                null, null,
                CallLog.Calls.DATE + " DESC LIMIT " + limit
            );

            if (cursor != null) {
                while (cursor.moveToNext()) {
                    String number = cursor.getString(cursor.getColumnIndex(CallLog.Calls.NUMBER));
                    int type = cursor.getInt(cursor.getColumnIndex(CallLog.Calls.TYPE));
                    long date = cursor.getLong(cursor.getColumnIndex(CallLog.Calls.DATE));
                    long duration = cursor.getLong(cursor.getColumnIndex(CallLog.Calls.DURATION));
                    String cachedName = cursor.getString(cursor.getColumnIndex(CallLog.Calls.CACHED_NAME));

                    // Number hash करा — privacy साठी
                    String hashedNumber = hashPhoneNumber(number);
                    String contactName = cachedName != null && !cachedName.isEmpty()
                        ? cachedName
                        : lookupContact(number);

                    WritableMap call = Arguments.createMap();
                    call.putString("hashedNumber", hashedNumber);
                    // शेवटचे 4 digits फक्त दाखवा
                    call.putString("numberPreview", "XXXX-" + number.replaceAll("\\D", "").replaceAll(".*(.{4})$", "$1"));
                    call.putString("contactName", contactName != null ? contactName : "Unknown");
                    call.putString("callType", getCallType(type));
                    call.putDouble("timestamp", (double) date);
                    call.putDouble("duration", (double) duration); // seconds
                    call.putString("durationFormatted", formatDuration(duration));

                    calls.pushMap(call);
                }
                cursor.close();
            }

            promise.resolve(calls);
        } catch (Exception e) {
            promise.reject("ERROR", "Call log read करताना error: " + e.getMessage());
        }
    }

    // ── Today's Call Stats ──
    @ReactMethod
    public void getTodayCallStats(Promise promise) {
        if (ContextCompat.checkSelfPermission(reactContext, Manifest.permission.READ_CALL_LOG)
                != PackageManager.PERMISSION_GRANTED) {
            promise.reject("PERMISSION_DENIED", "READ_CALL_LOG permission नाही");
            return;
        }

        try {
            long todayStart = getTodayStartTimestamp();
            ContentResolver cr = reactContext.getContentResolver();

            Cursor cursor = cr.query(
                CallLog.Calls.CONTENT_URI,
                new String[]{
                    CallLog.Calls.TYPE,
                    CallLog.Calls.DURATION,
                },
                CallLog.Calls.DATE + " >= ?",
                new String[]{String.valueOf(todayStart)},
                null
            );

            int totalCalls = 0;
            int missedCalls = 0;
            long totalDuration = 0;
            Map<String, Integer> callTypes = new HashMap<>();
            callTypes.put("incoming", 0);
            callTypes.put("outgoing", 0);
            callTypes.put("missed", 0);

            if (cursor != null) {
                while (cursor.moveToNext()) {
                    int type = cursor.getInt(0);
                    long duration = cursor.getLong(1);

                    totalCalls++;
                    totalDuration += duration;

                    String typeName = getCallType(type);
                    callTypes.put(typeName, callTypes.getOrDefault(typeName, 0) + 1);

                    if (type == CallLog.Calls.MISSED_TYPE) {
                        missedCalls++;
                    }
                }
                cursor.close();
            }

            WritableMap stats = Arguments.createMap();
            stats.putInt("totalCalls", totalCalls);
            stats.putInt("missedCalls", missedCalls);
            stats.putDouble("totalDurationSeconds", (double) totalDuration);
            stats.putString("totalDurationFormatted", formatDuration(totalDuration));
            stats.putInt("incomingCalls", callTypes.get("incoming"));
            stats.putInt("outgoingCalls", callTypes.get("outgoing"));

            promise.resolve(stats);
        } catch (Exception e) {
            promise.reject("ERROR", "Stats मिळवताना error: " + e.getMessage());
        }
    }

    // ── Contacts मध्ये नाव शोधा ──
    private String lookupContact(String phoneNumber) {
        try {
            Uri uri = Uri.withAppendedPath(
                ContactsContract.PhoneLookup.CONTENT_FILTER_URI,
                Uri.encode(phoneNumber)
            );
            Cursor cursor = reactContext.getContentResolver().query(
                uri,
                new String[]{ContactsContract.PhoneLookup.DISPLAY_NAME},
                null, null, null
            );
            if (cursor != null && cursor.moveToFirst()) {
                String name = cursor.getString(0);
                cursor.close();
                return name;
            }
        } catch (Exception e) {
            // Silent fail
        }
        return null;
    }

    // ── Helpers ──
    private String getCallType(int type) {
        switch (type) {
            case CallLog.Calls.INCOMING_TYPE: return "incoming";
            case CallLog.Calls.OUTGOING_TYPE: return "outgoing";
            case CallLog.Calls.MISSED_TYPE: return "missed";
            case CallLog.Calls.BLOCKED_TYPE: return "blocked";
            default: return "unknown";
        }
    }

    private String formatDuration(long seconds) {
        if (seconds < 60) return seconds + "s";
        long min = seconds / 60;
        long sec = seconds % 60;
        if (min < 60) return min + "m " + sec + "s";
        long hr = min / 60;
        long m = min % 60;
        return hr + "h " + m + "m";
    }

    private long getTodayStartTimestamp() {
        java.util.Calendar cal = java.util.Calendar.getInstance();
        cal.set(java.util.Calendar.HOUR_OF_DAY, 0);
        cal.set(java.util.Calendar.MINUTE, 0);
        cal.set(java.util.Calendar.SECOND, 0);
        cal.set(java.util.Calendar.MILLISECOND, 0);
        return cal.getTimeInMillis();
    }

    // Privacy साठी — phone number hash करा
    private String hashPhoneNumber(String number) {
        try {
            java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(number.getBytes());
            StringBuilder hex = new StringBuilder();
            for (byte b : hash) {
                hex.append(String.format("%02x", b));
            }
            return hex.substring(0, 12); // Short hash
        } catch (Exception e) {
            return "unknown";
        }
    }
}
