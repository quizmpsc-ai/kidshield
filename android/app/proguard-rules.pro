# KidShield — proguard-rules.pro (Session 6)
# R8 minification rules — Production APK/AAB साठी

# ══════════════════════════════════════════
# REACT NATIVE — आवश्यक rules
# ══════════════════════════════════════════

-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class com.facebook.soloader.** { *; }

# React Native bridge methods
-keepclassmembers class * {
    @com.facebook.react.uimanager.annotations.ReactProp <methods>;
}
-keepclassmembers class * {
    @com.facebook.react.uimanager.annotations.ReactPropGroup <methods>;
}

# ══════════════════════════════════════════
# KIDSHIELD NATIVE MODULES — KEEP करा
# ══════════════════════════════════════════

-keep class com.kidshield.** { *; }
-keep class com.kidshield.KidShieldSecurityModule { *; }
-keep class com.kidshield.AppBlockerModule { *; }
-keep class com.kidshield.AppBlockerService { *; }
-keep class com.kidshield.LocationModule { *; }
-keep class com.kidshield.NotificationModule { *; }
-keep class com.kidshield.UsageStatsModule { *; }
-keep class com.kidshield.CallLogModule { *; }
-keep class com.kidshield.AppInstallReceiver { *; }
-keep class com.kidshield.BootReceiver { *; }
-keep class com.kidshield.KidShieldAdminReceiver { *; }
-keep class com.kidshield.BlockOverlayActivity { *; }

# Device Admin
-keep class * extends android.app.admin.DeviceAdminReceiver { *; }

# ══════════════════════════════════════════
# FIREBASE — आवश्यक
# ══════════════════════════════════════════

-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**

# Firebase Crashlytics
-keepattributes SourceFile,LineNumberTable
-keep public class * extends java.lang.Exception
-keep class com.google.firebase.crashlytics.** { *; }

# Firestore
-keep class com.google.firebase.firestore.** { *; }

# FCM
-keep class com.google.firebase.messaging.** { *; }

# ══════════════════════════════════════════
# THIRD PARTY LIBRARIES
# ══════════════════════════════════════════

# OkHttp (networking)
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }

# Retrofit (if used)
-keep class retrofit2.** { *; }
-dontwarn retrofit2.**

# SSL Pinning
-keep class com.nativemodules.sslpinning.** { *; }

# React Native Fast Image
-keep class com.dylanvann.fastimage.** { *; }

# Notifee
-keep class io.invertase.notifee.** { *; }

# ══════════════════════════════════════════
# GENERAL ANDROID — BEST PRACTICES
# ══════════════════════════════════════════

# Activities, Services, Receivers, Providers
-keep public class * extends android.app.Activity
-keep public class * extends android.app.Service
-keep public class * extends android.content.BroadcastReceiver
-keep public class * extends android.content.ContentProvider
-keep public class * extends android.preference.Preference
-keep public class * extends android.view.View

# Parcelable
-keep class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator *;
}

# Serializable
-keepnames class * implements java.io.Serializable
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    !static !transient <fields>;
    !private <fields>;
    !private <methods>;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}

# Annotations
-keepattributes *Annotation*
-keepattributes Signature
-keepattributes Exceptions

# Enums
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# ══════════════════════════════════════════
# DEBUGGING AIDS (production मध्ये ठेवा)
# Crashlytics साठी line numbers preserve करतो
# ══════════════════════════════════════════

-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# ══════════════════════════════════════════
# REMOVE LOGGING (production optimization)
# ══════════════════════════════════════════

-assumenosideeffects class android.util.Log {
    public static *** d(...);
    public static *** v(...);
    public static *** i(...);
}
