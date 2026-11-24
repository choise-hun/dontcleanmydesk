import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { setupPwa } from '@/pwa';
import { store } from '@/store/store';
import { startAutoSync } from '@/sync/sync';

export default function RootLayout() {
  const pathname = usePathname();
  const [ready, setReady] = useState(store.ready);

  useEffect(() => {
    setupPwa();
    let stop: (() => void) | undefined;
    store.init().then(() => {
      setReady(true);
      stop = startAutoSync();
    });
    return () => stop?.();
  }, []);

  if (!ready && pathname !== '/collage-preview')
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e9c99b' }}>
        <ActivityIndicator color="#7a4a26" />
      </View>
    );

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />
    </SafeAreaProvider>
  );
}
