'use client';

import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, UsersRound } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { FamilyMemberManager } from '@/components/profile/FamilyMemberManager';
import { ProfileItemList } from '@/components/profile/ProfileItemList';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { getAgeDisplay, roleLabel } from '@/lib/utils';
import type { Baby, ProfileItem, User, UserPermissions } from '@/lib/types';

export default function ProfilePage() {
  const user = useAuthStore((state) => state.user);
  const [profile, setProfile] = useState<ProfileItem[]>([]);
  const [baby, setBaby] = useState<Baby | null>(null);
  const [users, setUsers] = useState<User[]>([]);

  const load = useCallback(async () => {
    const [profileData, babyData] = await Promise.all([api.getMyProfile(), api.getBaby()]);
    setProfile(profileData);
    setBaby(babyData);
    if (user?.role === 'admin') {
      setUsers(await api.getUsers());
    }
  }, [user?.role]);

  useEffect(() => {
    void load();
  }, [load]);

  async function editProfile(id: string, content: string) {
    await api.updateProfileItem(id, content);
    setProfile(await api.getMyProfile());
  }

  async function deleteProfile(id: string) {
    await api.deleteProfileItem(id);
    setProfile(await api.getMyProfile());
  }

  async function updatePermissions(id: string, permissions: UserPermissions) {
    await api.updateUserPermissions(id, permissions);
    setUsers(await api.getUsers());
  }

  async function updateBaby(data: Partial<Baby>) {
    const updated = await api.updateBaby(data);
    setBaby(updated);
  }

  return (
    <div className="space-y-5 px-4 py-4">
      <Card className="bg-gradient-to-br from-white to-fawn-amber-light">
        <div className="flex items-center gap-4">
        <Avatar label={user?.display_name ?? '用户'} role={user?.role ?? 'family'} size="lg" src={user?.avatar_url} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-fawn-amber">家庭与隐私</p>
            <h2 className="mt-1 truncate text-2xl font-semibold leading-tight text-soft-charcoal">
              {user?.display_name ?? '家庭成员'}
            </h2>
            <p className="mt-1 text-sm text-dark-gray">{roleLabel(user?.role ?? 'family')}</p>
          </div>
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-nursery-mint text-brand-strong">
            <ShieldCheck className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-sm text-dark-gray">当前权限</p>
            <h2 className="text-[17px] font-semibold text-soft-charcoal">家庭数据边界</h2>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl bg-warm-gray p-3">
            <p className="text-dark-gray">相册上传</p>
            <p className="mt-1 font-semibold text-soft-charcoal">
              {user?.role === 'admin' || user?.role === 'parent' || user?.permissions.can_upload_photos ? '允许' : '关闭'}
            </p>
          </div>
          <div className="rounded-2xl bg-warm-gray p-3">
            <p className="text-dark-gray">记录写入</p>
            <p className="mt-1 font-semibold text-soft-charcoal">
              {user?.role === 'admin' || user?.role === 'parent' || user?.permissions.can_write_tracker ? '允许' : '关闭'}
            </p>
          </div>
        </div>
      </Card>

      {baby ? (
        user?.role === 'admin' ? (
          <FamilyMemberManager
            users={users}
            baby={baby}
            onUpdatePermissions={updatePermissions}
            onUpdateBaby={updateBaby}
          />
        ) : (
          <Card>
            <div className="mb-3 flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-nursery-powder text-info-blue">
                <UsersRound className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <p className="text-sm text-dark-gray">宝宝档案</p>
                <h2 className="text-[17px] font-semibold text-soft-charcoal">{baby.name}</h2>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-dark-gray">姓名</p>
                <p className="font-semibold">{baby.name}</p>
              </div>
              <div>
                <p className="text-dark-gray">月龄</p>
                <p className="font-semibold">{getAgeDisplay(baby.birth_date)}</p>
              </div>
              <div>
                <p className="text-dark-gray">出生体重</p>
                <p className="font-semibold">{baby.birth_weight_g ?? '暂无'}g</p>
              </div>
              <div>
                <p className="text-dark-gray">是否早产</p>
                <p className="font-semibold">{baby.is_premature ? '是' : '否'}</p>
              </div>
            </div>
          </Card>
        )
      ) : null}

      <ProfileItemList items={profile} onEdit={editProfile} onDelete={deleteProfile} />
    </div>
  );
}
