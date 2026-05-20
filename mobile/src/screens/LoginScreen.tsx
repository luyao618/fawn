import { AxiosError } from 'axios';
import React, { useState } from 'react';
import {
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
import { Ionicons } from '@expo/vector-icons';

import {
  colors,
  layout,
  radii,
  shadows,
  spacing,
  typography,
} from '../shared/theme';
import { useAuth } from '../auth/AuthContext';
import { registerFamily, type RegistrationRequest } from '../lib/auth';
import { Button } from '../components/ui/Button';

/**
 * Login screen — Android equivalent of `frontend/src/app/login/LoginClient.tsx`.
 *
 * Mirrors the web flow: login form on top with a "注册账号" entry that toggles
 * an inline registration form (invite code, family name, display name, role,
 * username, password). Welcome heading is "欢迎回来" only (no brand line) and
 * the API endpoint footer is intentionally hidden from end users.
 */

const ROLE_OPTIONS: Array<RegistrationRequest['role']> = ['爸爸', '妈妈'];

const emptyRegistration: RegistrationRequest = {
  invite_code: '',
  family_name: '',
  username: '',
  password: '',
  display_name: '',
  role: '爸爸',
};

export function LoginScreen() {
  const { signIn } = useAuth();
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [usernameFocused, setUsernameFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerDraft, setRegisterDraft] = useState<RegistrationRequest>(emptyRegistration);
  const [registering, setRegistering] = useState(false);
  const [registerSuccess, setRegisterSuccess] = useState<string | null>(null);

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

  const updateDraft = <K extends keyof RegistrationRequest>(
    key: K,
    value: RegistrationRequest[K],
  ) => {
    setRegisterDraft((state) => ({ ...state, [key]: value }));
  };

  const onRegister = async () => {
    const invite = registerDraft.invite_code.trim();
    const familyName = registerDraft.family_name.trim();
    const displayName = registerDraft.display_name.trim();
    const registerUsername = registerDraft.username.trim();
    if (
      !invite ||
      !familyName ||
      !displayName ||
      !registerUsername ||
      !registerDraft.password
    ) {
      Alert.alert('请填写完整', '请补全所有注册信息');
      return;
    }
    if (registerDraft.password.length < 6) {
      Alert.alert('密码太短', '密码至少需要 6 位');
      return;
    }
    setRegistering(true);
    try {
      await registerFamily({
        invite_code: invite,
        family_name: familyName,
        username: registerUsername,
        password: registerDraft.password,
        display_name: displayName,
        role: registerDraft.role,
      });
      setUsername(registerUsername);
      setPassword('');
      setRegisterDraft(emptyRegistration);
      setRegisterOpen(false);
      setRegisterSuccess('注册成功，请使用新账号登录。');
    } catch (err) {
      const detail =
        (err as AxiosError<{ detail?: string }>).response?.data?.detail ??
        '注册失败，请稍后再试';
      Alert.alert('注册失败', String(detail));
    } finally {
      setRegistering(false);
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
            <Pressable
              onPress={() => {
                setRegisterOpen((value) => !value);
                setRegisterSuccess(null);
              }}
              accessibilityRole="button"
              accessibilityState={{ expanded: registerOpen }}
              style={({ pressed }) => [
                styles.registerToggle,
                pressed && styles.registerTogglePressed,
              ]}
            >
              <Ionicons name="person-add-outline" size={14} color={colors['fawn-amber']} />
              <Text style={styles.registerToggleText}>注册账号</Text>
            </Pressable>
          </View>

          {registerSuccess ? (
            <View style={styles.successBanner}>
              <Ionicons name="checkmark-circle" size={16} color={colors['brand-strong']} />
              <Text style={styles.successText}>{registerSuccess}</Text>
            </View>
          ) : null}

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

          <Button
            variant="primary"
            onPress={onSubmit}
            disabled={submitting}
            loading={submitting}
            style={styles.button}
          >
            登录
          </Button>
        </View>

        {registerOpen ? (
          <View style={[styles.card, styles.registerCard]}>
            <View style={styles.registerHeader}>
              <Text style={styles.registerEyebrow}>邀请注册</Text>
              <Text style={styles.registerTitle}>创建家庭管理员</Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.labelSm}>邀请码</Text>
              <TextInput
                value={registerDraft.invite_code}
                onChangeText={(text) => updateDraft('invite_code', text)}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
                editable={!registering}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.labelSm}>家庭名称</Text>
              <TextInput
                value={registerDraft.family_name}
                onChangeText={(text) => updateDraft('family_name', text)}
                style={styles.input}
                editable={!registering}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.labelSm}>昵称</Text>
              <TextInput
                value={registerDraft.display_name}
                onChangeText={(text) => updateDraft('display_name', text)}
                style={styles.input}
                editable={!registering}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.labelSm}>身份</Text>
              <View style={styles.roleRow}>
                {ROLE_OPTIONS.map((role) => {
                  const selected = registerDraft.role === role;
                  return (
                    <Pressable
                      key={role}
                      onPress={() => updateDraft('role', role)}
                      disabled={registering}
                      style={[styles.roleOption, selected && styles.roleOptionSelected]}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                    >
                      <Text
                        style={[
                          styles.roleOptionText,
                          selected && styles.roleOptionTextSelected,
                        ]}
                      >
                        {role}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.labelSm}>账号名</Text>
              <TextInput
                value={registerDraft.username}
                onChangeText={(text) => updateDraft('username', text)}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                style={styles.input}
                editable={!registering}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.labelSm}>密码</Text>
              <TextInput
                value={registerDraft.password}
                onChangeText={(text) => updateDraft('password', text)}
                secureTextEntry
                autoComplete="new-password"
                style={styles.input}
                editable={!registering}
              />
            </View>

            <View style={styles.registerActions}>
              <Button
                variant="secondary"
                onPress={() => setRegisterOpen(false)}
                disabled={registering}
                style={styles.registerActionButton}
              >
                取消
              </Button>
              <Button
                variant="primary"
                onPress={onRegister}
                disabled={registering}
                loading={registering}
                style={styles.registerActionButton}
              >
                创建
              </Button>
            </View>
          </View>
        ) : null}
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
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing['3'],
  },
  welcome: {
    ...typography.heading,
    color: colors['soft-charcoal'],
  },
  registerToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['1'],
    backgroundColor: colors['warm-gray'],
    paddingHorizontal: spacing['3'],
    paddingVertical: spacing['2'],
    borderRadius: radii.chip,
    minHeight: 36,
  },
  registerTogglePressed: {
    backgroundColor: colors['nursery-mint'],
  },
  registerToggleText: {
    ...typography.metaXs,
    color: colors['fawn-amber'],
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['2'],
    backgroundColor: colors['nursery-mint'],
    borderRadius: radii.md,
    paddingHorizontal: spacing['3'],
    paddingVertical: spacing['2'],
    marginBottom: spacing['4'],
  },
  successText: {
    ...typography.bodySmall,
    color: colors['brand-strong'],
  },
  field: {
    marginBottom: spacing['4'],
  },
  label: {
    ...typography.bodySmall,
    color: colors['dark-gray'],
    marginBottom: spacing['2'],
  },
  labelSm: {
    ...typography.caption,
    color: colors['dark-gray'],
    marginBottom: spacing['1'],
  },
  input: {
    minHeight: layout.iconButton,
    backgroundColor: colors['warm-gray'],
    borderWidth: 1,
    borderColor: colors['oat-border'],
    borderRadius: radii.input,
    paddingHorizontal: spacing['4'],
    ...typography.inputBody,
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
  registerCard: {
    marginTop: spacing['3'],
  },
  registerHeader: {
    marginBottom: spacing['4'],
  },
  registerEyebrow: {
    ...typography.bodySmall,
    color: colors['dark-gray'],
  },
  registerTitle: {
    ...typography.heading,
    color: colors['soft-charcoal'],
    marginTop: spacing['1'],
  },
  roleRow: {
    flexDirection: 'row',
    gap: spacing['2'],
    backgroundColor: colors['warm-gray'],
    borderRadius: radii.input,
    borderWidth: 1,
    borderColor: colors['oat-border'],
    padding: spacing['1'],
  },
  roleOption: {
    flex: 1,
    minHeight: 36,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleOptionSelected: {
    backgroundColor: colors.card,
    ...shadows.card,
  },
  roleOptionText: {
    ...typography.button,
    color: colors['dark-gray'],
  },
  roleOptionTextSelected: {
    color: colors['fawn-amber'],
  },
  registerActions: {
    marginTop: spacing['2'],
    flexDirection: 'row',
    gap: spacing['2'],
  },
  registerActionButton: {
    flex: 1,
  },
});
