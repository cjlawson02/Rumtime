import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

import { LinkButton } from '@/components/kiosk/link-button';
import { PageHeader } from '@/components/kiosk/page-header';
import { SETUP_ROOT, useSetupReturn } from '@/hooks/use-setup-return';

type SetupPageHeaderProps = {
  title: string;
  subtitle?: ReactNode;
  /** index = back exits setup; section = back to setup menu */
  level: 'index' | 'section';
};

export function SetupPageHeader({
  title,
  subtitle,
  level,
}: SetupPageHeaderProps) {
  const returnTo = useSetupReturn();
  const backHref = level === 'index' ? returnTo : SETUP_ROOT;

  return (
    <PageHeader
      title={title}
      subtitle={subtitle}
      leading={
        <LinkButton
          href={backHref}
          variant="outline"
          size="icon"
          className="kiosk-touch"
        >
          <ArrowLeft className="size-5" />
          <span className="sr-only">
            {level === 'index' ? 'Back' : 'Back to setup'}
          </span>
        </LinkButton>
      }
    />
  );
}
