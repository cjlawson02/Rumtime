import { NumberPad, NumberValueDisplay } from '@/components/kiosk/number-pad';
import {
  canAppendIpv4Digit,
  canAppendIpv4Dot,
  IPV4_MAX_LENGTH,
} from '@/lib/ip-address';
import { cn } from '@/lib/utils';

export type IpAddressPadProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
};

export function IpAddressPad({
  value,
  onChange,
  disabled = false,
  className,
}: IpAddressPadProps) {
  return (
    <div className={cn('space-y-3', className)}>
      <NumberValueDisplay
        value={value || '—'}
        className="text-2xl"
      />
      <NumberPad
        value={value}
        onChange={onChange}
        disabled={disabled}
        maxLength={IPV4_MAX_LENGTH}
        allowDot
        canAppendDigit={canAppendIpv4Digit}
        canAppendDot={canAppendIpv4Dot}
        ariaLabel="IP address pad"
      />
    </div>
  );
}
