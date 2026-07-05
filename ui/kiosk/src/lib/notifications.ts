import type { DeviceNotification, DeviceStatus } from '@/api/types';
import type { UnavailableRecipe } from '@/lib/availability';
import { issueLabel } from '@/lib/availability';
import { setupSectionPath } from '@/hooks/use-setup-return';
import { sanitizeInternalPath } from '@/lib/safe-href';

export type KioskNotificationSource = 'device' | 'menu';

export type KioskNotification = {
  id: string;
  severity: DeviceNotification['severity'];
  title: string;
  detail?: string;
  actionHref?: string;
  actionLabel?: string;
  source: KioskNotificationSource;
};

const SEVERITY_RANK: Record<KioskNotification['severity'], number> = {
  error: 0,
  warning: 1,
  info: 2,
};

function menuAlertsFromUnavailable(
  unavailable: UnavailableRecipe[],
): KioskNotification[] {
  const map = new Map<
    string,
    {
      severity: KioskNotification['severity'];
      title: string;
      drinks: string[];
    }
  >();

  for (const { recipe, availability } of unavailable) {
    for (const issue of availability.issues) {
      const key = `${issue.type}-${issue.ingredient.id}`;
      let entry = map.get(key);
      if (!entry) {
        entry =
          issue.type === 'unbound'
            ? {
                severity: 'error',
                title: issueLabel(issue),
                drinks: [],
              }
            : issue.type === 'unprimed'
              ? {
                  severity: 'warning',
                  title: `${issue.ingredient.name} line not primed`,
                  drinks: [],
                }
              : {
                  severity: 'warning',
                  title: issueLabel(issue),
                  drinks: [],
                };
        map.set(key, entry);
      }
      if (!entry.drinks.includes(recipe.name)) {
        entry.drinks.push(recipe.name);
      }
    }
  }

  return [...map.entries()]
    .map(([key, entry]) => ({
      id: `menu-${key}`,
      severity: entry.severity,
      title: entry.title,
      detail:
        entry.drinks.length > 0
          ? `Affects: ${entry.drinks.join(', ')}`
          : undefined,
      actionHref: setupSectionPath('pumps'),
      actionLabel: 'Open bottle bay',
      source: 'menu' as const,
    }))
    .sort((a, b) => {
      const severityDelta =
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (severityDelta !== 0) return severityDelta;
      return a.title.localeCompare(b.title);
    });
}

function deviceAlertsFromStatus(status: DeviceStatus): KioskNotification[] {
  return (status.notifications ?? []).map((notification) => ({
    id: `device-${notification.id}`,
    severity: notification.severity,
    title: notification.title,
    detail: notification.message,
    actionHref: sanitizeInternalPath(notification.actionHref),
    actionLabel: notification.actionLabel,
    source: 'device' as const,
  }));
}

export function collectKioskNotifications(input: {
  status: DeviceStatus;
  unavailableRecipes?: UnavailableRecipe[];
}): KioskNotification[] {
  const menuAlerts = menuAlertsFromUnavailable(input.unavailableRecipes ?? []);
  const deviceAlerts = deviceAlertsFromStatus(input.status);
  const merged = new Map<string, KioskNotification>();

  for (const notification of [...deviceAlerts, ...menuAlerts]) {
    merged.set(notification.id, notification);
  }

  return [...merged.values()].sort((a, b) => {
    const severityDelta = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (severityDelta !== 0) return severityDelta;
    if (a.source !== b.source) return a.source === 'device' ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
}

export function notificationCenterSummary(
  notifications: KioskNotification[],
): string {
  const deviceCount = notifications.filter(
    (notification) => notification.source === 'device',
  ).length;
  if (deviceCount > 0) {
    return `${deviceCount} alert${deviceCount === 1 ? '' : 's'} from the dispenser`;
  }

  return `${notifications.length} alert${notifications.length === 1 ? '' : 's'}`;
}
