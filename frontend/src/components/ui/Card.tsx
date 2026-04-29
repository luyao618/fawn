import * as React from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <section
      className={cn('rounded-card border border-oat-border bg-white p-4 shadow-card', className)}
      {...props}
    />
  );
}
