import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AuthProvider, useAuth } from './src/auth/AuthContext';
import { HomeScreen } from './src/screens/HomeScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { QueryProvider } from './src/shared/query';

type Route = 'home' | 'settings';

function Root() {
  const { status } = useAuth();
  const [route, setRoute] = useState<Route>('home');

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
  return <HomeScreen onOpenSettings={() => setRoute('settings')} />;
}

export default function App() {
  return (
    <QueryProvider>
      <AuthProvider>
        <Root />
        <StatusBar style="auto" />
      </AuthProvider>
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
