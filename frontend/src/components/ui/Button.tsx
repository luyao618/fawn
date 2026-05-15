import * as React from 'react';
import { LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'text';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
}

const variants: Record<ButtonVariant, string> = {
  primary:
    'btn-press btn-press-primary bg-fawn-amber text-white disabled:bg-oat-border disabled:text-mid-gray disabled:shadow-none',
  secondary:
    'btn-press btn-press-secondary border border-white/70 bg-white/85 text-fawn-amber',
  danger: 'bg-safety-red text-white shadow-card active:opacity-85',
  text: 'bg-transparent text-fawn-amber px-2',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-6 py-3 text-base font-semibold transition-all duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)]',
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
