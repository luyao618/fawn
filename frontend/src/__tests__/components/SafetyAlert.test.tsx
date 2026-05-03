import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SafetyAlert } from '@/components/chat/SafetyAlert';

describe('SafetyAlert', () => {
  it('renders quiet safety guidance after the content', () => {
    render(<SafetyAlert content="宝宝发烧39度，请及时联系医生。" />);
    expect(screen.getByText('宝宝发烧39度，请及时联系医生。')).toBeInTheDocument();
    expect(screen.getByText('如症状持续或加重，请及时咨询医生或就医。')).toBeInTheDocument();
  });
});
