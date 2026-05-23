// Mobile History search + calendar entry point.
//
// This screen intentionally treats conversation ids as navigation internals:
// the user-facing surface is keyword search, calendar activity, and message
// targets.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
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
const MONTH_LABELS = Array.from({ length: 12 }, (_, index) => index + 1);
const YEAR_OPTION_COUNT = 7;

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

type HistoryView = 'calendar' | 'search';

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
  const [historyView, setHistoryView] = useState<HistoryView>('calendar');
  const [searchText, setSearchText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(now.getFullYear());
  const [pickerYearStart, setPickerYearStart] = useState(now.getFullYear() - 3);
  const [pendingDate, setPendingDate] = useState<string | null>(null);
  const [dateTargetError, setDateTargetError] = useState<string | null>(null);
  const [emptyDate, setEmptyDate] = useState<string | null>(null);

  const search = useQuery({
    queryKey: ['chat', 'history-search', { query: searchQuery, pageSize: SEARCH_PAGE_SIZE }],
    queryFn: () => searchMessages(searchQuery),
    enabled: historyView === 'search' && searchQuery.length > 0,
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
    const dates = new Set<string>();
    for (const day of activity.data?.days ?? []) {
      if (day.message_count > 0) dates.add(day.date);
    }
    return dates;
  }, [activity.data?.days]);

  const yearOptions = useMemo(
    () => Array.from({ length: YEAR_OPTION_COUNT }, (_, index) => pickerYearStart + index),
    [pickerYearStart],
  );

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

  const submitSearch = useCallback(() => {
    const trimmed = searchText.trim();
    if (!trimmed) return;
    setSearchText(trimmed);
    setSearchQuery(trimmed);
    setHistoryView('search');
  }, [searchText]);

  const clearSearch = useCallback(() => {
    setSearchText('');
    if (historyView === 'search') setSearchQuery('');
  }, [historyView]);

  const returnToCalendar = useCallback(() => {
    setHistoryView('calendar');
  }, []);

  const openMonthPicker = useCallback(() => {
    setPickerYear(selectedYear);
    setPickerYearStart(selectedYear - Math.floor(YEAR_OPTION_COUNT / 2));
    setMonthPickerOpen(true);
  }, [selectedYear]);

  const selectMonth = useCallback((month: number) => {
    setSelectedYear(pickerYear);
    setSelectedMonth(month);
    setEmptyDate(null);
    setDateTargetError(null);
    setMonthPickerOpen(false);
  }, [pickerYear]);

  const refresh = useCallback(() => {
    if (historyView === 'search') {
      if (searchQuery.length > 0) void search.refetch();
      return;
    }
    void activity.refetch();
  }, [activity, historyView, search, searchQuery.length]);

  const searchResults = search.data?.items ?? [];
  const hasSearchText = searchText.trim().length > 0;
  const hasActiveDays = activeDays.size > 0;
  const refreshing = historyView === 'search'
    ? search.isFetching && searchQuery.length > 0
    : activity.isFetching;

  const renderSearchBox = () => (
    <View style={styles.searchCard}>
      <Ionicons name="search-outline" size={18} color={colors['mid-gray']} />
      <TextInput
        value={searchText}
        onChangeText={setSearchText}
        onSubmitEditing={submitSearch}
        placeholder="搜索聊天内容"
        placeholderTextColor={colors['mid-gray']}
        autoCorrect={false}
        returnKeyType="search"
        style={styles.searchInput}
        accessibilityLabel="搜索历史消息"
      />
      {hasSearchText ? (
        <TouchableOpacity
          onPress={clearSearch}
          accessibilityRole="button"
          accessibilityLabel="清除搜索关键词"
          style={styles.clearIconButton}
          activeOpacity={0.8}
        >
          <Ionicons name="close-circle" size={18} color={colors['mid-gray']} />
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        onPress={submitSearch}
        disabled={!hasSearchText}
        accessibilityRole="button"
        accessibilityLabel="执行历史搜索"
        accessibilityState={{ disabled: !hasSearchText }}
        style={[styles.searchButton, !hasSearchText && styles.searchButtonDisabled]}
        activeOpacity={0.85}
      >
        <Text style={[styles.searchButtonText, !hasSearchText && styles.searchButtonTextDisabled]}>
          搜索
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderSearchResults = () => {
    if (searchQuery.length === 0) {
      return <Text style={styles.stateText}>输入关键词后点搜索。</Text>;
    }
    if (search.isError) {
      return (
        <View style={styles.inlineBanner}>
          <Text style={styles.inlineBannerText}>
            搜索失败。{'\n'}{(search.error as Error)?.message ?? ''}
          </Text>
        </View>
      );
    }
    if (search.isPending) {
      return (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors['fawn-amber']} />
          <Text style={styles.stateText}>正在搜索…</Text>
        </View>
      );
    }
    if (searchResults.length === 0) {
      return <Text style={styles.stateText}>没有找到匹配消息，换个关键词试试。</Text>;
    }
    return (
      <View style={styles.resultsList}>
        <Text style={styles.resultsSummary}>
          找到 {search.data?.total ?? searchResults.length} 条匹配
        </Text>
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
    );
  };

  if (historyView === 'search') {
    return (
      <View style={styles.root}>
        <TopBar title="搜索" onBack={returnToCalendar} />
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
          {renderSearchBox()}
          {renderSearchResults()}
        </ScrollView>
      </View>
    );
  }

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
        {renderSearchBox()}

        <View style={styles.sectionCard}>
          <View style={styles.monthHeader}>
            <TouchableOpacity
              style={styles.monthSelectButton}
              onPress={openMonthPicker}
              accessibilityRole="button"
              accessibilityLabel="选择年月"
              activeOpacity={0.85}
            >
              <Text style={styles.sectionTitle}>{monthTitle(selectedYear, selectedMonth)}</Text>
              <Ionicons name="chevron-down" size={18} color={colors['dark-gray']} />
            </TouchableOpacity>
            <Text style={styles.sectionHint}>有消息的日期会加粗，可点击打开当天消息</Text>
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
              const isActive = activeDays.has(cell.date);
              const isPending = pendingDate === cell.date;
              return (
                <TouchableOpacity
                  key={cell.key}
                  style={[styles.dayCell, styles.dayButton]}
                  onPress={() => {
                    if (isActive && !isPending) void openDateTarget(cell.date);
                  }}
                  disabled={!isActive || isPending}
                  accessibilityRole="button"
                  accessibilityLabel={`${cell.date}${isActive ? ' 有消息' : ' 无消息'}`}
                  accessibilityState={{ disabled: !isActive || isPending }}
                  activeOpacity={0.85}
                >
                  {isPending ? (
                    <ActivityIndicator color={colors['fawn-amber']} size="small" />
                  ) : (
                    <Text style={[styles.dayText, isActive && styles.dayTextActive]}>
                      {cell.day}
                    </Text>
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
      <Modal
        visible={monthPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMonthPickerOpen(false)}
      >
        <Pressable style={styles.pickerBackdrop} onPress={() => setMonthPickerOpen(false)}>
          <Pressable style={styles.pickerSheet} onPress={(event) => event.stopPropagation()}>
            <View style={styles.pickerHeader}>
              <TouchableOpacity
                style={styles.pickerIconButton}
                onPress={() => setPickerYearStart((start) => start - YEAR_OPTION_COUNT)}
                accessibilityRole="button"
                accessibilityLabel="更早年份"
                activeOpacity={0.85}
              >
                <Ionicons name="chevron-back" size={18} color={colors['dark-gray']} />
              </TouchableOpacity>
              <Text style={styles.pickerTitle}>选择年月</Text>
              <TouchableOpacity
                style={styles.pickerIconButton}
                onPress={() => setPickerYearStart((start) => start + YEAR_OPTION_COUNT)}
                accessibilityRole="button"
                accessibilityLabel="更晚年份"
                activeOpacity={0.85}
              >
                <Ionicons name="chevron-forward" size={18} color={colors['dark-gray']} />
              </TouchableOpacity>
            </View>

            <View style={styles.yearGrid}>
              {yearOptions.map((year) => {
                const selected = year === pickerYear;
                return (
                  <TouchableOpacity
                    key={year}
                    style={[styles.yearButton, selected && styles.pickerButtonSelected]}
                    onPress={() => setPickerYear(year)}
                    accessibilityRole="button"
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.yearButtonText, selected && styles.pickerButtonTextSelected]}>
                      {year}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.monthGrid}>
              {MONTH_LABELS.map((month) => {
                const selected = pickerYear === selectedYear && month === selectedMonth;
                return (
                  <TouchableOpacity
                    key={month}
                    style={[styles.monthButton, selected && styles.pickerButtonSelected]}
                    onPress={() => selectMonth(month)}
                    accessibilityRole="button"
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.monthButtonText, selected && styles.pickerButtonTextSelected]}>
                      {month} 月
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={styles.pickerCancelButton}
              onPress={() => setMonthPickerOpen(false)}
              accessibilityRole="button"
              activeOpacity={0.85}
            >
              <Text style={styles.pickerCancelText}>取消</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
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
  searchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['2'],
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
    minWidth: 0,
    ...typography.inputBody,
    paddingVertical: spacing['3'],
  },
  clearIconButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.full,
  },
  searchButton: {
    minWidth: 54,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['3'],
    borderRadius: radii.input,
    backgroundColor: colors['fawn-amber'],
  },
  searchButtonDisabled: {
    backgroundColor: colors['fawn-amber-light'],
  },
  searchButtonText: {
    ...typography.button,
    color: colors['on-brand'],
    fontSize: 13,
    lineHeight: 18,
  },
  searchButtonTextDisabled: {
    color: colors['brand-strong'],
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
  resultsSummary: {
    ...typography.bodySmall,
    color: colors['dark-gray'],
    marginBottom: spacing['1'],
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
    alignItems: 'flex-start',
    gap: spacing['2'],
  },
  monthSelectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing['2'],
    paddingHorizontal: spacing['2'],
    paddingVertical: spacing['2'],
    marginLeft: -spacing['2'],
    borderRadius: radii.md,
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
  dayText: {
    ...typography.bodySmall,
    color: colors['mid-gray'],
  },
  dayTextActive: {
    color: colors['brand-strong'],
    fontFamily: typography.button.fontFamily,
    fontWeight: '700',
  },
  pickerBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors['modal-backdrop'],
    padding: spacing['4'],
  },
  pickerSheet: {
    backgroundColor: colors['card'],
    borderRadius: radii.card,
    padding: spacing['4'],
    gap: spacing['3'],
    ...shadows.modal,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing['3'],
  },
  pickerTitle: {
    ...typography.heading,
    color: colors['soft-charcoal'],
  },
  pickerIconButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.full,
    backgroundColor: colors['warm-gray'],
  },
  yearGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing['2'],
  },
  yearButton: {
    minWidth: 58,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['2'],
    borderRadius: radii.input,
    backgroundColor: colors['warm-gray'],
    borderWidth: 1,
    borderColor: colors['oat-border'],
  },
  yearButtonText: {
    ...typography.bodySmall,
    color: colors['dark-gray'],
    fontFamily: typography.button.fontFamily,
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing['2'],
  },
  monthButton: {
    width: '30.8%',
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors['warm-gray'],
    borderWidth: 1,
    borderColor: colors['oat-border'],
  },
  monthButtonText: {
    ...typography.body,
    color: colors['soft-charcoal'],
    fontFamily: typography.button.fontFamily,
  },
  pickerButtonSelected: {
    backgroundColor: colors['fawn-amber'],
    borderColor: colors['fawn-amber'],
  },
  pickerButtonTextSelected: {
    color: colors['on-brand'],
  },
  pickerCancelButton: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.input,
    backgroundColor: colors['fawn-amber-light'],
  },
  pickerCancelText: {
    ...typography.button,
    color: colors['brand-strong'],
  },
});
