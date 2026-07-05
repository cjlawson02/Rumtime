export const PUMPS_SETUP_SECTION = {
  id: 'pumps',
  title: 'Bottle bay',
  icon: '🍾',
  subtitle: 'Liquids, bottle size, and fill on each line',
  description:
    'Each line draws from one bottle — pick the liquid, size, and level, or mark a refill after swapping.',
} as const;

export const CALIBRATION_SETUP_SECTION = {
  id: 'calibration',
  title: 'Pour tuning',
  icon: '💧',
  subtitle: 'How fast each line pours and when it stops',
  description:
    'Set flow rate and anti-drip timing so measured pours match the recipe.',
} as const;

export const CLEANING_SETUP_SECTION = {
  id: 'cleaning',
  title: 'Line cleaning',
  icon: '🧼',
  subtitle: 'Flush, sanitize, and dry each line',
  description:
    'Step through warm-water flush, sanitizer, and drain after a session so lines stay food-safe.',
} as const;

export const DEVICE_SETUP_SECTION = {
  id: 'device',
  title: 'Machine status',
  icon: '📶',
  subtitle: 'Connection, address, and firmware version',
  description:
    'Check whether the kiosk can reach the dispenser. Override with an IP address when mDNS is unavailable.',
} as const;

export const SETUP_SECTIONS = [
  PUMPS_SETUP_SECTION,
  CALIBRATION_SETUP_SECTION,
  CLEANING_SETUP_SECTION,
  DEVICE_SETUP_SECTION,
] as const;

export type SetupSection = (typeof SETUP_SECTIONS)[number];
export type SetupSectionId = SetupSection['id'];

export function getSetupSection(id: string): SetupSection | undefined {
  return SETUP_SECTIONS.find((section) => section.id === id);
}

export const SETUP_INDEX = {
  title: 'Setup',
  subtitle: 'Bottle bay, pour tuning, cleaning, and machine status',
  description:
    "Everything behind the taps — what's on each line, how pours run, keeping lines clean, and how the bar connects.",
} as const;
