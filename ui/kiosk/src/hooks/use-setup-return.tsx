import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import { useLocation } from 'wouter';

import { sanitizeInternalPath } from '@/lib/safe-href';

export const SETUP_ROOT = '/setup';

export function setupSectionPath(sectionId: string): string {
  return `${SETUP_ROOT}/${sectionId}`;
}

export function sanitizeReturnPath(
  raw: string | null | undefined,
  fallback = '/',
): string {
  return sanitizeInternalPath(raw) ?? fallback;
}

type SetupReturnContextValue = {
  returnTo: string;
  setReturnTo: (path: string) => void;
};

const SetupReturnContext = createContext<SetupReturnContextValue | null>(null);

export function SetupReturnProvider({ children }: { children: ReactNode }) {
  const [returnTo, setReturnToState] = useState('/');

  const setReturnTo = useCallback((path: string) => {
    setReturnToState(sanitizeReturnPath(path, '/'));
  }, []);

  return (
    <SetupReturnContext.Provider value={{ returnTo, setReturnTo }}>
      {children}
    </SetupReturnContext.Provider>
  );
}

function useSetupReturnContext(): SetupReturnContextValue {
  const value = useContext(SetupReturnContext);
  if (!value) {
    throw new Error('SetupReturnProvider is missing');
  }
  return value;
}

export function useSetupReturn(): string {
  return useSetupReturnContext().returnTo;
}

export function useSetSetupReturn() {
  return useSetupReturnContext().setReturnTo;
}

/** Navigate into setup and remember the current page (or an explicit `from` path). */
export function useEnterSetup() {
  const [location, navigate] = useLocation();
  const setReturnTo = useSetSetupReturn();

  return useCallback(
    (path: string, from?: string) => {
      setReturnTo(sanitizeReturnPath(from ?? location, '/'));
      navigate(path);
    },
    [location, navigate, setReturnTo],
  );
}
