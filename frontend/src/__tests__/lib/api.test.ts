import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { consumeSSE } from '@/lib/sse';
import type { SSEEvent } from '@/lib/types';

async function collectSSE(response: Response) {
  const events: SSEEvent[] = [];
  await consumeSSE(response, {
    onToken: (content) => events.push({ type: 'token', content }),
    onToolCall: (name, args) => events.push({ type: 'tool_call', name, args }),
    onToolResult: (name, result) => events.push({ type: 'tool_result', name, result }),
    onDone: (message_id, message_type) => events.push({ type: 'done', message_id, message_type }),
    onError: (message) => events.push({ type: 'error', message }),
    onSessionExpired: (expired_conversation_id) =>
      events.push({ type: 'session_expired', expired_conversation_id }),
  });
  return events;
}

describe('api mock layer', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_USE_MOCK = 'true';
    vi.restoreAllMocks();
    window.localStorage.clear();
    useAuthStore.getState().logout();
  });

  it('returns typed core mock data', async () => {
    const login = await api.login({ username: 'mama', password: 'password' });
    expect(login.user.role).toBe('parent');
    window.localStorage.setItem('access_token', login.access_token);
    expect((await api.getMe()).username).toBe('mama');
    expect((await api.getDashboardSummary()).baby.name).toBe('晨晨');
    expect((await api.getPhotos()).items[0].tags.length).toBeGreaterThan(0);
  });

  it('creates tracker records in mock mode and refreshes derived dashboard data', async () => {
    const login = await api.login({ username: 'mama', password: 'password' });
    window.localStorage.setItem('access_token', login.access_token);
    const beforeSummary = await api.getDashboardSummary();

    const growth = await api.createGrowthRecord({
      measurement_date: '2026-05-02',
      weight_g: 6300,
      height_cm: 62,
    });
    expect((await api.getGrowthRecords()).some((record) => record.id === growth.id)).toBe(true);
    expect((await api.getGrowthChart()).records.some((record) => record.date === '2026-05-02')).toBe(true);
    expect((await api.getDashboardSummary()).latest_growth?.date).toBe('2026-05-02');

    const feeding = await api.createFeedingRecord({
      feed_time: '2026-04-29T15:30:00+08:00',
      feed_type: 'formula',
      amount_ml: 80,
    });
    expect((await api.getFeedingRecords()).some((record) => record.id === feeding.id)).toBe(true);
    expect((await api.getDashboardSummary()).today_feeding).toMatchObject({
      total_ml: beforeSummary.today_feeding.total_ml + 80,
      count: beforeSummary.today_feeding.count + 1,
      last_feed_time: '2026-04-29T15:30:00+08:00',
    });

    const beforeSleep = await api.getDashboardSummary();
    const sleep = await api.createSleepRecord({
      sleep_start: '2026-04-29T16:00:00+08:00',
      sleep_end: '2026-04-29T17:30:00+08:00',
      sleep_type: 'nap',
      night_wakings: 0,
    });
    expect((await api.getSleepRecords()).some((record) => record.id === sleep.id)).toBe(true);
    expect((await api.getDashboardSummary()).today_sleep.total_hours).toBe(
      Number(((beforeSleep.today_sleep.total_hours ?? 0) + 1.5).toFixed(1)),
    );

    const health = await api.createHealthRecord({
      record_date: '2026-05-02',
      record_type: 'checkup',
      title: '儿保复查',
      description: '状态稳定',
    });
    expect((await api.getHealthRecords()).some((record) => record.id === health.id)).toBe(true);
  });

  it('rejects tracker creation for mock users without write permission', async () => {
    const login = await api.login({ username: 'nainai', password: 'password' });
    window.localStorage.setItem('access_token', login.access_token);

    await expect(
      api.createFeedingRecord({
        feed_time: '2026-04-29T15:30:00+08:00',
        feed_type: 'breast',
        duration_min: 10,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('throws ApiError for non-401 mock errors', async () => {
    await expect(api.getConversation('missing')).rejects.toBeInstanceOf(ApiError);
    await expect(api.getConversation('missing')).rejects.toMatchObject({ status: 404 });
  });

  it('logs out when mock getMe sees an invalid token', async () => {
    await useAuthStore.getState().login('mama', 'password');
    useAuthStore.setState({ token: 'bad-token' });
    await expect(api.getMe()).rejects.toMatchObject({ status: 401 });
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('switches to real HTTP mode when mock env is false', async () => {
    process.env.NEXT_PUBLIC_USE_MOCK = 'false';
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: 'real', token_type: 'bearer', user: { id: 'u', username: 'x' } }), {
        status: 200,
      }),
    );
    await api.login({ username: 'x', password: 'y' });
    expect(fetchMock).toHaveBeenCalled();
  });

  it('returns the five required mock SSE scenarios', async () => {
    await useAuthStore.getState().login('mama', 'password');
    const growth = await collectSSE(await api.sendMessage('conv', '宝宝今天体重4.2kg，是不是偏轻了？'));
    expect(growth.map((event) => event.type)).toEqual(['tool_call', 'tool_result', 'token', 'done']);
    expect(growth.find((event) => event.type === 'token')).toMatchObject({
      content: expect.stringContaining('来源'),
    });

    const correction = await collectSSE(await api.sendMessage('conv', '不对，是4.6kg'));
    expect(correction.map((event) => event.type)).toEqual(['tool_call', 'tool_result', 'token', 'done']);

    const followUp = await collectSSE(await api.sendMessage('conv', '宝宝吃了奶'));
    expect(followUp.map((event) => event.type)).toEqual(['token', 'done']);

    useAuthStore.getState().logout();
    await useAuthStore.getState().login('nainai', 'password');
    const family = await collectSSE(await api.sendMessage('conv', '宝宝今天吃了多少'));
    expect(family.map((event) => event.type)).toEqual(['tool_call', 'tool_result', 'token', 'done']);

    const safety = await collectSSE(await api.sendMessage('conv', '宝宝发烧39度怎么办'));
    expect(safety.at(-1)).toMatchObject({ type: 'done', message_type: 'safety_alert' });
  });
});
