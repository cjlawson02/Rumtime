import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type PageHeaderProps = {
  title: string;
  subtitle?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  className?: string;
};

export function PageHeader({
  title,
  subtitle,
  leading,
  trailing,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        'flex items-center gap-4 border-b border-border/60 bg-background/40 px-6 py-4 backdrop-blur-md',
        className,
      )}
    >
      {leading}
      <div className="min-w-0 flex-1">
        <h1 className="font-heading truncate text-2xl font-semibold tracking-tight md:text-3xl">
          {title}
        </h1>
        {subtitle && (
          <div className="mt-0.5 text-sm text-muted-foreground">{subtitle}</div>
        )}
      </div>
      {trailing}
    </header>
  );
}
