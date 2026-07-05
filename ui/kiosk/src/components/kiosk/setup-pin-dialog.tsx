import { useState } from 'react';
import { Lock } from 'lucide-react';

import { PinPadWithError } from '@/components/kiosk/pin-pad';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { verifySetupPin } from '@/lib/config';
import { KIOSK_DIALOG_CONTENT_CLASSNAME } from '@/lib/kiosk-input-styles';
import { grantSetupUnlock } from '@/lib/setup-unlock';

type SetupPinDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onSuccess: (pin: string) => void;
  onCancel?: () => void;
};

export function SetupPinDialog({
  open,
  onOpenChange,
  title,
  description,
  onSuccess,
  onCancel,
}: SetupPinDialogProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  const handlePinChange = (next: string) => {
    setPin(next);
    if (error) setError(false);
  };

  const tryUnlock = (entered: string) => {
    if (verifySetupPin(entered)) {
      grantSetupUnlock();
      setPin('');
      setError(false);
      onSuccess(entered);
      return;
    }
    setError(true);
    setPin('');
  };

  const handleCancel = () => {
    setPin('');
    setError(false);
    onCancel?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={KIOSK_DIALOG_CONTENT_CLASSNAME}
      >
        <DialogHeader>
          <div className="mx-auto mb-2 flex size-14 items-center justify-center rounded-full bg-primary/15 ring-1 ring-primary/30">
            <Lock className="size-7 text-primary" />
          </div>
          <DialogTitle className="text-center font-heading text-2xl">
            {title}
          </DialogTitle>
          <DialogDescription className="text-center">
            {description}
          </DialogDescription>
        </DialogHeader>

        <PinPadWithError
          value={pin}
          onChange={handlePinChange}
          onComplete={tryUnlock}
          error={error}
        />

        <DialogFooter>
          <Button
            variant="outline"
            className="kiosk-touch w-full sm:w-auto"
            onClick={handleCancel}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
