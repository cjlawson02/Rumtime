import type { ReactNode } from 'react';

import { KioskShell } from '@/components/kiosk/kiosk-shell';
import { cn } from '@/lib/utils';

type KioskMessageScreenProps = {
  message: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function KioskMessageScreen({
  message,
  action,
  className,
}: KioskMessageScreenProps) {
  return (
    <KioskShell
      className={cn('flex items-center justify-center p-6', className)}
    >
      <div className="flex flex-col items-center gap-4 text-center">
        {typeof message === 'string' ? (
          <p className="text-lg text-muted-foreground">{message}</p>
        ) : (
          message
        )}
        {action}
      </div>
    </KioskShell>
  );
}
