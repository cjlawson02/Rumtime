import type { PumpSlot } from '@/api/types';

export function sortPumpSlots(pumps: PumpSlot[]): PumpSlot[] {
  return [...pumps].sort((a, b) => a.pumpId - b.pumpId);
}

export function findPumpSlot(
  pumps: PumpSlot[] | null | undefined,
  pumpId: number,
): PumpSlot | undefined {
  return pumps?.find((pump) => pump.pumpId === pumpId);
}
