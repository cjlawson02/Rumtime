import type { ReactNode } from 'react';

import { DrinkImage } from '@/components/kiosk/drink-image';
import { KioskShell } from '@/components/kiosk/kiosk-shell';
import { cn } from '@/lib/utils';

type PourBackdropProps = {
  recipeId: string;
  category?: string;
};

export function PourBackdrop({ recipeId, category }: PourBackdropProps) {
  return (
    <>
      <DrinkImage
        recipeId={recipeId}
        category={category}
        className="absolute inset-0 h-full w-full object-cover opacity-25 blur-sm"
      />
      <div className="absolute inset-0 bg-background/85" />
    </>
  );
}

const defaultContentClassName =
  'relative flex min-h-dvh flex-col items-center justify-center gap-6 p-8';

type PourScreenShellProps = {
  recipeId: string;
  category?: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function PourScreenShell({
  recipeId,
  category,
  children,
  className,
  contentClassName = defaultContentClassName,
}: PourScreenShellProps) {
  return (
    <KioskShell className="relative overflow-hidden">
      <PourBackdrop recipeId={recipeId} category={category} />
      <div className={cn(contentClassName, className)}>{children}</div>
    </KioskShell>
  );
}
