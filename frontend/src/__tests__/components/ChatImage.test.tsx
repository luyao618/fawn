import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatImage } from '@/components/chat/ChatImage';
import { api } from '@/lib/api';

describe('ChatImage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('loads authenticated API images as blobs and releases the URL on unmount', async () => {
    vi.spyOn(api, 'getChatImage').mockResolvedValue(new Blob(['image']));
    vi.mocked(URL.createObjectURL).mockReturnValueOnce('blob:chat-image');
    const revoke = vi.fn();
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke });
    const { unmount } = render(<ChatImage src="/api/chat/conversations/conv/images/a.jpg" alt="聊天图片" />);
    expect(screen.getByAltText('聊天图片')).not.toHaveAttribute('src');
    await waitFor(() => expect(screen.getByAltText('聊天图片')).toHaveAttribute('src', 'blob:chat-image'));
    unmount();
    expect(revoke).toHaveBeenCalledWith('blob:chat-image');
  });
});
