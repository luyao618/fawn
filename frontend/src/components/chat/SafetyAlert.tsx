import { MarkdownMessage } from './MarkdownMessage';

export function SafetyAlert({ content }: { content: string }) {
  return (
    <div className="text-soft-charcoal">
      <MarkdownMessage content={content} className="text-base leading-7" />
      <p className="mt-2 text-sm italic leading-6 text-dark-gray">如症状持续或加重，请及时咨询医生或就医。</p>
    </div>
  );
}
