import {
  currentMockTime,
  makeLoginResponse,
  mockBaby,
  mockConversations,
  mockDashboardSummary,
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
  FeedingRecord,
  FeedingStatsData,
  GrowthChartData,
  GrowthRecord,
  HealthRecord,
  LoginRequest,
  LoginResponse,
  Message,
  MessageSearchResult,
  PaginatedResponse,
  Photo,
  PhotoTag,
  ProfileItem,
  SleepRecord,
  SleepStatsData,
  TrackerType,
  User,
  UserPermissions,
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

function currentUserRole() {
  return tokenToUser(getAuthToken())?.role ?? 'parent';
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
    const role = currentUserRole();
    return createMockSSEResponse(mockSSEEventsFor(content, role));
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
    const records = recordMatchesType(type) as unknown as Array<Record<string, unknown>>;
    const index = records.findIndex((record) => record.id === id);
    if (index === -1) throw new ApiError(404, '记录不存在');
    records[index] = { ...records[index], ...updates };
    return clone(records[index]);
  }

  async deleteTrackerRecord(type: TrackerType, id: string): Promise<void> {
    if (!isMockMode()) return this.request(`/tracker/${type}/${id}`, { method: 'DELETE' });
    await delay();
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
    const tag = mockPhotos.find((photo) => photo.id === photoId)?.tags.find((item) => item.id === tagId);
    if (!tag) throw new ApiError(404, '标签不存在');
    tag.is_confirmed = true;
    return clone(tag);
  }

  async getMyProfile(): Promise<ProfileItem[]> {
    if (!isMockMode()) return this.request('/profile/me');
    await delay();
    return clone(mockProfileItems);
  }

  async updateProfileItem(id: string, content: string): Promise<ProfileItem> {
    if (!isMockMode()) {
      return this.request(`/profile/me/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      });
    }
    await delay();
    const item = mockProfileItems.find((profile) => profile.id === id);
    if (!item) throw new ApiError(404, '画像不存在');
    item.content = content;
    item.updated_at = new Date().toISOString();
    return clone(item);
  }

  async deleteProfileItem(id: string): Promise<void> {
    if (!isMockMode()) return this.request(`/profile/me/${id}`, { method: 'DELETE' });
    await delay();
    const index = mockProfileItems.findIndex((item) => item.id === id);
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
    Object.assign(mockBaby, data);
    return clone(mockBaby);
  }

  async getUsers(): Promise<User[]> {
    if (!isMockMode()) return this.request('/users');
    await delay();
    return clone(mockUsers);
  }

  async updateUserPermissions(id: string, permissions: UserPermissions): Promise<User> {
    if (!isMockMode()) {
      return this.request(`/users/${id}/permissions`, {
        method: 'PATCH',
        body: JSON.stringify(permissions),
      });
    }
    await delay();
    const user = mockUsers.find((item) => item.id === id);
    if (!user) throw new ApiError(404, '用户不存在');
    user.permissions = permissions;
    return clone(user);
  }
}

export const api = new ApiClient();
