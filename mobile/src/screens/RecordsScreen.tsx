// RecordsScreen — RN port of frontend/src/app/(main)/record/page.tsx.
//
// Mirrors the structured-form layout used on Web: a 4-tab picker
// (喂养 / 睡眠 / 生长 / 健康) that swaps in a tab-specific form. Submits land in
// the same /tracker/* endpoints used by the web app. Replaces the previous
// "quick-add chips + Modal" UI so the two surfaces feel identical.
//
// Visual contract: tokens only — every color / radius / spacing / shadow / type
// style comes from `mobile/src/shared/theme.ts`. No literal hex / px values.
//
// Layout (top → bottom):
//   • TopBar "记录"
//   • Header date / title / subtitle  (mirrors web `<section>`)
//   • Permission / babyMissing banners
//   • 4-up tab cards (aria-pressed via accessibilityState.selected)
//   • Active-tab form Card
//   • Status banner + Submit button
//   • Growth tab → 成长记录历史 (reuses GrowthHistoryList)

import { Ionicons } from '@expo/vector-icons';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useCallback, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { GrowthHistoryList } from '../components/dashboard/GrowthHistoryList';
import { TopBar } from '../components/layout/TopBar';
import { Button, Card, SegmentedChoice } from '../components/ui';
import { useAuth } from '../auth/AuthContext';
import { canWriteTracker, formatDate } from '../lib/utils';
import { ROUTES } from '../navigation/routeNames';
import {
  createFeeding,
  createGrowth,
  createHealth,
  createSleep,
  dashboardQueries,
  growthQueries,
  recordQueries,
} from '../shared/api';
import {
  borderWidth,
  colors,
  layout,
  radii,
  shadows,
  spacing,
  typography,
  type ColorToken,
} from '../shared/theme';

// ---------- Constants -------------------------------------------------------

type RecordKind = 'feeding' | 'sleep' | 'growth' | 'health';
type FeedType = 'formula' | 'breast';
type SleepType = 'nap' | 'night';
type HealthType = 'checkup' | 'vaccination' | 'illness';

interface RecordCard {
  kind: RecordKind;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  tintBg: ColorToken;
  tintFg: ColorToken;
}

const RECORD_CARDS: RecordCard[] = [
  {
    kind: 'feeding',
    label: '喂养',
    description: '配方奶量、亲喂时长',
    icon: 'restaurant-outline',
    tintBg: 'nursery-butter',
    tintFg: 'warning-amber',
  },
  {
    kind: 'sleep',
    label: '睡眠',
    description: '小睡、夜睡、夜醒次数',
    icon: 'moon-outline',
    tintBg: 'nursery-powder',
    tintFg: 'info-blue',
  },
  {
    kind: 'growth',
    label: '生长',
    description: '体重、身高、头围',
    icon: 'resize-outline',
    tintBg: 'nursery-mint',
    tintFg: 'brand-strong',
  },
  {
    kind: 'health',
    label: '健康',
    description: '疫苗、就诊、身体状况',
    icon: 'medical-outline',
    tintBg: 'safety-red-light',
    tintFg: 'safety-red',
  },
];

const FEED_TYPE_OPTIONS = [
  { value: 'formula' as FeedType, label: '配方奶' },
  { value: 'breast' as FeedType, label: '母乳' },
];

const SLEEP_TYPE_OPTIONS = [
  { value: 'nap' as SleepType, label: '小睡' },
  { value: 'night' as SleepType, label: '夜睡' },
];

const HEALTH_TYPE_OPTIONS = [
  { value: 'checkup' as HealthType, label: '体检' },
  { value: 'vaccination' as HealthType, label: '疫苗' },
  { value: 'illness' as HealthType, label: '不适' },
];

