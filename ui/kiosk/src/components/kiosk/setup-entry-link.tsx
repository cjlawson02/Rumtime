import type { ComponentProps } from 'react';
import { useLocation } from 'wouter';

import { LinkButton } from '@/components/kiosk/link-button';
import {
  sanitizeReturnPath,
  useSetSetupReturn,
} from '@/hooks/use-setup-return';

type SetupEntryLinkProps = ComponentProps<typeof LinkButton>;

/** Link into setup; captures the current guest page as the return target. */
export function SetupEntryLink({ onClick, ...props }: SetupEntryLinkProps) {
  const [location] = useLocation();
  const setReturnTo = useSetSetupReturn();

  return (
    <LinkButton
      {...props}
      onClick={(event) => {
        setReturnTo(sanitizeReturnPath(location, '/'));
        onClick?.(event);
      }}
    />
  );
}
