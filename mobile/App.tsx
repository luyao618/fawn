import Constants from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

export default function App() {
  const version =
    (Constants.expoConfig?.version ?? '0.0.0') +
    ` (build ${Constants.expoConfig?.android?.versionCode ?? '?'})`;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Fawn</Text>
      <Text style={styles.subtitle}>家庭育儿 Agent · Android v1</Text>
      <Text style={styles.version}>v{version}</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#555',
    marginBottom: 24,
  },
  version: {
    fontSize: 13,
    color: '#888',
  },
});
