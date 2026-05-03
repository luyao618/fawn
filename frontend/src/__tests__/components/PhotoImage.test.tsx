import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PhotoImage, resolvePhotoImageUrl } from '@/components/album/PhotoImage';

describe('PhotoImage', () => {
  it('rewrites Docker-internal MinIO URLs for the browser', () => {
    const resolved = new URL(resolvePhotoImageUrl('http://minio:9000/fawn/photos/baby.jpg'));
    expect(resolved.hostname).toBe(window.location.hostname || 'localhost');
    expect(resolved.port).toBe('9000');
    expect(resolved.pathname).toBe('/fawn/photos/baby.jpg');
  });

  it('shows a visible fallback when the image cannot load', () => {
    render(<PhotoImage src="/missing.jpg" alt="宝宝照片" className="h-full w-full object-cover" />);
    fireEvent.error(screen.getByAltText('宝宝照片'));
    expect(screen.getByRole('img', { name: '宝宝照片 加载失败' })).toBeInTheDocument();
    expect(screen.getByText('照片暂时无法加载')).toBeInTheDocument();
  });
});
