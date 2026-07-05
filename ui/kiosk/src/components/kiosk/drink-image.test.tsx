import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DrinkImage } from '@/components/kiosk/drink-image';
import { FALLBACK_DRINK_IMAGE, getDrinkImage } from '@/data/drink-images';

describe('DrinkImage', () => {
  it('renders the recipe image with lazy loading by default', () => {
    const { container } = render(
      <DrinkImage recipeId="old-fashioned" className="h-40" />,
    );

    const image = container.querySelector('img');
    expect(image).toHaveAttribute('src', getDrinkImage('old-fashioned'));
    expect(image).toHaveAttribute('loading', 'lazy');
  });

  it('uses eager loading when requested', () => {
    const { container } = render(
      <DrinkImage recipeId="margarita" eager className="h-40" />,
    );

    expect(container.querySelector('img')).toHaveAttribute('loading', 'eager');
  });

  it('falls back to the shared placeholder image on first load error', () => {
    const { container } = render(
      <DrinkImage recipeId="unknown-drink" className="h-40" />,
    );

    const image = container.querySelector('img');
    expect(image).not.toBeNull();
    fireEvent.error(image!);

    expect(image).toHaveAttribute('src', FALLBACK_DRINK_IMAGE);
  });

  it('renders a category gradient placeholder after fallback also fails', () => {
    const { container } = render(
      <DrinkImage recipeId="unknown-drink" category="whiskey" className="h-40" />,
    );

    const image = container.querySelector('img');
    expect(image).not.toBeNull();
    fireEvent.error(image!);
    fireEvent.error(image!);

    expect(container.querySelector('img')).toBeNull();
    expect(container.firstChild).toHaveClass('from-amber-900/40');
  });
});
