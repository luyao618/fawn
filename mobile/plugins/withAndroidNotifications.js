// Expo config plugin: apply Expo Notifications' Android native configuration
// without enabling iOS APNs entitlements for Personal Team local builds.

const { createRunOncePlugin } = require('@expo/config-plugins');
const { withNotificationsAndroid } = require('expo-notifications/plugin/build/withNotificationsAndroid');
const pkg = require('expo-notifications/package.json');

const withAndroidNotifications = (config, props = {}) =>
  withNotificationsAndroid(config, props);

module.exports = createRunOncePlugin(withAndroidNotifications, pkg.name, pkg.version);
