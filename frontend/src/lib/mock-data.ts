import type {
  Baby,
  Conversation,
  DashboardSummary,
  FeedingRecord,
  FeedingStatsData,
  GrowthChartData,
  GrowthRecord,
  HealthRecord,
  LoginResponse,
  Message,
  Photo,
  PhotoTag,
  ProfileItem,
  SSEEvent,
  SleepRecord,
  SleepStatsData,
  User,
} from './types';

const now = new Date('2026-04-29T09:00:00+08:00');

export const mockUsers: User[] = [
  {
    id: 'user-admin',
    username: 'admin',
    display_name: '爸爸',
    role: 'admin',
    avatar_url: null,
    permissions: { can_upload_photos: true, can_write_tracker: true },
  },
  {
    id: 'user-mama',
    username: 'mama',
    display_name: '妈妈',
    role: 'parent',
    avatar_url: null,
    permissions: { can_upload_photos: true, can_write_tracker: true },
  },
  {
    id: 'user-nainai',
    username: 'nainai',
    display_name: '奶奶',
    role: 'family',
    avatar_url: null,
    permissions: { can_upload_photos: false, can_write_tracker: false },
  },
];

export const mockPassword = 'password';

export function makeLoginResponse(user: User): LoginResponse {
  return {
    access_token: `mock-token-${user.username}`,
    token_type: 'bearer',
    user,
  };
}

export const mockBaby: Baby = {
  id: 'baby-chenchen',
  name: '晨晨',
  gender: 'female',
  birth_date: '2026-03-01',
  birth_weight_g: 3200,
  birth_height_cm: 50,
  birth_head_cm: 34,
  is_premature: false,
  gestational_weeks: null,
};

export const mockConversations: Conversation[] = [
  {
    id: 'conv-active',
    started_at: '2026-04-29T07:40:00+08:00',
    ended_at: null,
    is_active: true,
    summary: '今天记录体重，并询问喂养和睡眠情况。',
    message_count: 5,
  },
  {
    id: 'conv-history-1',
    started_at: '2026-04-28T20:10:00+08:00',
    ended_at: '2026-04-28T20:35:00+08:00',
    is_active: false,
    summary: '讨论了夜醒次数和白天小睡安排。',
    message_count: 4,
  },
];

export const mockMessages: Message[] = [
  {
    id: 'msg-1',
    conversation_id: 'conv-active',
    role: 'assistant',
    content: '早上好，我可以帮你记录晨晨的喂养、睡眠、身高体重，也可以解释数据变化。',
    message_type: 'text',
    metadata: null,
    created_at: '2026-04-29T07:40:00+08:00',
  },
  {
    id: 'msg-2',
    conversation_id: 'conv-active',
    role: 'user',
    content: '宝宝今天体重4.2kg，是不是偏轻了？',
    message_type: 'text',
    metadata: null,
    created_at: '2026-04-29T08:10:00+08:00',
  },
  {
    id: 'msg-3',
    conversation_id: 'conv-active',
    role: 'assistant',
    content: '已记录今天体重 4.2kg。按晨晨当前月龄估算约在 WHO P35，仍处在常见范围内。-- 来源：《0-6月婴儿喂养与生长参考》第2章',
    message_type: 'data_card',
    metadata: {
      type: 'growth',
      data: { weight_g: 4200, weight_percentile: 35, height_cm: 55, head_cm: 38 },
    },
    created_at: '2026-04-29T08:10:20+08:00',
  },
  {
    id: 'msg-4',
    conversation_id: 'conv-active',
    role: 'user',
    content: '宝宝发烧39度怎么办',
    message_type: 'text',
    metadata: null,
    created_at: '2026-04-29T08:45:00+08:00',
  },
  {
    id: 'msg-5',
    conversation_id: 'conv-active',
    role: 'assistant',
    content: '39度发热需要更谨慎处理。请尽快联系儿科医生或就医，观察精神反应、吃奶量、尿量和呼吸情况。不要自行使用退烧药剂量，以医生意见为准。',
    message_type: 'safety_alert',
    metadata: null,
    created_at: '2026-04-29T08:45:20+08:00',
  },
  {
    id: 'msg-img-1',
    conversation_id: 'conv-history-1',
    role: 'user',
    content: '这是今天的照片',
    message_type: 'image',
    metadata: {
      image_url:
        'https://images.unsplash.com/photo-1546015720-b8b30df5aa27?auto=format&fit=crop&w=640&q=80',
    },
    created_at: '2026-04-28T20:12:00+08:00',
  },
];

