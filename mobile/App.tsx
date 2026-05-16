import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/nunito';

import { AuthProvider, useAuth } from './src/auth/AuthContext';
import {
  DeepLinkIntent,
  subscribeIntents,
  takePendingIntent,
} from './src/lib/deepLinks';
import { useNotifications } from './src/lib/pushNotifications';
import { LoginScreen } from './src/screens/LoginScreen';
import { RootNavigator } from './src/navigation/RootNavigator';
import { QueryProvider } from './src/shared/query';
import { colors } from './src/shared/theme';

function Root() {
  const { status } = useAuth();
  // Holds the most recent push-tap intent. Subsequent issues will wire this
  // back through React Navigation (e.g. profile → agent task run). We keep
  // the subscription here so cold-start intents are not lost while the
  // skeleton navigator is in place.
  const [, setPendingIntent] = useState<DeepLinkIntent | null>(null);

  useEffect(() => {
    const cold = takePendingIntent();
    if (cold) setPendingIntent(cold);
    return subscribeIntents((intent) => {
      setPendingIntent(intent);
      return true;
    });
  }, []);

  if (status === 'loading') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors['fawn-amber']} />
      </View>
    );
  }

  if (status !== 'authenticated') {
    return <LoginScreen />;
  }

  return <RootNavigator />;
}

function NotificationsBridge({ children }: { children: React.ReactNode }) {
  useNotifications();
  return <>{children}</>;
}

export default function App() {
  // Load Nunito once at the root so the design-token typography renders with
  // the correct face on Android. While the font is loading we return null
  // and let the Expo splash stay visible.
  const [fontsLoaded] = useFonts({
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <QueryProvider>
        <NotificationsBridge>
          <AuthProvider>
            <Root />
            <StatusBar style="auto" />
          </AuthProvider>
        </NotificationsBridge>
      </QueryProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors['warm-cream'],
    alignItems: 'center',
    justifyContent: 'center',
  },
});
