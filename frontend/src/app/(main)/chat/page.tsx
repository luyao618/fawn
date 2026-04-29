import { Suspense } from 'react';
import { ChatClient } from './ChatClient';

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-dark-gray">正在加载对话...</div>}>
      <ChatClient />
    </Suspense>
  );
}