export const mockGrowthRecords: GrowthRecord[] = [
  {
    id: 'growth-1',
    measurement_date: '2026-03-01',
    weight_g: 3200,
    height_cm: 50,
    head_cm: 34,
    weight_percentile: 50,
    height_percentile: 48,
    head_percentile: 52,
    notes: '出生记录',
  },
  {
    id: 'growth-2',
    measurement_date: '2026-04-01',
    weight_g: 3900,
    height_cm: 53.8,
    head_cm: null,
    weight_percentile: 38,
    height_percentile: 42,
    head_percentile: null,
    notes: null,
  },
  {
    id: 'growth-3',
    measurement_date: '2026-04-29',
    weight_g: 4200,
    height_cm: 55,
    head_cm: 38,
    weight_percentile: 35,
    height_percentile: 45,
    head_percentile: 50,
    notes: '家用软尺测量，头围可能有轻微误差',
  },
];

export const mockFeedingRecords: FeedingRecord[] = [
  {
    id: 'feeding-1',
    feed_time: '2026-04-29T06:40:00+08:00',
    feed_type: 'breast',
    amount_ml: null,
    duration_min: 18,
    notes: '左侧为主，精神好',
  },
  {
    id: 'feeding-2',
    feed_time: '2026-04-29T10:30:00+08:00',
    feed_type: 'formula',
    amount_ml: 90,
    duration_min: null,
    notes: '奶奶喂，喝完后拍嗝',
  },
  {
    id: 'feeding-3',
    feed_time: '2026-04-29T14:20:00+08:00',
    feed_type: 'formula',
    amount_ml: 100,
    duration_min: null,
    notes: null,
  },
];

export const mockSleepRecords: SleepRecord[] = [
  {
    id: 'sleep-1',
    sleep_start: '2026-04-28T21:30:00+08:00',
    sleep_end: '2026-04-29T06:20:00+08:00',
    night_wakings: 2,
    sleep_type: 'night',
    notes: '凌晨三点醒一次，安抚后继续睡',
  },
  {
    id: 'sleep-2',
    sleep_start: '2026-04-29T09:20:00+08:00',
    sleep_end: '2026-04-29T10:10:00+08:00',
    night_wakings: 0,
    sleep_type: 'nap',
    notes: null,
  },
];

export const mockHealthRecords: HealthRecord[] = [
  {
    id: 'health-1',
    record_date: '2026-04-15',
    record_type: 'checkup',
    title: '满月体检',
    description: '体重增长稳定，医生建议继续观察喂养间隔。',
  },
  {
    id: 'health-2',
    record_date: '2026-04-02',
    record_type: 'vaccination',
    title: '乙肝疫苗第二针',
    description: '接种后体温正常。',
  },
  {
    id: 'health-3',
    record_date: '2026-03-20',
    record_type: 'illness',
    title: '轻微鼻塞',
    description: '无发热，保持观察和室内湿度。',
  },
];

const weightRef = {
  p3: [3.0, 3.4, 4.0, 4.5, 5.0, 5.4, 5.7],
  p15: [3.2, 3.8, 4.4, 5.0, 5.5, 5.9, 6.2],
  p50: [3.4, 4.2, 5.1, 5.8, 6.4, 6.9, 7.3],
  p85: [3.8, 4.8, 5.8, 6.6, 7.3, 7.8, 8.2],
  p97: [4.1, 5.2, 6.4, 7.3, 8.0, 8.6, 9.0],
};

const heightRef = {
  p3: [47.0, 50.8, 54.0, 56.6, 58.7, 60.5, 62.0],
  p15: [48.0, 52.0, 55.2, 57.8, 60.0, 61.8, 63.3],
  p50: [49.5, 53.7, 57.1, 59.8, 62.1, 64.0, 65.7],
  p85: [51.0, 55.4, 59.0, 61.8, 64.2, 66.2, 68.0],
  p97: [52.0, 56.7, 60.4, 63.3, 65.8, 68.0, 69.8],
};

const headRef = {
  p3: [32.0, 34.0, 35.5, 36.8, 38.0, 39.0, 39.8],
  p15: [33.0, 35.0, 36.5, 37.8, 39.0, 40.0, 40.8],
  p50: [34.0, 36.4, 38.0, 39.3, 40.5, 41.5, 42.4],
  p85: [35.0, 37.8, 39.5, 40.8, 42.0, 43.0, 43.8],
  p97: [36.0, 38.8, 40.5, 42.0, 43.2, 44.2, 45.0],
};

