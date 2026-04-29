'use client';

import { FormEvent, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { formatDateTime } from '@/lib/utils';
import type { ProfileItem } from '@/lib/types';

interface ProfileItemListProps {
  items: ProfileItem[];
  onEdit: (id: string, content: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function ProfileItemList({ items, onEdit, onDelete }: ProfileItemListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [content, setContent] = useState('');

  function begin(item: ProfileItem) {
    setEditingId(item.id);
    setContent(item.content);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!editingId) return;
    await onEdit(editingId, content);
    setEditingId(null);
  }

  return (
    <Card>
      <h2 className="mb-3 text-[17px] font-semibold">我的画像</h2>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-xl border border-oat-border bg-warm-cream p-3">
            {editingId === item.id ? (
              <form onSubmit={submit} className="space-y-2">
                <textarea
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  className="min-h-24 w-full rounded-xl border border-oat-border bg-white p-3 outline-none focus:border-fawn-amber"
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
                    <button
                      type="button"
                      onClick={() => begin(item)}
                      className="grid h-11 w-11 place-items-center rounded-full text-fawn-amber"
                      aria-label="编辑画像"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm('确认删除这条画像？')) void onDelete(item.id);
                      }}
                      className="grid h-11 w-11 place-items-center rounded-full text-safety-red"
                      aria-label="删除画像"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
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
