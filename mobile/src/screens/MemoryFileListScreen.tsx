/**
 * MemoryFileListScreen — lists long-term memory files and navigates to the
 * editor. Mobile counterpart of frontend/src/app/(main)/profile/memory page.
 */

import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { TopBar } from '../components/layout/TopBar';
import { Card } from '../components/ui/Card';
import { getMemoryFiles } from '../lib/api';
import type { MemoryFileSummary } from '../lib/api';
import { ROUTES } from '../navigation/routeNames';
import { colors, radii, spacing, typography } from '../shared/theme';

interface MemoryFileListScreenProps {
  navigation: {
    navigate: (route: string, params?: Record<string, unknown>) => void;
    goBack: () => void;
  };
}

const KIND_LABEL: Record<MemoryFileSummary['kind'], string> = {
  soul: '灵魂',
  family: '家庭',
  baby: '宝宝',
  user: '用户',
};

export function MemoryFileListScreen({ navigation }: MemoryFileListScreenProps) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['memory-files'],
    queryFn: getMemoryFiles,
  });

  function renderItem({ item }: { item: MemoryFileSummary }) {
    return (
      <Pressable
        onPress={() => navigation.navigate(ROUTES.MEMORY_FILE_EDITOR, { id: item.id })}
        accessibilityRole="button"
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      >
        <View style={styles.rowMain}>
          <Text style={styles.rowLabel}>{item.label}</Text>
          <Text style={styles.rowMeta}>
            {KIND_LABEL[item.kind] ?? item.kind}
            {item.can_edit ? '' : ' · 只读'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors['mid-gray']} />
      </Pressable>
    );
  }

  return (
    <View style={styles.root}>
      <TopBar title="长期记忆" onBack={() => navigation.goBack()} />
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors['fawn-amber']} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>加载失败，请稍后重试</Text>
          <Pressable onPress={() => void refetch()} style={styles.retryBtn}>
            <Text style={styles.retryText}>重试</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <Card>
              <Text style={styles.emptyText}>暂无记忆文件</Text>
            </Card>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors['warm-cream'],
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing['3'],
  },
  list: {
    padding: spacing['4'],
    gap: spacing['2'],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors['card'],
    borderRadius: radii.lg,
    paddingHorizontal: spacing['4'],
    paddingVertical: spacing['3'],
    gap: spacing['3'],
  },
  rowPressed: {
    opacity: 0.8,
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
  },
  rowLabel: {
    ...typography.body,
    color: colors['soft-charcoal'],
  },
  rowMeta: {
    ...typography.caption,
    color: colors['mid-gray'],
    marginTop: spacing['1'],
  },
  separator: {
    height: spacing['2'],
  },
  emptyText: {
    ...typography.body,
    color: colors['mid-gray'],
    textAlign: 'center',
  },
  errorText: {
    ...typography.body,
    color: colors['safety-red'],
  },
  retryBtn: {
    paddingHorizontal: spacing['4'],
    paddingVertical: spacing['2'],
  },
  retryText: {
    ...typography.body,
    color: colors['fawn-amber'],
  },
});
