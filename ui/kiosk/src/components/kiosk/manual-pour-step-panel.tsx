import { Hand, Snowflake } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { PourScreenShell } from '@/components/kiosk/pour-screen-shell';
import type { Recipe } from '@/api/types';
import { cn } from '@/lib/utils';

type ManualPourStepPanelProps = {
  recipe: Recipe;
  stepLabel: string;
  instruction: string;
  icon?: 'hand' | 'ice';
  actionError?: string | null;
  actionLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
};

export function ManualPourStepPanel({
  recipe,
  stepLabel,
  instruction,
  icon = 'hand',
  actionError,
  actionLabel = 'Done',
  onConfirm,
  onCancel,
}: ManualPourStepPanelProps) {
  const Icon = icon === 'ice' ? Snowflake : Hand;
  const iconClass =
    icon === 'ice'
      ? 'bg-sky-500/15 ring-sky-500/30 text-sky-300'
      : 'bg-amber-500/15 ring-amber-500/30 text-amber-300';

  return (
    <PourScreenShell
      recipeId={recipe.id}
      category={recipe.categories[0]}
      contentClassName="relative flex min-h-dvh flex-col items-center justify-center gap-8 p-8"
      className="text-center"
    >
      <div className={`rounded-full p-6 ring-1 ${iconClass}`}>
        <Icon className="size-14" />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          {stepLabel}
        </p>
        <h1 className="font-heading text-4xl font-bold">{recipe.name}</h1>
      </div>
      <p className="max-w-lg text-xl leading-relaxed text-muted-foreground">
        {instruction}
      </p>
      {actionError && (
        <p className="text-sm text-destructive">{actionError}</p>
      )}
      <div
        className={cn(
          'grid w-full max-w-lg gap-3',
          onCancel ? 'grid-cols-2' : 'grid-cols-1',
        )}
      >
        {onCancel && (
          <Button
            variant="outline"
            size="kiosk"
            className="w-full"
            onClick={onCancel}
          >
            Back
          </Button>
        )}
        <Button
          size="kiosk"
          className={cn('kiosk-cta w-full', !onCancel && 'mx-auto max-w-xs')}
          onClick={onConfirm}
        >
          {actionLabel}
        </Button>
      </div>
    </PourScreenShell>
  );
}
