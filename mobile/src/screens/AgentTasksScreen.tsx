// Agent task module — list runnable tasks, trigger a run, follow it through
// running / succeeded / failed states (YAO-21; visual pass under YAO-36).
//
// Visual language strictly from `mobile/src/shared/theme.ts`. Business logic
// (polling, retry, deep-link seeded runs) is unchanged — only the surface is
// re-skinned and a `TopBar` with a back button is added so this screen reads
// as a secondary-entry under the 家庭 tab.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  TaskTriggerError,
  agentTaskQueries,
  triggerRun,
  type AgentTaskDefinition,
  type AgentTaskRun,
} from '../shared/api';
import { queryKeys } from '../shared/api/queryKeys';
import { TopBar } from '../components/layout/TopBar';
import {
  colors,
  fontFamily,
  radii,
  shadows,
  spacing,
  typography,
} from '../shared/theme';

type Route =
  | { kind: 'list' }
  | { kind: 'run'; runId: string; definition: AgentTaskDefinition | null };

interface AgentTasksScreenProps {
  /**
   * Run id to open immediately on mount. Used by the push deep-link path
   * so tapping a "task completed" notification lands the user on the run
   * detail view without an intermediate tap.
   */
  initialRunId?: string | null;
  onInitialRunConsumed?: () => void;
  /**
   * Optional back handler — surfaced as a TopBar chevron when provided.
   * Wired by the ProfileStack so the screen reads as a secondary entry
   * below 家庭.
   */
  onClose?: () => void;
}

export function AgentTasksScreen({
  initialRunId,
  onInitialRunConsumed,
  onClose,
}: AgentTasksScreenProps = {}) {
  const [route, setRoute] = useState<Route>(
    initialRunId
      ? { kind: 'run', runId: initialRunId, definition: null }
      : { kind: 'list' },
  );

  useEffect(() => {
    if (!initialRunId) return;
    setRoute((current) => {
      if (current.kind === 'run' && current.runId === initialRunId) {
        return current;
      }
      return { kind: 'run', runId: initialRunId, definition: null };
    });
    onInitialRunConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRunId]);

  if (route.kind === 'run') {
    return (
      <RunView
        runId={route.runId}
        definition={route.definition}
        onBack={() => setRoute({ kind: 'list' })}
        onSwitchRun={(runId) =>
          setRoute({ kind: 'run', runId, definition: route.definition })
        }
      />
    );
  }

  return (
    <ListView
      onClose={onClose}
      onOpenRun={(runId, definition) =>
        setRoute({ kind: 'run', runId, definition })
      }
    />
  );
}

// ----- List -----

interface ListViewProps {
  onOpenRun: (runId: string, definition: AgentTaskDefinition | null) => void;
  onClose?: () => void;
}

