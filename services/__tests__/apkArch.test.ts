import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyArm64Only, ANDROID_APK_ARCH, ANDROID_APK_ARCH_PROPERTY } from '../apkArch';

test('applyArm64Only : pose arm64-v8a et remplace une valeur déjà là', () => {
  assert.equal(ANDROID_APK_ARCH, 'arm64-v8a');
  assert.equal(ANDROID_APK_ARCH_PROPERTY, 'reactNativeArchitectures');
  assert.deepEqual(applyArm64Only([]), [
    { type: 'property', key: ANDROID_APK_ARCH_PROPERTY, value: ANDROID_APK_ARCH },
  ]);
  assert.deepEqual(applyArm64Only([
    { type: 'property', key: 'foo', value: '1' },
    { type: 'property', key: ANDROID_APK_ARCH_PROPERTY, value: 'armeabi-v7a,arm64-v8a,x86,x86_64' },
  ]), [
    { type: 'property', key: 'foo', value: '1' },
    { type: 'property', key: ANDROID_APK_ARCH_PROPERTY, value: ANDROID_APK_ARCH },
  ]);
});
