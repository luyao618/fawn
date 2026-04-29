import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SafetyAlert } from '@/components/chat/SafetyAlert';

describe('SafetyAlert', () => {
  it('renders red safety alert language', () => {
    render(<SafetyAlert content="宝宝发烧39度，请及时联系医生。" />);
    expect(screen.getByText('宝宝发烧39度，请及时联系医生。')).toBeInTheDocument();
    expect(screen.getByText('建议尽快咨询医生或就医')).toBeInTheDocument();
  });
});
