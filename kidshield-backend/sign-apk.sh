#!/bin/bash
# ═══════════════════════════════════════════════════════════
# KidShield APK Sign Script
# हे script APK sign करतो production release साठी
# ═══════════════════════════════════════════════════════════

set -e  # Error झाल्यावर थांब

echo "🛡️ KidShield APK Signing Script"
echo "================================"

# ────────────────────────────────
# STEP 1: Keystore Generate करा (एकदाच करायचे!)
# ────────────────────────────────
generate_keystore() {
  echo ""
  echo "📦 STEP 1: Keystore Generate करत आहे..."
  echo "⚠️  हे फक्त एकदाच करायचे! keystore.jks safe ठेवा!"
  echo ""

  keytool -genkey -v \
    -keystore kidshield-release-key.jks \
    -alias kidshield \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000 \
    -dname "CN=KidShield, OU=Mobile, O=KidShield App, L=Pune, S=Maharashtra, C=IN"

  echo ""
  echo "✅ keystore.jks तयार झाला!"
  echo "⚠️  हा file GitHub वर push करू नका! .gitignore मध्ये टाका"
}

# ────────────────────────────────
# STEP 2: Release APK Build करा
# ────────────────────────────────
build_release_apk() {
  echo ""
  echo "🔨 STEP 2: Release APK Build करत आहे..."
  echo ""

  cd android
  ./gradlew assembleRelease
  cd ..

  echo "✅ Unsigned APK तयार: android/app/build/outputs/apk/release/app-release-unsigned.apk"
}

# ────────────────────────────────
# STEP 3: APK Sign करा
# ────────────────────────────────
sign_apk() {
  echo ""
  echo "✍️  STEP 3: APK Sign करत आहे..."
  echo ""

  UNSIGNED_APK="android/app/build/outputs/apk/release/app-release-unsigned.apk"
  SIGNED_APK="KidShield-v1.0-signed.apk"
  KEYSTORE="kidshield-release-key.jks"

  # Sign with apksigner (v2 signing)
  apksigner sign \
    --ks "$KEYSTORE" \
    --ks-key-alias kidshield \
    --out "$SIGNED_APK" \
    "$UNSIGNED_APK"

  echo "✅ Signed APK तयार: $SIGNED_APK"
}

# ────────────────────────────────
# STEP 4: APK Verify करा
# ────────────────────────────────
verify_apk() {
  echo ""
  echo "🔍 STEP 4: APK Verify करत आहे..."

  apksigner verify --verbose KidShield-v1.0-signed.apk

  echo ""
  echo "📊 APK Info:"
  aapt dump badging KidShield-v1.0-signed.apk | grep -E "package:|versionCode|versionName|sdkVersion"
}

# ────────────────────────────────
# STEP 5: zipalign (optimize)
# ────────────────────────────────
zipalign_apk() {
  echo ""
  echo "⚡ STEP 5: zipalign (performance optimize)..."

  zipalign -v 4 KidShield-v1.0-signed.apk KidShield-v1.0-final.apk

  echo "✅ Final APK: KidShield-v1.0-final.apk"
  echo ""
  ls -lh KidShield-v1.0-final.apk
}

# ────────────────────────────────
# MAIN
# ────────────────────────────────
echo ""
echo "काय करायचे? (number enter करा):"
echo "1) सगळं एकत्र करा (fresh setup)"
echo "2) फक्त sign + verify"
echo "3) फक्त keystore generate"
read -p "Choice: " choice

case $choice in
  1)
    generate_keystore
    build_release_apk
    sign_apk
    zipalign_apk
    verify_apk
    ;;
  2)
    sign_apk
    zipalign_apk
    verify_apk
    ;;
  3)
    generate_keystore
    ;;
  *)
    echo "Invalid choice"
    exit 1
    ;;
esac

echo ""
echo "🎉 Done! APK GitHub Releases वर upload करा."
echo "   → https://github.com/yourusername/kidshield/releases/new"
