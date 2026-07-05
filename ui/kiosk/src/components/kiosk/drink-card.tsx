import { AlertCircle, ChevronRight } from 'lucide-react';
import { Link } from 'wouter';

import { DrinkImage } from '@/components/kiosk/drink-image';
import { getCategoryStyle } from '@/data/category-styles';
import type { Recipe } from '@/api/types';
import { cn } from '@/lib/utils';

type DrinkCardProps = {
  recipe: Recipe;
  unavailableReason?: string;
};

export function DrinkCard({ recipe, unavailableReason }: DrinkCardProps) {
  const primaryCategory = recipe.categories[0];
  const unavailable = Boolean(unavailableReason);

  return (
    <Link href={`/drink/${recipe.id}`}>
      <article
        className={cn(
          'group relative flex h-full min-h-[220px] cursor-pointer flex-col overflow-hidden rounded-2xl border bg-card/80 shadow-lg shadow-black/20 transition-all duration-200',
          unavailable
            ? 'border-border/30 opacity-70 saturate-[0.35]'
            : 'border-border/50 hover:border-primary/30 hover:shadow-primary/10 hover:shadow-xl active:scale-[0.98]',
        )}
      >
        <div className="relative aspect-[16/10] shrink-0 overflow-hidden">
          <DrinkImage
            recipeId={recipe.id}
            category={primaryCategory}
            className={cn(
              'h-full w-full object-cover',
              unavailable
                ? 'grayscale'
                : 'transition-transform duration-500 group-hover:scale-105',
            )}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/20 to-transparent" />
          <div className="absolute left-3 top-3 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-1.5">
            {recipe.categories.map((categoryId) => {
              const style = getCategoryStyle(categoryId);
              if (!style) return null;

              return (
                <span
                  key={categoryId}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wider backdrop-blur-sm',
                    unavailable ? 'bg-black/40 text-white/70' : style.pillActive,
                  )}
                >
                  {style.label}
                </span>
              );
            })}
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-2 p-4 pt-3">
          <div className="flex items-start justify-between gap-2">
            <h2
              className={cn(
                'font-heading text-xl font-semibold leading-tight',
                unavailable && 'text-muted-foreground',
              )}
            >
              {recipe.name}
            </h2>
            <ChevronRight
              className={cn(
                'mt-1 size-5 shrink-0 transition-transform',
                unavailable
                  ? 'text-muted-foreground/60'
                  : 'text-primary/70 group-hover:translate-x-0.5',
              )}
            />
          </div>
          {unavailableReason ? (
            <p className="flex items-start gap-2 text-sm font-medium leading-snug text-amber-300/90">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{unavailableReason}</span>
            </p>
          ) : (
            <p className="line-clamp-2 flex-1 text-sm leading-relaxed text-muted-foreground">
              {recipe.description}
            </p>
          )}
        </div>
      </article>
    </Link>
  );
}
