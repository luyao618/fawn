import * as React from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <section
      className={cn('rounded-card bg-white/95 p-5 shadow-card ring-1 ring-white/70', className)}
      {...props}
    />
  );
}
