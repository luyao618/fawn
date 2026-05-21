// Mobile History search + calendar entry point.
//
// This screen intentionally treats conversation ids as navigation internals:
// the user-facing surface is keyword search, calendar activity, and message
// targets.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { TopBar } from '../components/layout/TopBar';
import { ROUTES } from '../navigation/routeNames';
import { api, type ChatMessage } from '../shared/api';
import {
  colors,
  radii,
  shadows,
  spacing,
  typography,
} from '../shared/theme';

const SEARCH_PAGE_SIZE = 30;
const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

interface HistoryTargetParams {
  targetMessageId?: string;
  targetDate?: string;
}

interface Props {
  onOpenConversation: (id: string, target?: HistoryTargetParams) => void;
}

interface MessageSearchResult extends ChatMessage {
  conversation_started_at?: string;
}

interface PaginatedSearchResults {
  items: MessageSearchResult[];
  total: number;
  page: number;
  page_size: number;
}

interface MonthActivityDay {
  date: string;
  day: number;
  message_count: number;
}

interface MonthActivityResponse {
  year: number;
  month: number;
  days: MonthActivityDay[];
}

interface DayTarget {
  conversation_id: string;
  message_id?: string;
  id?: string;
  created_at?: string;
  role?: 'user' | 'assistant';
  content?: string;
}

interface DayTargetResponse {
  date: string;
  target: DayTarget | null;
}

type CalendarCell =
  | { key: string; kind: 'blank' }
  | { key: string; kind: 'day'; day: number; date: string };

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function monthTitle(year: number, month: number): string {
  return `${year} 年 ${month} 月`;
}

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const next = new Date(year, month - 1 + delta, 1);
  return { year: next.getFullYear(), month: next.getMonth() + 1 };
}

function buildCalendar(year: number, month: number): CalendarCell[] {
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const dayCount = new Date(year, month, 0).getDate();
  const cells: CalendarCell[] = [];
  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push({ key: `blank-start-${i}`, kind: 'blank' });
  }
  for (let day = 1; day <= dayCount; day += 1) {
    cells.push({ key: dateKey(year, month, day), kind: 'day', day, date: dateKey(year, month, day) });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ key: `blank-end-${cells.length}`, kind: 'blank' });
  }
  return cells;
}

function roleLabel(role: ChatMessage['role']): string {
  return role === 'user' ? '我' : 'Fawn';
}

async function searchMessages(query: string): Promise<PaginatedSearchResults> {
  const { data } = await api.get<PaginatedSearchResults>('/chat/messages/search', {
    params: { q: query, page: 1, page_size: SEARCH_PAGE_SIZE },
  });
  return data;
}

async function fetchMonthActivity(year: number, month: number): Promise<MonthActivityResponse> {
  const { data } = await api.get<MonthActivityResponse>('/chat/history/activity', {
    params: { year, month },
  });
  return data;
}

async function fetchDayTarget(date: string): Promise<DayTargetResponse> {
  const { data } = await api.get<DayTargetResponse>('/chat/history/day-target', {
    params: { date },
  });
  return data;
}