// ---------- Date / number helpers (mirror web record/page.tsx) --------------

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function localDateValue(date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localDateTimeValue(date = new Date()): string {
  return `${localDateValue(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// PORT DECISION: datetime picker requires @react-native-community/datetimepicker;
// deferred. Inputs accept the literal `YYYY-MM-DDTHH:mm` / `YYYY-MM-DD` shape
// that web `<input type=datetime-local>` emits, so the create payloads match.
const DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function toIsoDateTime(value: string): string {
  return new Date(value).toISOString();
}

function positiveIntegerOrNull(value: string, label: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) throw new Error(`${label}需要填写大于 0 的整数`);
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error(`${label}需要填写有效的整数`);
  return n;
}

function positiveInteger(value: string, label: string): number {
  const n = positiveIntegerOrNull(value, label);
  if (n == null) throw new Error(`${label}不能为空`);
  return n;
}

function nonNegativeIntegerOrZero(value: string, label: string): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  if (!/^\d+$/.test(trimmed)) throw new Error(`${label}需要填写 0 或更大的整数`);
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n)) throw new Error(`${label}需要填写有效的整数`);
  return n;
}

function positiveDecimalOrNull(value: string, label: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) throw new Error(`${label}需要填写大于 0 的数字`);
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${label}需要填写大于 0 的数字`);
  return n;
}

function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function validateDateTime(value: string, label: string, birthDate: string | undefined): void {
  if (!DATETIME_PATTERN.test(value)) {
    throw new Error(`${label}格式应为 YYYY-MM-DDTHH:mm`);
  }
  if (birthDate && value.slice(0, 10) < birthDate) {
    throw new Error(`${label}不能早于宝宝出生日期`);
  }
  if (value > localDateTimeValue()) {
    throw new Error(`${label}不能晚于当前时间`);
  }
}

function validateDate(value: string, label: string, birthDate: string | undefined): void {
  if (!DATE_PATTERN.test(value)) {
    throw new Error(`${label}格式应为 YYYY-MM-DD`);
  }
  if (birthDate && value < birthDate) {
    throw new Error(`${label}不能早于宝宝出生日期`);
  }
  if (value > localDateValue()) {
    throw new Error(`${label}不能晚于今天`);
  }
}

// ---------- Initial form state ---------------------------------------------

function initialFeedingForm() {
  return {
    feed_time: localDateTimeValue(),
    feed_type: 'formula' as FeedType,
    amount_ml: '',
    duration_min: '',
    notes: '',
  };
}

function initialSleepForm() {
  const end = new Date();
  const start = new Date(end.getTime() - 90 * 60_000);
  return {
    sleep_start: localDateTimeValue(start),
    sleep_end: localDateTimeValue(end),
    sleep_type: 'nap' as SleepType,
    night_wakings: '0',
    notes: '',
  };
}

function initialGrowthForm() {
  return {
    measurement_date: localDateValue(),
    weight_g: '',
    height_cm: '',
    head_cm: '',
    notes: '',
  };
}

function initialHealthForm() {
  return {
    record_date: localDateValue(),
    record_type: 'checkup' as HealthType,
    title: '',
    description: '',
  };
}

// ---------- Screen ----------------------------------------------------------

