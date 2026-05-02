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
    <div className="flex gap-2 overflow-x-auto px-4 pb-2 pt-1">
      {actions.map((action) => (
        <button
          type="button"
          key={action}
          onClick={() => onSelect(action)}
          className="min-h-11 shrink-0 rounded-chip border border-white/70 bg-white px-4 text-sm font-semibold text-dark-gray shadow-card active:border-fawn-amber active:bg-nursery-mint"
        >
          {action}
        </button>
      ))}
    </div>
  );
}
