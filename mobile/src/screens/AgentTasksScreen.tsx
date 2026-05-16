// Agent task module — list runnable tasks, trigger a run, follow it through
// running / succeeded / failed states (YAO-21).
//
// Three views in one screen, driven by local state:
//   1. List view  — definitions from `GET /agent-tasks/definitions`. Each card
//      is a "tap to trigger" entry.
//   2. Run view   — single run polled via `GET /agent-tasks/runs/{id}`.
//      - queued / running: spinner + progress text.
//      - succeeded: render output.summary_markdown (lightweight pseudo-MD).
//      - failed: error.message + retry button gated by error.retryable.
//      - cancelled: terminal note, no retry.
//
// Markdown rendering is intentionally minimal: the backend currently only
// emits headings, bullet lists, and paragraphs for `weekly_report`. Pulling
// in a full markdown lib for v1 would add a dep we don't yet need.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
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

type Route =
  | { kind: 'list' }
  | { kind: 'run'; runId: string; definition: AgentTaskDefinition | null };

export function AgentTasksScreen() {
  const [route, setRoute] = useState<Route>({ kind: 'list' });

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
      onOpenRun={(runId, definition) =>
        setRoute({ kind: 'run', runId, definition })
      }
    />
  );
}

// ----- List -----

interface ListViewProps {
  onOpenRun: (runId: string, definition: AgentTaskDefinition | null) => void;
}

