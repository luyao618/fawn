'use client';

import { FormEvent, useState } from 'react';
import { Baby as BabyIcon, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { roleLabel } from '@/lib/utils';
import type { Baby, User, UserPermissions } from '@/lib/types';

interface FamilyMemberManagerProps {
  users: User[];
  baby: Baby;
  onUpdatePermissions: (id: string, permissions: UserPermissions) => Promise<void>;
  onUpdateBaby: (data: Partial<Baby>) => Promise<void>;
}

const inputClass =
  'min-h-11 w-full rounded-2xl border border-oat-border bg-white px-3 outline-none transition-colors focus:border-fawn-amber';

export function FamilyMemberManager({ users, baby, onUpdatePermissions, onUpdateBaby }: FamilyMemberManagerProps) {
  const [babyDraft, setBabyDraft] = useState({
    name: baby.name,
    birth_date: baby.birth_date,
    birth_weight_g: baby.birth_weight_g ?? 0,
    birth_height_cm: baby.birth_height_cm ?? 0,
    birth_head_cm: baby.birth_head_cm ?? 0,
  });

  async function submitBaby(event: FormEvent) {
    event.preventDefault();
    await onUpdateBaby(babyDraft);
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-nursery-powder text-info-blue">
            <BabyIcon className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-sm text-dark-gray">宝宝档案</p>
            <h2 className="text-[17px] font-semibold text-soft-charcoal">{baby.name}</h2>
          </div>
        </div>
        <form onSubmit={submitBaby} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm text-dark-gray">姓名</span>
            <input
              value={babyDraft.name}
              onChange={(event) => setBabyDraft((state) => ({ ...state, name: event.target.value }))}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-dark-gray">出生日期</span>
            <input
              type="date"
              value={babyDraft.birth_date}
              onChange={(event) => setBabyDraft((state) => ({ ...state, birth_date: event.target.value }))}
              className={inputClass}
            />
          </label>
          <div className="grid grid-cols-1 gap-2 min-[390px]:grid-cols-3">
            {[
              ['birth_weight_g', '出生体重(g)'],
              ['birth_height_cm', '身高(cm)'],
              ['birth_head_cm', '头围(cm)'],
            ].map(([key, label]) => (
              <label key={key} className="block">
                <span className="mb-1 block text-xs text-dark-gray">{label}</span>
                <input
                  type="number"
                  value={String(babyDraft[key as keyof typeof babyDraft])}
                  onChange={(event) =>
                    setBabyDraft((state) => ({ ...state, [key]: Number(event.target.value) }))
                  }
                  className={inputClass}
                />
              </label>
            ))}
          </div>
          <Button type="submit" className="w-full">
            保存宝宝档案
          </Button>
        </form>
      </Card>

      <Card>
        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-nursery-mint text-brand-strong">
            <ShieldCheck className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-sm text-dark-gray">成员权限</p>
            <h2 className="text-[17px] font-semibold text-soft-charcoal">家庭成员权限</h2>
          </div>
        </div>
        <div className="space-y-3">
          {users.map((user) => (
            <div key={user.id} className="rounded-2xl border border-white/70 bg-warm-gray p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-soft-charcoal">{user.display_name}</p>
                  <p className="text-sm text-dark-gray">{roleLabel(user.role)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(['can_upload_photos', 'can_write_tracker'] as const).map((key) => (
                  <label key={key} className="flex min-h-11 items-center justify-between gap-2 rounded-2xl bg-white px-3 text-sm">
                    <span>{key === 'can_upload_photos' ? '上传照片' : '写入数据'}</span>
                    <input
                      type="checkbox"
                      checked={user.permissions[key]}
                      disabled={user.role !== 'family'}
                      className="h-5 w-5 accent-fawn-amber"
                      onChange={(event) =>
                        void onUpdatePermissions(user.id, {
                          ...user.permissions,
                          [key]: event.target.checked,
                        })
                      }
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