function ListView({ onOpenRun, onClose }: ListViewProps) {
  const { data, isPending, isFetching, isError, error, refetch } = useQuery(
    agentTaskQueries.definitions(),
  );
  const [triggeringName, setTriggeringName] = useState<string | null>(null);

  const triggerMutation = useMutation({
    mutationFn: async (def: AgentTaskDefinition) => {
      const run = await triggerRun(def.name);
      return { run, definition: def };
    },
    onMutate: (def) => {
      setTriggeringName(def.name);
    },
    onSettled: () => {
      setTriggeringName(null);
    },
    onSuccess: ({ run, definition }) => {
      onOpenRun(run.id, definition);
    },
    onError: (err: unknown, def) => {
      if (err instanceof TaskTriggerError && err.existingRunId) {
        onOpenRun(err.existingRunId, def);
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert('触发失败', msg);
    },
  });

  if (isPending && !data) {
    return (
      <View style={styles.root}>
        <TopBar title="Agent 任务" onBack={onClose} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors['fawn-amber']} />
        </View>
      </View>
    );
  }

  const definitions = data ?? [];

  return (
    <View style={styles.root}>
      <TopBar title="Agent 任务" onBack={onClose} />
      <ScrollView
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl
            refreshing={isFetching}
            onRefresh={() => refetch()}
            tintColor={colors['fawn-amber']}
          />
        }
      >
        <Text style={styles.subtitle}>选择一个任务并触发，运行结果会显示在下一页。</Text>

        {isError && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>
              离线 / 拉取失败。{'\n'}
              {(error as Error)?.message ?? ''}
            </Text>
          </View>
        )}

        {definitions.length === 0 ? (
          <Text style={styles.empty}>当前没有可触发的任务。</Text>
        ) : (
          definitions.map((def) => {
            const pending = triggeringName === def.name && triggerMutation.isPending;
            return (
              <TouchableOpacity
                key={def.name}
                style={[
                  styles.taskCard,
                  !def.enabled && styles.taskCardDisabled,
                  pending && styles.taskCardPending,
                ]}
                activeOpacity={0.85}
                disabled={!def.enabled || triggerMutation.isPending}
                onPress={() => triggerMutation.mutate(def)}
                accessibilityRole="button"
                accessibilityLabel={`触发任务 ${def.title}`}
              >
                <View style={styles.taskHeader}>
                  <Text style={styles.taskTitle}>{def.title}</Text>
                  <Text style={styles.taskEta}>~{def.estimated_duration_seconds}s</Text>
                </View>
                <Text style={styles.taskDesc}>{def.description}</Text>
                <Text style={styles.taskCta}>
                  {pending ? '触发中…' : def.enabled ? '点击触发 ▸' : '暂未开放'}
                </Text>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

// ----- Run detail -----

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);

interface RunViewProps {
  runId: string;
  definition: AgentTaskDefinition | null;
  onBack: () => void;
  onSwitchRun: (runId: string) => void;
}

function RunView({ runId, definition, onBack, onSwitchRun }: RunViewProps) {
  const queryClient = useQueryClient();
  const query = useQuery({
    ...agentTaskQueries.run(runId),
    refetchInterval: (q) => {
      const r = q.state.data as AgentTaskRun | undefined;
      if (r && TERMINAL_STATUSES.has(r.status)) return false;
      return 2000;
    },
    refetchIntervalInBackground: false,
  });

  const retryMutation = useMutation({
    mutationFn: async () => {
      if (!definition) throw new Error('缺少任务定义，无法重试');
      return triggerRun(definition.name);
    },
    onSuccess: (run) => {
      queryClient.setQueryData(queryKeys.agentTasks.run(run.id), run);
      onSwitchRun(run.id);
    },
    onError: (err: unknown) => {
      if (err instanceof TaskTriggerError && err.existingRunId) {
        onSwitchRun(err.existingRunId);
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert('重试失败', msg);
    },
  });

  const run = query.data;
  const showInitialSpinner = query.isPending && !run;
  const headerTitle = definition?.title ?? run?.name ?? '任务运行';

  return (
    <View style={styles.root}>
      <TopBar title={headerTitle} onBack={onBack} />
      <ScrollView
        contentContainerStyle={styles.runBody}
        refreshControl={
          <RefreshControl
            refreshing={query.isFetching}
            onRefresh={() => query.refetch()}
            tintColor={colors['fawn-amber']}
          />
        }
      >
        {showInitialSpinner ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors['fawn-amber']} />
          </View>
        ) : !run ? (
          <Text style={styles.empty}>无法加载运行状态。</Text>
        ) : (
          <RunStateView
            run={run}
            onRetry={() => retryMutation.mutate()}
            retrying={retryMutation.isPending}
          />
        )}
      </ScrollView>
    </View>
  );
}

// ----- State-specific renderers -----

function RunStateView({
  run,
  onRetry,
  retrying,
}: {
  run: AgentTaskRun;
  onRetry: () => void;
  retrying: boolean;
}) {
  if (run.status === 'queued' || run.status === 'running') {
    return <RunningView run={run} />;
  }
  if (run.status === 'succeeded') {
    return <SucceededView run={run} />;
  }
  if (run.status === 'failed') {
    return <FailedView run={run} onRetry={onRetry} retrying={retrying} />;
  }
  return (
    <View style={styles.stateBlock}>
      <Text style={styles.stateBadgeNeutral}>已取消</Text>
      <Text style={styles.stateBody}>这次运行已被取消。</Text>
      <RunMeta run={run} />
    </View>
  );
}

function RunningView({ run }: { run: AgentTaskRun }) {
  const label = run.status === 'queued' ? '排队中…' : '运行中…';
  return (
    <View style={styles.stateBlock}>
      <View style={styles.runningRow}>
        <ActivityIndicator size="small" color={colors['fawn-amber']} />
        <Text style={styles.runningLabel}>{label}</Text>
      </View>
      <Text style={styles.stateHint}>任务正在后台执行，完成后会自动刷新结果。</Text>
      <RunMeta run={run} />
    </View>
  );
}

function SucceededView({ run }: { run: AgentTaskRun }) {
  const summary = extractSummaryMarkdown(run.output);
  return (
    <View style={styles.stateBlock}>
      <Text style={styles.stateBadgeSuccess}>已完成</Text>
      {summary ? (
        <View style={styles.markdownCard}>
          <SimpleMarkdown source={summary} />
        </View>
      ) : (
        <Text style={styles.stateHint}>任务已完成，但未返回可显示的产出。</Text>
      )}
      <RunMeta run={run} />
    </View>
  );
}

function FailedView({
  run,
  onRetry,
  retrying,
}: {
  run: AgentTaskRun;
  onRetry: () => void;
  retrying: boolean;
}) {
  const err = run.error;
  return (
    <View style={styles.stateBlock}>
      <Text style={styles.stateBadgeError}>失败</Text>
      <View style={styles.errorCard}>
        <Text style={styles.errorMessage}>
          {err?.message ?? '任务失败，但未返回错误信息。'}
        </Text>
        {err?.code && <Text style={styles.errorCode}>错误码：{err.code}</Text>}
      </View>
      {err?.retryable && (
        <TouchableOpacity
          style={[styles.retryButton, retrying && styles.retryButtonDisabled]}
          onPress={onRetry}
          disabled={retrying}
          accessibilityRole="button"
        >
          <Text style={styles.retryButtonText}>{retrying ? '重试中…' : '重试'}</Text>
        </TouchableOpacity>
      )}
      <RunMeta run={run} />
    </View>
  );
}

function RunMeta({ run }: { run: AgentTaskRun }) {
  return (
    <View style={styles.metaBlock}>
      <MetaRow label="创建" value={formatTime(run.created_at)} />
      {run.started_at && <MetaRow label="开始" value={formatTime(run.started_at)} />}
      {run.finished_at && (
        <MetaRow label="结束" value={formatTime(run.finished_at)} />
      )}
      <MetaRow label="Run" value={run.id.slice(0, 8)} />
    </View>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

// ----- helpers -----

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function extractSummaryMarkdown(
  output: Record<string, unknown> | null,
): string | null {
  if (!output) return null;
  const raw = output.summary_markdown;
  if (typeof raw === 'string' && raw.trim().length > 0) return raw;
  return null;
}

/**
 * Minimal Markdown renderer for the subset weekly_report emits.
 * Kept inline — same as before — to avoid pulling a heavy dep for v1.
 */
function SimpleMarkdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let buffer: string[] = [];

  const flushParagraph = () => {
    if (buffer.length === 0) return;
    const text = buffer.join(' ').trim();
    if (text.length > 0) {
      blocks.push(
        <Text key={`p-${blocks.length}`} style={mdStyles.paragraph}>
          {renderInline(text)}
        </Text>,
      );
    }
    buffer = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.trim() === '') {
      flushParagraph();
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      const level = heading[1].length;
      const text = heading[2];
      blocks.push(
        <Text
          key={`h-${blocks.length}`}
          style={[
            mdStyles.heading,
            level === 1 ? mdStyles.h1 : level === 2 ? mdStyles.h2 : mdStyles.h3,
          ]}
        >
          {renderInline(text)}
        </Text>,
      );
      continue;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      flushParagraph();
      blocks.push(
        <View key={`li-${blocks.length}`} style={mdStyles.bulletRow}>
          <Text style={mdStyles.bulletDot}>•</Text>
          <Text style={mdStyles.bulletText}>{renderInline(bullet[1])}</Text>
        </View>,
      );
      continue;
    }
    buffer.push(line);
  }
  flushParagraph();

  return <View>{blocks}</View>;
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    const m = /^\*\*([^*]+)\*\*$/.exec(part);
    if (m) {
      return (
        <Text key={i} style={mdStyles.bold}>
          {m[1]}
        </Text>
      );
    }
    return <Text key={i}>{part}</Text>;
  });
}

// ----- styles -----

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors['warm-cream'] },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['6'],
  },
  listContainer: {
    padding: spacing['4'],
    paddingBottom: spacing['8'],
    gap: spacing['3'],
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors['dark-gray'],
    marginBottom: spacing['2'],
  },
  banner: {
    backgroundColor: colors['warning-amber-light'],
    borderColor: colors['warning-amber'],
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing['3'],
    marginBottom: spacing['2'],
  },
  bannerText: {
    ...typography.bodySmall,
    color: colors['warning-amber'],
  },
  empty: {
    ...typography.body,
    color: colors['dark-gray'],
    textAlign: 'center',
    marginTop: spacing['10'],
  },
  taskCard: {
    borderWidth: 1,
    borderColor: colors['oat-border'],
    borderRadius: radii.lg,
    padding: spacing['4'],
    backgroundColor: colors['card'],
    ...shadows.card,
  },
  taskCardDisabled: { opacity: 0.5 },
  taskCardPending: { borderColor: colors['fawn-amber'] },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing['1'],
  },
  taskTitle: {
    ...typography.heading,
    color: colors['soft-charcoal'],
  },
  taskEta: {
    ...typography.caption,
    color: colors['mid-gray'],
  },
  taskDesc: {
    ...typography.body,
    color: colors['dark-gray'],
  },
  taskCta: {
    marginTop: spacing['3'],
    ...typography.caption,
    color: colors['brand-strong'],
    fontFamily: typography.heading.fontFamily,
  },
  runBody: {
    padding: spacing['5'],
    paddingBottom: spacing['8'],
    flexGrow: 1,
  },
  stateBlock: { gap: spacing['3'] },
  stateBadgeBase: {
    alignSelf: 'flex-start',
    ...typography.caption,
    fontFamily: typography.heading.fontFamily,
    paddingHorizontal: spacing['3'],
    paddingVertical: spacing['1'],
    borderRadius: radii.chip,
    overflow: 'hidden',
  },
  stateBadgeSuccess: {
    alignSelf: 'flex-start',
    ...typography.caption,
    fontFamily: typography.heading.fontFamily,
    backgroundColor: colors['sage-green-light'],
    color: colors['sage-green'],
    paddingHorizontal: spacing['3'],
    paddingVertical: spacing['1'],
    borderRadius: radii.chip,
    overflow: 'hidden',
  },
  stateBadgeError: {
    alignSelf: 'flex-start',
    ...typography.caption,
    fontFamily: typography.heading.fontFamily,
    backgroundColor: colors['safety-red-light'],
    color: colors['safety-red'],
    paddingHorizontal: spacing['3'],
    paddingVertical: spacing['1'],
    borderRadius: radii.chip,
    overflow: 'hidden',
  },
  stateBadgeNeutral: {
    alignSelf: 'flex-start',
    ...typography.caption,
    fontFamily: typography.heading.fontFamily,
    backgroundColor: colors['warm-gray'],
    color: colors['dark-gray'],
    paddingHorizontal: spacing['3'],
    paddingVertical: spacing['1'],
    borderRadius: radii.chip,
    overflow: 'hidden',
  },
  stateBody: {
    ...typography.body,
    color: colors['soft-charcoal'],
  },
  stateHint: {
    ...typography.bodySmall,
    color: colors['dark-gray'],
  },
  runningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['2'],
  },
  runningLabel: {
    ...typography.heading,
    color: colors['brand-strong'],
  },
  markdownCard: {
    borderWidth: 1,
    borderColor: colors['oat-border'],
    borderRadius: radii.md,
    padding: spacing['4'],
    backgroundColor: colors['card'],
  },
  errorCard: {
    borderWidth: 1,
    borderColor: colors['safety-red-light'],
    borderRadius: radii.md,
    padding: spacing['3'],
    backgroundColor: colors['safety-red-light'],
  },
  errorMessage: {
    ...typography.body,
    color: colors['safety-red'],
  },
  errorCode: {
    marginTop: spacing['1'],
    ...typography.caption,
    color: colors['safety-red'],
    fontFamily: fontFamily.mono,
  },
  retryButton: {
    backgroundColor: colors['fawn-amber'],
    borderRadius: radii.md,
    paddingVertical: spacing['3'],
    paddingHorizontal: spacing['5'],
    alignSelf: 'flex-start',
  },
  retryButtonDisabled: { opacity: 0.6 },
  retryButtonText: {
    ...typography.button,
    color: colors['card'],
  },
  metaBlock: {
    marginTop: spacing['3'],
    paddingTop: spacing['3'],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors['oat-border'],
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing['1'],
  },
  metaLabel: {
    ...typography.caption,
    color: colors['mid-gray'],
  },
  metaValue: {
    ...typography.caption,
    color: colors['dark-gray'],
  },
});

const mdStyles = StyleSheet.create({
  paragraph: {
    ...typography.body,
    color: colors['soft-charcoal'],
    marginBottom: spacing['2'],
  },
  heading: {
    color: colors['soft-charcoal'],
    marginTop: spacing['3'],
    marginBottom: spacing['1'],
  },
  h1: {
    ...typography.title,
  },
  h2: {
    ...typography.heading,
  },
  h3: {
    ...typography.body,
    fontFamily: typography.heading.fontFamily,
  },
  bold: {
    fontFamily: typography.heading.fontFamily,
  },
  bulletRow: {
    flexDirection: 'row',
    marginBottom: spacing['1'],
    paddingLeft: spacing['1'],
  },
  bulletDot: {
    width: 14,
    color: colors['brand-strong'],
    ...typography.body,
  },
  bulletText: {
    flex: 1,
    ...typography.body,
    color: colors['soft-charcoal'],
  },
});
