import type { MouseEvent, ReactNode } from 'react';
import { Link } from 'wouter';

import { sanitizeInternalPath } from '@/lib/safe-href';
import { buttonVariants } from '@/components/ui/button';
import type { VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

type LinkButtonProps = {
  href: string;
  children: ReactNode;
  className?: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
} & VariantProps<typeof buttonVariants>;

export function LinkButton({
  href,
  children,
  className,
  variant = 'default',
  size = 'default',
  onClick,
}: LinkButtonProps) {
  const safeHref = sanitizeInternalPath(href) ?? '/';

  return (
    <Link
      href={safeHref}
      onClick={onClick}
      className={cn(buttonVariants({ variant, size }), className)}
    >
      {children}
    </Link>
  );
}
