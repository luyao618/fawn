import { AxiosError } from 'axios';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  colors,
  fontFamily,
  layout,
  radii,
  shadows,
  spacing,
  typography,
} from '../shared/theme';
import { useAuth } from '../auth/AuthContext';
import { getApiBaseUrl } from '../lib/api';

/**
 * Login screen — Android equivalent of `frontend/src/app/login/LoginClient.tsx`
 * (login form only; family registration is out of scope for this issue).
 *
 * Visual rules — every color / radius / shadow / font from `shared/theme.ts`:
 *   - Warm-cream canvas, card has `radii.card` (28) + `shadows.card`.
 *   - Field labels in `dark-gray`, inputs are pill-shaped `radii.input` with
 *     `warm-gray` fill on `oat-border`.
 *   - Primary button: `fawn-amber` background, white SemiBold label, pill.
 *   - Brand title in Nunito SemiBold (`typography.title`).
 *   - API endpoint footer in `caption` token.
 */

export function LoginScreen() {
  const { signIn } = useAuth();
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [usernameFocused, setUsernameFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  const onSubmit = async () => {
    if (!username.trim() || !password) {
      Alert.alert('请填写完整', '用户名和密码不能为空');
      return;
    }
    setSubmitting(true);
    try {
      await signIn(username.trim(), password);
    } catch (err) {
      const detail =
        (err as AxiosError<{ detail?: string }>).response?.data?.detail ??
        '登录失败，请稍后再试';
      Alert.alert('登录失败', String(detail));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.canvas}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + spacing['10'],
            paddingBottom: insets.bottom + spacing['10'],
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.welcome}>欢迎回来</Text>
            <Text style={[typography.title, styles.brand]}>Fawn</Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>用户名</Text>
            <TextInput
              value={username}
              onChangeText={setUsername}
              onFocus={() => setUsernameFocused(true)}
              onBlur={() => setUsernameFocused(false)}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              placeholder="username"
              placeholderTextColor={colors['mid-gray']}
              style={[styles.input, usernameFocused && styles.inputFocused]}
              editable={!submitting}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>密码</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
              secureTextEntry
              autoComplete="current-password"
              placeholder="••••••"
              placeholderTextColor={colors['mid-gray']}
              style={[styles.input, passwordFocused && styles.inputFocused]}
              editable={!submitting}
            />
          </View>

          <Pressable
            onPress={onSubmit}
            disabled={submitting}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.button,
              submitting && styles.buttonDisabled,
              pressed && !submitting && styles.buttonPressed,
            ]}
          >
            {submitting ? (
              <ActivityIndicator color={colors['on-brand']} />
            ) : (
              <Text style={styles.buttonText}>登录</Text>
            )}
          </Pressable>

          <Text style={styles.footer}>API: {getApiBaseUrl()}</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  canvas: {
    flex: 1,
    backgroundColor: colors['warm-cream'],
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing['5'],
  },
  card: {
    width: '100%',
    maxWidth: layout.maxMobileWidth,
    alignSelf: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors['oat-border'],
    padding: spacing['5'],
    ...shadows.card,
  },
  header: {
    marginBottom: spacing['8'],
  },
  welcome: {
    ...typography.bodySmall,
    color: colors['dark-gray'],
  },
  brand: {
    marginTop: spacing['1'],
  },
  field: {
    marginBottom: spacing['4'],
  },
  label: {
    ...typography.bodySmall,
    color: colors['dark-gray'],
    marginBottom: spacing['2'],
  },
  input: {
    minHeight: layout.iconButton,
    backgroundColor: colors['warm-gray'],
    borderWidth: 1,
    borderColor: colors['oat-border'],
    borderRadius: radii.input,
    paddingHorizontal: spacing['4'],
    fontFamily: fontFamily.sans,
    fontSize: 15,
    color: colors['soft-charcoal'],
  },
  inputFocused: {
    borderColor: colors['fawn-amber'],
  },
  button: {
    marginTop: spacing['2'],
    minHeight: layout.iconButton,
    backgroundColor: colors['fawn-amber'],
    borderRadius: radii.input,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['5'],
    ...shadows.card,
  },
  buttonPressed: {
    backgroundColor: colors['brand-strong'],
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    ...typography.button,
    color: colors['on-brand'],
  },
  footer: {
    ...typography.caption,
    color: colors['mid-gray'],
    textAlign: 'center',
    marginTop: spacing['5'],
  },
});
