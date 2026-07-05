import { useMemo, useState } from "react";

import type { PumpSlot } from "@/api/types";
import { CalibrationWizard } from "@/components/kiosk/calibration-wizard";
import { PrimeWizard } from "@/components/kiosk/prime-wizard";
import { PumpCalibrationMetrics } from "@/components/kiosk/pump-calibration-metrics";
import { SetupSectionLayout } from "@/components/kiosk/setup-section-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CALIBRATION_SETUP_SECTION } from "@/data/setup-sections";
import { useDeviceStatus } from "@/hooks/use-device-status";
import { useIngredientNameLookup } from "@/hooks/use-ingredient-name-lookup";
import { resolvePumpCalibration } from "@/lib/calibration";
import { sortPumpSlots } from "@/lib/pumps";

const pourTuning = CALIBRATION_SETUP_SECTION;

function PourTuningPanel() {
  const { status } = useDeviceStatus();
  const [primePumpId, setPrimePumpId] = useState<number | null>(null);
  const [calibratePumpId, setCalibratePumpId] = useState<number | null>(null);
  const nameForIngredient = useIngredientNameLookup();

  const pumps = useMemo(() => {
    if (!status?.pumps?.length) return [];
    return sortPumpSlots(status.pumps);
  }, [status]);

  if (!status) {
    return <p className="text-muted-foreground">Loading pour tuning…</p>;
  }

  return (
    <div className="space-y-6">
      <p className="max-w-2xl text-sm text-muted-foreground">
        {pourTuning.description} Use Prime or Calibrate on each assigned line to
        update flow rate and anti-drip.
      </p>

      <ul className="grid grid-cols-3 gap-4">
        {pumps.map((pump: PumpSlot) => {
          const binding =
            pump.ingredientId !== null
              ? status.bindings[pump.ingredientId]
              : undefined;
          const calibration = resolvePumpCalibration(pump);
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
                    {pump.ingredientId && binding ? (
                      <Badge variant={primed ? "default" : "destructive"}>
                        {primed ? "Primed" : "Needs prime"}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {pump.ingredientId
                      ? nameForIngredient(pump.ingredientId)
                      : "Unassigned"}
                  </p>
                </div>

                {pump.ingredientId && binding ? (
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="kiosk-touch"
                      onClick={() => {
                        setPrimePumpId(pump.pumpId);
                      }}
                    >
                      Prime
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="kiosk-touch"
                      onClick={() => {
                        setCalibratePumpId(pump.pumpId);
                      }}
                    >
                      Calibrate
                    </Button>
                  </div>
                ) : null}
              </div>

              <PumpCalibrationMetrics
                mlPerSecond={calibration.mlPerSecond}
                antiDripMs={calibration.antiDripMs}
              />
            </li>
          );
        })}
      </ul>

      {primePumpId !== null && (
        <PrimeWizard
          open
          pumpId={primePumpId}
          onOpenChange={(open) => {
            if (!open) setPrimePumpId(null);
          }}
          ingredientName={nameForIngredient}
        />
      )}

      {calibratePumpId !== null && (
        <CalibrationWizard
          open
          pumpId={calibratePumpId}
          onOpenChange={(open) => {
            if (!open) setCalibratePumpId(null);
          }}
          ingredientName={nameForIngredient}
        />
      )}
    </div>
  );
}

export function SetupCalibrationPage() {
  return (
    <SetupSectionLayout section={pourTuning}>
      <PourTuningPanel />
    </SetupSectionLayout>
  );
}
