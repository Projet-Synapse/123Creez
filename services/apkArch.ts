/** Architecture unique de l'APK Android : téléphones 64 bits (Galaxy A13, etc.). */
export const ANDROID_APK_ARCH = 'arm64-v8a';
export const ANDROID_APK_ARCH_PROPERTY = 'reactNativeArchitectures';

export type GradleProperty = { type: string; key?: string; value?: string };

/** Ajoute ou remplace reactNativeArchitectures=arm64-v8a dans gradle.properties. */
export function applyArm64Only(properties: readonly GradleProperty[]): GradleProperty[] {
  const rest = properties.filter((item) => !(item.type === 'property' && item.key === ANDROID_APK_ARCH_PROPERTY));
  rest.push({ type: 'property', key: ANDROID_APK_ARCH_PROPERTY, value: ANDROID_APK_ARCH });
  return rest;
}
