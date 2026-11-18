// Restreint l'APK Android à arm64-v8a (téléphones comme le Galaxy A13).
// Sans ça, expo prebuild embarque aussi armeabi-v7a, x86 et x86_64.
// Même signature : la mise à jour reste une mise à jour, sans désinstallation.
const { withGradleProperties } = require('expo/config-plugins');

// Doit rester aligné sur services/apkArch.ts (ANDROID_APK_ARCH / applyArm64Only).
const KEY = 'reactNativeArchitectures';
const VALUE = 'arm64-v8a';

function applyArm64Only(properties) {
  const rest = properties.filter((item) => !(item.type === 'property' && item.key === KEY));
  rest.push({ type: 'property', key: KEY, value: VALUE });
  return rest;
}

function withArm64Only(config) {
  return withGradleProperties(config, (config) => {
    config.modResults = applyArm64Only(config.modResults);
    return config;
  });
}

module.exports = withArm64Only;
