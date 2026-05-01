import { AlertTriangle } from 'lucide-react';
import { MarkdownMessage } from './MarkdownMessage';

export function SafetyAlert({ content }: { content: string }) {
  return (
    <div className="max-w-[85vw] rounded-xl border-l-[3px] border-safety-red bg-safety-red-light p-3 text-soft-charcoal">
      <div className="flex gap-2">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-safety-red" aria-hidden />
        <div>
          <MarkdownMessage content={content} className="text-base leading-normal" />
          <p className="mt-2 text-sm font-semibold text-safety-red">建议尽快咨询医生或就医</p>
        </div>
      </div>
    </div>
  );
}
