// Smoke test: run withAndroidReleaseSigning against a synthetic
// Expo-template-style android/app/build.gradle and assert the patches landed.
//
// Usage: node mobile/plugins/__test__/withAndroidReleaseSigning.test.js
//
// Exits non-zero on failure. Stubs @expo/config-plugins so the test runs
// without node_modules installed.
const Module = require('module');
const path = require('path');
const assert = require('assert');

// Stub @expo/config-plugins.withAppBuildGradle since it's not installed in
// every workdir. The real plugin only uses withAppBuildGradle as a thin
// wrapper that hands a mutable `modResults.contents` string to the callback.
// We inject the stub into require.cache under a resolved-looking id so the
// plugin's `require('@expo/config-plugins')` returns it.
const stubId = path.join(__dirname, '_stub-config-plugins.js');
require.cache[stubId] = {
  id: stubId,
  filename: stubId,
  loaded: true,
  exports: { withAppBuildGradle: (config, fn) => fn(config) },
};
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === '@expo/config-plugins') return stubId;
  return originalResolve.call(this, request, ...rest);
};

const withAndroidReleaseSigning = require('../withAndroidReleaseSigning.js');

// Trimmed-down version of the build.gradle Expo emits today (the bits we
// care about). The full file is much larger but the regexes only need these
// blocks to exist.
const TEMPLATE_BUILD_GRADLE = `
apply plugin: "com.android.application"

android {
    namespace 'com.luyao618.fawn'
    defaultConfig {
        applicationId 'com.luyao618.fawn'
    }
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            signingConfig signingConfigs.debug
            minifyEnabled enableProguardInReleaseBuilds
        }
    }
}
`;

function runPlugin(contents) {
  const config = {
    modResults: { language: 'groovy', contents },
  };
  withAndroidReleaseSigning(config);
  return config.modResults.contents;
}

// 1. Fresh patch.
const patched = runPlugin(TEMPLATE_BUILD_GRADLE);
assert.ok(
  patched.includes('// fawn:release-signing-injected'),
  'marker comment should be injected',
);
assert.ok(
  patched.includes('fawnKeystorePropsFile = rootProject.file("keystore.properties")'),
  'keystore loader should be injected',
);
assert.ok(
  /signingConfigs\s*\{[\s\S]*release\s*\{[\s\S]*fawnKeystoreProps\['storeFile'\]/.test(patched),
  'release signingConfig block should be injected',
);
assert.ok(
  /buildTypes\s*\{[\s\S]*release\s*\{[\s\S]*signingConfig\s+signingConfigs\.release/.test(patched),
  'buildTypes.release.signingConfig should point at signingConfigs.release',
);
assert.ok(
  !/release\s*\{[\s\S]*signingConfig\s+signingConfigs\.debug/.test(
    patched.split('buildTypes')[1] || '',
  ),
  'release build type should no longer reference signingConfigs.debug',
);

// 2. Idempotency: running twice must not duplicate the loader/release block.
const patchedTwice = runPlugin(patched);
assert.strictEqual(
  patchedTwice.split('// fawn:release-signing-injected').length,
  2,
  'marker should appear exactly once after two runs',
);
const releaseBlockCount = (
  patchedTwice.match(/release\s*\{[\s\S]*?fawnKeystoreProps\['storeFile'\]/g) || []
).length;
assert.strictEqual(releaseBlockCount, 1, 'release signingConfig must only be injected once');

console.log('withAndroidReleaseSigning: all assertions passed');
