import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, fontFamily, radii, spacing, typography } from '../../shared/theme';
import type { DashboardSummary } from '../../shared/api';
import { Avatar } from '../ui/Avatar';
import { Card } from '../ui/Card';

/**
 * Top overview card on the Dashboard — mobile equivalent of the inline
 * `DashboardOverview` in `frontend/src/app/(main)/dashboard/page.tsx`.
 *
 * Layout: avatar + 「今日摘要」 eyebrow + age chip + summary headline
 * (name · 喂养 N 次 · 睡眠 Xh) + 最近 line + two StatChip side-by-side.
 *
 * Empty state (no baby) keeps the same shape so the page doesn't jump.
 */

export interface RecentRecordLite {
  type: '生长' | '喂养' | '睡眠' | '健康';
  title: string;
}

function StatChip({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={chipStyles.chip}>
      <Text style={chipStyles.label}>{label}</Text>
      <Text style={chipStyles.value}>{value}</Text>
      {hint ? <Text style={chipStyles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function DashboardOverview({
  summary,
  latestRecord,
}: {
  summary: DashboardSummary;
  latestRecord?: RecentRecordLite;
}) {
  if (!summary.baby) {
    return (
      <Card style={styles.card}>
        <View style={styles.row}>
          <View style={styles.emptyIcon}>
            <Ionicons name="clipboard-outline" size={22} color={colors['info-blue']} />
          </View>
          <View style={styles.text}>
            <Text style={styles.eyebrow}>今日摘要</Text>
            <Text style={styles.headline} numberOfLines={2}>
              还没有宝宝档案
            </Text>
            <Text style={styles.meta} numberOfLines={2}>
              喂养、睡眠和生长记录会在创建档案后开始显示。
            </Text>
          </View>
        </View>
      </Card>
    );
  }

  const todaySleepValue =
    summary.today_sleep.total_hours == null
      ? '没数据'
      : `${summary.today_sleep.total_hours.toFixed(1)}h`;
  const todayBreastDuration = summary.today_feeding.breast_duration_min;
  const latestRecordText = latestRecord
    ? `${latestRecord.type} · ${latestRecord.title}`
    : '暂无最近记录';
  const babyName = summary.baby.name ?? '宝宝档案';
  const babyAge = summary.baby.age_display ?? '出生日期待填';

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <Avatar label={babyName} role="baby" size="md" />
        <View style={styles.text}>
          <View style={styles.eyebrowRow}>
            <Text style={styles.eyebrow}>今日摘要</Text>
            <View style={styles.ageChip}>
              <Text style={styles.ageChipText}>{babyAge}</Text>
            </View>
          </View>
          <Text style={styles.headline} numberOfLines={1}>
            {babyName} · 喂养 {summary.today_feeding.count} 次 · 睡眠 {todaySleepValue}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            最近：{latestRecordText}
          </Text>
        </View>
      </View>
      <View style={styles.chips}>
        <StatChip
          label="今日喂养"
          value={`${summary.today_feeding.count}次`}
          hint={todayBreastDuration > 0 ? `亲喂 ${todayBreastDuration}分钟` : undefined}
        />
        <StatChip label="今日睡眠" value={todaySleepValue} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing['3'],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['3'],
  },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.lg,
    backgroundColor: colors['nursery-powder'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing['2'],
  },
  eyebrow: {
    ...typography.metaXs,
    color: colors['fawn-amber'],
  },
  ageChip: {
    backgroundColor: colors['nursery-mint'],
    paddingHorizontal: spacing['2'],
    paddingVertical: spacing['1'],
    borderRadius: radii.chip,
  },
  ageChipText: {
    ...typography.metaXs,
    color: colors['brand-strong'],
  },
  headline: {
    ...typography.heading,
    marginTop: spacing['1'],
  },
  meta: {
    ...typography.caption,
    color: colors['dark-gray'],
    marginTop: spacing['1'],
  },
  chips: {
    flexDirection: 'row',
    gap: spacing['2'],
  },
});

const chipStyles = StyleSheet.create({
  chip: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors['warm-gray'],
    borderRadius: radii.lg,
    paddingHorizontal: spacing['3'],
    paddingVertical: spacing['2'],
  },
  label: {
    ...typography.caption,
    color: colors['dark-gray'],
  },
  value: {
    fontFamily: fontFamily.mono,
    fontSize: 16,
    fontWeight: '700',
    color: colors['soft-charcoal'],
    marginTop: spacing['1'],
  },
  hint: {
    ...typography.caption,
    color: colors['sage-green'],
    marginTop: spacing['1'],
  },
});
