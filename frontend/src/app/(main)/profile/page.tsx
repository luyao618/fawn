'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Baby as BabyIcon, Home, KeyRound, Plus, ShieldCheck, Trash2, UsersRound } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ProfileItemList } from '@/components/profile/ProfileItemList';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { accessTypeLabel, canManageFamily, canWriteTracker, getAgeDisplay, roleLabel } from '@/lib/utils';
import type { Baby, Family, ProfileItem, User, UserAccessType, UserCreate } from '@/lib/types';

const inputClass =
  'min-h-11 w-full rounded-2xl border border-oat-border bg-white px-3 outline-none transition-colors focus:border-fawn-amber';

const accessTypes: Array<{ value: UserAccessType; label: string }> = [
  { value: 'parent', label: '父母' },
  { value: 'family', label: '家人' },
  { value: 'friend', label: '朋友' },
];

export default function ProfilePage() {
  const currentUser = useAuthStore((state) => state.user);
  const canManage = canManageFamily(currentUser?.access_type);
  const canWriteProfile = canWriteTracker(currentUser?.access_type);
  const [family, setFamily] = useState<Family | null>(null);
  const [profile, setProfile] = useState<ProfileItem[]>([]);
  const [familyProfile, setFamilyProfile] = useState<ProfileItem[]>([]);
  const [baby, setBaby] = useState<Baby | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [familyName, setFamilyName] = useState('');
  const [babyDraft, setBabyDraft] = useState<Partial<Baby>>({});
  const [memberDraft, setMemberDraft] = useState<UserCreate>({
    username: '',
    display_name: '',
    password: '',
    access_type: 'family',
    role: '',
  });

  const load = useCallback(async () => {
    const [familyData, profileData, familyProfileData, babyData, usersData] = await Promise.all([
      api.getFamily(),
      api.getMyProfile(),
      api.getFamilyProfile(),
      api.getBaby(),
      api.getUsers(),
    ]);
    setFamily(familyData);
    setFamilyName(familyData.name);
    setProfile(profileData);
    setFamilyProfile(familyProfileData);
    setBaby(babyData);
    setBabyDraft(babyData);
    setUsers(usersData);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateFamily(event: FormEvent) {
    event.preventDefault();
    const updated = await api.updateFamily({ name: familyName });
    setFamily(updated);
  }

  async function updateBaby(event: FormEvent) {
    event.preventDefault();
    const updated = await api.updateBaby(babyDraft);
    setBaby(updated);
    setBabyDraft(updated);
  }

  async function createMember(event: FormEvent) {
    event.preventDefault();
    await api.createUser(memberDraft);
    setMemberDraft({ username: '', display_name: '', password: '', access_type: 'family', role: '' });
    setUsers(await api.getUsers());
  }

  async function updateMember(id: string, data: Partial<User>) {
    await api.updateUser(id, {
      display_name: data.display_name,
      role: data.role,
      access_type: data.access_type,
    });
    setUsers(await api.getUsers());
  }

  async function updatePassword(user: User) {
    const password = window.prompt(`为 ${user.display_name} 设置新密码`);
    if (!password) return;
    await api.updateUserPassword(user.id, password);
  }

  async function deleteMember(user: User) {
    if (!window.confirm(`确认删除 ${user.display_name} 的账号？历史记录会保留。`)) return;
    await api.deleteUser(user.id);
    setUsers(await api.getUsers());
  }

  return (
    <div className="space-y-5 px-4 py-4">
      <Card className="bg-gradient-to-br from-white to-fawn-amber-light">
        <div className="flex items-center gap-4">
          <Avatar
            label={currentUser?.display_name ?? '用户'}
            role={currentUser?.access_type ?? 'friend'}
            size="lg"
            src={currentUser?.avatar_url}
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-fawn-amber">{family?.name ?? '家庭设置'}</p>
            <h2 className="mt-1 truncate text-2xl font-semibold leading-tight text-soft-charcoal">
              {currentUser?.display_name ?? '家庭成员'}
            </h2>
            <p className="mt-1 text-sm text-dark-gray">
              {roleLabel(currentUser?.role)} · {accessTypeLabel(currentUser?.access_type)}
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-nursery-mint text-brand-strong">
            <Home className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-sm text-dark-gray">家庭组</p>
            <h2 className="text-[17px] font-semibold text-soft-charcoal">家庭数据边界</h2>
          </div>
        </div>
        <form onSubmit={updateFamily} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm text-dark-gray">家庭名称</span>
            <input
              value={familyName}
              onChange={(event) => setFamilyName(event.target.value)}
              disabled={!canManage}
              className={inputClass}
            />
          </label>
          {canManage ? (
            <Button type="submit" className="w-full">
              保存家庭名称
            </Button>
          ) : (
            <p className="text-sm text-dark-gray">当前账号可查看家庭资料，只有父母权限可以修改家庭设置。</p>
          )}
        </form>
      </Card>

      {baby ? (
        <Card>
          <div className="mb-4 flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-nursery-powder text-info-blue">
              <BabyIcon className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <p className="text-sm text-dark-gray">宝宝档案</p>
              <h2 className="text-[17px] font-semibold text-soft-charcoal">
                {baby.name} · {getAgeDisplay(baby.birth_date)}
              </h2>
            </div>
          </div>
          <form onSubmit={updateBaby} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-sm text-dark-gray">姓名</span>
                <input
                  value={babyDraft.name ?? ''}
                  disabled={!canManage}
                  onChange={(event) => setBabyDraft((state) => ({ ...state, name: event.target.value }))}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-dark-gray">出生日期</span>
                <input
                  type="date"
                  value={babyDraft.birth_date ?? ''}
                  disabled={!canManage}
                  onChange={(event) => setBabyDraft((state) => ({ ...state, birth_date: event.target.value }))}
                  className={inputClass}
                />
              </label>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                ['birth_weight_g', '体重(g)'],
                ['birth_height_cm', '身高(cm)'],
                ['birth_head_cm', '头围(cm)'],
              ].map(([key, label]) => (
                <label key={key} className="block">
                  <span className="mb-1 block text-xs text-dark-gray">{label}</span>
                  <input
                    type="number"
                    value={String(babyDraft[key as keyof Baby] ?? '')}
                    disabled={!canManage}
                    onChange={(event) =>
                      setBabyDraft((state) => ({ ...state, [key]: event.target.value ? Number(event.target.value) : null }))
                    }
                    className={inputClass}
                  />
                </label>
              ))}
            </div>
            {canManage ? (
              <Button type="submit" className="w-full">
                保存宝宝档案
              </Button>
            ) : null}
          </form>
        </Card>
      ) : null}

      <Card>
        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-nursery-mint text-brand-strong">
            <UsersRound className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-sm text-dark-gray">家庭成员</p>
            <h2 className="text-[17px] font-semibold text-soft-charcoal">账号与权限</h2>
          </div>
        </div>
        <div className="space-y-3">
          {users.map((member) => (
            <div key={member.id} className="rounded-2xl border border-white/70 bg-warm-gray p-3">
              <div className="mb-3 flex items-center gap-3">
                <Avatar label={member.display_name} role={member.access_type} src={member.avatar_url} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-soft-charcoal">{member.display_name}</p>
                  <p className="text-sm text-dark-gray">
                    {member.role} · {accessTypeLabel(member.access_type)}
                  </p>
                </div>
              </div>
              {canManage ? (
                <div className="grid gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      defaultValue={member.display_name}
                      onBlur={(event) => {
                        if (event.target.value !== member.display_name) void updateMember(member.id, { display_name: event.target.value });
                      }}
                      className={inputClass}
                      aria-label={`${member.display_name}昵称`}
                    />
                    <input
                      defaultValue={member.role}
                      onBlur={(event) => {
                        if (event.target.value !== member.role) void updateMember(member.id, { role: event.target.value });
                      }}
                      className={inputClass}
                      aria-label={`${member.display_name}角色`}
                    />
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={member.access_type}
                      onChange={(event) => void updateMember(member.id, { access_type: event.target.value as UserAccessType })}
                      className={`${inputClass} flex-1`}
                      aria-label={`${member.display_name}权限`}
                    >
                      {accessTypes.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => updatePassword(member)}
                      className="grid h-11 w-11 place-items-center rounded-full bg-white text-fawn-amber"
                      aria-label="修改密码"
                    >
                      <KeyRound className="h-4 w-4" />
                    </button>
                    {member.id !== currentUser?.id ? (
                      <button
                        type="button"
                        onClick={() => void deleteMember(member)}
                        className="grid h-11 w-11 place-items-center rounded-full bg-white text-dark-gray"
                        aria-label="删除账号"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>

        {canManage ? (
          <form onSubmit={createMember} className="mt-4 space-y-2 rounded-2xl bg-warm-gray p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-soft-charcoal">
              <Plus className="h-4 w-4" /> 新增账号
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                value={memberDraft.username}
                placeholder="用户名"
                required
                onChange={(event) => setMemberDraft((state) => ({ ...state, username: event.target.value }))}
                className={inputClass}
              />
              <input
                value={memberDraft.password}
                placeholder="初始密码"
                type="password"
                required
                onChange={(event) => setMemberDraft((state) => ({ ...state, password: event.target.value }))}
                className={inputClass}
              />
              <input
                value={memberDraft.display_name}
                placeholder="昵称"
                required
                onChange={(event) => setMemberDraft((state) => ({ ...state, display_name: event.target.value }))}
                className={inputClass}
              />
              <input
                value={memberDraft.role}
                placeholder="角色，如奶奶/医生"
                required
                onChange={(event) => setMemberDraft((state) => ({ ...state, role: event.target.value }))}
                className={inputClass}
              />
            </div>
            <select
              value={memberDraft.access_type}
              onChange={(event) => setMemberDraft((state) => ({ ...state, access_type: event.target.value as UserAccessType }))}
              className={inputClass}
            >
              {accessTypes.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <Button type="submit" className="w-full">
              创建账号
            </Button>
          </form>
        ) : null}
      </Card>

      <Card>
        <div className="mb-3 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-nursery-mint text-brand-strong">
            <ShieldCheck className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-sm text-dark-gray">权限说明</p>
            <h2 className="text-[17px] font-semibold text-soft-charcoal">父母、家人、朋友</h2>
          </div>
        </div>
        <div className="grid gap-2 text-sm">
          <p className="rounded-2xl bg-warm-gray p-3">父母：管理账号、宝宝档案、家庭记忆，并拥有所有日常权限。</p>
          <p className="rounded-2xl bg-warm-gray p-3">家人：记录数据、上传/下载照片、软删除普通数据，并和管家聊天。</p>
          <p className="rounded-2xl bg-warm-gray p-3">朋友：查看所有内容、下载照片、参与聊天，但不能写入或删除数据。</p>
        </div>
      </Card>

      <ProfileItemList
        items={familyProfile}
        eyebrow="共享上下文"
        title="家庭记忆"
        emptyText="暂无家庭记忆"
        onAdd={canManage ? async (content) => setFamilyProfile([await api.createFamilyProfileItem(content), ...familyProfile]) : undefined}
        onEdit={canManage ? async (id, content) => {
          const updated = await api.updateFamilyProfileItem(id, content);
          setFamilyProfile((items) => items.map((item) => (item.id === id ? updated : item)));
        } : undefined}
        onDelete={canManage ? async (id) => {
          await api.deleteFamilyProfileItem(id);
          setFamilyProfile((items) => items.filter((item) => item.id !== id));
        } : undefined}
      />

      <ProfileItemList
        items={profile}
        onAdd={canWriteProfile ? async (content) => setProfile([await api.createProfileItem(content), ...profile]) : undefined}
        onEdit={canWriteProfile ? async (id, content) => {
          const updated = await api.updateProfileItem(id, content);
          setProfile((items) => items.map((item) => (item.id === id ? updated : item)));
        } : undefined}
        onDelete={canWriteProfile ? async (id) => {
          await api.deleteProfileItem(id);
          setProfile((items) => items.filter((item) => item.id !== id));
        } : undefined}
      />
    </div>
  );
}
