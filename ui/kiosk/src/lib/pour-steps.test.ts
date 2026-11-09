import { describe, expect, it } from "vitest";

import type { Recipe } from "@/api/types";
import { pourPhasesFromRecipe, pourStepsFromRecipe } from "@/lib/pour-steps";

const recipe: Recipe = {
  id: "daiquiri",
  name: "Daiquiri",
  categories: ["rum"],
  description: "Classic rum sour",
  ingredients: [
    { id: "rum", name: "White rum", ml: 60, kind: "pumped" },
    { id: "lime", name: "Lime juice", ml: 22, kind: "manual" },
    { id: "simple", name: "Simple syrup", ml: 15, kind: "pumped" },
    { id: "soda", name: "Soda", kind: "manual" },
  ],
};

describe("pourPhasesFromRecipe", () => {
  it("defaults each pumped ingredient to its own sequential phase", () => {
    expect(pourPhasesFromRecipe(recipe)).toEqual([
      { steps: [{ ingredientId: "rum", ml: 60 }] },
      { steps: [{ ingredientId: "simple", ml: 15 }] },
    ]);
  });

  it("uses explicit config phases for layered pours", () => {
    const b52: Recipe = {
      id: "b-52",
      name: "B-52",
      categories: ["shot"],
      description: "Layered shot",
      ingredients: [
        { id: "kahlua", name: "Kahlúa", ml: 15, kind: "pumped" },
        { id: "baileys", name: "Baileys", ml: 15, kind: "pumped" },
        { id: "grand_marnier", name: "Grand Marnier", ml: 15, kind: "pumped" },
      ],
      phases: [
        { ingredientIds: ["kahlua"] },
        { ingredientIds: ["baileys"] },
        { ingredientIds: ["grand_marnier"] },
      ],
    };
    expect(pourPhasesFromRecipe(b52)).toEqual([
      { steps: [{ ingredientId: "kahlua", ml: 15 }] },
      { steps: [{ ingredientId: "baileys", ml: 15 }] },
      { steps: [{ ingredientId: "grand_marnier", ml: 15 }] },
    ]);
  });

  it("keeps concurrent ingredients inside one phase", () => {
    const parallel: Recipe = {
      ...recipe,
      phases: [{ ingredientIds: ["rum", "simple"] }],
    };
    expect(pourPhasesFromRecipe(parallel)).toEqual([
      {
        steps: [
          { ingredientId: "rum", ml: 60 },
          { ingredientId: "simple", ml: 15 },
        ],
      },
    ]);
  });
});

describe("pourStepsFromRecipe", () => {
  it("maps only pumped ingredients with ml to pour steps", () => {
    expect(pourStepsFromRecipe(recipe)).toEqual([
      { ingredientId: "rum", ml: 60 },
      { ingredientId: "simple", ml: 15 },
    ]);
  });

  it("returns an empty list when nothing is pumped", () => {
    const manualOnly: Recipe = {
      ...recipe,
      ingredients: [{ id: "lime", name: "Lime", kind: "manual" }],
    };
    expect(pourStepsFromRecipe(manualOnly)).toEqual([]);
  });

  it("skips pumped lines missing ml", () => {
    const missingMl: Recipe = {
      ...recipe,
      ingredients: [{ id: "rum", name: "Rum", kind: "pumped" }],
    };
    expect(pourStepsFromRecipe(missingMl)).toEqual([]);
  });

  it("keeps layered pumped ingredients in recipe order", () => {
    const b52: Recipe = {
      id: "b-52",
      name: "B-52",
      categories: ["shot"],
      description: "Layered shot",
      ingredients: [
        { id: "kahlua", name: "Kahlúa", ml: 15, kind: "pumped" },
        { id: "baileys", name: "Baileys", ml: 15, kind: "pumped" },
        { id: "grand_marnier", name: "Grand Marnier", ml: 15, kind: "pumped" },
      ],
    };
    expect(pourStepsFromRecipe(b52)).toEqual([
      { ingredientId: "kahlua", ml: 15 },
      { ingredientId: "baileys", ml: 15 },
      { ingredientId: "grand_marnier", ml: 15 },
    ]);
  });
});
