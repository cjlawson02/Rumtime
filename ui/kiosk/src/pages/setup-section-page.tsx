import { Redirect, useRoute } from 'wouter';

import { KioskMessageScreen } from '@/components/kiosk/kiosk-message-screen';
import { LinkButton } from '@/components/kiosk/link-button';
import { SetupSectionLayout } from '@/components/kiosk/setup-section-layout';
import { getSetupSection } from '@/data/setup-sections';
import { SETUP_ROOT } from '@/hooks/use-setup-return';

const DEDICATED_SECTION_ROUTES: Record<string, string> = {
  pumps: '/setup/pumps',
  calibration: '/setup/calibration',
  cleaning: '/setup/cleaning',
  device: '/setup/device',
};

export function SetupSectionPage() {
  const [, params] = useRoute('/setup/:section');
  const sectionId = params?.section ?? '';
  const dedicatedRoute = DEDICATED_SECTION_ROUTES[sectionId];

  if (dedicatedRoute) {
    return <Redirect to={dedicatedRoute} />;
  }

  const section = getSetupSection(sectionId);

  if (!section) {
    return (
      <KioskMessageScreen
        message="Setup section not found."
        action={
          <LinkButton href={SETUP_ROOT} className="kiosk-cta">
            Back to setup
          </LinkButton>
        }
      />
    );
  }

  return (
    <SetupSectionLayout section={section}>
      <p className="max-w-2xl text-muted-foreground">{section.description}</p>
    </SetupSectionLayout>
  );
}
