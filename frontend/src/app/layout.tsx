import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '鹿小宝',
  description: '私有化家庭育儿 Agent',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // Intentionally NOT using interactiveWidget: 'resizes-content' — under that
  // mode both window.innerHeight and visualViewport.height shrink with the
  // soft keyboard, which makes our keyboard-height detection in
  // src/app/(main)/chat/ChatClient.tsx return 0 and lands the composer above
  // the tabbar instead of directly on the keyboard. The default
  // 'resizes-visual' behavior keeps the layout viewport at full height so the
  // (innerHeight - visualViewport.height) diff gives the real keyboard inset
  // and fixed-bottom elements (TabBar) stay anchored under the keyboard.
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
