import * as React from 'react';
import { LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'text';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
}

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-fawn-amber text-white active:opacity-85 disabled:bg-oat-border disabled:text-mid-gray',
  secondary: 'border border-fawn-amber bg-white text-fawn-amber active:bg-fawn-amber-light',
  danger: 'bg-safety-red text-white active:opacity-85',
  text: 'bg-transparent text-fawn-amber px-2',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-6 py-3 text-base font-semibold transition-colors duration-150',
        variants[variant],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <LoaderCircle aria-hidden className="h-5 w-5 animate-spin" /> : null}
      {children}
    </button>
  ),
);

Button.displayName = 'Button';
