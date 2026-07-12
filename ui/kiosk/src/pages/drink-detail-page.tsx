import { useState } from 'react';
import {
  ArrowLeft,
  Droplets,
  Hand,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { useLocation, useRoute } from 'wouter';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LinkButton } from '@/components/kiosk/link-button';
import { KioskMessageScreen } from '@/components/kiosk/kiosk-message-screen';
import { KioskShell } from '@/components/kiosk/kiosk-shell';
import { DrinkImage } from '@/components/kiosk/drink-image';
import { SetupPinDialog } from '@/components/kiosk/setup-pin-dialog';
import { getCategoryStyle } from '@/data/category-styles';
import { getRecipeById } from '@/data/load-recipes';
import { useDeviceStatus } from '@/hooks/use-device-status';
import { SetupEntryLink } from '@/components/kiosk/setup-entry-link';
import { useEnterSetup, setupSectionPath } from '@/hooks/use-setup-return';
import {
  canShowRefillCta,
  effectiveBlockingIssues,
  firstBlockingMessage,
  getDrinkAvailability,
  hasUnboundIssues,
  isPourBlocked,
  issueStatusChipLabel,
  refillButtonLabel,
} from '@/lib/availability';
import { isSetupPinConfigured } from '@/lib/config';
import { grantPourInventoryBypass } from '@/lib/pour-inventory-bypass';
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
import { formatVolumeMl } from '@/lib/volume';
import { cn } from '@/lib/utils';

