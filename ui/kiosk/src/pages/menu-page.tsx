import { useMemo } from 'react';
import { Settings, Wifi, WifiOff } from 'lucide-react';

import { DrinkCard } from '@/components/kiosk/drink-card';
import { NotificationCenter } from '@/components/kiosk/notification-center';
import { SetupEntryLink } from '@/components/kiosk/setup-entry-link';
import { KioskShell } from '@/components/kiosk/kiosk-shell';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  CATEGORIES,
  type CategoryId,
  recipeMatchesCategory,
} from '@/data/categories';
import { getCategoryStyle } from '@/data/category-styles';
import { MENU_HERO_IMAGE } from '@/data/drink-images';
import { useMenuCategory } from '@/hooks/use-menu-category';
import { useDeviceEndpoint } from '@/hooks/use-device-endpoint';
import { useDeviceStatus } from '@/hooks/use-device-status';
import type { Recipe } from '@/api/types';
import { getRecipes, getRecipeCatalogError } from '@/data/load-recipes';
import {
  firstBlockingMessage,
  partitionMenuRecipes,
} from '@/lib/availability';
import { collectKioskNotifications } from '@/lib/notifications';
import { SETUP_ROOT } from '@/hooks/use-setup-return';
import { cn } from '@/lib/utils';

function ConnectionBadge({
  loading,
  error,
  connected,
  hostname,
}: {
  loading: boolean;
  error: string | null;
  connected?: boolean;
  hostname?: string;
}) {
  if (loading) {
    return (
      <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <span className="size-2 animate-pulse rounded-full bg-amber-400/60" />
        Connecting…
      </span>
    );
  }

  if (error || !connected) {
    return (
      <span className="inline-flex items-center gap-2 text-sm text-amber-200/80">
        <WifiOff className="size-4" />
        Device offline
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 text-sm text-emerald-300/90">
      <Wifi className="size-4" />
      Connected · {hostname ?? 'rumtime.local'}
    </span>
  );
}

type MenuEntry = {
  recipe: Recipe;
  unavailableReason?: string;
};

export function MenuPage() {
  const catalogError = getRecipeCatalogError();
  const { category, setCategory } = useMenuCategory();
  const recipes = getRecipes();
  const { status, error, loading, connected, refresh } = useDeviceStatus();
  const { hostname } = useDeviceEndpoint();
  const availabilityKnown = Boolean(status) && !error;

  const filtered =
    category === 'all'
      ? recipes
      : recipes.filter((r) => recipeMatchesCategory(r.categories, category));

  const { menuEntries, notifications, unavailableCount, staleStatus } =
    useMemo((): {
      menuEntries: MenuEntry[];
      notifications: ReturnType<typeof collectKioskNotifications>;
      unavailableCount: number;
      staleStatus: boolean;
    } => {
      if (!status) {
        return {
          menuEntries: [],
          notifications: [],
          unavailableCount: 0,
          staleStatus: false,
        };
      }

      const { available, unavailable } = partitionMenuRecipes(filtered, status);
      const entries: MenuEntry[] = [
        ...available.map((recipe): MenuEntry => ({ recipe })),
        ...unavailable.map(({ recipe, availability }): MenuEntry => ({
          recipe,
          unavailableReason:
            firstBlockingMessage(availability.issues) ?? undefined,
        })),
      ];

      return {
        menuEntries: entries,
        notifications: collectKioskNotifications({
          status,
          unavailableRecipes: unavailable,
        }),
        unavailableCount: unavailable.length,
        staleStatus: Boolean(error),
      };
    }, [filtered, status, error]);

  return (
    <KioskShell>
      <section className="relative h-44 shrink-0 overflow-hidden md:h-52">
        <img
          src={MENU_HERO_IMAGE}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="kiosk-hero-overlay absolute inset-0" />
        <div className="relative flex h-full flex-col justify-end px-6 pb-5 pt-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="font-heading text-4xl font-bold tracking-tight md:text-5xl">
                Home bar
              </h1>
              <ConnectionBadge
                loading={loading}
                error={error}
                connected={connected}
                hostname={hostname}
              />
            </div>
            <div className="flex items-center gap-2">
              {availabilityKnown && (
                <NotificationCenter notifications={notifications} />
              )}
              <SetupEntryLink
                href={SETUP_ROOT}
                variant="outline"
                size="icon"
                className="kiosk-touch size-14 border-white/20 bg-black/30 backdrop-blur-sm hover:bg-black/50"
              >
                <Settings className="size-5" />
                <span className="sr-only">Setup</span>
              </SetupEntryLink>
            </div>
          </div>
        </div>
      </section>

      <div className="sticky top-0 z-10 border-b border-border/60 bg-background/70 px-6 py-3 backdrop-blur-md">
        <div className="-mx-6 overflow-x-auto px-6 py-0.5">
          <ToggleGroup
            value={[category]}
            onValueChange={(values) => {
              const next = values[0] as CategoryId | undefined;
              if (next && CATEGORIES.some((cat) => cat.id === next)) {
                setCategory(next);
              }
            }}
            spacing={2}
            className="flex w-max flex-nowrap gap-2"
            aria-label="Filter drinks by spirit"
          >
            {CATEGORIES.map((cat) => {
              const style = getCategoryStyle(cat.id);
              const selected = category === cat.id;
              if (!style) return null;

              return (
                <ToggleGroupItem
                  key={cat.id}
                  value={cat.id}
                  className={cn(
                    'min-h-14 shrink-0 rounded-full border border-transparent px-6 text-lg font-medium transition-all',
                    selected
                      ? style.pillActive
                      : cn('bg-secondary/60', style.pillIdle),
                  )}
                >
                  {cat.label}
                </ToggleGroupItem>
              );
            })}
          </ToggleGroup>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto px-6 py-6">
        {catalogError && (
          <Alert variant="destructive" className="mb-5">
            <AlertTitle>Menu unavailable</AlertTitle>
            <AlertDescription>
              Recipe catalog failed to load: {catalogError}
            </AlertDescription>
          </Alert>
        )}

        {staleStatus && (
          <Alert className="mb-5 border-amber-500/40 bg-amber-500/10">
            <AlertTitle>Showing last known menu</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-3">
              <span>Device status may be out of date.</span>
              <button
                type="button"
                className="underline underline-offset-2"
                onClick={() => void refresh()}
              >
                Retry
              </button>
            </AlertDescription>
          </Alert>
        )}

        {error && !status && (
          <Alert variant="destructive" className="mb-5">
            <AlertTitle>Device unreachable</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-3">
              <span>{error}</span>
              <button
                type="button"
                className="underline underline-offset-2"
                onClick={() => void refresh()}
              >
                Retry
              </button>
            </AlertDescription>
          </Alert>
        )}

        <p className="mb-5 text-base text-muted-foreground">
          {menuEntries.length} drink{menuEntries.length === 1 ? '' : 's'}
          {unavailableCount > 0
            ? ` · ${unavailableCount} unavailable`
            : ''}
          {category !== 'all'
            ? ` · ${CATEGORIES.find((c) => c.id === category)?.label}`
            : ''}
        </p>

        {menuEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <p className="font-heading text-2xl font-semibold">
              {catalogError
                ? 'Menu could not load'
                : staleStatus
                  ? 'Menu paused — device offline'
                  : 'No drinks ready'}
            </p>
            <p className="max-w-sm text-muted-foreground">
              {catalogError
                ? 'Fix recipes.json and reload the kiosk.'
                : staleStatus
                  ? 'Retry connection when the machine is back online.'
                  : notifications.length > 0
                    ? 'Check notifications to see what needs attention.'
                    : 'Nothing matches this filter right now.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-5 lg:grid-cols-3">
            {menuEntries.map(({ recipe, unavailableReason }) => (
              <DrinkCard
                key={recipe.id}
                recipe={recipe}
                unavailableReason={unavailableReason}
              />
            ))}
          </div>
        )}
      </main>
    </KioskShell>
  );
}