function referenceLines(values: Record<'p3' | 'p15' | 'p50' | 'p85' | 'p97', number[]>) {
  return Object.fromEntries(
    Object.entries(values).map(([key, rows]) => [
      key,
      rows.map((value, age_months) => ({ age_months, value })),
    ]),
  ) as unknown as GrowthChartData['who_reference']['weight'];
}

export const mockGrowthChart: GrowthChartData = {
  records: mockGrowthRecords.map((record) => ({
    date: record.measurement_date,
    weight_g: record.weight_g,
    height_cm: record.height_cm,
    head_cm: record.head_cm,
  })),
  who_reference: {
    weight: referenceLines(weightRef),
    height: referenceLines(heightRef),
    head: referenceLines(headRef),
  },
};

export const mockDashboardSummary: DashboardSummary = {
  baby: {
    name: mockBaby.name,
    gender: mockBaby.gender,
    birth_date: mockBaby.birth_date,
    age_days: 59,
    age_display: '1个月28天',
  },
  latest_growth: {
    date: '2026-04-29',
    weight_g: 4200,
    weight_percentile: 35,
    height_cm: 55,
    height_percentile: 45,
  },
  today_feeding: {
    total_ml: 190,
    breast_duration_min: 18,
    count: 3,
    last_feed_time: '2026-04-29T14:20:00+08:00',
  },
  today_sleep: {
    total_hours: null,
    night_wakings: null,
  },
};

export const mockFeedingStats: FeedingStatsData = {
  days: 7,
  daily: [
    { date: '2026-04-23', total_ml: 520, breast_duration_min: 38, count: 7 },
    { date: '2026-04-24', total_ml: 560, breast_duration_min: 40, count: 8 },
    { date: '2026-04-25', total_ml: 540, breast_duration_min: 37, count: 7 },
    { date: '2026-04-26', total_ml: 590, breast_duration_min: 42, count: 8 },
    { date: '2026-04-27', total_ml: 570, breast_duration_min: 40, count: 8 },
    { date: '2026-04-28', total_ml: 610, breast_duration_min: 45, count: 8 },
    { date: '2026-04-29', total_ml: 480, breast_duration_min: 41, count: 6 },
  ],
  average_daily_ml: 553,
  average_daily_breast_duration_min: 40.4,
  average_daily_count: 7.4,
};

export const mockSleepStats: SleepStatsData = {
  days: 7,
  daily: [
    { date: '2026-04-23', total_hours: 12.6, night_wakings: 2 },
    { date: '2026-04-24', total_hours: 10.8, night_wakings: 3 },
    { date: '2026-04-25', total_hours: 11.9, night_wakings: 2 },
    { date: '2026-04-26', total_hours: null, night_wakings: null },
    { date: '2026-04-27', total_hours: null, night_wakings: null },
    { date: '2026-04-28', total_hours: 12.4, night_wakings: 1 },
    { date: '2026-04-29', total_hours: null, night_wakings: null },
  ],
  average_daily_hours: 11.93,
  average_night_wakings: 2,
};

export const mockPhotos: Photo[] = [
  {
    id: 'photo-1',
    storage_url:
      'https://images.unsplash.com/photo-1546015720-b8b30df5aa27?auto=format&fit=crop&w=800&q=80',
    original_filename: 'chenchen-smile.jpg',
    taken_at: '2026-04-28T16:30:00+08:00',
    uploaded_at: '2026-04-28T21:00:00+08:00',
    tags: [
      { id: 'tag-1', tag_type: 'scene', tag_value: '客厅', confidence: 0.91, is_confirmed: true },
      { id: 'tag-2', tag_type: 'expression', tag_value: '微笑', confidence: 0.87, is_confirmed: true },
      { id: 'tag-3', tag_type: 'milestone', tag_value: '第一次有意识微笑', confidence: 0.64, is_confirmed: false },
    ],
  },
  {
    id: 'photo-2',
    storage_url:
      'https://images.unsplash.com/photo-1519689680058-324335c77eba?auto=format&fit=crop&w=800&q=80',
    original_filename: 'chenchen-sleep.jpg',
    taken_at: '2026-04-26T13:20:00+08:00',
    uploaded_at: '2026-04-26T20:15:00+08:00',
    tags: [
      { id: 'tag-4', tag_type: 'scene', tag_value: '婴儿床', confidence: 0.94, is_confirmed: true },
      { id: 'tag-5', tag_type: 'expression', tag_value: '熟睡', confidence: 0.9, is_confirmed: true },
    ],
  },
  {
    id: 'photo-3',
    storage_url:
      'https://images.unsplash.com/photo-1596870230751-ebdfce98ec42?auto=format&fit=crop&w=800&q=80',
    original_filename: 'chenchen-tummy.jpg',
    taken_at: '2026-04-20T10:10:00+08:00',
    uploaded_at: '2026-04-20T21:20:00+08:00',
    tags: [
      { id: 'tag-6', tag_type: 'scene', tag_value: '爬行垫', confidence: 0.88, is_confirmed: true },
      { id: 'tag-7', tag_type: 'milestone', tag_value: '俯趴练习', confidence: 0.78, is_confirmed: true },
    ],
  },
];

