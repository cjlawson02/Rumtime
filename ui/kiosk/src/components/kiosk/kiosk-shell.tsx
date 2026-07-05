import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type KioskShellProps = {
  children: ReactNode;
  className?: string;
};

export function KioskShell({ children, className }: KioskShellProps) {
  return (
    <div
      className={cn('kiosk-bg relative min-h-dvh text-foreground', className)}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,oklch(0.45_0.12_65_/_0.18),transparent)]"
      />
      <div className="relative flex min-h-dvh flex-col">{children}</div>
    </div>
  );
}