export function RecordsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const openDrawer = useCallback(
    () => navigation.dispatch(DrawerActions.openDrawer()),
    [navigation],
  );
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canWrite = canWriteTracker(user?.access_type);

  const { data: summary } = useQuery(dashboardQueries.summary());
  const { data: growthRecords } = useQuery(growthQueries.records());

  const [activeKind, setActiveKind] = useState<RecordKind>('feeding');
  const [feeding, setFeeding] = useState(initialFeedingForm);
  const [sleep, setSleep] = useState(initialSleepForm);
  const [growth, setGrowth] = useState(initialGrowthForm);
  const [health, setHealth] = useState(initialHealthForm);
  const [status, setStatus] = useState<
    { type: 'success' | 'error'; message: string } | null
  >(null);

  const babyMissing = summary?.baby === null;
  const birthDate = summary?.baby?.birth_date ?? undefined;
  const formDisabled = !canWrite || babyMissing;

  const activeCard = useMemo(
    () => RECORD_CARDS.find((c) => c.kind === activeKind) ?? RECORD_CARDS[0],
    [activeKind],
  );

  function resetActiveForm() {
    if (activeKind === 'feeding') setFeeding(initialFeedingForm());
    if (activeKind === 'sleep') setSleep(initialSleepForm());
    if (activeKind === 'growth') setGrowth(initialGrowthForm());
    if (activeKind === 'health') setHealth(initialHealthForm());
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (activeKind === 'feeding') {
        validateDateTime(feeding.feed_time, '喂养时间', birthDate);
        const isFormula = feeding.feed_type === 'formula';
        const isBreast = feeding.feed_type === 'breast';
        await createFeeding({
          feed_time: toIsoDateTime(feeding.feed_time),
          feed_type: feeding.feed_type,
          amount_ml: isFormula ? positiveInteger(feeding.amount_ml, '配方奶量') : null,
          duration_min: isBreast ? positiveInteger(feeding.duration_min, '亲喂时长') : null,
          notes: textOrNull(feeding.notes),
        });
        return;
      }
      if (activeKind === 'sleep') {
        validateDateTime(sleep.sleep_start, '睡眠开始时间', birthDate);
        if (sleep.sleep_end) {
          validateDateTime(sleep.sleep_end, '睡眠结束时间', birthDate);
          if (sleep.sleep_end <= sleep.sleep_start) {
            throw new Error('睡眠结束时间必须晚于开始时间');
          }
        }
        await createSleep({
          sleep_start: toIsoDateTime(sleep.sleep_start),
          sleep_end: sleep.sleep_end ? toIsoDateTime(sleep.sleep_end) : null,
          sleep_type: sleep.sleep_type,
          night_wakings:
            sleep.sleep_type === 'night'
              ? nonNegativeIntegerOrZero(sleep.night_wakings, '夜醒次数')
              : 0,
          notes: textOrNull(sleep.notes),
        });
        return;
      }
      if (activeKind === 'growth') {
        validateDate(growth.measurement_date, '生长记录日期', birthDate);
        await createGrowth({
          measurement_date: growth.measurement_date,
          weight_g: positiveIntegerOrNull(growth.weight_g, '体重'),
          height_cm: positiveDecimalOrNull(growth.height_cm, '身高'),
          head_cm: positiveDecimalOrNull(growth.head_cm, '头围'),
          notes: textOrNull(growth.notes),
        });
        return;
      }
      // health
      validateDate(health.record_date, '健康记录日期', birthDate);
      const title = health.title.trim();
      if (!title) throw new Error('标题不能为空');
      await createHealth({
        record_date: health.record_date,
        record_type: health.record_type,
        title,
        description: textOrNull(health.description),
      });
    },
    onSuccess: async () => {
      setStatus({
        type: 'success',
        message: `${activeCard.label}已保存，成长看板会同步更新。`,
      });
      resetActiveForm();
      // Refresh dependent caches so dashboard/growth lists pick up the new row.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: recordQueries.timeline().queryKey }),
        queryClient.invalidateQueries({ queryKey: growthQueries.records().queryKey }),
        queryClient.invalidateQueries({ queryKey: dashboardQueries.summary().queryKey }),
      ]);
    },
    onError: (err: unknown) => {
      setStatus({
        type: 'error',
        message: err instanceof Error ? err.message : '保存失败，请稍后再试',
      });
    },
  });

  return (
    <View style={styles.root}>
      <TopBar title="记录" onMenu={openDrawer} />
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + spacing['6'] },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerDate}>{formatDate(new Date(), 'M月d日')}</Text>
            <Text style={styles.headerTitle}>
              记录{summary?.baby?.name ?? '宝宝'}今天的变化
            </Text>
            <Text style={styles.headerSubtitle}>
              保存后会同步到成长看板和后续对话参考。
            </Text>
          </View>

          {/* Banners */}
          {!canWrite ? (
            <View style={[styles.banner, styles.bannerWarn]}>
              <Text style={styles.bannerText}>
                当前账号只有查看权限，无法新增记录。请让父母或管理员账号记录，已有数据仍可在成长页查看。
              </Text>
            </View>
          ) : null}

          {babyMissing ? (
            <View style={[styles.banner, styles.bannerInfo]}>
              <Text style={styles.bannerText}>还没有宝宝档案，暂时不能保存记录。</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  // Hop to the Profile tab (sibling tab); fall back to in-stack
                  // navigate if the parent navigator isn't available.
                  const parent = navigation.getParent();
                  if (parent) parent.navigate('Profile' as never);
                  else navigation.navigate(ROUTES.PROFILE_HOME as never);
                }}
                style={({ pressed }) => [
                  styles.bannerAction,
                  pressed && styles.bannerActionPressed,
                ]}
              >
                <Text style={styles.bannerActionText}>去家庭页</Text>
              </Pressable>
            </View>
          ) : null}

          {/* Tab cards */}
          <View style={styles.tabs}>
            {RECORD_CARDS.map((card) => {
              const active = card.kind === activeKind;
              return (
                <Pressable
                  key={card.kind}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${card.label}：${card.description}`}
                  onPress={() => {
                    setActiveKind(card.kind);
                    setStatus(null);
                  }}
                  style={({ pressed }) => [
                    styles.tabCard,
                    active && styles.tabCardActive,
                    pressed && styles.tabCardPressed,
                  ]}
                >
                  <View
                    style={[
                      styles.tabIcon,
                      { backgroundColor: colors[card.tintBg] },
                    ]}
                  >
                    <Ionicons
                      name={card.icon}
                      size={16}
                      color={colors[card.tintFg]}
                    />
                  </View>
                  <Text style={styles.tabLabel}>{card.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Active tab form */}
          <Card style={styles.formCard}>
            <View style={styles.formHeader}>
              <View
                style={[
                  styles.formHeaderIcon,
                  { backgroundColor: colors[activeCard.tintBg] },
                ]}
              >
                <Ionicons
                  name={activeCard.icon}
                  size={18}
                  color={colors[activeCard.tintFg]}
                />
              </View>
              <View style={styles.formHeaderTextBlock}>
                <Text style={styles.formHeaderTitle}>保存{activeCard.label}</Text>
                <Text style={styles.formHeaderDesc}>{activeCard.description}</Text>
              </View>
            </View>

            {activeKind === 'feeding' ? (
              <FeedingForm
                value={feeding}
                onChange={setFeeding}
                disabled={formDisabled}
              />
            ) : null}
            {activeKind === 'sleep' ? (
              <SleepForm value={sleep} onChange={setSleep} disabled={formDisabled} />
            ) : null}
            {activeKind === 'growth' ? (
              <GrowthForm
                value={growth}
                onChange={setGrowth}
                disabled={formDisabled}
              />
            ) : null}
            {activeKind === 'health' ? (
              <HealthForm
                value={health}
                onChange={setHealth}
                disabled={formDisabled}
              />
            ) : null}

            {status ? (
              <View
                accessibilityRole="alert"
                style={[
                  styles.statusBanner,
                  status.type === 'success'
                    ? styles.statusSuccess
                    : styles.statusError,
                ]}
              >
                <Text
                  style={[
                    styles.statusText,
                    status.type === 'success'
                      ? styles.statusSuccessText
                      : styles.statusErrorText,
                  ]}
                >
                  {status.message}
                </Text>
              </View>
            ) : null}

            <Button
              variant="primary"
              loading={mutation.isPending}
              disabled={formDisabled}
              onPress={() => mutation.mutate()}
              style={styles.submitButton}
            >
              保存{activeCard.label}
            </Button>
          </Card>

          {/* Growth history */}
          {activeKind === 'growth' ? (
            <Card style={styles.historyCard}>
              <Text style={styles.historyTitle}>成长记录历史</Text>
              <GrowthHistoryList records={growthRecords ?? []} />
            </Card>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ---------- Sub-forms -------------------------------------------------------

interface FieldProps {
  label: string;
  hint?: string;
  children: React.ReactNode;
}

function Field({ label, hint, children }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

interface FormSubProps<T> {
  value: T;
  onChange: React.Dispatch<React.SetStateAction<T>>;
  disabled: boolean;
}

function FeedingForm({
  value,
  onChange,
  disabled,
}: FormSubProps<ReturnType<typeof initialFeedingForm>>) {
  return (
    <View style={styles.formBody}>
      <Field label="时间" hint="格式 YYYY-MM-DDTHH:mm">
        <TextInput
          editable={!disabled}
          value={value.feed_time}
          onChangeText={(v) => onChange((s) => ({ ...s, feed_time: v }))}
          placeholder="2026-05-18T14:30"
          placeholderTextColor={colors['mid-gray']}
          style={[styles.input, disabled && styles.inputDisabled]}
          autoCapitalize="none"
        />
      </Field>
      <SegmentedChoice
        label="类型"
        accessibilityLabel="喂养类型"
        options={FEED_TYPE_OPTIONS}
        value={value.feed_type}
        disabled={disabled}
        onChange={(feed_type) => onChange((s) => ({ ...s, feed_type }))}
      />
      {value.feed_type === 'formula' ? (
        <Field label="配方奶量 (ml)">
          <TextInput
            editable={!disabled}
            value={value.amount_ml}
            onChangeText={(v) => onChange((s) => ({ ...s, amount_ml: v }))}
            keyboardType="numeric"
            placeholder="120"
            placeholderTextColor={colors['mid-gray']}
            style={[styles.input, disabled && styles.inputDisabled]}
          />
        </Field>
      ) : (
        <Field label="亲喂时长 (分钟)">
          <TextInput
            editable={!disabled}
            value={value.duration_min}
            onChangeText={(v) => onChange((s) => ({ ...s, duration_min: v }))}
            keyboardType="numeric"
            placeholder="15"
            placeholderTextColor={colors['mid-gray']}
            style={[styles.input, disabled && styles.inputDisabled]}
          />
        </Field>
      )}
      <Field label="备注">
        <TextInput
          editable={!disabled}
          value={value.notes}
          onChangeText={(v) => onChange((s) => ({ ...s, notes: v }))}
          placeholder="例如：精神好，喝完后拍嗝顺利"
          placeholderTextColor={colors['mid-gray']}
          multiline
          style={[styles.input, styles.inputMultiline, disabled && styles.inputDisabled]}
        />
      </Field>
    </View>
  );
}

function SleepForm({
  value,
  onChange,
  disabled,
}: FormSubProps<ReturnType<typeof initialSleepForm>>) {
  return (
    <View style={styles.formBody}>
      <Field label="开始" hint="格式 YYYY-MM-DDTHH:mm">
        <TextInput
          editable={!disabled}
          value={value.sleep_start}
          onChangeText={(v) => onChange((s) => ({ ...s, sleep_start: v }))}
          placeholder="2026-05-18T13:00"
          placeholderTextColor={colors['mid-gray']}
          style={[styles.input, disabled && styles.inputDisabled]}
          autoCapitalize="none"
        />
      </Field>
      <Field label="结束">
        <TextInput
          editable={!disabled}
          value={value.sleep_end}
          onChangeText={(v) => onChange((s) => ({ ...s, sleep_end: v }))}
          placeholder="2026-05-18T14:30"
          placeholderTextColor={colors['mid-gray']}
          style={[styles.input, disabled && styles.inputDisabled]}
          autoCapitalize="none"
        />
      </Field>
      <SegmentedChoice
        label="类型"
        accessibilityLabel="睡眠类型"
        options={SLEEP_TYPE_OPTIONS}
        value={value.sleep_type}
        disabled={disabled}
        onChange={(sleep_type) =>
          onChange((s) => ({
            ...s,
            sleep_type,
            night_wakings: sleep_type === 'nap' ? '0' : s.night_wakings,
          }))
        }
      />
      {value.sleep_type === 'night' ? (
        <Field label="夜醒次数">
          <TextInput
            editable={!disabled}
            value={value.night_wakings}
            onChangeText={(v) => onChange((s) => ({ ...s, night_wakings: v }))}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={colors['mid-gray']}
            style={[styles.input, disabled && styles.inputDisabled]}
          />
        </Field>
      ) : null}
      <Field label="补充说明（可选）">
        <TextInput
          editable={!disabled}
          value={value.notes}
          onChangeText={(v) => onChange((s) => ({ ...s, notes: v }))}
          placeholder={
            value.sleep_type === 'night'
              ? '例如：胀气醒、换尿布后继续睡'
              : '例如：入睡方式、醒来状态'
          }
          placeholderTextColor={colors['mid-gray']}
          multiline
          style={[styles.input, styles.inputMultiline, disabled && styles.inputDisabled]}
        />
      </Field>
    </View>
  );
}

function GrowthForm({
  value,
  onChange,
  disabled,
}: FormSubProps<ReturnType<typeof initialGrowthForm>>) {
  return (
    <View style={styles.formBody}>
      <Text style={styles.growthExplainer}>
        成长指标无需每日测量，按医生建议或自身节奏记录即可。
      </Text>
      <Field label="日期" hint="格式 YYYY-MM-DD">
        <TextInput
          editable={!disabled}
          value={value.measurement_date}
          onChangeText={(v) => onChange((s) => ({ ...s, measurement_date: v }))}
          placeholder="2026-05-18"
          placeholderTextColor={colors['mid-gray']}
          style={[styles.input, disabled && styles.inputDisabled]}
          autoCapitalize="none"
        />
      </Field>
      <View style={styles.growthGrid}>
        <View style={styles.growthCell}>
          <Field label="体重 (g)">
            <TextInput
              editable={!disabled}
              value={value.weight_g}
              onChangeText={(v) => onChange((s) => ({ ...s, weight_g: v }))}
              keyboardType="numeric"
              placeholder="6500"
              placeholderTextColor={colors['mid-gray']}
              style={[styles.input, disabled && styles.inputDisabled]}
            />
          </Field>
        </View>
        <View style={styles.growthCell}>
          <Field label="身高 (cm)">
            <TextInput
              editable={!disabled}
              value={value.height_cm}
              onChangeText={(v) => onChange((s) => ({ ...s, height_cm: v }))}
              keyboardType="numeric"
              placeholder="62.5"
              placeholderTextColor={colors['mid-gray']}
              style={[styles.input, disabled && styles.inputDisabled]}
            />
          </Field>
        </View>
        <View style={styles.growthCell}>
          <Field label="头围 (cm)">
            <TextInput
              editable={!disabled}
              value={value.head_cm}
              onChangeText={(v) => onChange((s) => ({ ...s, head_cm: v }))}
              keyboardType="numeric"
              placeholder="40.0"
              placeholderTextColor={colors['mid-gray']}
              style={[styles.input, disabled && styles.inputDisabled]}
            />
          </Field>
        </View>
      </View>
      <Field label="补充说明（可选）">
        <TextInput
          editable={!disabled}
          value={value.notes}
          onChangeText={(v) => onChange((s) => ({ ...s, notes: v }))}
          placeholder="例如：家用软尺测量、饭后称重、复查时记录"
          placeholderTextColor={colors['mid-gray']}
          multiline
          style={[styles.input, styles.inputMultiline, disabled && styles.inputDisabled]}
        />
      </Field>
    </View>
  );
}

function HealthForm({
  value,
  onChange,
  disabled,
}: FormSubProps<ReturnType<typeof initialHealthForm>>) {
  return (
    <View style={styles.formBody}>
      <Field label="日期" hint="格式 YYYY-MM-DD">
        <TextInput
          editable={!disabled}
          value={value.record_date}
          onChangeText={(v) => onChange((s) => ({ ...s, record_date: v }))}
          placeholder="2026-05-18"
          placeholderTextColor={colors['mid-gray']}
          style={[styles.input, disabled && styles.inputDisabled]}
          autoCapitalize="none"
        />
      </Field>
      <SegmentedChoice
        label="类型"
        accessibilityLabel="健康类型"
        options={HEALTH_TYPE_OPTIONS}
        value={value.record_type}
disabled={disabled}
        onChange={(record_type) => onChange((s) => ({ ...s, record_type }))}
      />
      <Field label="标题">
        <TextInput
          editable={!disabled}
          value={value.title}
          onChangeText={(v) => onChange((s) => ({ ...s, title: v }))}
          maxLength={200}
          placeholder="例如：儿保复查"
          placeholderTextColor={colors['mid-gray']}
          style={[styles.input, disabled && styles.inputDisabled]}
        />
      </Field>
      <Field label="说明">
        <TextInput
          editable={!disabled}
          value={value.description}
          onChangeText={(v) => onChange((s) => ({ ...s, description: v }))}
          placeholder="记录医生建议、症状或观察重点"
          placeholderTextColor={colors['mid-gray']}
          multiline
          style={[styles.input, styles.inputMultiline, disabled && styles.inputDisabled]}
        />
      </Field>
    </View>
  );
}

// ---------- Styles ---------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors['warm-cream'],
  },
  kav: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing['4'],
    paddingTop: spacing['3'],
    gap: spacing['3'],
  },

  // Header
  header: {
    paddingHorizontal: spacing['1'],
    gap: spacing['1'],
  },
  headerDate: {
    ...typography.caption,
    color: colors['fawn-amber'],
    fontFamily: typography.tabLabel.fontFamily,
  },
  headerTitle: {
    ...typography.title,
    fontSize: 20,
    lineHeight: 26,
  },
  headerSubtitle: {
    ...typography.caption,
    color: colors['mid-gray'],
    fontStyle: 'italic',
  },

  // Banners
  banner: {
    borderRadius: radii.card,
    padding: spacing['3'],
    borderWidth: borderWidth.hairline,
  },
  bannerWarn: {
    backgroundColor: colors['warning-amber-light'],
    borderColor: colors['warning-amber'],
  },
  bannerInfo: {
    backgroundColor: colors['nursery-powder'],
    borderColor: colors['info-blue'],
    gap: spacing['2'],
  },
  bannerText: {
    ...typography.bodySmall,
    color: colors['dark-gray'],
  },
  bannerAction: {
    alignSelf: 'flex-start',
    minHeight: 40,
    paddingHorizontal: spacing['4'],
    backgroundColor: colors['card'],
    borderRadius: radii.input,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  bannerActionPressed: {
    opacity: 0.85,
  },
  bannerActionText: {
    ...typography.button,
    color: colors['info-blue'],
  },

  // Tabs
  tabs: {
    flexDirection: 'row',
    gap: spacing['2'],
  },
  tabCard: {
    flex: 1,
    backgroundColor: colors['card'],
    borderRadius: radii.lg,
    borderWidth: borderWidth.hairline,
    borderColor: colors['frosted-border'],
    paddingVertical: spacing['2'],
    paddingHorizontal: spacing['1'],
    alignItems: 'center',
    gap: spacing['1'],
    ...shadows.card,
  },
  tabCardActive: {
    borderColor: colors['fawn-amber'],
    backgroundColor: colors['nursery-mint'],
  },
  tabCardPressed: {
    opacity: 0.85,
  },
  tabIcon: {
    width: 28,
    height: 28,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    ...typography.tabLabel,
    color: colors['soft-charcoal'],
  },

  // Form card
  formCard: {
    gap: spacing['3'],
    padding: spacing['4'],
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['3'],
  },
  formHeaderIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formHeaderTextBlock: {
    flex: 1,
    minWidth: 0,
    gap: spacing['1'],
  },
  formHeaderTitle: {
    ...typography.heading,
    fontSize: 16,
    lineHeight: 20,
  },
  formHeaderDesc: {
    ...typography.caption,
    color: colors['dark-gray'],
  },
  formBody: {
    gap: spacing['3'],
  },

  // Field
  field: {
    gap: spacing['1'],
  },
  fieldLabel: {
    ...typography.bodySmall,
    fontFamily: typography.tabLabel.fontFamily,
    color: colors['dark-gray'],
  },
  fieldHint: {
    ...typography.caption,
    color: colors['mid-gray'],
    fontStyle: 'italic',
  },
  input: {
    borderWidth: borderWidth.hairline,
    borderColor: colors['oat-border'],
    borderRadius: radii.md,
    backgroundColor: colors['card'],
    paddingHorizontal: spacing['3'],
    paddingVertical: spacing['3'],
    minHeight: 44,
    ...typography.inputBody,
  },
  inputMultiline: {
    minHeight: layout.inputMultilineMinHeight,
    textAlignVertical: 'top',
  },
  inputDisabled: {
    backgroundColor: colors['warm-gray'],
    color: colors['mid-gray'],
  },

  // Growth tab specifics
  growthExplainer: {
    ...typography.caption,
    color: colors['dark-gray'],
    backgroundColor: colors['warm-gray'],
    borderRadius: radii.md,
    paddingHorizontal: spacing['3'],
    paddingVertical: spacing['2'],
  },
  growthGrid: {
    flexDirection: 'row',
    gap: spacing['2'],
  },
  growthCell: {
    flex: 1,
  },

  // Status
  statusBanner: {
    borderRadius: radii.lg,
    paddingHorizontal: spacing['3'],
    paddingVertical: spacing['2'],
  },
  statusSuccess: {
    backgroundColor: colors['nursery-mint'],
  },
  statusError: {
    backgroundColor: colors['safety-red-light'],
  },
  statusText: {
    ...typography.bodySmall,
  },
  statusSuccessText: {
    color: colors['brand-strong'],
  },
  statusErrorText: {
    color: colors['safety-red'],
  },

  submitButton: {
    minHeight: 44,
    width: '100%',
  },

  // Growth history card
  historyCard: {
    gap: spacing['2'],
    padding: spacing['4'],
  },
  historyTitle: {
    ...typography.heading,
    fontSize: 16,
    lineHeight: 20,
  },
});
