import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';

import type { PumpSlot } from '@/api/types';
import { BottleLevelBar } from '@/components/kiosk/bottle-level-bar';
import { BottleSizeInput } from '@/components/kiosk/bottle-size-input';
import { LineSwapWizard } from '@/components/kiosk/line-swap-wizard';
import { PrimeWizard } from '@/components/kiosk/prime-wizard';
import { FillLevelInput } from '@/components/kiosk/fill-level-input';
import { SetupSectionLayout } from '@/components/kiosk/setup-section-layout';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PUMPS_SETUP_SECTION } from '@/data/setup-sections';
import { getPumpedIngredients } from '@/data/pumped-ingredients';
import { useDeviceStatus } from '@/hooks/use-device-status';
import { useIngredientNameLookup } from '@/hooks/use-ingredient-name-lookup';
import {
  useApplyIngredientSwap,
  useRefillIngredient,
} from '@/hooks/use-device-mutations';
import {
  ingredientSwapCopy,
  shouldPromptIngredientSwap,
  shouldPromptPrimeAfterAssign,
} from '@/lib/cleaning';
import { KIOSK_SELECT_CLASSNAME } from '@/lib/kiosk-input-styles';
import { mutationErrorMessage } from '@/lib/device-errors';
import { sortPumpSlots } from '@/lib/pumps';

const bottleBay = PUMPS_SETUP_SECTION;

type PendingSwap = {
  pumpId: number;
  fromIngredientId: string | null;
  toIngredientId: string | null;
};

type PendingPrime = {
  pumpId: number;
  ingredientId: string;
};

