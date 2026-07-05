import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { useSetupPinSuspend } from '@/hooks/use-setup-pin-suspend';
import {
  Progress,
  ProgressIndicator,
  ProgressTrack,
} from '@/components/ui/progress';
import { cn, roundProgressPercent } from '@/lib/utils';

type SetupWizardShellProps = {
  open: boolean;
  title: string;
  stepIndex: number;
  stepCount: number;
  stepTitle: string;
  children: ReactNode;
  footer?: ReactNode;
  onCancel: () => void;
  className?: string;
};

export function SetupWizardShell({
  open,
  title,
  stepIndex,
  stepCount,
  stepTitle,
  children,
  footer,
  onCancel,
  className,
}: SetupWizardShellProps) {
  useSetupPinSuspend(open);

  if (!open) return null;

  const progress = roundProgressPercent(((stepIndex + 1) / stepCount) * 100);

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex flex-col bg-background',
        className,
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby="setup-wizard-title"
    >
      <header className="border-b border-border/60 px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <Button
            type="button"
            variant="ghost"
            className="kiosk-touch"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <h2
            id="setup-wizard-title"
            className="font-heading text-xl font-semibold"
          >
            {title}
          </h2>
          <span className="text-sm tabular-nums text-muted-foreground">
            {stepIndex + 1}/{stepCount}
          </span>
        </div>
        <p className="mt-3 text-lg text-muted-foreground">{stepTitle}</p>
        <Progress value={progress} className="mt-4 gap-0">
          <ProgressTrack className="h-2 bg-secondary">
            <ProgressIndicator className="rounded-full bg-primary" />
          </ProgressTrack>
        </Progress>
      </header>

      <main className="flex-1 overflow-y-auto p-6">{children}</main>

      {footer ? (
        <footer className="border-t border-border/60 bg-card/40 p-6">
          {footer}
        </footer>
      ) : null}
    </div>
  );
}

type WizardFooterActionsProps = {
  onBack?: () => void;
  backDisabled?: boolean;
  backLabel?: string;
  backVariant?:
    'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  showBack?: boolean;
  showNext?: boolean;
};

export function WizardFooterActions({
  onBack,
  backDisabled = false,
  backLabel = 'Back',
  backVariant = 'outline',
  onNext,
  nextLabel = 'Continue',
  nextDisabled = false,
  showBack = true,
  showNext = true,
}: WizardFooterActionsProps) {
  return (
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
      {showBack ? (
        <Button
          type="button"
          variant={backVariant}
          className="kiosk-touch sm:min-w-36"
          disabled={backDisabled}
          onClick={onBack}
        >
          {backLabel}
        </Button>
      ) : (
        <span className="hidden sm:block sm:min-w-36" aria-hidden />
      )}
      {showNext ? (
        <Button
          type="button"
          className="kiosk-touch min-w-48 sm:ml-auto"
          disabled={nextDisabled}
          onClick={onNext}
        >
          {nextLabel}
        </Button>
      ) : null}
    </div>
  );
}
