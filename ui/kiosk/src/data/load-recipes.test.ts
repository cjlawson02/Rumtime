import { describe, expect, it } from "vitest";

import { getRecipeById, getRecipeCatalogError, getRecipes } from "@/data/load-recipes";

describe("recipe catalog", () => {
  it("loads a validated catalog without parse errors", () => {
    expect(getRecipeCatalogError()).toBeNull();
    expect(getRecipes().length).toBeGreaterThan(0);
  });

  it("looks up recipes by id", () => {
    const recipe = getRecipeById("old-fashioned");
    expect(recipe?.name).toBe("Old Fashioned");
    expect(getRecipeById("missing-drink")).toBeUndefined();
  });

  it("includes the B-52 with layered pour order", () => {
    const recipe = getRecipeById("b-52");
    expect(recipe?.name).toBe("B-52");
    expect(recipe?.categories).toContain("shot");
    expect(recipe?.ingredients.map((ingredient) => ingredient.id)).toEqual([
      "kahlua",
      "baileys",
      "grand_marnier",
    ]);
    expect(recipe?.phases).toEqual([
      { ingredientIds: ["kahlua"] },
      { ingredientIds: ["baileys"] },
      { ingredientIds: ["grand_marnier"] },
    ]);
  });
});
