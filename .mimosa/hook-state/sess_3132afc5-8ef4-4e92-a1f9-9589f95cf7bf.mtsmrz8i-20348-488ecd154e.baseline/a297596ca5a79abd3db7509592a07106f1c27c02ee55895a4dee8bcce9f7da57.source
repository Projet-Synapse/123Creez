// Powered by OnSpace.AI
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AlertProvider } from '@/template';
import { CanvasProvider } from '@/contexts/CanvasContext';
import { VaultProvider } from '@/contexts/VaultContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { AutomationProvider } from '@/contexts/AutomationContext';
import { UpdateProvider } from '@/contexts/UpdateContext';

export default function RootLayout() {
  return (
    <AlertProvider>
      <SafeAreaProvider>
        <ThemeProvider>
          <UpdateProvider>
          <VaultProvider>
            <AutomationProvider>
            <CanvasProvider>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="editor/[id]" />
                <Stack.Screen name="settings" />
              </Stack>
            </CanvasProvider>
          </AutomationProvider>
          </VaultProvider>
          </UpdateProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </AlertProvider>
  );
}
