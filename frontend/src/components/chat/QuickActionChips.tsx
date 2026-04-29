'use client';

interface QuickActionChipsProps {
  onSelect: (action: string) => void;
  canWriteTracker: boolean;
}

const queryActions = ['睡眠情况', '查看生长曲线'];
const writeActions = ['记录喂奶', '今天体重'];

export function QuickActionChips({ onSelect, canWriteTracker }: QuickActionChipsProps) {
  const actions = canWriteTracker ? [...writeActions, ...queryActions] : queryActions;
  return (
    <div className="flex gap-2 overflow-x-auto border-t border-oat-border bg-warm-cream px-3 py-2">
      {actions.map((action) => (
        <button
          type="button"
          key={action}
          onClick={() => onSelect(action)}
          className="min-h-11 shrink-0 rounded-chip border border-oat-border bg-white px-4 text-sm text-dark-gray active:border-fawn-amber active:bg-fawn-amber-light"
        >
          {action}
        </button>
      ))}
    </div>
  );
}