function ListView({ onOpenRun }: ListViewProps) {
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
      // Concurrency: if a run is already in progress, jump straight to it
      // instead of showing a scary error — that matches the spec ("避免重复
      // 点击重复跑").
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
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2c7a4b" />
      </View>
    );
  }

  const definitions = data ?? [];

  return (
    <ScrollView
      contentContainerStyle={styles.listContainer}
      refreshControl={
        <RefreshControl refreshing={isFetching} onRefresh={() => refetch()} />
      }
    >
      <Text style={styles.title}>Agent 任务</Text>
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
    // Poll every 2s until terminal. Once terminal, stop hitting the server.
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
      // Seed the new run's cache so the swap to its detail view doesn't
      // flash an empty loading spinner.
      queryClient.setQueryData(queryKeys.agentTasks.run(run.id), run);
      onSwitchRun(run.id);
    },
    onError: (err: unknown) => {
      if (err instanceof TaskTriggerError && err.existingRunId) {
        // Backend says another run is already in flight — follow that one
        // instead of failing loudly.
        onSwitchRun(err.existingRunId);
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert('重试失败', msg);
    },
  });

  const run = query.data;
  const showInitialSpinner = query.isPending && !run;

  return (
    <View style={styles.root}>
      <View style={styles.runHeader}>
        <TouchableOpacity onPress={onBack} accessibilityRole="button">
          <Text style={styles.backButton}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.runHeaderTitle} numberOfLines={1}>
          {definition?.title ?? run?.name ?? '任务运行'}
        </Text>
        <View style={styles.backButtonPlaceholder} />
      </View>

      <ScrollView
        contentContainerStyle={styles.runBody}
        refreshControl={
          <RefreshControl
            refreshing={query.isFetching}
            onRefresh={() => query.refetch()}
          />
        }
      >
        {showInitialSpinner ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#2c7a4b" />
          </View>
        ) : !run ? (
          <Text style={styles.empty}>无法加载运行状态。</Text>
        ) : (
          <RunStateView run={run} onRetry={() => retryMutation.mutate()} retrying={retryMutation.isPending} />
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
  // cancelled
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
        <ActivityIndicator size="small" color="#2c7a4b" />
        <Text style={styles.runningLabel}>{label}</Text>
      </View>
      <Text style={styles.stateHint}>
        任务正在后台执行，完成后会自动刷新结果。
      </Text>
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
 * Minimal Markdown renderer for the subset weekly_report emits:
 *   - `#`/`##`/`###` headings
 *   - `-` / `*` bullet lists
 *   - blank-line paragraph breaks
 *   - inline `**bold**`
 *
 * Anything else falls through as a plain paragraph. We deliberately do NOT
 * pull react-native-markdown-display for v1 — it would be the only large dep
 * added for one screen.
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
          style={[mdStyles.heading, level === 1 ? mdStyles.h1 : level === 2 ? mdStyles.h2 : mdStyles.h3]}
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
  // Split on **bold** segments; everything else is plain text.
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
  root: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  listContainer: { padding: 24, paddingTop: 64, paddingBottom: 32 },
  title: { fontSize: 24, fontWeight: '700', color: '#222', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#666', marginBottom: 20 },
  banner: {
    backgroundColor: '#fff4e0',
    borderColor: '#e0a96d',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  bannerText: { color: '#8a5a17', fontSize: 13 },
  empty: { fontSize: 14, color: '#666', textAlign: 'center', marginTop: 48 },
  taskCard: {
    borderWidth: 1,
    borderColor: '#e3e3e3',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  taskCardDisabled: { opacity: 0.5 },
  taskCardPending: { borderColor: '#2c7a4b' },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  taskTitle: { fontSize: 17, fontWeight: '700', color: '#222' },
  taskEta: { fontSize: 12, color: '#888' },
  taskDesc: { fontSize: 14, color: '#555', lineHeight: 20 },
  taskCta: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: '600',
    color: '#2c7a4b',
  },
  runHeader: {
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
    backgroundColor: '#fff',
  },
  backButton: { fontSize: 15, color: '#2c7a4b', fontWeight: '600', width: 70 },
  backButtonPlaceholder: { width: 70 },
  runHeaderTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: '#222',
  },
  runBody: { padding: 20, paddingBottom: 48, flexGrow: 1 },
  stateBlock: { gap: 12 },
  stateBadgeSuccess: {
    alignSelf: 'flex-start',
    backgroundColor: '#e6f4ec',
    color: '#2c7a4b',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  stateBadgeError: {
    alignSelf: 'flex-start',
    backgroundColor: '#fde8e8',
    color: '#b03030',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  stateBadgeNeutral: {
    alignSelf: 'flex-start',
    backgroundColor: '#eee',
    color: '#555',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  stateBody: { fontSize: 15, color: '#222', marginTop: 4 },
  stateHint: { fontSize: 13, color: '#666' },
  runningRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  runningLabel: { fontSize: 16, fontWeight: '600', color: '#2c7a4b' },
  markdownCard: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 10,
    padding: 16,
    backgroundColor: '#fafafa',
  },
  errorCard: {
    borderWidth: 1,
    borderColor: '#f1c2c2',
    borderRadius: 10,
    padding: 12,
    backgroundColor: '#fdf2f2',
  },
  errorMessage: { fontSize: 15, color: '#7a1f1f', lineHeight: 22 },
  errorCode: { marginTop: 6, fontSize: 12, color: '#a04a4a', fontFamily: 'Menlo' },
  retryButton: {
    backgroundColor: '#2c7a4b',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignSelf: 'flex-start',
  },
  retryButtonDisabled: { opacity: 0.6 },
  retryButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  metaBlock: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eee',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  metaLabel: { fontSize: 12, color: '#888' },
  metaValue: { fontSize: 12, color: '#444' },
});

const mdStyles = StyleSheet.create({
  paragraph: { fontSize: 14, color: '#222', lineHeight: 22, marginBottom: 8 },
  heading: { color: '#222', marginTop: 12, marginBottom: 6 },
  h1: { fontSize: 20, fontWeight: '700' },
  h2: { fontSize: 17, fontWeight: '700' },
  h3: { fontSize: 15, fontWeight: '600' },
  bold: { fontWeight: '700' },
  bulletRow: { flexDirection: 'row', marginBottom: 4, paddingLeft: 4 },
  bulletDot: { width: 14, color: '#2c7a4b', fontSize: 14, lineHeight: 22 },
  bulletText: { flex: 1, fontSize: 14, color: '#222', lineHeight: 22 },
});
