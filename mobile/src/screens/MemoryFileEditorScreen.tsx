/**
 * MemoryFileEditorScreen — view and optionally edit a single long-term memory
 * file. Mobile counterpart of frontend/src/app/(main)/profile/memory/[memoryId].
 */

import React, { useEffect, useState } from 'react';
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
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TopBar } from '../components/layout/TopBar';
import { Button } from '../components/ui/Button';
import { MarkdownMessage } from '../components/chat/MarkdownMessage';
import { getMemoryFile, updateMemoryFile } from '../lib/api';
import { colors, spacing, typography } from '../shared/theme';
import { Ionicons } from '@expo/vector-icons';

interface MemoryFileEditorScreenProps {
  route: {
    params: { id: string };
  };
  navigation: {
    goBack: () => void;
  };
}

export function MemoryFileEditorScreen({ route, navigation }: MemoryFileEditorScreenProps) {
  const { id } = route.params;
  const queryClient = useQueryClient();

  const { data: file, isLoading, error } = useQuery({
    queryKey: ['memory-file', id],
    queryFn: () => getMemoryFile(id),
  });

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (file) setDraft(file.content);
  }, [file]);

  const mutation = useMutation({
    mutationFn: (content: string) => updateMemoryFile(id, content),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ['memory-file', id] });
      void queryClient.invalidateQueries({ queryKey: ['memory-files'] });
      setDraft(updated.content);
      setEditing(false);
    },
    onError: (err: Error) => {
      Alert.alert('保存失败', err.message ?? '请稍后重试');
    },
  });

  function handleSave() {
    if (!file) return;
    const limit = file.limit;
    if (draft.length > limit) {
      Alert.alert('内容过长', `当前 ${draft.length} 字符，上限 ${limit} 字符`);
      return;
    }
    mutation.mutate(draft);
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TopBar
        title={file?.label ?? '记忆文件'}
        onBack={() => navigation.goBack()}
        rightAction={
          file?.can_edit && !editing ? (
            <Pressable
              onPress={() => setEditing(true)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="编辑"
            >
              <Ionicons name="pencil-outline" size={22} color={colors['fawn-amber']} />
            </Pressable>
          ) : undefined
        }
      />

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors['fawn-amber']} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>加载失败，请稍后重试</Text>
        </View>
      ) : file ? (
        <>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            {editing ? (
              <View style={styles.editBlock}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  multiline
                  style={styles.editInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textAlignVertical="top"
                />
                <Text style={styles.charCount}>
                  {draft.length}/{file.limit}
                </Text>
              </View>
            ) : (
              <View style={styles.viewBlock}>
                <MarkdownMessage content={file.content} />
              </View>
            )}
          </ScrollView>

          {editing ? (
            <View style={styles.toolbar}>
              <Button
                variant="secondary"
                onPress={() => {
                  setDraft(file.content);
                  setEditing(false);
                }}
              >
                取消
              </Button>
              <Button
                variant="primary"
                onPress={handleSave}
                loading={mutation.isPending}
                style={styles.saveBtn}
              >
                保存
              </Button>
            </View>
          ) : null}
        </>
      ) : null}
    </KeyboardAvoidingView>
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
  },
  content: {
    padding: spacing['4'],
    paddingBottom: spacing['12'],
  },
  viewBlock: {
    gap: spacing['3'],
  },
  editBlock: {
    gap: spacing['2'],
  },
  editInput: {
    minHeight: 240,
    borderWidth: 1,
    borderColor: colors['oat-border'],
    borderRadius: 12,
    backgroundColor: colors['card'],
    padding: spacing['3'],
    ...typography.body,
    lineHeight: 22,
  },
  charCount: {
    ...typography.caption,
    color: colors['mid-gray'],
    textAlign: 'right',
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing['2'],
    paddingHorizontal: spacing['4'],
    paddingBottom: spacing['6'],
    paddingTop: spacing['3'],
    backgroundColor: colors['warm-cream'],
    borderTopWidth: 1,
    borderTopColor: colors['oat-border'],
  },
  saveBtn: {
    minWidth: 80,
  },
  errorText: {
    ...typography.body,
    color: colors['safety-red'],
  },
});
