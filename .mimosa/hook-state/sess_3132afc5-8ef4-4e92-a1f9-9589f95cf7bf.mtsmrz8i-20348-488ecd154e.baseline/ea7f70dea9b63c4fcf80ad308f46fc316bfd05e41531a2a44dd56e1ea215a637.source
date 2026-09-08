// Powered by OnSpace.AI
import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UpdateBanner } from '@/components';

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1 }}>
      <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}>
        <Tabs.Screen name="index" options={{ title: 'Vault' }} />
      </Tabs>
      {/* Floats above the vault so an available update is visible immediately. */}
      <View
        style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 12 }}
        pointerEvents="box-none"
      >
        <UpdateBanner />
      </View>
    </View>
  );
}
