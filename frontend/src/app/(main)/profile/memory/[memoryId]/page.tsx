'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Eye, Pencil, Save } from 'lucide-react';
import { MarkdownMessage } from '@/components/chat/MarkdownMessage';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { api, ApiError } from '@/lib/api';
import type { MemoryFileRead } from '@/lib/types';

const iconButtonClass =
  'grid h-10 w-10 place-items-center rounded-full border border-oat-border bg-white/80 text-dark-gray shadow-sm transition-colors active:bg-warm-gray';

export default function MemoryFilePage() {
  const router = useRouter();
  const params = useParams<{ memoryId: string }>();
  const memoryId = useMemo(() => decodeURIComponent(params.memoryId), [params.memoryId]);
  const [file, setFile] = useState<MemoryFileRead | null>(null);
  const [draft, setDraft] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .getMemoryFile(memoryId)
      .then((data) => {
        if (!active) return;
        setFile(data);
        setDraft(data.content);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof ApiError ? err.message : '记忆文件加载失败');
      });
    return () => {
      active = false;
    };
  }, [memoryId]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!file?.can_edit) return;
    setIsSaving(true);
    setError(null);
    try {
      const updated = await api.updateMemoryFile(file.id, draft);
      setFile(updated);
      setDraft(updated.content);
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存失败');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-5 px-4 py-4">
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <button type="button" onClick={() => router.push('/profile')} className={iconButtonClass} aria-label="返回家庭">
              <ArrowLeft className="h-4 w-4" aria-hidden />
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm text-dark-gray">长期记忆</p>
              <h1 className="truncate text-xl font-semibold text-soft-charcoal">{file?.label ?? '长期记忆'}</h1>
            </div>
          </div>
          {file?.can_edit ? (
            <button
              type="button"
              onClick={() => setIsEditing((value) => !value)}
              className={iconButtonClass}
              aria-label={isEditing ? '预览记忆' : '编辑记忆'}
            >
              {isEditing ? <Eye className="h-4 w-4" aria-hidden /> : <Pencil className="h-4 w-4" aria-hidden />}
            </button>
          ) : null}
        </div>
        {file ? (
          <div className="mt-3 flex items-center justify-between gap-3 text-xs text-dark-gray">
            <span>{file.can_edit ? '可编辑' : '只读'}</span>
            <span>
              {draft.length}/{file.limit}
            </span>
          </div>
        ) : null}
      </Card>

      {error ? <p className="rounded-2xl bg-safety-red/10 p-3 text-sm text-safety-red">{error}</p> : null}

      {file && isEditing ? (
        <Card>
          <form onSubmit={save} className="space-y-4">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="min-h-[420px] w-full resize-y rounded-2xl border border-oat-border bg-white p-3 font-mono text-sm leading-6 outline-none focus:border-fawn-amber"
            />
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setIsEditing(false)} className="flex-1">
                取消
              </Button>
              <Button type="submit" loading={isSaving} className="flex-1">
                <Save className="h-4 w-4" aria-hidden />
                保存
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <Card>
          {file ? (
            <MarkdownMessage content={file.content} className="text-base leading-7 text-soft-charcoal" />
          ) : (
            <p className="text-sm text-dark-gray">正在加载</p>
          )}
        </Card>
      )}
    </div>
  );
}