function PumpInventoryPanel() {
  const { status } = useDeviceStatus();
  const applyIngredientSwap = useApplyIngredientSwap();
  const refillIngredient = useRefillIngredient();
  const ingredients = useMemo(() => getPumpedIngredients(), []);
  const nameForIngredient = useIngredientNameLookup();
  const [refilling, setRefilling] = useState<string | null>(null);
  const [refilledIds, setRefilledIds] = useState<Set<string>>(() => new Set());
  const [savingPump, setSavingPump] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingSwap, setPendingSwap] = useState<PendingSwap | null>(null);
  const [activeSwap, setActiveSwap] = useState<PendingSwap | null>(null);
  const [pendingPrime, setPendingPrime] = useState<PendingPrime | null>(null);
  const [activePrimePumpId, setActivePrimePumpId] = useState<number | null>(
    null,
  );

  const swapDialogCopy = pendingSwap
    ? ingredientSwapCopy(
        pendingSwap.pumpId,
        pendingSwap.fromIngredientId,
        pendingSwap.toIngredientId,
        nameForIngredient,
      )
    : null;

  const pumps = useMemo(() => {
    if (!status?.pumps?.length) return [];
    return sortPumpSlots(status.pumps);
  }, [status]);

  const clearRefilled = (ingredientId: string) => {
    setRefilledIds((prev) => {
      if (!prev.has(ingredientId)) return prev;
      const next = new Set(prev);
      next.delete(ingredientId);
      return next;
    });
  };

  const handleRefill = async (ingredientId: string) => {
    setRefilling(ingredientId);
    setError(null);
    try {
      await refillIngredient.mutateAsync({ ingredientId });
      setRefilledIds((prev) => new Set(prev).add(ingredientId));
    } catch (err) {
      setError(mutationErrorMessage(err, 'Refill failed'));
    } finally {
      setRefilling(null);
    }
  };

  const commitSwap = async (swap: PendingSwap) => {
    setSavingPump(swap.pumpId);
    setError(null);
    try {
      await applyIngredientSwap.mutateAsync(swap);
      if (swap.fromIngredientId) {
        clearRefilled(swap.fromIngredientId);
      }
      if (swap.toIngredientId) {
        clearRefilled(swap.toIngredientId);
      }
    } catch (err) {
      setError(mutationErrorMessage(err, 'Could not update pump'));
      throw err;
    } finally {
      setSavingPump(null);
    }
  };

  const handleIngredientChange = async (
    pump: PumpSlot,
    nextIngredientId: string,
  ) => {
    const toIngredientId = nextIngredientId === '' ? null : nextIngredientId;
    if (toIngredientId === pump.ingredientId) return;

    if (!shouldPromptIngredientSwap(pump.ingredientId, toIngredientId)) {
      setSavingPump(pump.pumpId);
      setError(null);
      try {
        await applyIngredientSwap.mutateAsync({
          pumpId: pump.pumpId,
          fromIngredientId: pump.ingredientId,
          toIngredientId,
        });
        if (
          shouldPromptPrimeAfterAssign(pump.ingredientId, toIngredientId) &&
          toIngredientId
        ) {
          setPendingPrime({
            pumpId: pump.pumpId,
            ingredientId: toIngredientId,
          });
        }
      } catch (err) {
        setError(mutationErrorMessage(err, 'Could not update pump'));
      } finally {
        setSavingPump(null);
      }
      return;
    }

    setPendingSwap({
      pumpId: pump.pumpId,
      fromIngredientId: pump.ingredientId,
      toIngredientId,
    });
  };

  const handleSaveSwapAnyway = async () => {
    if (!pendingSwap) return;
    try {
      await commitSwap(pendingSwap);
      setPendingSwap(null);
    } catch {
      // error surfaced in panel
    }
  };

  const handleCleanLineFirst = () => {
    if (!pendingSwap) return;
    setActiveSwap(pendingSwap);
    setPendingSwap(null);
  };

  const closeSwapDialog = (open: boolean) => {
    if (!open) setPendingSwap(null);
  };

  if (!status) {
    return <p className="text-muted-foreground">Loading bottle bay…</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{bottleBay.description}</p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <ul className="grid grid-cols-2 gap-4">
        {pumps.map((pump) => {
          const binding =
            pump.ingredientId !== null
              ? status.bindings[pump.ingredientId]
              : undefined;
          const bottleSizeMl = binding?.bottleSizeMl ?? 750;

          return (
            <li
              key={pump.pumpId}
              className="flex min-w-0 flex-col gap-4 rounded-xl border border-border/60 bg-secondary/50 px-4 py-4"
            >
              <p className="font-heading text-lg font-semibold">
                Line {pump.pumpId}
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div className="min-w-0 space-y-2">
                  <Label htmlFor={`pump-${pump.pumpId}-ingredient`}>
                    Ingredient
                  </Label>
                  <select
                    id={`pump-${pump.pumpId}-ingredient`}
                    aria-label={`Line ${pump.pumpId} ingredient`}
                    className={KIOSK_SELECT_CLASSNAME}
                    value={pump.ingredientId ?? ''}
                    disabled={savingPump === pump.pumpId}
                    onChange={(event) =>
                      void handleIngredientChange(pump, event.target.value)
                    }
                  >
                    <option value="">Unassigned</option>
                    {ingredients.map((ingredient) => (
                      <option key={ingredient.id} value={ingredient.id}>
                        {ingredient.name}
                      </option>
                    ))}
                  </select>
                </div>

                <BottleSizeInput
                  inputId={`pump-${pump.pumpId}-size`}
                  ingredientId={pump.ingredientId ?? ''}
                  bottleSizeMl={bottleSizeMl}
                  disabled={!pump.ingredientId}
                  onSaved={() => {
                    const ingredientId = pump.ingredientId;
                    if (ingredientId) clearRefilled(ingredientId);
                  }}
                  onError={setError}
                />
              </div>

              {pump.ingredientId && binding ? (
                <>
                  <FillLevelInput
                    ingredientId={pump.ingredientId}
                    remainingMl={binding.remainingMl}
                    bottleSizeMl={bottleSizeMl}
                    onSaved={() => {
                      const ingredientId = pump.ingredientId;
                      if (ingredientId) clearRefilled(ingredientId);
                    }}
                    onError={setError}
                    trailing={
                      refilledIds.has(pump.ingredientId) ? (
                        <span
                          className="inline-flex size-14 shrink-0 items-center justify-center rounded-xl border border-green-500/40 bg-green-500/15 text-green-500"
                          aria-label="Refilled"
                        >
                          <Check className="size-6" strokeWidth={2.5} />
                        </span>
                      ) : (
                        <Button
                          variant="destructive"
                          className="kiosk-touch h-14 shrink-0 px-4"
                          disabled={refilling === pump.ingredientId}
                          onClick={() => {
                            const ingredientId = pump.ingredientId;
                            if (ingredientId) void handleRefill(ingredientId);
                          }}
                        >
                          {refilling === pump.ingredientId
                            ? 'Refilling…'
                            : 'Mark refilled'}
                        </Button>
                      )
                    }
                  />
                  <BottleLevelBar
                    remainingMl={binding.remainingMl}
                    bottleSizeMl={bottleSizeMl}
                  />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Pick a liquid to set bottle size and fill for this line.
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <AlertDialog open={pendingSwap !== null} onOpenChange={closeSwapDialog}>
        <AlertDialogContent className="max-w-md border-border/60 bg-popover">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading text-2xl">
              {swapDialogCopy?.title ?? 'Change line liquid?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base leading-relaxed">
              {swapDialogCopy?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <AlertDialogAction
              className="kiosk-touch w-full"
              onClick={handleCleanLineFirst}
            >
              {swapDialogCopy?.cleanLabel ?? 'Start swap'}
            </AlertDialogAction>
            <AlertDialogAction
              className="kiosk-touch w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
              variant="destructive"
              onClick={() => void handleSaveSwapAnyway()}
            >
              {swapDialogCopy?.saveLabel ?? 'Assign without cleaning'}
            </AlertDialogAction>
            <AlertDialogCancel className="kiosk-touch w-full">
              Cancel
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingPrime !== null}
        onOpenChange={(open) => {
          if (!open) setPendingPrime(null);
        }}
      >
        <AlertDialogContent className="max-w-md border-border/60 bg-popover">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading text-2xl">
              Prime line {pendingPrime?.pumpId}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base leading-relaxed">
              {pendingPrime
                ? `${nameForIngredient(pendingPrime.ingredientId)} is assigned. Prime the line before pouring drinks.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <AlertDialogAction
              className="kiosk-touch w-full"
              onClick={() => {
                if (!pendingPrime) return;
                setActivePrimePumpId(pendingPrime.pumpId);
                setPendingPrime(null);
              }}
            >
              Prime now
            </AlertDialogAction>
            <AlertDialogCancel className="kiosk-touch w-full">
              Later
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {activePrimePumpId !== null && (
        <PrimeWizard
          open
          pumpId={activePrimePumpId}
          ingredientName={nameForIngredient}
          onOpenChange={(open) => {
            if (!open) setActivePrimePumpId(null);
          }}
        />
      )}

      {activeSwap?.fromIngredientId && (
        <LineSwapWizard
          open
          pumpId={activeSwap.pumpId}
          fromIngredientId={activeSwap.fromIngredientId}
          toIngredientId={activeSwap.toIngredientId}
          ingredientName={nameForIngredient}
          onApplySwap={async () => {
            await commitSwap(activeSwap);
          }}
          onOpenChange={(open) => {
            if (!open) setActiveSwap(null);
          }}
        />
      )}
    </div>
  );
}

export function SetupPumpsPage() {
  return (
    <SetupSectionLayout section={bottleBay}>
      <PumpInventoryPanel />
    </SetupSectionLayout>
  );
}
