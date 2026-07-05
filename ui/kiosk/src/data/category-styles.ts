import type { CategoryId } from '@/data/categories';

type CategoryStyle = {
  label: string;
  pillActive: string;
  pillIdle: string;
  gradient: string;
};

const STYLES: Record<CategoryId, CategoryStyle> = {
  all: {
    label: 'All',
    pillActive:
      'border-primary/50 bg-primary/30 text-primary data-[state=on]:border-primary/50 data-[state=on]:bg-primary/30 data-[state=on]:text-primary aria-pressed:border-primary/50 aria-pressed:bg-primary/30 aria-pressed:text-primary',
    pillIdle: 'bg-secondary/80 text-muted-foreground hover:bg-secondary',
    gradient: 'from-stone-900/40 to-stone-950/20',
  },
  whiskey: {
    label: 'Whiskey',
    pillActive: 'border-amber-400/40 bg-amber-500/25 text-amber-200',
    pillIdle: 'text-amber-200/70 hover:bg-amber-500/10',
    gradient: 'from-amber-900/40 to-amber-950/20',
  },
  vodka: {
    label: 'Vodka',
    pillActive: 'border-sky-400/40 bg-sky-500/25 text-sky-200',
    pillIdle: 'text-sky-200/70 hover:bg-sky-500/10',
    gradient: 'from-sky-900/40 to-sky-950/20',
  },
  gin: {
    label: 'Gin',
    pillActive: 'border-emerald-400/40 bg-emerald-500/25 text-emerald-200',
    pillIdle: 'text-emerald-200/70 hover:bg-emerald-500/10',
    gradient: 'from-emerald-900/40 to-emerald-950/20',
  },
  rum: {
    label: 'Rum',
    pillActive: 'border-orange-400/40 bg-orange-500/25 text-orange-200',
    pillIdle: 'text-orange-200/70 hover:bg-orange-500/10',
    gradient: 'from-orange-900/40 to-orange-950/20',
  },
  tequila: {
    label: 'Tequila',
    pillActive: 'border-lime-400/40 bg-lime-500/25 text-lime-200',
    pillIdle: 'text-lime-200/70 hover:bg-lime-500/10',
    gradient: 'from-lime-900/40 to-lime-950/20',
  },
};

export function getCategoryStyle(category: string): CategoryStyle | undefined {
  return STYLES[category as CategoryId];
}
