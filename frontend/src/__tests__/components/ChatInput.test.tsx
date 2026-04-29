import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChatInput } from '@/components/chat/ChatInput';

describe('ChatInput', () => {
  it('sends typed content', async () => {
    const onSend = vi.fn();
    render(
      <ChatInput onSend={onSend} onAttach={vi.fn()} attachedImage={null} onRemoveImage={vi.fn()} />,
    );
    await userEvent.type(screen.getByPlaceholderText('输入消息...'), '宝宝今天体重4.2kg');
    await userEvent.click(screen.getByLabelText('发送'));
    expect(onSend).toHaveBeenCalledWith('宝宝今天体重4.2kg', undefined);
  });

  it('disables controls while streaming', () => {
    render(
      <ChatInput onSend={vi.fn()} onAttach={vi.fn()} disabled attachedImage={null} onRemoveImage={vi.fn()} />,
    );
    expect(screen.getByPlaceholderText('输入消息...')).toBeDisabled();
    expect(screen.getByLabelText('发送')).toBeDisabled();
  });

  it('uploads and removes an attached image', async () => {
    const onAttach = vi.fn().mockResolvedValue('/upload.jpg');
    const onRemove = vi.fn();
    render(
      <ChatInput onSend={vi.fn()} onAttach={onAttach} attachedImage="/upload.jpg" onRemoveImage={onRemove} />,
    );
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(['x'], 'baby.jpg', { type: 'image/jpeg' })] } });
    await waitFor(() => expect(onAttach).toHaveBeenCalled());
    await userEvent.click(screen.getByLabelText('移除图片'));
    expect(onRemove).toHaveBeenCalled();
  });
});
