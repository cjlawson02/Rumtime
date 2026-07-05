import { ChevronRight } from 'lucide-react';
import { Link } from 'wouter';

import { SetupGate } from '@/components/kiosk/setup-gate';
import { SetupPageHeader } from '@/components/kiosk/setup-page-header';
import { KioskShell } from '@/components/kiosk/kiosk-shell';
import { SETUP_INDEX, SETUP_SECTIONS } from '@/data/setup-sections';
import { setupSectionPath } from '@/hooks/use-setup-return';

export function SetupIndexPage() {
  return (
    <SetupGate>
      <KioskShell>
        <SetupPageHeader
          level="index"
          title={SETUP_INDEX.title}
          subtitle={SETUP_INDEX.subtitle}
        />

        <main className="flex-1 p-6">
          <p className="mb-6 max-w-2xl text-muted-foreground">
            {SETUP_INDEX.description}
          </p>
          <ul className="overflow-hidden rounded-xl border border-border/60 bg-card/60">
            {SETUP_SECTIONS.map((section, index) => (
              <li
                key={section.id}
                className={index > 0 ? 'border-t border-border/60' : undefined}
              >
                <Link
                  href={setupSectionPath(section.id)}
                  className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-card active:bg-card/80"
                >
                  <span className="text-2xl" aria-hidden>
                    {section.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-medium">{section.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {section.subtitle}
                    </p>
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </main>
      </KioskShell>
    </SetupGate>
  );
}
