'use client';

import { FormEvent, useState } from 'react';
import { Pencil, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { formatDateTime } from '@/lib/utils';
import type { ProfileItem } from '@/lib/types';

interface ProfileItemListProps {
  items: ProfileItem[];
  onEdit?: (id: string, content: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onAdd?: (content: string) => Promise<void>;
  eyebrow?: string;
  title?: string;
  emptyText?: string;
}

export function ProfileItemList({
  items,
  onEdit,
  onDelete,
  onAdd,
  eyebrow = '个性化记忆',
  title = '我的画像',
  emptyText = '暂无记录',
}: ProfileItemListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [draft, setDraft] = useState('');

  function begin(item: ProfileItem) {
    setEditingId(item.id);
    setContent(item.content);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!editingId || !onEdit) return;
    await onEdit(editingId, content);
    setEditingId(null);
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!onAdd || !draft.trim()) return;
    await onAdd(draft.trim());
    setDraft('');
  }

  return (
    <Card>
      <div className="mb-4 flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-nursery-butter text-warning-amber">
          <Sparkles className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <p className="text-sm text-dark-gray">{eyebrow}</p>
          <h2 className="text-[17px] font-semibold text-soft-charcoal">{title}</h2>
        </div>
      </div>
      {onAdd ? (
        <form onSubmit={add} className="mb-3 flex gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="添加一条记忆"
            className="min-h-11 min-w-0 flex-1 rounded-2xl border border-oat-border bg-white px-3 outline-none focus:border-fawn-amber"
          />
          <Button type="submit" variant="secondary" className="min-h-11 px-4 text-sm shadow-none">
            添加
          </Button>
        </form>
      ) : null}
      <div className="space-y-3">
        {items.length === 0 ? <p className="rounded-2xl bg-warm-gray p-3 text-sm text-dark-gray">{emptyText}</p> : null}
        {items.map((item) => (
          <div key={item.id} className="rounded-2xl border border-white/70 bg-warm-gray p-3">
            {editingId === item.id ? (
              <form onSubmit={submit} className="space-y-2">
                <textarea
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  className="min-h-24 w-full rounded-2xl border border-oat-border bg-white p-3 outline-none focus:border-fawn-amber"
                />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="text" onClick={() => setEditingId(null)}>
                    取消
                  </Button>
                  <Button type="submit" className="min-h-10 px-4 py-2 text-sm">
                    保存
                  </Button>
                </div>
              </form>
            ) : (
              <>
                <p className="text-base text-soft-charcoal">{item.content}</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-xs text-mid-gray">更新于 {formatDateTime(item.updated_at)}</p>
                  <div className="flex">
                    {onEdit ? (
                      <button
                        type="button"
                        onClick={() => begin(item)}
                        className="grid h-11 w-11 place-items-center rounded-full text-fawn-amber"
                        aria-label="编辑画像"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    ) : null}
                    {onDelete ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm('确认删除这条记忆？')) void onDelete(item.id);
                        }}
                        className="grid h-11 w-11 place-items-center rounded-full text-safety-red"
                        aria-label="删除画像"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