export function HistoryListScreen({ onOpenConversation }: Props) {
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const openDrawer = useCallback(
    () => navigation.dispatch(DrawerActions.openDrawer()),
    [navigation],
  );

  const now = useMemo(() => new Date(), []);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [searchText, setSearchText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingDate, setPendingDate] = useState<string | null>(null);
  const [dateTargetError, setDateTargetError] = useState<string | null>(null);
  const [emptyDate, setEmptyDate] = useState<string | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => setSearchQuery(searchText.trim()), 350);
    return () => clearTimeout(handle);
  }, [searchText]);

  const search = useQuery({
    queryKey: ['chat', 'history-search', { query: searchQuery, pageSize: SEARCH_PAGE_SIZE }],
    queryFn: () => searchMessages(searchQuery),
    enabled: searchQuery.length > 0,
    staleTime: 30_000,
  });

  const activity = useQuery({
    queryKey: ['chat', 'history-activity', { year: selectedYear, month: selectedMonth }],
    queryFn: () => fetchMonthActivity(selectedYear, selectedMonth),
    staleTime: 60_000,
  });

  const calendarCells = useMemo(
    () => buildCalendar(selectedYear, selectedMonth),
    [selectedMonth, selectedYear],
  );

  const activeDays = useMemo(() => {
    const map = new Map<string, number>();
    for (const day of activity.data?.days ?? []) {
      map.set(day.date, day.message_count);
    }
    return map;
  }, [activity.data?.days]);

  const openTarget = useCallback(
    (id: string, target: HistoryTargetParams = {}) => {
      if (!target.targetMessageId && !target.targetDate) {
        onOpenConversation(id);
        return;
      }
      const navigateToHistory = navigation.navigate as (
        routeName: string,
        params: { id: string } & HistoryTargetParams,
      ) => void;
      navigateToHistory(ROUTES.HISTORY_CONVERSATION, { id, ...target });
    },
    [navigation, onOpenConversation],
  );

  const openSearchResult = useCallback(
    (item: MessageSearchResult) => {
      openTarget(item.conversation_id, { targetMessageId: item.id });
    },
    [openTarget],
  );

  const openDateTarget = useCallback(
    async (date: string) => {
      setPendingDate(date);
      setDateTargetError(null);
      setEmptyDate(null);
      try {
        const result = await queryClient.fetchQuery({
          queryKey: ['chat', 'history-day-target', { date }],
          queryFn: () => fetchDayTarget(date),
          staleTime: 60_000,
        });
        const target = result.target;
        const targetMessageId = target?.message_id ?? target?.id;
        if (target?.conversation_id && targetMessageId) {
          openTarget(target.conversation_id, { targetMessageId, targetDate: date });
        } else {
          setEmptyDate(date);
        }
      } catch (err) {
        setDateTargetError((err as Error)?.message ?? '日期记录拉取失败');
      } finally {
        setPendingDate(null);
      }
    },
    [openTarget, queryClient],
  );

  const moveMonth = useCallback((delta: number) => {
    const next = shiftMonth(selectedYear, selectedMonth, delta);
    setSelectedYear(next.year);
    setSelectedMonth(next.month);
    setEmptyDate(null);
    setDateTargetError(null);
  }, [selectedMonth, selectedYear]);

  const moveYear = useCallback((delta: number) => {
    setSelectedYear((year) => year + delta);
    setEmptyDate(null);
    setDateTargetError(null);
  }, []);

  const refresh = useCallback(() => {
    void activity.refetch();
    if (searchQuery.length > 0) void search.refetch();
  }, [activity, search, searchQuery.length]);

  const searchResults = search.data?.items ?? [];
  const hasSearchText = searchText.trim().length > 0;
  const hasActiveDays = activeDays.size > 0;
  const refreshing = activity.isFetching || (search.isFetching && searchQuery.length > 0);

  return (
    <View style={styles.root}>
      <TopBar title="" onMenu={openDrawer} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors['fawn-amber']}
          />
        }
      >
        <Text style={styles.eyebrow}>历史记录</Text>
        <Text style={styles.title}>按关键词或日期找回聊天内容</Text>

        <View style={styles.searchCard}>
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder="搜索聊天内容"
            placeholderTextColor={colors['mid-gray']}
            autoCorrect={false}
            returnKeyType="search"
            style={styles.searchInput}
            accessibilityLabel="搜索历史消息"
          />
          {hasSearchText ? (
            <TouchableOpacity
              onPress={() => setSearchText('')}
              accessibilityRole="button"
              style={styles.clearButton}
              activeOpacity={0.8}
            >
              <Text style={styles.clearButtonText}>清除</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>搜索结果</Text>
              <Text style={styles.sectionHint}>点按结果会定位到匹配消息</Text>
            </View>
            {search.isFetching && searchQuery.length > 0 ? (
              <ActivityIndicator color={colors['fawn-amber']} />
            ) : null}
          </View>

          {!hasSearchText ? (
            <Text style={styles.stateText}>输入关键词后，这里会显示匹配的聊天消息。</Text>
          ) : search.isError ? (
            <View style={styles.inlineBanner}>
              <Text style={styles.inlineBannerText}>
                搜索失败，已保留当前页面。{'\n'}{(search.error as Error)?.message ?? ''}
              </Text>
            </View>
          ) : search.isPending ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors['fawn-amber']} />
              <Text style={styles.stateText}>正在搜索…</Text>
            </View>
          ) : searchResults.length === 0 ? (
            <Text style={styles.stateText}>没有找到匹配消息，换个关键词试试。</Text>
          ) : (
            <View style={styles.resultsList}>
              {searchResults.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.resultRow}
                  onPress={() => openSearchResult(item)}
                  accessibilityRole="button"
                  activeOpacity={0.85}
                >
                  <Text style={styles.resultContent} numberOfLines={3}>
                    {item.content || '（图片消息）'}
                  </Text>
                  <Text style={styles.resultMeta}>
                    {roleLabel(item.role)} · {formatDateTime(item.created_at)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.monthHeader}>
            <TouchableOpacity
              style={styles.navButton}
              onPress={() => moveYear(-1)}
              accessibilityRole="button"
              activeOpacity={0.85}
            >
              <Text style={styles.navButtonText}>上一年</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.navButton}
              onPress={() => moveMonth(-1)}
              accessibilityRole="button"
              activeOpacity={0.85}
            >
              <Text style={styles.navButtonText}>上月</Text>
            </TouchableOpacity>
            <View style={styles.monthTitleWrap}>
              <Text style={styles.sectionTitle}>{monthTitle(selectedYear, selectedMonth)}</Text>
              <Text style={styles.sectionHint}>有记录的日期会加深显示</Text>
            </View>
            <TouchableOpacity
              style={styles.navButton}
              onPress={() => moveMonth(1)}
              accessibilityRole="button"
              activeOpacity={0.85}
            >
              <Text style={styles.navButtonText}>下月</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.navButton}
              onPress={() => moveYear(1)}
              accessibilityRole="button"
              activeOpacity={0.85}
            >
              <Text style={styles.navButtonText}>下一年</Text>
            </TouchableOpacity>
          </View>

          {activity.isError ? (
            <View style={styles.inlineBanner}>
              <Text style={styles.inlineBannerText}>
                月历拉取失败。{'\n'}{(activity.error as Error)?.message ?? ''}
              </Text>
            </View>
          ) : null}
          {dateTargetError ? (
            <View style={styles.inlineBanner}>
              <Text style={styles.inlineBannerText}>{dateTargetError}</Text>
            </View>
          ) : null}
          {emptyDate ? <Text style={styles.stateText}>{emptyDate} 没有可定位的聊天消息。</Text> : null}

          <View style={styles.weekHeader}>
            {WEEKDAY_LABELS.map((label) => (
              <Text key={label} style={styles.weekLabel}>{label}</Text>
            ))}
          </View>

          <View style={styles.calendarGrid}>
            {calendarCells.map((cell) => {
              if (cell.kind === 'blank') return <View key={cell.key} style={styles.dayCell} />;
              const messageCount = activeDays.get(cell.date) ?? 0;
              const isActive = messageCount > 0;
              const isPending = pendingDate === cell.date;
              return (
                <TouchableOpacity
                  key={cell.key}
                  style={[styles.dayCell, styles.dayButton, isActive && styles.dayButtonActive]}
                  onPress={() => {
                    if (isActive && !isPending) void openDateTarget(cell.date);
                  }}
                  disabled={!isActive || isPending}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !isActive || isPending }}
                  activeOpacity={0.85}
                >
                  {isPending ? (
                    <ActivityIndicator color={colors['fawn-amber']} size="small" />
                  ) : (
                    <>
                      <Text style={[styles.dayText, isActive && styles.dayTextActive]}>{cell.day}</Text>
                      {isActive ? <Text style={styles.dayMeta}>{messageCount}</Text> : null}
                    </>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {activity.isPending ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors['fawn-amber']} />
              <Text style={styles.stateText}>正在加载月历…</Text>
            </View>
          ) : !hasActiveDays && !activity.isError ? (
            <Text style={styles.stateText}>这个月份还没有聊天记录。</Text>
          ) : (
            <Text style={styles.stateText}>点按加深日期，会打开当天最早的一条消息。</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors['warm-cream'] },
  content: {
    paddingHorizontal: spacing['4'],
    paddingTop: spacing['3'],
    paddingBottom: spacing['8'],
    gap: spacing['4'],
  },
  eyebrow: {
    ...typography.bodySmall,
    color: colors['dark-gray'],
  },
  title: {
    ...typography.heading,
    color: colors['soft-charcoal'],
  },
  searchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors['card'],
    borderRadius: radii.input,
    borderWidth: 1,
    borderColor: colors['oat-border'],
    paddingLeft: spacing['4'],
    paddingRight: spacing['2'],
    minHeight: 52,
    ...shadows.card,
  },
  searchInput: {
    flex: 1,
    ...typography.inputBody,
    paddingVertical: spacing['3'],
  },
  clearButton: {
    paddingHorizontal: spacing['3'],
    paddingVertical: spacing['2'],
    borderRadius: radii.chip,
    backgroundColor: colors['fawn-amber-light'],
  },
  clearButtonText: {
    ...typography.caption,
    color: colors['brand-strong'],
    fontFamily: typography.button.fontFamily,
  },
  sectionCard: {
    backgroundColor: colors['card'],
    borderRadius: radii.card,
    padding: spacing['4'],
    borderWidth: 1,
    borderColor: colors['oat-border'],
    gap: spacing['3'],
    ...shadows.card,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing['3'],
  },
  sectionTitle: {
    ...typography.heading,
    color: colors['soft-charcoal'],
  },
  sectionHint: {
    ...typography.caption,
    color: colors['mid-gray'],
    marginTop: spacing['1'],
  },
  stateText: {
    ...typography.bodySmall,
    color: colors['dark-gray'],
  },
  inlineBanner: {
    backgroundColor: colors['warning-amber-light'],
    borderColor: colors['warning-amber'],
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing['3'],
  },
  inlineBannerText: {
    ...typography.bodySmall,
    color: colors['warning-amber'],
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['2'],
  },
  resultsList: {
    gap: spacing['2'],
  },
  resultRow: {
    padding: spacing['3'],
    borderRadius: radii.lg,
    backgroundColor: colors['warm-gray'],
    borderWidth: 1,
    borderColor: colors['oat-border'],
  },
  resultContent: {
    ...typography.body,
    color: colors['soft-charcoal'],
  },
  resultMeta: {
    ...typography.caption,
    color: colors['mid-gray'],
    marginTop: spacing['2'],
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing['2'],
  },
  monthTitleWrap: {
    minWidth: 120,
    flexGrow: 1,
  },
  navButton: {
    paddingHorizontal: spacing['3'],
    paddingVertical: spacing['2'],
    borderRadius: radii.chip,
    backgroundColor: colors['fawn-amber-light'],
  },
  navButtonText: {
    ...typography.caption,
    color: colors['brand-strong'],
    fontFamily: typography.button.fontFamily,
  },
  weekHeader: {
    flexDirection: 'row',
  },
  weekLabel: {
    flex: 1,
    textAlign: 'center',
    ...typography.caption,
    color: colors['mid-gray'],
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['1'],
  },
  dayButton: {
    borderRadius: radii.md,
  },
  dayButtonActive: {
    backgroundColor: colors['fawn-amber-light'],
    borderWidth: 1,
    borderColor: colors['fawn-amber'],
  },
  dayText: {
    ...typography.bodySmall,
    color: colors['mid-gray'],
  },
  dayTextActive: {
    color: colors['brand-strong'],
    fontFamily: typography.button.fontFamily,
  },
  dayMeta: {
    ...typography.caption,
    color: colors['fawn-amber'],
    marginTop: spacing['1'],
  },
});
