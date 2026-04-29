'use client';

import { useCallback, useEffect, useState } from 'react';
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
    <div className="space-y-4 px-4 py-4">
      <Card className="flex items-center gap-4">
        <Avatar label={user?.display_name ?? '用户'} role={user?.role ?? 'family'} size="lg" src={user?.avatar_url} />
        <div>
          <p className="text-lg font-semibold">{user?.display_name ?? '家庭成员'}</p>
          <p className="text-sm text-dark-gray">{roleLabel(user?.role ?? 'family')}</p>
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
            <h2 className="mb-3 text-[17px] font-semibold">宝宝档案</h2>
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
