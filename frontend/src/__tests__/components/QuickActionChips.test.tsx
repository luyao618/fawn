import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QuickActionChips } from '@/components/chat/QuickActionChips';

describe('QuickActionChips', () => {
  it('hides write actions without tracker permission', () => {
    render(<QuickActionChips canWriteTracker={false} onSelect={vi.fn()} />);
    expect(screen.queryByText('记录喂奶')).not.toBeInTheDocument();
    expect(screen.getByText('睡眠情况')).toBeInTheDocument();
  });

  it('shows all actions and calls onSelect with selected text', async () => {
    const onSelect = vi.fn();
    render(<QuickActionChips canWriteTracker onSelect={onSelect} />);
    await userEvent.click(screen.getByText('今天体重'));
    expect(onSelect).toHaveBeenCalledWith('今天体重');
  });
});
