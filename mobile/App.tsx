import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AuthProvider, useAuth } from './src/auth/AuthContext';
import {
  DeepLinkIntent,
  subscribeIntents,
  takePendingIntent,
} from './src/lib/deepLinks';
import { useNotifications } from './src/lib/pushNotifications';
import { HomeScreen } from './src/screens/HomeScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { QueryProvider } from './src/shared/query';

type Route = 'home' | 'settings';

function Root() {
  const { status } = useAuth();
  const [route, setRoute] = useState<Route>('home');
  // Holds the most recent push-tap intent. HomeScreen reads + clears it
  // after wiring through to the matching tab/screen.
  const [pendingIntent, setPendingIntent] = useState<DeepLinkIntent | null>(null);

  useEffect(() => {
    // Drain any cold-start intent that fired before this component mounted.
    const cold = takePendingIntent();
    if (cold) setPendingIntent(cold);
    // And subscribe to warm taps. Returning true marks the intent as
    // consumed so the bus doesn't park it in `pending`.
    return subscribeIntents((intent) => {
      setPendingIntent(intent);
      // Snap any open Settings sheet shut so HomeScreen can take over.
      setRoute('home');
      return true;
    });
  }, []);

  if (status === 'loading') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#2c7a4b" />
      </View>
    );
  }

  if (status !== 'authenticated') {
    return <LoginScreen />;
  }

  if (route === 'settings') {
    return <SettingsScreen onClose={() => setRoute('home')} />;
  }
  return (
    <HomeScreen
      onOpenSettings={() => setRoute('settings')}
      pendingIntent={pendingIntent}
      onIntentHandled={() => setPendingIntent(null)}
    />
  );
}

function NotificationsBridge({ children }: { children: React.ReactNode }) {
  // Single global subscription point for Expo notification responses +
  // cold-start tap recovery. Lives outside <AuthProvider> so it runs even
  // before the user signs in (the intent will sit in the bus until the
  // authenticated tree mounts and drains it).
  useNotifications();
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryProvider>
      <NotificationsBridge>
        <AuthProvider>
          <Root />
          <StatusBar style="auto" />
        </AuthProvider>
      </NotificationsBridge>
    </QueryProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
