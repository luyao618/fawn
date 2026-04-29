import type { MessageType, SSEEvent } from './types';

export interface SSEOptions {
  onToken: (content: string) => void;
  onToolCall: (name: string, args: Record<string, unknown>) => void;
  onToolResult: (name: string, result: Record<string, unknown>) => void;
  onDone: (messageId: string, messageType: MessageType) => void;
  onError: (message: string) => void;
  onSessionExpired: (expiredConversationId: string) => void;
}

function dispatchEvent(event: SSEEvent, options: SSEOptions) {
  switch (event.type) {
    case 'token':
      options.onToken(event.content);
      break;
    case 'tool_call':
      options.onToolCall(event.name, event.args);
      break;
    case 'tool_result':
      options.onToolResult(event.name, event.result);
      break;
    case 'done':
      options.onDone(event.message_id, event.message_type);
      break;
    case 'error':
      options.onError(event.message);
      break;
    case 'session_expired':
      options.onSessionExpired(event.expired_conversation_id);
      break;
  }
}

export async function consumeSSE(response: Response, options: SSEOptions): Promise<void> {
  if (!response.ok) {
    options.onError(`请求失败：${response.status}`);
    return;
  }

  if (!response.body) {
    options.onError('响应中没有可读取的数据流');
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const processLine = (line: string) => {
    if (!line.startsWith('data: ')) return;
    try {
      const event = JSON.parse(line.slice(6)) as SSEEvent;
      dispatchEvent(event, options);
    } catch {
      options.onError('SSE 数据解析失败');
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) processLine(line.trim());
  }

  const tail = buffer.trim();
  if (tail) processLine(tail);
}

export function createMockSSEResponse(events: SSEEvent[], delayMs = 30) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const event of events) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}
