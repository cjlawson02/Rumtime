/** US customary fluid ounce (29.5735 ml). */
export const ML_PER_US_FL_OZ = 29.5735;

/** Round ml to the nearest quarter ounce for guest-facing labels. */
export function mlToRoughOz(ml: number): number {
  if (!Number.isFinite(ml) || ml <= 0) return 0;
  return Math.round((ml / ML_PER_US_FL_OZ) * 4) / 4;
}

function formatOzValue(oz: number): string {
  if (oz <= 0) return '0 oz';
  if (Number.isInteger(oz)) return `${oz} oz`;
  return `${oz.toFixed(1).replace(/\.0$/, '')} oz`;
}

/** Rough US fl oz equivalent, prefixed with ~ */
export function formatRoughOz(ml: number): string {
  return `~${formatOzValue(mlToRoughOz(ml))}`;
}

/** Guest-facing volume: rough oz first, exact ml in parentheses. */
export function formatVolumeMl(ml: number): string {
  return `${formatRoughOz(ml)} (${ml} ml)`;
}
