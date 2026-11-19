import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAndroidArmAbis, ANDROID_APK_ARCHES, ANDROID_APK_ARCH_PROPERTY } from '../apkArch';

test('applyAndroidArmAbis : pose armeabi-v7a,arm64-v8a et remplace une valeur déjà là', () => {
  assert.equal(ANDROID_APK_ARCHES, 'armeabi-v7a,arm64-v8a');
  assert.equal(ANDROID_APK_ARCH_PROPERTY, 'reactNativeArchitectures');
  assert.ok(!ANDROID_APK_ARCHES.includes('x86'));
  assert.deepEqual(applyAndroidArmAbis([]), [
    { type: 'property', key: ANDROID_APK_ARCH_PROPERTY, value: ANDROID_APK_ARCHES },
  ]);
  assert.deepEqual(applyAndroidArmAbis([
    { type: 'property', key: 'foo', value: '1' },
    { type: 'property', key: ANDROID_APK_ARCH_PROPERTY, value: 'armeabi-v7a,arm64-v8a,x86,x86_64' },
  ]), [
    { type: 'property', key: 'foo', value: '1' },
    { type: 'property', key: ANDROID_APK_ARCH_PROPERTY, value: ANDROID_APK_ARCHES },
  ]);
});
