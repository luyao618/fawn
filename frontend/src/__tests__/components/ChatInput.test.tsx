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
    expect(screen.getByLabelText('更多操作')).toBeDisabled();
    expect(screen.getByLabelText('发送')).toBeDisabled();
  });

  it('opens the add menu with history and photo actions', async () => {
    render(
      <ChatInput
        onSend={vi.fn()}
        onAttach={vi.fn()}
        attachedImage={null}
        onRemoveImage={vi.fn()}
        historyHref="/history"
      />,
    );
    expect(screen.queryByRole('menuitem', { name: '历史记录' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: '上传照片' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('更多操作'));
    expect(screen.getByRole('menuitem', { name: '历史记录' })).toHaveAttribute('href', '/history');
    expect(screen.getByRole('menuitem', { name: '上传照片' })).toBeInTheDocument();
  });

  it('does not scroll the composer on focus', async () => {
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });

    try {
      render(
        <ChatInput onSend={vi.fn()} onAttach={vi.fn()} attachedImage={null} onRemoveImage={vi.fn()} />,
      );

      await userEvent.click(screen.getByPlaceholderText('输入消息...'));
      expect(scrollIntoView).not.toHaveBeenCalled();
    } finally {
      if (originalScrollIntoView) {
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
          configurable: true,
          value: originalScrollIntoView,
        });
      } else {
        delete (HTMLElement.prototype as { scrollIntoView?: Element['scrollIntoView'] }).scrollIntoView;
      }
    }
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
