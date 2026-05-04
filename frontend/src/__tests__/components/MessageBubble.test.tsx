import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MessageBubble } from '@/components/chat/MessageBubble';
import type { Message } from '@/lib/types';

const base: Message = {
  id: 'msg',
  conversation_id: 'conv',
  role: 'assistant',
  content: '测试内容',
  message_type: 'text',
  metadata: null,
  created_at: '2026-04-29T08:00:00+08:00',
};

describe('MessageBubble', () => {
  it('renders text messages and streaming cursor', () => {
    render(<MessageBubble message={base} isStreaming />);
    expect(screen.getByText('测试内容')).toBeInTheDocument();
  });

  it('renders image messages', () => {
    render(
      <MessageBubble
        message={{
          ...base,
          role: 'user',
          content: '图片',
          message_type: 'image',
          metadata: { image_url: '/photo.jpg' },
        }}
      />,
    );
    expect(screen.getByAltText('图片')).toHaveAttribute('src', '/photo.jpg');
  });

  it('renders data_card text and structured card together', () => {
    render(
      <MessageBubble
        message={{
          ...base,
          content: '已记录体重',
          message_type: 'data_card',
          metadata: { type: 'growth', data: { weight_g: 4200, weight_percentile: 35 } },
        }}
      />,
    );
    expect(screen.getByText('已记录体重')).toBeInTheDocument();
    expect(screen.getByText('生长记录')).toBeInTheDocument();
  });

  it('renders assistant markdown without affecting structured cards', () => {
    render(
      <MessageBubble
        message={{
          ...base,
          content:
            '好的，**马上帮你记录**。\n\n1. **喂奶时间**：12:10\n2. **喂奶方式**：母乳\n\n| 项目 | 内容 |\n|---|---|\n| 时间 | 12:10 |\n| 类型 | 母乳 |',
          message_type: 'data_card',
          metadata: { type: 'feeding', data: { total_ml: 10, count: 1, last_feed_time: '12:10' } },
        }}
      />,
    );

    expect(screen.getByText('马上帮你记录').tagName).toBe('STRONG');
    expect(screen.getByText('喂奶时间').tagName).toBe('STRONG');
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('喂养统计')).toBeInTheDocument();
  });

  it('keeps user messages as plain text even when they contain markdown markers', () => {
    render(<MessageBubble message={{ ...base, role: 'user', content: '**不要格式化**' }} />);
    expect(screen.getByText('**不要格式化**')).toBeInTheDocument();
    expect(screen.queryByText('不要格式化')).not.toBeInTheDocument();
  });

  it('places family member messages on the right and shows sender identity without an avatar', () => {
    render(
      <MessageBubble
        message={{
          ...base,
          role: 'user',
          content: '晚点再喂一次',
          sender_user_id: 'user-mama',
          sender: {
            id: 'user-mama',
            family_id: 'family',
            username: 'mama',
            display_name: '林雨',
            access_type: 'parent',
            role: '妈妈',
            avatar_url: null,
            permissions: { can_upload_photos: true, can_write_tracker: true },
          },
        }}
      />,
    );

    expect(screen.getByTestId('user-message-row')).toHaveClass('justify-end');
    expect(screen.getByText('林雨')).toBeInTheDocument();
    expect(screen.getByText('妈妈')).toBeInTheDocument();
    expect(screen.queryByLabelText('林雨 · 妈妈')).not.toBeInTheDocument();
  });

  it('renders safety alerts as quiet assistant copy', () => {
    render(<MessageBubble message={{ ...base, message_type: 'safety_alert', content: '**请尽快就医**' }} />);
    expect(screen.getByText('请尽快就医').tagName).toBe('STRONG');
    expect(screen.getByText('如症状持续或加重，请及时咨询医生或就医。')).toBeInTheDocument();
    expect(screen.queryByLabelText('Fawn Agent')).not.toBeInTheDocument();
  });
});
