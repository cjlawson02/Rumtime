import { lazy, Suspense } from 'react';
import { Route, Switch } from 'wouter';

import { KioskMessageScreen } from '@/components/kiosk/kiosk-message-screen';
import { LinkButton } from '@/components/kiosk/link-button';

const MenuPage = lazy(() =>
  import('@/pages/menu-page').then((m) => ({ default: m.MenuPage })),
);
const DrinkDetailPage = lazy(() =>
  import('@/pages/drink-detail-page').then((m) => ({
    default: m.DrinkDetailPage,
  })),
);
const PourPage = lazy(() =>
  import('@/pages/pour-page').then((m) => ({ default: m.PourPage })),
);
const SetupIndexPage = lazy(() =>
  import('@/pages/setup-index-page').then((m) => ({
    default: m.SetupIndexPage,
  })),
);
const SetupPumpsPage = lazy(() =>
  import('@/pages/setup-pumps-page').then((m) => ({
    default: m.SetupPumpsPage,
  })),
);
const SetupCalibrationPage = lazy(() =>
  import('@/pages/setup-calibration-page').then((m) => ({
    default: m.SetupCalibrationPage,
  })),
);
const SetupCleaningPage = lazy(() =>
  import('@/pages/setup-cleaning-page').then((m) => ({
    default: m.SetupCleaningPage,
  })),
);
const SetupDevicePage = lazy(() =>
  import('@/pages/setup-device-page').then((m) => ({
    default: m.SetupDevicePage,
  })),
);
const SetupSectionPage = lazy(() =>
  import('@/pages/setup-section-page').then((m) => ({
    default: m.SetupSectionPage,
  })),
);

function PageFallback() {
  return (
    <div className="kiosk-bg flex min-h-dvh items-center justify-center">
      <p className="text-muted-foreground">Loading…</p>
    </div>
  );
}

function NotFoundPage() {
  return (
    <KioskMessageScreen
      message="Page not found."
      action={
        <LinkButton href="/" className="kiosk-cta">
          Back to menu
        </LinkButton>
      }
    />
  );
}

export function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Switch>
        <Route path="/">
          <MenuPage />
        </Route>
        <Route path="/drink/:id">
          <DrinkDetailPage />
        </Route>
        <Route path="/pour/:id">
          <PourPage />
        </Route>
        <Route path="/setup/pumps">
          <SetupPumpsPage />
        </Route>
        <Route path="/setup/calibration">
          <SetupCalibrationPage />
        </Route>
        <Route path="/setup/cleaning">
          <SetupCleaningPage />
        </Route>
        <Route path="/setup/device">
          <SetupDevicePage />
        </Route>
        <Route path="/setup/:section">
          <SetupSectionPage />
        </Route>
        <Route path="/setup">
          <SetupIndexPage />
        </Route>
        <Route>
          <NotFoundPage />
        </Route>
      </Switch>
    </Suspense>
  );
}
