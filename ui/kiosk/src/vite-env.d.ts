/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_DEVICE_API_BASE?: string;
  readonly VITE_SETUP_PIN?: string;
  readonly VITE_DEVICE_POLL_MS?: string;
  /** Force MSW on/off in dev (`true`/`false`). Unset uses hostname heuristic. */
  readonly VITE_USE_MSW?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "virtual:pwa-register" {
  export interface RegisterSWOptions {
    immediate?: boolean;
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
    onRegistered?: (registration: ServiceWorkerRegistration | undefined) => void;
    onRegisterError?: (error: unknown) => void;
  }

  export function registerSW(options?: RegisterSWOptions): (reload?: boolean) => void;
}

declare module "*.json" {
  const value: unknown;
  export default value;
}
