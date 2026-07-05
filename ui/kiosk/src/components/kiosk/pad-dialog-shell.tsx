import { type ReactNode } from 'react';
import { Check, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { KIOSK_DIALOG_CONTENT_CLASSNAME } from '@/lib/kiosk-input-styles';

export type PadDialogFooterProps = {
  onCancel: () => void;
  onSave: () => void;
  saving?: boolean;
  saveDisabled?: boolean;
  cancelLabel?: string;
  saveLabel?: string;
};

export function PadDialogFooter({
  onCancel,
  onSave,
  saving = false,
  saveDisabled = false,
  cancelLabel = 'Cancel',
  saveLabel = 'Save',
}: PadDialogFooterProps) {
  return (
    <DialogFooter className="flex-row gap-2 sm:justify-center">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="kiosk-touch size-14 shrink-0 border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20"
        disabled={saving}
        onClick={onCancel}
        aria-label={cancelLabel}
      >
        <X className="size-6" strokeWidth={2.5} />
      </Button>
      <Button
        type="button"
        size="icon"
        className="kiosk-touch size-14 shrink-0 border-green-500/40 bg-green-500/15 text-green-500 hover:bg-green-500/25"
        disabled={saving || saveDisabled}
        onClick={onSave}
        aria-label={saveLabel}
      >
        <Check className="size-6" strokeWidth={2.5} />
      </Button>
    </DialogFooter>
  );
}

export type PadDialogShellProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
};

export function PadDialogShell({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: PadDialogShellProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(KIOSK_DIALOG_CONTENT_CLASSNAME, className)}
      >
        <DialogHeader>
          <DialogTitle className="text-center font-heading text-2xl">
            {title}
          </DialogTitle>
          {description ? (
            <DialogDescription className="text-center">
              {description}
            </DialogDescription>
          ) : null}
        </DialogHeader>

        {children}

        {footer}
      </DialogContent>
    </Dialog>
  );
}
