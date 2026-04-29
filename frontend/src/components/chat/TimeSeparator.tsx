import { formatDateTime } from '@/lib/utils';

export function TimeSeparator({ timestamp }: { timestamp: string }) {
  return (
    <div className="flex justify-center py-3">
      <span className="rounded-[10px] bg-mid-gray/10 px-2 py-0.5 text-xs leading-snug text-mid-gray">
        {formatDateTime(timestamp)}
      </span>
    </div>
  );
}
