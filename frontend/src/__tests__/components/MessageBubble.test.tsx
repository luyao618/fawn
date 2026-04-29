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

  it('renders safety alerts with safety copy', () => {
    render(<MessageBubble message={{ ...base, message_type: 'safety_alert', content: '请尽快就医' }} />);
    expect(screen.getByText('请尽快就医')).toBeInTheDocument();
    expect(screen.getByText('建议尽快咨询医生或就医')).toBeInTheDocument();
  });
});
