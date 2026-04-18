package com.kidshield;

import android.Manifest;
import android.content.pm.PackageManager;
import android.location.Location;
import android.os.Looper;
import android.util.Log;

import androidx.core.app.ActivityCompat;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

public class LocationModule extends ReactContextBaseJavaModule {

    private static final String TAG = "LocationModule";
    private static final String LOCATION_UPDATE_EVENT = "onLocationUpdate";

    private final ReactApplicationContext reactContext;
    private FusedLocationProviderClient fusedLocationClient;
    private LocationCallback locationCallback;
    private boolean isTracking = false;

    public LocationModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(reactContext);
    }

    @Override
    public String getName() {
        return "LocationTracker";
    }

    @ReactMethod
    public void startTracking(double intervalSeconds, Promise promise) {
        if (isTracking) {
            promise.resolve(true);
            return;
        }

        if (ActivityCompat.checkSelfPermission(reactContext,
                Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
            ActivityCompat.checkSelfPermission(reactContext,
                Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            promise.reject("PERMISSION_DENIED", "Location permission not granted");
            return;
        }

        LocationRequest locationRequest = new LocationRequest.Builder(
            Priority.PRIORITY_HIGH_ACCURACY,
            (long)(intervalSeconds * 1000)
        )
        .setMinUpdateIntervalMillis((long)(intervalSeconds * 500))
        .setMaxUpdateDelayMillis((long)(intervalSeconds * 2000))
        .build();

        locationCallback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult locationResult) {
                if (locationResult == null) return;
                Location location = locationResult.getLastLocation();
                if (location != null) {
                    sendLocationUpdate(location);
                }
            }
        };

        fusedLocationClient.requestLocationUpdates(
            locationRequest,
            locationCallback,
            Looper.getMainLooper()
        );

        isTracking = true;
        Log.d(TAG, "Location tracking started, interval: " + intervalSeconds + "s");
        promise.resolve(true);
    }

    @ReactMethod
    public void stopTracking(Promise promise) {
        if (locationCallback != null) {
            fusedLocationClient.removeLocationUpdates(locationCallback);
            locationCallback = null;
        }
        isTracking = false;
        Log.d(TAG, "Location tracking stopped");
        promise.resolve(true);
    }

    @ReactMethod
    public void getCurrentLocation(Promise promise) {
        if (ActivityCompat.checkSelfPermission(reactContext,
                Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            promise.reject("PERMISSION_DENIED", "Location permission not granted");
            return;
        }

        fusedLocationClient.getLastLocation()
            .addOnSuccessListener(location -> {
                if (location != null) {
                    WritableMap locationMap = Arguments.createMap();
                    locationMap.putDouble("latitude", location.getLatitude());
                    locationMap.putDouble("longitude", location.getLongitude());
                    locationMap.putDouble("accuracy", location.getAccuracy());
                    locationMap.putDouble("altitude", location.getAltitude());
                    locationMap.putDouble("speed", location.getSpeed());
                    locationMap.putDouble("timestamp", location.getTime());
                    promise.resolve(locationMap);
                } else {
                    promise.reject("NO_LOCATION", "No location available");
                }
            })
            .addOnFailureListener(e -> promise.reject("ERROR", e.getMessage()));
    }

    @ReactMethod
    public void isTracking(Promise promise) {
        promise.resolve(isTracking);
    }

    private void sendLocationUpdate(Location location) {
        WritableMap locationMap = Arguments.createMap();
        locationMap.putDouble("latitude", location.getLatitude());
        locationMap.putDouble("longitude", location.getLongitude());
        locationMap.putDouble("accuracy", location.getAccuracy());
        locationMap.putDouble("speed", location.getSpeed());
        locationMap.putDouble("timestamp", location.getTime());

        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
            .emit(LOCATION_UPDATE_EVENT, locationMap);
    }

    @ReactMethod
    public void addListener(String eventName) {
        // Required for RN event emitter
    }

    @ReactMethod
    public void removeListeners(Integer count) {
        // Required for RN event emitter
    }
}