export function DrinkDetailPage() {
  const [, params] = useRoute('/drink/:id');
  const [, navigate] = useLocation();
  const enterSetup = useEnterSetup();
  const recipe = getRecipeById(params?.id ?? '');
  const { status, error, loading, refresh } = useDeviceStatus();
  const [refillPinOpen, setRefillPinOpen] = useState(false);
  const [inventoryChoiceOpen, setInventoryChoiceOpen] = useState(false);
  const [pourError, setPourError] = useState<string | null>(null);

  if (!recipe) {
    return (
      <KioskMessageScreen
        message="Drink not found."
        action={
          <LinkButton href="/" className="kiosk-cta">
            Back to menu
          </LinkButton>
        }
      />
    );
  }

  if (loading && !status) {
    return <KioskMessageScreen message="Loading device status…" />;
  }

  if (!status) {
    return (
      <KioskMessageScreen
        message={error ?? 'Device unreachable'}
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <Button className="kiosk-touch" onClick={() => void refresh()}>
              Retry
            </Button>
            <LinkButton href="/" variant="outline" className="kiosk-touch">
              Menu
            </LinkButton>
          </div>
        }
        className="max-w-md"
      />
    );
  }

  const deviceReady = status.connected && !error;

  const availability = getDrinkAvailability(recipe, status);
  const blockingIssues = availability.issues;
  const pourBlocked = isPourBlocked(availability.issues);
  const unboundBlocked = hasUnboundIssues(blockingIssues);
  const showRefillCta =
    canShowRefillCta(blockingIssues) &&
    (import.meta.env.DEV || isSetupPinConfigured());
  const refillLabel = refillButtonLabel(blockingIssues);
  const primaryCategory = recipe.categories[0];
  const pumped = recipe.ingredients.filter((i) => i.kind === 'pumped');
  const setupPumpsPath = setupSectionPath('pumps');

  const goToPour = ({ bypassInventory = false } = {}) => {
    if (!deviceReady) {
      setPourError(error ?? 'Device offline');
      return;
    }

    const current = getDrinkAvailability(recipe, status);
    if (effectiveBlockingIssues(current.issues, bypassInventory).length > 0) {
      const message = firstBlockingMessage(current.issues, bypassInventory);
      if (message) setPourError(message);
      return;
    }

    setPourError(null);
    if (bypassInventory) {
      grantPourInventoryBypass(recipe.id);
    }
    navigate(`/pour/${recipe.id}`);
  };

  const handleMakeIt = () => {
    goToPour();
  };

  const handlePourAnyway = () => {
    goToPour({ bypassInventory: true });
  };

  const tryRefillPin = () => {
    setRefillPinOpen(false);
    setInventoryChoiceOpen(true);
  };

  const handleRefillInSetup = () => {
    setInventoryChoiceOpen(false);
    enterSetup(setupPumpsPath);
  };

  const handlePourAnywayFromChoice = () => {
    setInventoryChoiceOpen(false);
    handlePourAnyway();
  };

  return (
    <KioskShell>
      <header className="sticky top-0 z-20 shrink-0">
        <div className="relative h-56 overflow-hidden md:h-64">
          <DrinkImage
            recipeId={recipe.id}
            category={primaryCategory}
            eager
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="kiosk-hero-overlay absolute inset-0" />
          <div className="relative flex h-full flex-col justify-between p-6">
            <LinkButton
              href="/"
              variant="outline"
              size="lg"
              className="kiosk-touch w-fit self-start gap-2 border-white/20 bg-black/40 backdrop-blur-sm hover:bg-black/60"
            >
              <ArrowLeft className="size-5" />
              Menu
            </LinkButton>
            <div className="flex flex-wrap gap-2">
              {recipe.categories.map((categoryId) => {
                const style = getCategoryStyle(categoryId);
                if (!style) return null;

                return (
                  <span
                    key={categoryId}
                    className={cn(
                      'inline-block rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wider',
                      style.pillActive,
                    )}
                  >
                    {style.label}
                  </span>
                );
              })}
              <h1 className="w-full font-heading text-4xl font-bold tracking-tight md:text-5xl">
                {recipe.name}
              </h1>
            </div>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-6 p-6 pb-36">
        <p className="text-lg leading-relaxed text-muted-foreground">
          {recipe.description}
        </p>

        <div className="flex flex-wrap items-stretch gap-4">
          <Card className="min-w-[min(100%,16rem)] flex-1 border-border/60 bg-card/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-heading text-xl">
                <Droplets className="size-5 text-primary" />
                Dispensed for you
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {pumped.map((i) => {
                const issue = blockingIssues.find(
                  (candidate) => candidate.ingredient.id === i.id,
                );
                if (i.ml === undefined) return null;

                return (
                  <div
                    key={i.id}
                    className={cn(
                      'inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-secondary/50 px-4 py-3 text-base',
                      issue && 'border border-destructive/30 bg-destructive/5',
                    )}
                  >
                    <span>{i.name}</span>
                    <span
                      className={cn(
                        'font-medium tabular-nums',
                        issue ? 'text-muted-foreground' : 'text-primary',
                      )}
                    >
                      {formatVolumeMl(i.ml)}
                    </span>
                    {issue && (
                      <Badge
                        variant="destructive"
                        className="border-destructive/30 bg-destructive/15 text-xs"
                      >
                        {issueStatusChipLabel(issue)}
                      </Badge>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {availability.manualItems.length > 0 && (
            <Card className="min-w-[min(100%,16rem)] flex-1 border-amber-500/20 bg-amber-500/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-heading text-xl">
                  <Hand className="size-5 text-amber-400" />
                  You add manually
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {availability.manualItems.map((i) => (
                  <div
                    key={i.id}
                    className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-secondary/50 px-4 py-3 text-base"
                  >
                    <span>{i.name}</span>
                    {i.ml !== undefined && (
                      <span className="font-medium tabular-nums text-primary">
                        {formatVolumeMl(i.ml)}
                      </span>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Device offline</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {pourError && (
          <Alert variant="destructive">
            <AlertTitle>Pour failed</AlertTitle>
            <AlertDescription>{pourError}</AlertDescription>
          </Alert>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 border-t border-border/60 bg-background/90 p-6 backdrop-blur-md">
        {unboundBlocked ? (
          <SetupEntryLink
            href={setupPumpsPath}
            size="lg"
            className="kiosk-cta w-full gap-2"
          >
            Open bottle bay
          </SetupEntryLink>
        ) : showRefillCta && refillLabel ? (
          <Button
            size="lg"
            className="kiosk-cta w-full gap-2 bg-destructive text-destructive-foreground shadow-destructive/20 hover:bg-destructive/90"
            onClick={() => { setRefillPinOpen(true); }}
          >
            <RefreshCw className="size-5" />
            {refillLabel}
          </Button>
        ) : (
          <Button
            size="lg"
            className="kiosk-cta w-full gap-2"
            disabled={pourBlocked || !deviceReady}
            onClick={handleMakeIt}
          >
            <Sparkles className="size-5" />
            Make it
          </Button>
        )}
      </div>

      <SetupPinDialog
        open={refillPinOpen}
        onOpenChange={setRefillPinOpen}
        title={refillLabel ?? 'Refill'}
        description="Enter the setup PIN to continue."
        onSuccess={tryRefillPin}
      />

      <AlertDialog
        open={inventoryChoiceOpen}
        onOpenChange={setInventoryChoiceOpen}
      >
        <AlertDialogContent className="border-border/60 bg-popover">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading text-2xl">
              {refillLabel ?? 'Low inventory'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Refill the bottle in setup, or pour with what is left anyway.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <AlertDialogAction
              className="kiosk-touch w-full"
              onClick={handleRefillInSetup}
            >
              Refill in bottle bay
            </AlertDialogAction>
            <AlertDialogAction
              className="kiosk-touch w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handlePourAnywayFromChoice}
            >
              Pour anyway
            </AlertDialogAction>
            <AlertDialogCancel className="kiosk-touch w-full">
              Cancel
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </KioskShell>
  );
}
