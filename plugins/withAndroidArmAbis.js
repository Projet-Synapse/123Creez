// Restreint l'APK Android aux ABI ARM : armeabi-v7a et arm64-v8a.
// Sans ça, expo prebuild embarque aussi x86 et x86_64, inutiles sur un téléphone.
// armeabi-v7a reste nécessaire pour les appareils dont le userland est 32 bits
// (certains Galaxy A13 notamment) : un APK arm64 seul est refusé comme incompatible.
// Même signature : la mise à jour reste une mise à jour, sans désinstallation.
const { withGradleProperties } = require('expo/config-plugins');

// Doit rester aligné sur services/apkArch.ts (ANDROID_APK_ARCHES / applyAndroidArmAbis).
const KEY = 'reactNativeArchitectures';
const VALUE = 'armeabi-v7a,arm64-v8a';

function applyAndroidArmAbis(properties) {
  const rest = properties.filter((item) => !(item.type === 'property' && item.key === KEY));
  rest.push({ type: 'property', key: KEY, value: VALUE });
  return rest;
}

function withAndroidArmAbis(config) {
  return withGradleProperties(config, (config) => {
    config.modResults = applyAndroidArmAbis(config.modResults);
    return config;
  });
}

module.exports = withAndroidArmAbis;
