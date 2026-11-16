#!/usr/bin/env bash
set -euo pipefail

PKG="com.nimzz.lyra"
APK="$(ls apk/*.apk | head -n 1)"

adb wait-for-device
adb shell input keyevent 82 || true
echo "Android API: $(adb shell getprop ro.build.version.sdk | tr -d '\r')"
adb shell dumpsys webviewupdate | grep -iE "current|package" | head -n 6 || true

adb install -r "$APK"
adb logcat -c
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1
sleep 30

if ! adb shell pidof "$PKG" > /dev/null; then
  adb logcat -d | tail -n 200
  echo "Lyra is not running after launch on Android 10"
  exit 1
fi

if adb logcat -d | grep -E "FATAL EXCEPTION|AndroidRuntime: Process: ${PKG}"; then
  adb logcat -d | tail -n 200
  echo "Lyra crashed on Android 10"
  exit 1
fi

adb exec-out screencap -p > smoke-android10.png || true
echo "Android 10 smoke test passed"
