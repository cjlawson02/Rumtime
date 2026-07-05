import { useState } from 'react';
import { AlertCircle, AlertTriangle, Info } from 'lucide-react';

import { LinkButton } from '@/components/kiosk/link-button';
import { SetupEntryLink } from '@/components/kiosk/setup-entry-link';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { KIOSK_DIALOG_CONTENT_CLASSNAME } from '@/lib/kiosk-input-styles';
import {
  notificationCenterSummary,
  type KioskNotification,
} from '@/lib/notifications';
import { cn } from '@/lib/utils';

type NotificationCenterProps = {
  notifications: KioskNotification[];
  className?: string;
};

function NotificationIcon({
  severity,
  className,
}: {
  severity: KioskNotification['severity'];
  className?: string;
}) {
  switch (severity) {
    case 'error':
      return <AlertCircle className={cn('text-red-400', className)} />;
    case 'warning':
      return <AlertTriangle className={cn('text-amber-400', className)} />;
    case 'info':
      return <Info className={cn('text-sky-400', className)} />;
  }
}

function hasUrgentNotifications(notifications: KioskNotification[]): boolean {
  return notifications.some(
    (notification) =>
      notification.severity === 'error' || notification.severity === 'warning',
  );
}

export function NotificationCenter({
  notifications,
  className,
}: NotificationCenterProps) {
  const [open, setOpen] = useState(false);

  if (notifications.length === 0) return null;

  const urgent = hasUrgentNotifications(notifications);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={`${notifications.length} notifications`}
        className={cn(
          'kiosk-touch relative size-14 backdrop-blur-sm',
          urgent
            ? 'border-red-500/40 bg-red-950/40 text-red-300 hover:bg-red-950/60 hover:text-red-200'
            : 'border-sky-500/40 bg-sky-950/40 text-sky-300 hover:bg-sky-950/60 hover:text-sky-200',
          className,
        )}
        onClick={() => { setOpen(true); }}
      >
        <AlertTriangle className="size-5" />
        <span
          className={cn(
            'absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full text-[10px] font-bold text-white ring-2 ring-background',
            urgent ? 'bg-red-500' : 'bg-sky-500',
          )}
        >
          {notifications.length}
        </span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={KIOSK_DIALOG_CONTENT_CLASSNAME}>
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl">
              Notifications
            </DialogTitle>
            <DialogDescription>
              {notificationCenterSummary(notifications)}
            </DialogDescription>
          </DialogHeader>

          <ul className="max-h-[min(50vh,24rem)] space-y-3 overflow-y-auto py-1">
            {notifications.map((notification) => {
              const action =
                notification.actionHref && notification.actionLabel ? (
                  notification.actionHref.startsWith('/setup') ? (
                    <SetupEntryLink
                      href={notification.actionHref}
                      variant="outline"
                      size="sm"
                      className="kiosk-touch shrink-0"
                      onClick={() => { setOpen(false); }}
                    >
                      {notification.actionLabel}
                    </SetupEntryLink>
                  ) : (
                    <LinkButton
                      href={notification.actionHref}
                      variant="outline"
                      size="sm"
                      className="kiosk-touch shrink-0"
                      onClick={() => { setOpen(false); }}
                    >
                      {notification.actionLabel}
                    </LinkButton>
                  )
                ) : null;

              return (
                <li
                  key={notification.id}
                  className="rounded-xl border border-border/60 bg-secondary/30 p-4"
                >
                  <div className="flex items-center gap-3">
                    <NotificationIcon
                      severity={notification.severity}
                      className="size-5 shrink-0"
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="font-medium leading-snug">
                        {notification.title}
                      </p>
                      {notification.detail && (
                        <p className="text-sm text-muted-foreground">
                          {notification.detail}
                        </p>
                      )}
                    </div>
                    {action}
                  </div>
                </li>
              );
            })}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
