import {
  currentMockTime,
  makeLoginResponse,
  mockBaby,
  mockConversations,
  mockDashboardSummary,
  mockFamily,
  mockFeedingRecords,
  mockFeedingStats,
  mockGrowthChart,
  mockGrowthRecords,
  mockHealthRecords,
  mockMessages,
  mockPassword,
  mockPhotos,
  mockProfileItems,
  mockSSEEventsFor,
  mockSleepRecords,
  mockSleepStats,
  mockUsers,
} from './mock-data';
import { createMockSSEResponse } from './sse';
import type {
  Baby,
  Conversation,
  DashboardSummary,
  FeedingRecordCreate,
  FeedingRecord,
  FeedingStatsData,
  Family,
  GrowthRecordCreate,
  GrowthChartData,
  GrowthReferenceP50,
  GrowthRecord,
  HealthRecordCreate,
  HealthRecord,
  LoginRequest,
  LoginResponse,
  Message,
  MessageSearchResult,
  PaginatedResponse,
  Photo,
  PhotoDownloadResponse,
  PhotoTag,
  ProfileItem,
  SleepRecordCreate,
  SleepRecord,
  SleepStatsData,
  TrackerType,
  User,
  UserAccessType,
  UserCreate,
  UserPermissions,
  UserUpdate,
} from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

type AuthTokenGetter = () => string | null;
type UnauthorizedHandler = () => void;

let getAuthToken: AuthTokenGetter = () => {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('access_token');
};

let onUnauthorized: UnauthorizedHandler = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem('access_token');
  if (window.location.pathname !== '/login') window.location.assign('/login');
};

