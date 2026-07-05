/** Cocktail photos — external CDN; swap for bundled assets per recipe when available. */

const UNSPLASH = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&h=600&q=80`;

const UNSPLASH_CARD = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&h=600&q=80`;

/** Verified 200 — warm bar interior for menu hero. */
export const MENU_HERO_IMAGE = UNSPLASH('photo-1572116469696-31de0f17cc34');

export const FALLBACK_DRINK_IMAGE = UNSPLASH_CARD(
  'photo-1572116469696-31de0f17cc34',
);

/** Per-recipe card art (IDs verified HTTP 200, 2026-07-04). */
const DRINK_IMAGES: Record<string, string> = {
  'old-fashioned': UNSPLASH_CARD('photo-1470337458703-46ad1756a187'),
  margarita: UNSPLASH_CARD('photo-1756521973702-b7b496adab70'),
  'moscow-mule': UNSPLASH_CARD('photo-1527628126150-086ff233b951'),
  'gin-tonic': UNSPLASH_CARD('photo-1536935338788-846bb9981813'),
  daiquiri: UNSPLASH_CARD('photo-1544145945-f90425340c7e'),
  'whiskey-sour': UNSPLASH_CARD('photo-1591634586875-a1e4b9725c94'),
  amf: UNSPLASH_CARD('photo-1578664182930-39d6469c49bf'),
};

export function getDrinkImage(recipeId: string): string {
  return DRINK_IMAGES[recipeId] ?? FALLBACK_DRINK_IMAGE;
}
