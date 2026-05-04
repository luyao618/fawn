'use client';

import { FormEvent, ReactNode, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Baby as BabyIcon,
  BookOpen,
  Brain,
  ChevronRight,
  HelpCircle,
  KeyRound,
  LogOut,
  Pencil,
  Plus,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { accessTypeLabel, canManageFamily, getAgeDisplay, roleLabel } from '@/lib/utils';
import type { Baby, Family, MemoryFileSummary, User, UserAccessType, UserCreate } from '@/lib/types';

const inputClass =
  'min-h-11 w-full rounded-2xl border border-oat-border bg-white px-3 outline-none transition-colors focus:border-fawn-amber';
const compactInputClass =
  'min-h-10 w-full rounded-xl border border-oat-border bg-white px-3 text-sm outline-none transition-colors focus:border-fawn-amber';
const subtleButtonClass =
  'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full bg-white/55 px-3 text-sm font-medium text-dark-gray transition-colors active:bg-white/80';
const quietActionButtonClass =
  'inline-flex h-9 items-center gap-1 rounded-full border border-oat-border bg-white/80 px-3 text-sm font-semibold text-dark-gray transition-colors active:bg-warm-gray';
const iconButtonClass =
  'grid h-9 w-9 place-items-center rounded-full border border-oat-border bg-white/80 text-dark-gray shadow-sm transition-colors active:bg-warm-gray';

const accessTypes: Array<{ value: UserAccessType; label: string; caption: string }> = [
  { value: 'parent', label: '父母', caption: '管理账号' },
  { value: 'family', label: '家人', caption: '记录数据' },
  { value: 'friend', label: '朋友', caption: '只读查看' },
];

const emptyMemberDraft: UserCreate = {
  username: '',
  display_name: '',
  password: '',
  access_type: 'family',
  role: '',
};

function memoryIcon(kind: MemoryFileSummary['kind']) {
  if (kind === 'soul') return <Brain className="h-5 w-5" aria-hidden />;
  if (kind === 'baby') return <BabyIcon className="h-5 w-5" aria-hidden />;
  if (kind === 'user') return <UserRound className="h-5 w-5" aria-hidden />;
  return <BookOpen className="h-5 w-5" aria-hidden />;
}

function AccessTypePicker({
  value,
  onChange,
}: {
  value: UserAccessType;
  onChange: (value: UserAccessType) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="权限类型">
      {accessTypes.map((item) => {
        const selected = value === item.value;
        return (
          <button
            key={item.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(item.value)}
            className={[
              'min-h-[52px] rounded-2xl border px-2 py-2 text-center transition-colors',
              selected
                ? 'border-brand-strong bg-nursery-mint text-brand-strong shadow-card'
                : 'border-oat-border bg-white text-dark-gray',
            ].join(' ')}
          >
            <span className="block text-sm font-semibold">{item.label}</span>
            <span className="mt-0.5 block text-[11px] leading-tight opacity-75">{item.caption}</span>
          </button>
        );
      })}
    </div>
  );
}

function Modal({
  title,
  eyebrow,
  children,
  onClose,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-soft-charcoal/35 px-3 pb-[calc(16px+var(--safe-area-bottom))] pt-8 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-modal-title"
        className="w-full max-w-[430px] rounded-3xl bg-white p-4 shadow-modal"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {eyebrow ? <p className="truncate text-sm text-dark-gray">{eyebrow}</p> : null}
            <h3 id="profile-modal-title" className="truncate text-lg font-semibold text-soft-charcoal">
              {title}
            </h3>
          </div>
          <button type="button" onClick={onClose} className={iconButtonClass} aria-label="关闭">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const currentUser = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const canManage = canManageFamily(currentUser?.access_type);
  const [family, setFamily] = useState<Family | null>(null);
  const [baby, setBaby] = useState<Baby | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [memoryFiles, setMemoryFiles] = useState<MemoryFileSummary[]>([]);
  const [familyName, setFamilyName] = useState('');
  const [babyDraft, setBabyDraft] = useState<Partial<Baby>>({});
  const [memberDraft, setMemberDraft] = useState<UserCreate>(emptyMemberDraft);
  const [isFamilyEditorOpen, setIsFamilyEditorOpen] = useState(false);
  const [isBabyEditorOpen, setIsBabyEditorOpen] = useState(false);
  const [isCreateMemberOpen, setIsCreateMemberOpen] = useState(false);
  const [isPermissionHelpOpen, setIsPermissionHelpOpen] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState<User | null>(null);
  const [passwordDraft, setPasswordDraft] = useState('');
  const [editingMember, setEditingMember] = useState<User | null>(null);
  const [memberEditDraft, setMemberEditDraft] = useState({
    display_name: '',
    role: '',
    access_type: 'family' as UserAccessType,
    password: '',
  });

  const load = useCallback(async () => {
    const [familyData, babyData, usersData, memoryData] = await Promise.all([
      api.getFamily(),
      api.getBaby(),
      api.getUsers(),
      api.getMemoryFiles(),
    ]);
    setFamily(familyData);
    setFamilyName(familyData.name);
    setBaby(babyData);
    setBabyDraft(babyData);
    setUsers(usersData);
    setMemoryFiles(memoryData);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openFamilyEditor() {
    setFamilyName(family?.name ?? '');
    setIsFamilyEditorOpen(true);
  }

  function openBabyEditor() {
    if (baby) setBabyDraft(baby);
    setIsBabyEditorOpen(true);
  }

  function openCreateMember() {
    setMemberDraft(emptyMemberDraft);
    setIsCreateMemberOpen(true);
  }

  function openMemberEditor(member: User) {
    setEditingMember(member);
    setMemberEditDraft({
      display_name: member.display_name,
      role: member.role,
      access_type: member.access_type,
      password: '',
    });
  }

  function openPasswordEditor(user: User) {
    setPasswordTarget(user);
    setPasswordDraft('');
  }

  function handleLogout() {
    logout();
    router.replace('/login');
  }

  async function updateFamily(event: FormEvent) {
    event.preventDefault();
    const updated = await api.updateFamily({ name: familyName });
    setFamily(updated);
    setIsFamilyEditorOpen(false);
  }

  async function updateBaby(event: FormEvent) {
    event.preventDefault();
    const updated = await api.updateBaby(babyDraft);
    setBaby(updated);
    setBabyDraft(updated);
    setIsBabyEditorOpen(false);
  }

  async function updateCurrentPassword(event: FormEvent) {
    event.preventDefault();
    if (!passwordTarget || !passwordDraft.trim()) return;
    await api.updateUserPassword(passwordTarget.id, passwordDraft.trim());
    setPasswordTarget(null);
    setPasswordDraft('');
  }

  async function createMember(event: FormEvent) {
    event.preventDefault();
    await api.createUser(memberDraft);
    setMemberDraft(emptyMemberDraft);
    setIsCreateMemberOpen(false);
    setUsers(await api.getUsers());
  }

  async function updateMember(event: FormEvent) {
    event.preventDefault();
    if (!editingMember) return;
    await api.updateUser(editingMember.id, {
      display_name: memberEditDraft.display_name,
      role: memberEditDraft.role,
      access_type: memberEditDraft.access_type,
    });
    if (memberEditDraft.password.trim()) {
      await api.updateUserPassword(editingMember.id, memberEditDraft.password.trim());
    }
    setEditingMember(null);
    setUsers(await api.getUsers());
  }

  async function deleteMember(user: User) {
    if (!window.confirm(`确认删除 ${user.display_name} 的账号？历史记录会保留。`)) return;
    await api.deleteUser(user.id);
    setEditingMember(null);
    setUsers(await api.getUsers());
  }

  return (
    <div className="space-y-5 px-4 py-4">
      <Card className="bg-gradient-to-br from-white to-fawn-amber-light">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-2xl font-semibold leading-tight text-soft-charcoal">
              {family?.name ?? '家庭设置'}
            </h2>
            <p className="mt-2 truncate text-sm text-dark-gray">
              {currentUser?.display_name ?? '家庭成员'} · {roleLabel(currentUser?.role)} · {accessTypeLabel(currentUser?.access_type)}
            </p>
          </div>
          {canManage ? (
            <button type="button" onClick={openFamilyEditor} className={iconButtonClass} aria-label="修改家庭名称">
              <Pencil className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </div>
        <div className={canManage ? 'mt-4 grid grid-cols-2 gap-2' : 'mt-4 flex'}>
          {canManage && currentUser ? (
            <button type="button" onClick={() => openPasswordEditor(currentUser)} className={subtleButtonClass}>
              <KeyRound className="h-4 w-4" aria-hidden />
              修改密码
            </button>
          ) : null}
          <button type="button" onClick={handleLogout} className={subtleButtonClass}>
            <LogOut className="h-4 w-4" aria-hidden />
            登出账户
          </button>
        </div>
      </Card>

      <Card>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-nursery-mint text-brand-strong">
              <UsersRound className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm text-dark-gray">家庭成员</p>
              <h2 className="text-[17px] font-semibold text-soft-charcoal">账号与权限</h2>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setIsPermissionHelpOpen(true)}
              className={iconButtonClass}
              aria-label="查看权限说明"
            >
              <HelpCircle className="h-4 w-4" aria-hidden />
            </button>
            {canManage ? (
              <button
                type="button"
                onClick={openCreateMember}
                className={quietActionButtonClass}
              >
                <Plus className="h-4 w-4" aria-hidden />
                新增
              </button>
            ) : null}
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-oat-border bg-white">
          {users.map((member) => (
            <button
              key={member.id}
              type="button"
              onClick={canManage ? () => openMemberEditor(member) : undefined}
              disabled={!canManage}
              className="grid w-full grid-cols-[minmax(0,1.25fr)_minmax(3.75rem,0.8fr)_auto] items-center gap-3 border-b border-oat-border/70 px-3 py-3 text-left last:border-b-0 disabled:cursor-default sm:grid-cols-[minmax(0,1.4fr)_minmax(5rem,0.8fr)_auto]"
              aria-label={canManage ? `编辑${member.display_name}` : undefined}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-soft-charcoal">{member.display_name}</span>
                <span className="block truncate text-xs text-dark-gray">@{member.username}</span>
              </span>
              <span className="min-w-0 truncate text-sm text-dark-gray">{roleLabel(member.role)}</span>
              <span className="flex items-center gap-1">
                <span className="whitespace-nowrap rounded-full bg-warm-gray px-2.5 py-1 text-xs font-semibold text-soft-charcoal">
                  {accessTypeLabel(member.access_type).replace('权限', '')}
                </span>
                {canManage ? <ChevronRight className="h-4 w-4 text-mid-gray" aria-hidden /> : null}
              </span>
            </button>
          ))}
        </div>
      </Card>

      {baby ? (
        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-nursery-powder text-info-blue">
                <BabyIcon className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm text-dark-gray">宝宝档案</p>
                <h2 className="truncate text-[17px] font-semibold text-soft-charcoal">
                  {baby.name} · {getAgeDisplay(baby.birth_date)}
                </h2>
              </div>
            </div>
            {canManage ? (
              <button type="button" onClick={openBabyEditor} className={iconButtonClass} aria-label="修改宝宝档案">
                <Pencil className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-2xl bg-warm-gray px-2 py-3">
              <p className="text-xs text-dark-gray">出生体重</p>
              <p className="mt-1 font-semibold text-soft-charcoal">{baby.birth_weight_g ? `${baby.birth_weight_g}g` : '暂无'}</p>
            </div>
            <div className="rounded-2xl bg-warm-gray px-2 py-3">
              <p className="text-xs text-dark-gray">身高</p>
              <p className="mt-1 font-semibold text-soft-charcoal">{baby.birth_height_cm ? `${baby.birth_height_cm}cm` : '暂无'}</p>
            </div>
            <div className="rounded-2xl bg-warm-gray px-2 py-3">
              <p className="text-xs text-dark-gray">头围</p>
              <p className="mt-1 font-semibold text-soft-charcoal">{baby.birth_head_cm ? `${baby.birth_head_cm}cm` : '暂无'}</p>
            </div>
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-nursery-butter text-warning-amber">
            <BookOpen className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm text-dark-gray">长期记忆</p>
            <h2 className="text-[17px] font-semibold text-soft-charcoal">Markdown 文件</h2>
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-oat-border bg-white">
          {memoryFiles.map((file) => (
            <button
              key={file.id}
              type="button"
              onClick={() => router.push(`/profile/memory/${encodeURIComponent(file.id)}`)}
              className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-oat-border/70 px-3 py-3 text-left last:border-b-0"
            >
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-warm-gray text-fawn-amber">
                {memoryIcon(file.kind)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-soft-charcoal">{file.label}</span>
                <span className="block truncate text-xs text-dark-gray">
                  {file.can_edit ? '可编辑' : '只读'}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 text-mid-gray" aria-hidden />
            </button>
          ))}
        </div>
      </Card>

      {isFamilyEditorOpen ? (
        <Modal title="修改家庭名称" onClose={() => setIsFamilyEditorOpen(false)}>
          <form onSubmit={updateFamily} className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-xs text-dark-gray">家庭名称</span>
              <input value={familyName} required onChange={(event) => setFamilyName(event.target.value)} className={inputClass} />
            </label>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setIsFamilyEditorOpen(false)} className="flex-1">
                取消
              </Button>
              <Button type="submit" className="flex-1">
                保存
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {passwordTarget ? (
        <Modal title="修改密码" eyebrow={passwordTarget.display_name} onClose={() => setPasswordTarget(null)}>
          <form onSubmit={updateCurrentPassword} className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-xs text-dark-gray">新密码</span>
              <input
                value={passwordDraft}
                type="password"
                required
                minLength={6}
                onChange={(event) => setPasswordDraft(event.target.value)}
                className={inputClass}
              />
            </label>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setPasswordTarget(null)} className="flex-1">
                取消
              </Button>
              <Button type="submit" className="flex-1">
                保存
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {isBabyEditorOpen ? (
        <Modal title="修改宝宝档案" eyebrow={baby?.name} onClose={() => setIsBabyEditorOpen(false)}>
          <form onSubmit={updateBaby} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs text-dark-gray">姓名</span>
                <input
                  value={babyDraft.name ?? ''}
                  required
                  onChange={(event) => setBabyDraft((state) => ({ ...state, name: event.target.value }))}
                  className={compactInputClass}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-dark-gray">出生日期</span>
                <input
                  type="date"
                  value={babyDraft.birth_date ?? ''}
                  required
                  onChange={(event) => setBabyDraft((state) => ({ ...state, birth_date: event.target.value }))}
                  className={compactInputClass}
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
                    onChange={(event) =>
                      setBabyDraft((state) => ({ ...state, [key]: event.target.value ? Number(event.target.value) : null }))
                    }
                    className={compactInputClass}
                  />
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setIsBabyEditorOpen(false)} className="flex-1">
                取消
              </Button>
              <Button type="submit" className="flex-1">
                保存
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {isPermissionHelpOpen ? (
        <Modal title="权限说明" eyebrow="父母、家人、朋友" onClose={() => setIsPermissionHelpOpen(false)}>
          <div className="grid gap-2 text-sm">
            <p className="rounded-2xl bg-warm-gray p-3">父母：管理账号、修改密码、宝宝档案和长期记忆，并拥有所有日常权限。</p>
            <p className="rounded-2xl bg-warm-gray p-3">家人：记录数据、上传/下载照片、软删除普通数据，并和管家聊天。</p>
            <p className="rounded-2xl bg-warm-gray p-3">朋友：查看所有内容、下载照片、参与聊天，但不能写入或删除数据。</p>
          </div>
        </Modal>
      ) : null}

      {isCreateMemberOpen ? (
        <Modal title="新增账号" eyebrow="家庭成员" onClose={() => setIsCreateMemberOpen(false)}>
          <form onSubmit={createMember} className="space-y-4">
            <div className="grid gap-3">
              <label className="block">
                <span className="mb-1 block text-xs text-dark-gray">用户名</span>
                <input
                  value={memberDraft.username}
                  required
                  onChange={(event) => setMemberDraft((state) => ({ ...state, username: event.target.value }))}
                  className={compactInputClass}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-dark-gray">初始密码</span>
                <input
                  value={memberDraft.password}
                  type="password"
                  required
                  minLength={6}
                  onChange={(event) => setMemberDraft((state) => ({ ...state, password: event.target.value }))}
                  className={compactInputClass}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-dark-gray">昵称</span>
                  <input
                    value={memberDraft.display_name}
                    required
                    onChange={(event) => setMemberDraft((state) => ({ ...state, display_name: event.target.value }))}
                    className={compactInputClass}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-dark-gray">角色</span>
                  <input
                    value={memberDraft.role}
                    required
                    placeholder="奶奶/医生"
                    onChange={(event) => setMemberDraft((state) => ({ ...state, role: event.target.value }))}
                    className={compactInputClass}
                  />
                </label>
              </div>
              <div>
                <p className="mb-1 text-xs text-dark-gray">权限类型</p>
                <AccessTypePicker
                  value={memberDraft.access_type}
                  onChange={(access_type) => setMemberDraft((state) => ({ ...state, access_type }))}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setIsCreateMemberOpen(false)} className="flex-1">
                取消
              </Button>
              <Button type="submit" className="flex-1">
                创建
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {editingMember ? (
        <Modal title="编辑账号" eyebrow={`@${editingMember.username}`} onClose={() => setEditingMember(null)}>
          <form onSubmit={updateMember} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs text-dark-gray">昵称</span>
                <input
                  value={memberEditDraft.display_name}
                  required
                  onChange={(event) => setMemberEditDraft((state) => ({ ...state, display_name: event.target.value }))}
                  className={compactInputClass}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-dark-gray">角色</span>
                <input
                  value={memberEditDraft.role}
                  required
                  onChange={(event) => setMemberEditDraft((state) => ({ ...state, role: event.target.value }))}
                  className={compactInputClass}
                />
              </label>
            </div>
            <div>
              <p className="mb-1 text-xs text-dark-gray">权限类型</p>
              <AccessTypePicker
                value={memberEditDraft.access_type}
                onChange={(access_type) => setMemberEditDraft((state) => ({ ...state, access_type }))}
              />
            </div>
            <label className="block">
              <span className="mb-1 flex items-center gap-1 text-xs text-dark-gray">
                <KeyRound className="h-3.5 w-3.5" aria-hidden />
                新密码
              </span>
              <input
                value={memberEditDraft.password}
                type="password"
                placeholder="不修改可留空"
                onChange={(event) => setMemberEditDraft((state) => ({ ...state, password: event.target.value }))}
                className={compactInputClass}
              />
            </label>
            <div className="flex gap-2">
              {editingMember.id !== currentUser?.id ? (
                <button
                  type="button"
                  onClick={() => void deleteMember(editingMember)}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-oat-border bg-white px-3 text-sm font-semibold text-dark-gray"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                  删除
                </button>
              ) : null}
              <Button type="button" variant="secondary" onClick={() => setEditingMember(null)} className="flex-1">
                取消
              </Button>
              <Button type="submit" className="flex-1">
                保存
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
