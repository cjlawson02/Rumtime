import { useState } from 'react';

import { getCategoryStyle } from '@/data/category-styles';
import { FALLBACK_DRINK_IMAGE, getDrinkImage } from '@/data/drink-images';
import { cn } from '@/lib/utils';

type DrinkImageProps = {
  recipeId: string;
  category?: string;
  className?: string;
  eager?: boolean;
};

export function DrinkImage({
  recipeId,
  category,
  className,
  eager = false,
}: DrinkImageProps) {
  const [src, setSrc] = useState(() => getDrinkImage(recipeId));
  const [usePlaceholder, setUsePlaceholder] = useState(false);
  const style = category ? getCategoryStyle(category) : undefined;

  if (usePlaceholder) {
    return (
      <div
        className={cn(
          'bg-linear-to-br from-muted to-secondary',
          style?.gradient,
          className,
        )}
      />
    );
  }

  return (
    <img
      src={src}
      alt=""
      loading={eager ? 'eager' : 'lazy'}
      className={className}
      onError={() => {
        if (src !== FALLBACK_DRINK_IMAGE) {
          setSrc(FALLBACK_DRINK_IMAGE);
          return;
        }
        setUsePlaceholder(true);
      }}
    />
  );
}
