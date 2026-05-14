import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import type { DashboardSummary } from '@/lib/types';

export function BabyInfoCard({ summary }: { summary: DashboardSummary }) {
  if (!summary.baby) {
    return (
      <Card className="flex items-center gap-4">
        <Avatar label="宝宝档案" role="baby" size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold text-soft-charcoal">还没有宝宝档案</p>
          <p className="mt-1 text-sm text-dark-gray">暂无生长数据</p>
        </div>
      </Card>
    );
  }

  const babyName = summary.baby.name ?? '宝宝档案';
  const babyAge = summary.baby.age_display ?? '出生日期待填';

  return (
    <Card className="flex items-center gap-4">
      <Avatar label={babyName} role="baby" size="lg" />
      <div className="min-w-0 flex-1">
        <p className="text-lg font-semibold text-soft-charcoal">{babyName}</p>
        <p className="mt-1 text-sm text-dark-gray">{babyAge}</p>
      </div>
    </Card>
  );
}
