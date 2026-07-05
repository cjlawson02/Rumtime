import { Component, type ErrorInfo, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { KioskMessageScreen } from '@/components/kiosk/kiosk-message-screen';

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
};

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Kiosk render error', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <KioskMessageScreen
          message={
            <div className="max-w-md space-y-2">
              <h1 className="font-heading text-2xl font-semibold">
                Something went wrong
              </h1>
              <p className="text-muted-foreground">
                Return to the menu or reload the kiosk app to continue.
              </p>
            </div>
          }
          action={
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button
                className="kiosk-cta"
                onClick={() => {
                  this.setState({ error: null });
                  window.location.assign('/');
                }}
              >
                Return to menu
              </Button>
              <Button
                variant="outline"
                className="kiosk-cta"
                onClick={() => { window.location.reload(); }}
              >
                Reload app
              </Button>
            </div>
          }
        />
      );
    }

    return this.props.children;
  }
}
