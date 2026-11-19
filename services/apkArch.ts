/** Architectures de l'APK Android : ARM 32 bits et 64 bits (hors x86 / x86_64). */
export const ANDROID_APK_ARCHES = 'armeabi-v7a,arm64-v8a';
export const ANDROID_APK_ARCH_PROPERTY = 'reactNativeArchitectures';

export type GradleProperty = { type: string; key?: string; value?: string };

/** Ajoute ou remplace reactNativeArchitectures=armeabi-v7a,arm64-v8a dans gradle.properties. */
export function applyAndroidArmAbis(properties: readonly GradleProperty[]): GradleProperty[] {
  const rest = properties.filter((item) => !(item.type === 'property' && item.key === ANDROID_APK_ARCH_PROPERTY));
  rest.push({ type: 'property', key: ANDROID_APK_ARCH_PROPERTY, value: ANDROID_APK_ARCHES });
  return rest;
}