export function configureApiAuth(options: {
  getToken?: AuthTokenGetter;
  onUnauthorized?: UnauthorizedHandler;
}) {
  if (options.getToken) getAuthToken = options.getToken;
  if (options.onUnauthorized) onUnauthorized = options.onUnauthorized;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function delay() {
  const ms = process.env.NODE_ENV === 'test' ? 1 : 200 + Math.floor(Math.random() * 300);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isMockMode() {
  return process.env.NEXT_PUBLIC_USE_MOCK !== 'false';
}

function tokenToUser(token: string | null): User | null {
  if (!token?.startsWith('mock-token-')) return null;
  const username = token.replace('mock-token-', '');
  return mockUsers.find((user) => user.username === username) ?? null;
}

function currentUserAccessType(): UserAccessType {
  return tokenToUser(getAuthToken())?.access_type ?? 'parent';
}

function requireMockUser(): User {
  const user = tokenToUser(getAuthToken());
  if (!user) {
    onUnauthorized();
    throw new ApiError(401, '登录已过期，请重新登录');
  }
  return user;
}

function paginate<T>(items: T[], page = 1, page_size = 20): PaginatedResponse<T> {
  const start = (page - 1) * page_size;
  return {
    items: clone(items.slice(start, start + page_size)),
    total: items.length,
    page,
    page_size,
  };
}

function recordMatchesType(type: TrackerType) {
  if (type === 'growth') return mockGrowthRecords;
  if (type === 'feeding') return mockFeedingRecords;
  if (type === 'sleep') return mockSleepRecords;
  return mockHealthRecords;
}

function dateKey(value: string) {
  return value.slice(0, 10);
}

function ageDisplay(ageDays: number) {
  const months = Math.floor(ageDays / 30);
  const days = ageDays % 30;
  return months <= 0 ? `${days}天` : `${months}个月${days}天`;
}

function interpolateP50(
  lines: GrowthChartData['who_reference']['weight'],
  ageMonths: number,
): number | null {
  const points = lines.p50;
  if (points.length === 0 || ageMonths < points[0].age_months || ageMonths > points[points.length - 1].age_months) {
    return null;
  }

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (Math.abs(point.age_months - ageMonths) < 1e-9) return point.value;
    if (point.age_months > ageMonths) {
      const previous = points[index - 1] ?? point;
      const span = point.age_months - previous.age_months;
      if (span <= 0) return point.value;
      return Number((previous.value + ((ageMonths - previous.age_months) / span) * (point.value - previous.value)).toFixed(2));
    }
  }
  return points[points.length - 1].value;
}

function currentMockDate() {
  return dateKey(currentMockTime());
}

function ensureMockTrackerWrite() {
  const user = requireMockUser();
  if (user.access_type !== 'parent' && user.access_type !== 'family') {
    throw new ApiError(403, '没有记录权限');
  }
}

function ensureMockProfileWrite() {
  const user = requireMockUser();
  if (user.access_type !== 'parent' && user.access_type !== 'family') {
    throw new ApiError(403, '没有画像写入权限');
  }
}

function ensureMockPhotoWrite() {
  const user = requireMockUser();
  if (user.access_type !== 'parent' && user.access_type !== 'family') {
    throw new ApiError(403, '没有照片写入权限');
  }
}

function ensureMockFamilyManage() {
  const user = requireMockUser();
  if (user.access_type !== 'parent') {
    throw new ApiError(403, '没有家庭管理权限');
  }
}

function refreshMockGrowthViews(record: GrowthRecord) {
  mockGrowthChart.records = mockGrowthRecords
    .map((item) => ({
      date: item.measurement_date,
      weight_g: item.weight_g,
      height_cm: item.height_cm,
      head_cm: item.head_cm,
    }))
    .sort((left, right) => left.date.localeCompare(right.date));

  const latest = mockGrowthRecords.reduce((current, item) => {
    return item.measurement_date > current.measurement_date ? item : current;
  }, mockGrowthRecords[0]);

  if (latest?.id === record.id || latest?.measurement_date === record.measurement_date) {
    mockDashboardSummary.latest_growth = latest.weight_g
      ? {
          date: latest.measurement_date,
          weight_g: latest.weight_g,
          weight_percentile: latest.weight_percentile ?? 0,
          height_cm: latest.height_cm ?? 0,
          height_percentile: latest.height_percentile ?? 0,
        }
      : null;
  }
}

function refreshMockFeedingViews(record: FeedingRecord) {
  if (record.feed_type === 'solid') return;

  const date = dateKey(record.feed_time);
  const amount = record.feed_type === 'formula' ? record.amount_ml ?? 0 : 0;
  const breastDuration = record.feed_type === 'breast' ? record.duration_min ?? 0 : 0;
  const daily = mockFeedingStats.daily.find((item) => item.date === date);
  if (daily) {
    daily.total_ml += amount;
    daily.breast_duration_min += breastDuration;
    daily.count += 1;
  } else {
    mockFeedingStats.daily.push({ date, total_ml: amount, breast_duration_min: breastDuration, count: 1 });
    mockFeedingStats.daily.sort((left, right) => left.date.localeCompare(right.date));
  }
  mockFeedingStats.average_daily_ml = Math.round(
    mockFeedingStats.daily.reduce((total, item) => total + item.total_ml, 0) / mockFeedingStats.daily.length,
  );
  mockFeedingStats.average_daily_breast_duration_min = Number(
    (
      mockFeedingStats.daily.reduce((total, item) => total + item.breast_duration_min, 0) /
      mockFeedingStats.daily.length
    ).toFixed(1),
  );
  mockFeedingStats.average_daily_count = Number(
    (
      mockFeedingStats.daily.reduce((total, item) => total + item.count, 0) / mockFeedingStats.daily.length
    ).toFixed(1),
  );

  if (date === currentMockDate()) {
    mockDashboardSummary.today_feeding.total_ml += amount;
    mockDashboardSummary.today_feeding.breast_duration_min += breastDuration;
    mockDashboardSummary.today_feeding.count += 1;
    if (
      !mockDashboardSummary.today_feeding.last_feed_time ||
      record.feed_time > mockDashboardSummary.today_feeding.last_feed_time
    ) {
      mockDashboardSummary.today_feeding.last_feed_time = record.feed_time;
    }
  }
}

function refreshMockSleepViews(record: SleepRecord) {
  const date = dateKey(record.sleep_start);
  const start = new Date(record.sleep_start).getTime();
  const end = record.sleep_end ? new Date(record.sleep_end).getTime() : start;
  const hours = Math.max(0, (end - start) / 1000 / 60 / 60);
  const nightWakings = record.sleep_type === 'night' ? record.night_wakings : null;
  const daily = mockSleepStats.daily.find((item) => item.date === date);
  if (daily) {
    daily.total_hours = Number(((daily.total_hours ?? 0) + hours).toFixed(1));
    if (nightWakings != null) daily.night_wakings = (daily.night_wakings ?? 0) + nightWakings;
  } else {
    mockSleepStats.daily.push({ date, total_hours: Number(hours.toFixed(1)), night_wakings: nightWakings });
    mockSleepStats.daily.sort((left, right) => left.date.localeCompare(right.date));
  }
  const recordedSleepDays = mockSleepStats.daily.filter((item) => item.total_hours != null);
  const wakingDays = mockSleepStats.daily.filter((item) => item.night_wakings != null);
  mockSleepStats.average_daily_hours =
    recordedSleepDays.length > 0
      ? Number(
          (
            recordedSleepDays.reduce((total, item) => total + (item.total_hours ?? 0), 0) / recordedSleepDays.length
          ).toFixed(1),
        )
      : null;
  mockSleepStats.average_night_wakings =
    wakingDays.length > 0
      ? Number(
          (
            wakingDays.reduce((total, item) => total + (item.night_wakings ?? 0), 0) / wakingDays.length
          ).toFixed(1),
        )
      : null;

  if (date === currentMockDate()) {
    mockDashboardSummary.today_sleep.total_hours = Number(
      ((mockDashboardSummary.today_sleep.total_hours ?? 0) + hours).toFixed(1),
    );
    if (nightWakings != null) {
      mockDashboardSummary.today_sleep.night_wakings =
        (mockDashboardSummary.today_sleep.night_wakings ?? 0) + nightWakings;
    }
  }
}

export class ApiClient {
  private getHeaders(isMultipart?: boolean): HeadersInit {
    const headers: Record<string, string> = {};
    if (!isMultipart) headers['Content-Type'] = 'application/json';
    const token = getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        ...this.getHeaders(options.body instanceof FormData),
        ...options.headers,
      },
    });

    if (response.status === 401) {
      onUnauthorized();
      throw new ApiError(401, '登录已过期，请重新登录');
    }

    if (!response.ok) {
      const body = await response.json().catch(() => ({ message: response.statusText }));
      throw new ApiError(response.status, String(body.message ?? '请求失败'));
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  async login(data: LoginRequest): Promise<LoginResponse> {
    if (!isMockMode()) {
      return this.request<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    }

    await delay();
    const user = mockUsers.find((item) => item.username === data.username);
    if (!user || data.password !== mockPassword) {
      throw new ApiError(401, '用户名或密码错误');
    }
    return clone(makeLoginResponse(user));
  }

  async refreshToken(): Promise<{ access_token: string }> {
    if (!isMockMode()) return this.request('/auth/refresh', { method: 'POST' });
    await delay();
    const user = tokenToUser(getAuthToken());
    if (!user) {
      onUnauthorized();
      throw new ApiError(401, '登录已过期，请重新登录');
    }
    return { access_token: `mock-token-${user.username}` };
  }

  async getMe(): Promise<User> {
    if (!isMockMode()) return this.request<User>('/auth/me');
    await delay();
    const user = tokenToUser(getAuthToken());
    if (!user) {
      onUnauthorized();
      throw new ApiError(401, '登录已过期，请重新登录');
    }
    return clone(user);
  }

  async createConversation(): Promise<Conversation> {
    if (!isMockMode()) return this.request('/chat/conversations', { method: 'POST' });
    await delay();
    const conversation: Conversation = {
      id: `conv-${Date.now()}`,
      started_at: currentMockTime(),
      ended_at: null,
      is_active: true,
      summary: null,
      message_count: 0,
    };
    mockConversations.unshift(conversation);
    return clone(conversation);
  }

  async getConversations(page = 1): Promise<PaginatedResponse<Conversation>> {
    if (!isMockMode()) return this.request(`/chat/conversations?page=${page}`);
    await delay();
    return paginate(mockConversations, page);
  }

  async getConversation(id: string): Promise<{ conversation: Conversation; messages: Message[] }> {
    if (!isMockMode()) return this.request(`/chat/conversations/${id}`);
    await delay();
    const conversation = mockConversations.find((item) => item.id === id);
    if (!conversation) throw new ApiError(404, '对话不存在');
    return {
      conversation: clone(conversation),
      messages: clone(mockMessages.filter((message) => message.conversation_id === id)),
    };
  }

  async sendMessage(conversationId: string, content: string, imageUrl?: string): Promise<Response> {
    if (!isMockMode()) {
      const response = await fetch(`${API_BASE}/chat/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ content, image_url: imageUrl }),
      });
      if (response.status === 401) onUnauthorized();
      return response;
    }

    await delay();
    const accessType = currentUserAccessType();
    return createMockSSEResponse(mockSSEEventsFor(content, accessType));
  }

  async uploadChatImage(conversationId: string, file: File): Promise<{ image_url: string; mime_type: string }> {
    if (!isMockMode()) {
      const form = new FormData();
      form.append('file', file);
      return this.request(`/chat/conversations/${conversationId}/images`, {
        method: 'POST',
        body: form,
      });
    }
    await delay();
    return { image_url: `/mock-upload/${encodeURIComponent(file.name)}`, mime_type: file.type || 'image/jpeg' };
  }

  async searchMessages(query: string): Promise<PaginatedResponse<MessageSearchResult>> {
    if (!isMockMode()) return this.request(`/chat/messages/search?q=${encodeURIComponent(query)}`);
    await delay();
    const results = mockMessages
      .filter((message) => message.content.includes(query))
      .map((message) => {
        const conversation = mockConversations.find((item) => item.id === message.conversation_id);
        return { ...message, conversation_started_at: conversation?.started_at ?? message.created_at };
      });
    return paginate(results);
  }

  async getGrowthRecords(): Promise<GrowthRecord[]> {
    if (!isMockMode()) return this.request('/tracker/growth');
    await delay();
    return clone(mockGrowthRecords);
  }

  async getFeedingRecords(date?: string): Promise<FeedingRecord[]> {
    if (!isMockMode()) return this.request(`/tracker/feeding${date ? `?date=${date}` : ''}`);
    await delay();
    return clone(mockFeedingRecords);
  }

  async getSleepRecords(date?: string): Promise<SleepRecord[]> {
    if (!isMockMode()) return this.request(`/tracker/sleep${date ? `?date=${date}` : ''}`);
    await delay();
    return clone(mockSleepRecords);
  }

  async getHealthRecords(): Promise<HealthRecord[]> {
    if (!isMockMode()) return this.request('/tracker/health');
    await delay();
    return clone(mockHealthRecords);
  }

  async createGrowthRecord(data: GrowthRecordCreate): Promise<GrowthRecord> {
    if (!isMockMode()) {
      return this.request('/tracker/growth', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    }

    await delay();
    ensureMockTrackerWrite();
    const record: GrowthRecord = {
      id: `growth-${Date.now()}`,
      measurement_date: data.measurement_date,
      weight_g: data.weight_g ?? null,
      height_cm: data.height_cm ?? null,
      head_cm: data.head_cm ?? null,
      weight_percentile: null,
      height_percentile: null,
      head_percentile: null,
      notes: data.notes ?? null,
    };
    mockGrowthRecords.unshift(record);
    refreshMockGrowthViews(record);
    return clone(record);
  }

  async createFeedingRecord(data: FeedingRecordCreate): Promise<FeedingRecord> {
    if (!isMockMode()) {
      return this.request('/tracker/feeding', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    }

    await delay();
    ensureMockTrackerWrite();
    const record: FeedingRecord = {
      id: `feeding-${Date.now()}`,
      feed_time: data.feed_time,
      feed_type: data.feed_type,
      amount_ml: data.amount_ml ?? null,
      duration_min: data.duration_min ?? null,
      notes: data.notes ?? null,
    };
    mockFeedingRecords.unshift(record);
    refreshMockFeedingViews(record);
    return clone(record);
  }

  async createSleepRecord(data: SleepRecordCreate): Promise<SleepRecord> {
    if (!isMockMode()) {
      return this.request('/tracker/sleep', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    }

    await delay();
    ensureMockTrackerWrite();
    const record: SleepRecord = {
      id: `sleep-${Date.now()}`,
      sleep_start: data.sleep_start,
      sleep_end: data.sleep_end ?? null,
      night_wakings: data.night_wakings ?? 0,
      sleep_type: data.sleep_type,
      notes: data.notes ?? null,
    };
    mockSleepRecords.unshift(record);
    refreshMockSleepViews(record);
    return clone(record);
  }

  async createHealthRecord(data: HealthRecordCreate): Promise<HealthRecord> {
    if (!isMockMode()) {
      return this.request('/tracker/health', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    }

    await delay();
    ensureMockTrackerWrite();
    const record: HealthRecord = {
      id: `health-${Date.now()}`,
      record_date: data.record_date,
      record_type: data.record_type,
      title: data.title,
      description: data.description ?? null,
    };
    mockHealthRecords.unshift(record);
    return clone(record);
  }

  async updateTrackerRecord(
    type: TrackerType,
    id: string,
    updates: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!isMockMode()) {
      return this.request(`/tracker/${type}/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
    }

    await delay();
    ensureMockTrackerWrite();
    const records = recordMatchesType(type) as unknown as Array<Record<string, unknown>>;
    const index = records.findIndex((record) => record.id === id);
    if (index === -1) throw new ApiError(404, '记录不存在');
    records[index] = { ...records[index], ...updates };
    return clone(records[index]);
  }

  async deleteTrackerRecord(type: TrackerType, id: string): Promise<void> {
    if (!isMockMode()) return this.request(`/tracker/${type}/${id}`, { method: 'DELETE' });
    await delay();
    ensureMockTrackerWrite();
    const records = recordMatchesType(type) as Array<{ id: string }>;
    const index = records.findIndex((record) => record.id === id);
    if (index >= 0) records.splice(index, 1);
  }

  async getDashboardSummary(): Promise<DashboardSummary> {
    if (!isMockMode()) return this.request('/dashboard/summary');
    await delay();
    return clone(mockDashboardSummary);
  }

  async getGrowthChart(): Promise<GrowthChartData> {
    if (!isMockMode()) return this.request('/dashboard/growth-chart');
    await delay();
    return clone(mockGrowthChart);
  }

  async getGrowthReferenceP50(measurementDate: string): Promise<GrowthReferenceP50> {
    if (!isMockMode()) {
      return this.request(`/dashboard/growth-reference-p50?measurement_date=${encodeURIComponent(measurementDate)}`);
    }

    await delay();
    const ageDays = Math.floor(
      (new Date(`${measurementDate}T00:00:00+08:00`).getTime() -
        new Date(`${mockBaby.birth_date}T00:00:00+08:00`).getTime()) /
        86_400_000,
    );
    const ageMonths = ageDays / 30.4375;
    return clone({
      measurement_date: measurementDate,
      age_days: ageDays,
      age_display: ageDisplay(ageDays),
      weight_g: interpolateP50(mockGrowthChart.who_reference.weight, ageMonths),
      height_cm: interpolateP50(mockGrowthChart.who_reference.height, ageMonths),
      head_cm: interpolateP50(mockGrowthChart.who_reference.head, ageMonths),
    });
  }

  async getFeedingStats(days = 7): Promise<FeedingStatsData> {
    if (!isMockMode()) return this.request(`/dashboard/feeding-stats?days=${days}`);
    await delay();
    return clone({ ...mockFeedingStats, days });
  }

  async getSleepStats(days = 7): Promise<SleepStatsData> {
    if (!isMockMode()) return this.request(`/dashboard/sleep-stats?days=${days}`);
    await delay();
    return clone({ ...mockSleepStats, days });
  }

  async uploadPhoto(file: File): Promise<Photo> {
    if (!isMockMode()) {
      const form = new FormData();
      form.append('file', file);
      return this.request('/album/photos', { method: 'POST', body: form });
    }

    await delay();
    ensureMockPhotoWrite();
    const photo: Photo = {
      id: `photo-${Date.now()}`,
      storage_url: URL.createObjectURL(file),
      original_filename: file.name,
      taken_at: new Date().toISOString(),
      uploaded_at: new Date().toISOString(),
      tags: [
        { id: `tag-${Date.now()}`, tag_type: 'scene', tag_value: '新上传', confidence: 0.82, is_confirmed: true },
      ],
    };
    mockPhotos.unshift(photo);
    return clone(photo);
  }

  async getPhotos(params?: { view?: string; scene?: string; month?: string }): Promise<PaginatedResponse<Photo>> {
    if (!isMockMode()) {
      const search = new URLSearchParams();
      if (params?.view) search.set('view', params.view);
      if (params?.scene) search.set('scene', params.scene);
      if (params?.month) search.set('month', params.month);
      return this.request(`/album/photos?${search.toString()}`);
    }
    await delay();
    return paginate(mockPhotos);
  }

  async getPhoto(id: string): Promise<Photo> {
    if (!isMockMode()) return this.request(`/album/photos/${id}`);
    await delay();
    const photo = mockPhotos.find((item) => item.id === id);
    if (!photo) throw new ApiError(404, '照片不存在');
    return clone(photo);
  }

  async confirmTag(photoId: string, tagId: string): Promise<PhotoTag> {
    if (!isMockMode()) return this.request(`/album/photos/${photoId}/tags/${tagId}/confirm`, { method: 'POST' });
    await delay();
    ensureMockPhotoWrite();
    const tag = mockPhotos.find((photo) => photo.id === photoId)?.tags.find((item) => item.id === tagId);
    if (!tag) throw new ApiError(404, '标签不存在');
    tag.is_confirmed = true;
    return clone(tag);
  }

  async getPhotoDownloadUrl(id: string): Promise<PhotoDownloadResponse> {
    if (!isMockMode()) return this.request(`/album/photos/${id}/download`);
    await delay();
    const photo = mockPhotos.find((item) => item.id === id);
    if (!photo) throw new ApiError(404, '照片不存在');
    return { download_url: photo.storage_url, expires_in_seconds: 300 };
  }

  async deletePhoto(id: string): Promise<void> {
    if (!isMockMode()) return this.request(`/album/photos/${id}`, { method: 'DELETE' });
    await delay();
    ensureMockPhotoWrite();
    const index = mockPhotos.findIndex((item) => item.id === id);
    if (index === -1) throw new ApiError(404, '照片不存在');
    mockPhotos.splice(index, 1);
  }

  async getMyProfile(): Promise<ProfileItem[]> {
    if (!isMockMode()) return this.request('/profile/me');
    await delay();
    return clone(mockProfileItems.filter((item) => item.scope === 'user'));
  }

  async createProfileItem(content: string): Promise<ProfileItem> {
    if (!isMockMode()) {
      return this.request('/profile/me', {
        method: 'POST',
        body: JSON.stringify({ content }),
      });
    }
    await delay();
    ensureMockProfileWrite();
    const item: ProfileItem = {
      id: `profile-${Date.now()}`,
      scope: 'user',
      content,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockProfileItems.unshift(item);
    return clone(item);
  }

  async updateProfileItem(id: string, content: string): Promise<ProfileItem> {
    if (!isMockMode()) {
      return this.request(`/profile/me/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      });
    }
    await delay();
    ensureMockProfileWrite();
    const item = mockProfileItems.find((profile) => profile.id === id);
    if (!item) throw new ApiError(404, '画像不存在');
    item.content = content;
    item.updated_at = new Date().toISOString();
    return clone(item);
  }

  async deleteProfileItem(id: string): Promise<void> {
    if (!isMockMode()) return this.request(`/profile/me/${id}`, { method: 'DELETE' });
    await delay();
    ensureMockProfileWrite();
    const index = mockProfileItems.findIndex((item) => item.id === id);
    if (index >= 0) mockProfileItems.splice(index, 1);
  }

  async getFamilyProfile(): Promise<ProfileItem[]> {
    if (!isMockMode()) return this.request('/profile/family');
    await delay();
    return clone(mockProfileItems.filter((item) => item.scope === 'family'));
  }

  async createFamilyProfileItem(content: string): Promise<ProfileItem> {
    if (!isMockMode()) {
      return this.request('/profile/family', {
        method: 'POST',
        body: JSON.stringify({ content }),
      });
    }
    await delay();
    ensureMockFamilyManage();
    const item: ProfileItem = {
      id: `family-profile-${Date.now()}`,
      scope: 'family',
      content,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockProfileItems.unshift(item);
    return clone(item);
  }

  async updateFamilyProfileItem(id: string, content: string): Promise<ProfileItem> {
    if (!isMockMode()) {
      return this.request(`/profile/family/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      });
    }
    await delay();
    ensureMockFamilyManage();
    const item = mockProfileItems.find((profile) => profile.id === id && profile.scope === 'family');
    if (!item) throw new ApiError(404, '家庭记忆不存在');
    item.content = content;
    item.updated_at = new Date().toISOString();
    return clone(item);
  }

  async deleteFamilyProfileItem(id: string): Promise<void> {
    if (!isMockMode()) return this.request(`/profile/family/${id}`, { method: 'DELETE' });
    await delay();
    ensureMockFamilyManage();
    const index = mockProfileItems.findIndex((item) => item.id === id && item.scope === 'family');
    if (index >= 0) mockProfileItems.splice(index, 1);
  }

  async getBaby(): Promise<Baby> {
    if (!isMockMode()) return this.request('/baby');
    await delay();
    return clone(mockBaby);
  }

  async updateBaby(data: Partial<Baby>): Promise<Baby> {
    if (!isMockMode()) {
      return this.request('/baby', {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    }
    await delay();
    ensureMockFamilyManage();
    Object.assign(mockBaby, data);
    return clone(mockBaby);
  }

  async getUsers(): Promise<User[]> {
    if (!isMockMode()) return this.request('/users');
    await delay();
    return clone(mockUsers);
  }

  async getFamily(): Promise<Family> {
    if (!isMockMode()) return this.request('/family');
    await delay();
    return clone(mockFamily);
  }

  async updateFamily(data: Partial<Family>): Promise<Family> {
    if (!isMockMode()) {
      return this.request('/family', {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    }
    await delay();
    ensureMockFamilyManage();
    Object.assign(mockFamily, data);
    return clone(mockFamily);
  }

  async createUser(data: UserCreate): Promise<User> {
    if (!isMockMode()) {
      return this.request('/users', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    }
    await delay();
    ensureMockFamilyManage();
    if (mockUsers.some((user) => user.username === data.username)) throw new ApiError(409, '用户名已存在');
    const user: User = {
      id: `user-${Date.now()}`,
      family_id: mockFamily.id,
      username: data.username,
      display_name: data.display_name,
      access_type: data.access_type,
      role: data.role,
      avatar_url: null,
      permissions: {
        can_upload_photos: data.access_type !== 'friend',
        can_write_tracker: data.access_type !== 'friend',
      },
    };
    mockUsers.push(user);
    return clone(user);
  }

  async updateUser(id: string, data: UserUpdate): Promise<User> {
    if (!isMockMode()) {
      return this.request(`/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    }
    await delay();
    ensureMockFamilyManage();
    const user = mockUsers.find((item) => item.id === id);
    if (!user) throw new ApiError(404, '用户不存在');
    Object.assign(user, data);
    if (data.access_type) {
      user.permissions = {
        can_upload_photos: data.access_type !== 'friend',
        can_write_tracker: data.access_type !== 'friend',
      };
    }
    return clone(user);
  }

  async updateUserPassword(id: string, password: string): Promise<void> {
    if (!isMockMode()) {
      return this.request(`/users/${id}/password`, {
        method: 'PATCH',
        body: JSON.stringify({ password }),
      });
    }
    await delay();
    ensureMockFamilyManage();
  }

  async deleteUser(id: string): Promise<void> {
    if (!isMockMode()) return this.request(`/users/${id}`, { method: 'DELETE' });
    await delay();
    ensureMockFamilyManage();
    const index = mockUsers.findIndex((item) => item.id === id);
    if (index >= 0) mockUsers.splice(index, 1);
  }

  async updateUserPermissions(id: string, permissions: UserPermissions): Promise<User> {
    if (!isMockMode()) {
      return this.request(`/users/${id}/permissions`, {
        method: 'PATCH',
        body: JSON.stringify(permissions),
      });
    }
    await delay();
    ensureMockFamilyManage();
    const user = mockUsers.find((item) => item.id === id);
    if (!user) throw new ApiError(404, '用户不存在');
    user.permissions = permissions;
    return clone(user);
  }
}

export const api = new ApiClient();
