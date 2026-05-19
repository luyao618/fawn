// gesture-handler must be the very first import in the bundle entry so the
// native module registers before any navigator that depends on it (drawer
// swipe, etc.). Per official docs this must be at the top of index.ts.
import 'react-native-gesture-handler';

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