export const mockProfileItems: ProfileItem[] = [
  {
    id: 'profile-1',
    content: '妈妈更关注喂养间隔和体重增长趋势。',
    created_at: '2026-04-10T10:00:00+08:00',
    updated_at: '2026-04-25T12:00:00+08:00',
  },
  {
    id: 'profile-2',
    content: '家庭倾向先观察日常状态，异常时及时联系儿科医生。',
    created_at: '2026-04-12T08:30:00+08:00',
    updated_at: '2026-04-22T18:40:00+08:00',
  },
];

export function mockSSEEventsFor(content: string, role: User['role'] = 'parent'): SSEEvent[] {
  const normalized = content.toLowerCase();
  const isCorrection =
    content.includes('不对') || content.includes('纠正') || (content.includes('不是') && !content.includes('是不是'));

  if (content.includes('发烧') || content.includes('39') || content.includes('高烧')) {
    return [
      {
        type: 'token',
        content:
          '39度发热需要更谨慎处理。请尽快联系儿科医生或就医，观察精神反应、吃奶量、尿量和呼吸情况。',
      },
      {
        type: 'token',
        content: '不要自行使用退烧药剂量，所有健康相关处理都以医生意见为准。',
      },
      { type: 'done', message_id: `msg-${Date.now()}`, message_type: 'safety_alert' },
    ];
  }

  if (isCorrection) {
    return [
      { type: 'tool_call', name: 'update_tracker_record', args: { type: 'growth', field: 'weight_g' } },
      {
        type: 'tool_result',
        name: 'update_tracker_record',
        result: { type: 'growth', weight_g: 4600, weight_percentile: 48, updated: true },
      },
      { type: 'token', content: '已把最近一条体重记录更新为 4.6kg，没有新增重复记录。' },
      { type: 'done', message_id: `msg-${Date.now()}`, message_type: 'data_card' },
    ];
  }

  if (content.includes('吃了奶') && !normalized.includes('ml') && !content.includes('毫升')) {
    return [
      {
        type: 'token',
        content: '请问是母乳还是配方奶？大约喝了多少 ml，或母乳喂了多久？我确认后再帮你记录。',
      },
      { type: 'done', message_id: `msg-${Date.now()}`, message_type: 'text' },
    ];
  }

  if (role === 'family' && (content.includes('吃了多少') || content.includes('喂养'))) {
    return [
      { type: 'tool_call', name: 'query_feeding_data', args: { date: 'today' } },
      {
        type: 'tool_result',
        name: 'query_feeding_data',
        result: { type: 'feeding', total_ml: 480, count: 6, last_feed_time: '14:20' },
      },
      { type: 'token', content: '今天已记录 6 次喂养，其中配方奶合计约 480ml。最近一次是 14:20，喝了 100ml。' },
      { type: 'done', message_id: `msg-${Date.now()}`, message_type: 'data_card' },
    ];
  }

  if (content.includes('体重') || normalized.includes('kg')) {
    return [
      { type: 'tool_call', name: 'record_growth', args: { weight_g: 4200, measurement_date: '2026-04-29' } },
      {
        type: 'tool_result',
        name: 'record_growth',
        result: { type: 'growth', weight_g: 4200, weight_percentile: 35, height_cm: 55, head_cm: 38 },
      },
      {
        type: 'token',
        content:
          '已记录今天体重 4.2kg。按晨晨当前月龄估算约在 WHO P35，仍处在常见范围内。最近一周继续观察吃奶量、尿量和精神状态即可。来源：《0-6月婴儿喂养与生长参考》第2章',
      },
      { type: 'done', message_id: `msg-${Date.now()}`, message_type: 'data_card' },
    ];
  }

  return [
    {
      type: 'token',
      content: '我已收到。可以继续告诉我时间、数量或宝宝当时的状态，我会帮你整理成记录并给出温和的参考建议。',
    },
    { type: 'done', message_id: `msg-${Date.now()}`, message_type: 'text' },
  ];
}

export function currentMockTime() {
  return now.toISOString();
}

export type MutablePhotoTag = PhotoTag;
