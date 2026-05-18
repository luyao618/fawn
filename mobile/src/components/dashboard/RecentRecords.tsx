import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radii, spacing, typography } from '../../shared/theme';
import type {
  FeedingRecord,
  GrowthRecord,
  HealthRecord,
  SleepRecord,
} from '../../shared/api';
import { Card } from '../ui/Card';
import { formatDate, formatDateTime, toKg } from '../../lib/utils';

/**
 * "最近记录" card — mobile equivalent of the inline `RecentRecords` in
 * `frontend/src/app/(main)/dashboard/page.tsx`. Builds a unified
 * reverse-chronological top-5 from the four tracker sources.
 */

export type RecentRecordType = '生长' | '喂养' | '睡眠' | '健康';

export interface RecentRecord {
  id: string;
  type: RecentRecordType;
  title: string;
  detail: string;
  at: string;
}

const feedTypeLabel: Record<FeedingRecord['feed_type'], string> = {
  breast: '母乳',
  formula: '配方奶',
  solid: '辅食',
};

const healthTypeLabel: Record<HealthRecord['record_type'], string> = {
  vaccination: '疫苗',
  illness: '不适',
  checkup: '体检',
};

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const TYPE_STYLE: Record<
  RecentRecordType,
  { icon: IconName; bg: string; fg: string }
> = {
  喂养: { icon: 'restaurant-outline', bg: colors['fawn-amber-light'], fg: colors['fawn-amber'] },
  睡眠: { icon: 'moon-outline', bg: colors['info-blue-light'], fg: colors['info-blue'] },
  生长: { icon: 'resize-outline', bg: colors['sage-green-light'], fg: colors['sage-green'] },
  健康: { icon: 'medical-outline', bg: colors['nursery-mint'], fg: colors['brand-strong'] },
};

function sortDesc(records: RecentRecord[]): RecentRecord[] {
  return [...records].sort(
    (left, right) => new Date(right.at).getTime() - new Date(left.at).getTime(),
  );
}

/**
 * Combine 4 sources into a top-5 timeline. Mirrors the web algorithm: pick
 * the newest from each type first (so each kind has a chance to appear), then
 * fill remaining slots with whatever's next newest overall.
 */
export function buildRecentRecords(
  growthRecords: GrowthRecord[],
  feedingRecords: FeedingRecord[],
  sleepRecords: SleepRecord[],
  healthRecords: HealthRecord[],
): RecentRecord[] {
  const growth: RecentRecord[] = growthRecords.map((record) => ({
    id: record.id,
    type: '生长',
    title: `${formatDate(record.measurement_date)} 生长记录`,
    detail: `${toKg(record.weight_g)} · ${record.height_cm ?? '暂无'}cm · 头围 ${record.head_cm ?? '暂无'}cm`,
    at: record.measurement_date,
  }));
  const feeding: RecentRecord[] = feedingRecords.map((record) => ({
    id: record.id,
    type: '喂养',
    title: `${formatDateTime(record.feed_time)} 喂养`,
    detail: `${feedTypeLabel[record.feed_type]} · ${
      record.amount_ml
        ? `${record.amount_ml}ml`
        : record.duration_min
          ? `${record.duration_min}分钟`
          : '未填写数量'
    }`,
    at: record.feed_time,
  }));
  const sleep: RecentRecord[] = sleepRecords.map((record) => ({
    id: record.id,
    type: '睡眠',
    title: `${formatDateTime(record.sleep_start)} ${record.sleep_type === 'night' ? '夜睡' : '小睡'}`,
    detail: `夜醒 ${record.night_wakings} 次${record.sleep_end ? ` · 至 ${formatDateTime(record.sleep_end)}` : ''}`,
    at: record.sleep_start,
  }));
  const health: RecentRecord[] = healthRecords.map((record) => ({
    id: record.id,
    type: '健康',
    title: `${formatDate(record.record_date)} ${record.title}`,
    detail: `${healthTypeLabel[record.record_type]}${record.description ? ` · ${record.description}` : ''}`,
    at: record.record_date,
  }));

  const primary = [growth, sleep, health, feeding]
    .map((records) => sortDesc(records)[0])
    .filter((record): record is RecentRecord => Boolean(record));
  const selected = new Set(primary.map((record) => `${record.type}-${record.id}`));
  const rest = sortDesc([...growth, ...feeding, ...sleep, ...health]).filter(
    (record) => !selected.has(`${record.type}-${record.id}`),
  );
  return sortDesc([...primary, ...rest.slice(0, 5 - primary.length)]).slice(0, 5);
}

export function RecentRecords({ records }: { records: RecentRecord[] }) {
  return (
    <Card>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>最近记录</Text>
          <Text style={styles.title}>轻量回顾</Text>
        </View>
        <View style={styles.headerIcon}>
          <Ionicons name="clipboard-outline" size={20} color={colors['brand-strong']} />
        </View>
      </View>
      <View style={styles.list}>
        {records.map((record) => {
          const style = TYPE_STYLE[record.type];
          return (
            <View key={`${record.type}-${record.id}`} style={styles.row}>
              <View style={[styles.iconBubble, { backgroundColor: style.bg }]}>
                <Ionicons name={style.icon} size={16} color={style.fg} />
              </View>
              <View style={styles.body}>
                <Text style={[styles.typeLabel, { color: style.fg }]}>{record.type}</Text>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {record.title}
                </Text>
                <Text style={styles.rowDetail} numberOfLines={2}>
                  {record.detail}
                </Text>
              </View>
            </View>
          );
        })}
        {records.length === 0 ? <Text style={styles.empty}>暂无记录</Text> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing['3'],
    marginBottom: spacing['3'],
  },
  headerText: {
    flex: 1,
  },
  eyebrow: {
    ...typography.bodySmall,
    color: colors['dark-gray'],
  },
  title: {
    ...typography.heading,
    marginTop: spacing['1'],
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.full,
    backgroundColor: colors['nursery-mint'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    gap: spacing['3'],
  },
  row: {
    flexDirection: 'row',
    gap: spacing['3'],
    backgroundColor: colors['warm-gray'],
    borderRadius: radii.lg,
    padding: spacing['3'],
  },
  iconBubble: {
    width: 32,
    height: 32,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  typeLabel: {
    ...typography.metaXs,
  },
  rowTitle: {
    ...typography.body,
    fontWeight: '600',
    marginTop: spacing['1'],
  },
  rowDetail: {
    ...typography.caption,
    color: colors['dark-gray'],
    marginTop: spacing['1'],
    lineHeight: 16,
  },
  empty: {
    ...typography.bodySmall,
    textAlign: 'center',
    color: colors['mid-gray'],
    paddingVertical: spacing['3'],
  },
});
