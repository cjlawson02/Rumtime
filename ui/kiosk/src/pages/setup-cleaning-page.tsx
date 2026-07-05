import { useMemo, useState } from 'react';

import type { PumpSlot } from '@/api/types';
import { CleaningWizard } from '@/components/kiosk/cleaning-wizard';
import { SetupSectionLayout } from '@/components/kiosk/setup-section-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CLEANING_SETUP_SECTION } from '@/data/setup-sections';
import { useDeviceStatus } from '@/hooks/use-device-status';
import { useIngredientNameLookup } from '@/hooks/use-ingredient-name-lookup';
import {
  lineCleaningBadgeLabel,
  type LineCleaningStatus,
} from '@/lib/cleaning';
import { sortPumpSlots } from '@/lib/pumps';

const lineCleaning = CLEANING_SETUP_SECTION;

function cleaningBadgeVariant(
  status: LineCleaningStatus,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'done':
      return 'default';
    case 'sanitized':
    case 'flushed':
      return 'secondary';
    default:
      return 'outline';
  }
}

function LineCleaningPanel() {
  const { status } = useDeviceStatus();
  const [lineStatuses, setLineStatuses] = useState<
    Record<number, LineCleaningStatus>
  >({});
  const [sessionWizardOpen, setSessionWizardOpen] = useState(false);
  const [lineWizardPumpId, setLineWizardPumpId] = useState<number | null>(null);
  const nameForIngredient = useIngredientNameLookup();

  const pumps = useMemo(() => {
    if (!status?.pumps?.length) return [];
    return sortPumpSlots(status.pumps);
  }, [status]);

  const assignedPumpIds = useMemo(
    () => pumps.filter((pump) => pump.ingredientId).map((pump) => pump.pumpId),
    [pumps],
  );

  const mergeStatuses = (updates: Record<number, LineCleaningStatus>) => {
    setLineStatuses((prev) => {
      const next = { ...prev };
      for (const [pumpId, nextStatus] of Object.entries(updates)) {
        const id = Number(pumpId);
        const current = prev[id] ?? 'idle';
        if (nextStatus === 'done') {
          next[id] = 'done';
        } else if (
          nextStatus === 'sanitized' &&
          (current === 'idle' ||
            current === 'flushed' ||
            current === 'sanitized')
        ) {
          next[id] = 'sanitized';
        } else if (
          nextStatus === 'flushed' &&
          (current === 'idle' || current === 'flushed')
        ) {
          next[id] = 'flushed';
        }
      }
      return next;
    });
  };

  if (!status) {
    return <p className="text-muted-foreground">Loading line cleaning…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-2xl text-sm text-muted-foreground">
          {lineCleaning.description} Pick up tubes from bottles, flush with warm
          water, run sanitizer, drain into waste, then unassign lines for the
          next session.
        </p>
        <Button
          type="button"
          className="kiosk-touch shrink-0"
          disabled={assignedPumpIds.length === 0}
          onClick={() => { setSessionWizardOpen(true); }}
        >
          Start session clean
        </Button>
      </div>

      <ul className="grid grid-cols-2 gap-4">
        {pumps.map((pump: PumpSlot) => {
          const cleaningStatus = lineStatuses[pump.pumpId] ?? 'idle';
          const binding =
            pump.ingredientId !== null
              ? status.bindings[pump.ingredientId]
              : undefined;
          const primed = binding?.primed ?? false;

          return (
            <li
              key={pump.pumpId}
              className="flex min-w-0 flex-col gap-4 rounded-xl border border-border/60 bg-secondary/50 px-4 py-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-heading text-lg font-semibold">
                      Line {pump.pumpId}
                    </p>
                    <Badge variant={cleaningBadgeVariant(cleaningStatus)}>
                      {lineCleaningBadgeLabel(cleaningStatus)}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {pump.ingredientId
                      ? nameForIngredient(pump.ingredientId)
                      : 'Unassigned'}
                  </p>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="kiosk-touch shrink-0"
                  onClick={() => { setLineWizardPumpId(pump.pumpId); }}
                >
                  Clean line
                </Button>
              </div>

              {pump.ingredientId && binding ? (
                <p className="text-sm text-muted-foreground">
                  {primed ? 'Primed — re-prime after cleaning.' : 'Needs prime'}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Unassigned — flush, sanitize, and drain before reuse.
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {sessionWizardOpen && (
        <CleaningWizard
          open
          mode="session"
          pumpIds={assignedPumpIds}
          ingredientName={nameForIngredient}
          onOpenChange={(open) => {
            if (!open) setSessionWizardOpen(false);
          }}
          onComplete={(updates) => {
            mergeStatuses(updates);
          }}
        />
      )}

      {lineWizardPumpId !== null && (
        <CleaningWizard
          open
          mode="line"
          pumpIds={[lineWizardPumpId]}
          ingredientName={nameForIngredient}
          onOpenChange={(open) => {
            if (!open) setLineWizardPumpId(null);
          }}
          onComplete={(updates) => {
            mergeStatuses(updates);
          }}
        />
      )}
    </div>
  );
}

export function SetupCleaningPage() {
  return (
    <SetupSectionLayout section={lineCleaning}>
      <LineCleaningPanel />
    </SetupSectionLayout>
  );
}
