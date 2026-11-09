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

  it("includes a single-ingredient shot for every alcohol pumped ingredient", () => {
    const alcoholIds = ["bourbon", "vodka", "gin", "rum", "tequila"];
    const shotRecipes = getRecipes().filter((recipe) => recipe.categories.includes("shot"));
    const singleShots = shotRecipes.filter(
      (recipe) =>
        recipe.ingredients.filter((ingredient) => ingredient.kind === "pumped").length === 1,
    );

    expect(singleShots).toHaveLength(alcoholIds.length);
    for (const id of alcoholIds) {
      const shot = singleShots.find((recipe) => recipe.ingredients[0]?.id === id);
      expect(shot, `missing shot for ${id}`).toBeDefined();
      expect(shot?.ingredients[0]?.ml).toBe(45);
      expect(shot?.phases).toEqual([{ ingredientIds: [id] }]);
    }
  });
});
