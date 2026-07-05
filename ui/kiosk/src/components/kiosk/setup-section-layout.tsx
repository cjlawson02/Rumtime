import type { ReactNode } from 'react';

import { SetupGate } from '@/components/kiosk/setup-gate';
import { SetupPageHeader } from '@/components/kiosk/setup-page-header';
import { KioskShell } from '@/components/kiosk/kiosk-shell';

type SetupSectionLayoutProps = {
  section: { title: string; subtitle: string };
  children: ReactNode;
  pinDescription?: string;
};

export function SetupSectionLayout({
  section,
  children,
  pinDescription,
}: SetupSectionLayoutProps) {
  return (
    <SetupGate
      pinTitle={section.title}
      pinDescription={
        pinDescription ??
        `Enter the setup PIN to manage ${section.title.toLowerCase()}.`
      }
    >
      <KioskShell>
        <SetupPageHeader
          level="section"
          title={section.title}
          subtitle={section.subtitle}
        />

        <main className="flex-1 p-6">{children}</main>
      </KioskShell>
    </SetupGate>
  );
}
