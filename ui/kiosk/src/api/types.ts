import { z } from 'zod';

/**
 * PROVISIONAL kiosk ↔ ESP32 HTTP contract.
 * Firmware has not agreed to these shapes — see docs/18-kiosk-device-api.md.
 * MSW mock implements this for dev; reconcile before firmware phase 5.
 *
 * Ingredient IDs are opaque strings on the device (pump binding + dispense lookup only).
 * Names, categories, and recipes live in the kiosk catalog — not on the ESP32.
 */

export const INVENTORY_RESERVE_ML = 10;

export const ingredientKindSchema = z.enum(['pumped', 'manual']);

/** When a manual ingredient is added relative to the pumped pour. */
export const manualTimingSchema = z.enum(['before', 'after']);

export const recipeIngredientSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    ml: z.number().positive().optional(),
    kind: ingredientKindSchema,
    /** Manual only — defaults from ingredient id when omitted. */
    when: manualTimingSchema.optional(),
  })
  .superRefine((ingredient, ctx) => {
    if (
      ingredient.kind === 'pumped' &&
      (ingredient.ml === undefined || ingredient.ml <= 0)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: `Pumped ingredient "${ingredient.id}" requires ml > 0`,
        path: ['ml'],
      });
    }
  });

export const spiritCategorySchema = z.enum([
  'whiskey',
  'vodka',
  'gin',
  'rum',
  'tequila',
]);

export const recipeSchema = z.object({
  id: z.string(),
  name: z.string(),
  categories: z.array(spiritCategorySchema).min(1),
  description: z.string(),
  /** Guest adds ice to the glass before the machine pours. */
  needsIce: z.boolean().optional(),
  ingredients: z.array(recipeIngredientSchema),
});

export const recipeCatalogSchema = z.array(recipeSchema);

export const ingredientBindingSchema = z.object({
  ingredientId: z.string(),
  remainingMl: z.number(),
  bottleSizeMl: z.number().optional(),
  primed: z.boolean().optional(),
});

export const pourJobStateSchema = z.enum([
  'idle',
  'pouring',
  'prompt',
  'complete',
  'cancelled',
]);

export const pourJobSchema = z.object({
  recipeId: z.string(),
  state: pourJobStateSchema,
  progress: z.number().min(0).max(100),
  stepLabel: z.string().max(200),
  promptMessage: z.string().max(500).optional(),
});

export const pumpJobPurposeSchema = z.enum([
  'prime',
  'calibration',
  'verify',
  'flush',
  'sanitize',
  'drain',
]);

export const pumpJobStateSchema = z.enum(['running', 'complete', 'cancelled']);

export const pumpJobSchema = z.object({
  pumpId: z.number().int().positive(),
  purpose: pumpJobPurposeSchema,
  state: pumpJobStateSchema,
  progress: z.number().min(0).max(100),
  stepLabel: z.string().max(200),
  targetMl: z.number().positive().optional(),
  durationSeconds: z.number().positive().optional(),
  continuous: z.boolean().optional(),
  elapsedSeconds: z.number().int().min(0).optional(),
});

/** Matches firmware `config.h` pour-rate bounds. */
export const MIN_ML_PER_SECOND = 0.01;
export const MAX_ML_PER_SECOND = 100;
export const DEFAULT_ML_PER_SECOND = 1.75;
export const DEFAULT_ANTI_DRIP_MS = 100;
export const MAX_ANTI_DRIP_MS = 5000;

export const pumpSlotSchema = z.object({
  pumpId: z.number().int().positive(),
  ingredientId: z.string().nullable(),
  mlPerSecond: z
    .number()
    .min(MIN_ML_PER_SECOND)
    .max(MAX_ML_PER_SECOND)
    .optional(),
  antiDripMs: z.number().int().min(0).max(MAX_ANTI_DRIP_MS).optional(),
});

export const notificationSeveritySchema = z.enum(['info', 'warning', 'error']);

/** Firmware-originated alerts surfaced in the kiosk notification center. */
export const deviceNotificationSchema = z.object({
  id: z.string().max(100),
  severity: notificationSeveritySchema,
  title: z.string().max(200),
  message: z.string().max(500).optional(),
  actionHref: z.string().max(200).optional(),
  actionLabel: z.string().max(100).optional(),
});

export const deviceStatusSchema = z.object({
  connected: z.boolean(),
  firmwareVersion: z.string().optional(),
  hostname: z.string().optional(),
  bindings: z.record(z.string(), ingredientBindingSchema),
  pumps: z.array(pumpSlotSchema).optional(),
  job: pourJobSchema.nullable().optional(),
  pumpJob: pumpJobSchema.nullable().optional(),
  notifications: z.array(deviceNotificationSchema).optional(),
});

export const pourStepSchema = z.object({
  ingredientId: z.string(),
  ml: z.number().positive(),
});

export const pourCommandSchema = z.object({
  /** Kiosk UI correlation only — firmware executes `steps`, not recipe semantics. */
  recipeId: z.string(),
  steps: z.array(pourStepSchema).min(1),
});

export const refillCommandSchema = z.object({
  ingredientId: z.string(),
});

export const pumpBindingCommandSchema = z.object({
  pumpId: z.number().int().positive(),
  ingredientId: z.string().nullable(),
});

export const bottleSizeCommandSchema = z.object({
  ingredientId: z.string(),
  bottleSizeMl: z.number().int().positive(),
});

export const inventoryLevelCommandSchema = z.object({
  ingredientId: z.string(),
  remainingMl: z.number().min(0),
});

export const pumpCalibrationCommandSchema = z.object({
  pumpId: z.number().int().positive(),
  mlPerSecond: z.number().min(MIN_ML_PER_SECOND).max(MAX_ML_PER_SECOND),
  antiDripMs: z.number().int().min(0).max(MAX_ANTI_DRIP_MS),
});

export const primedCommandSchema = z.object({
  ingredientId: z.string(),
  primed: z.boolean(),
});

export const pumpDispenseCommandSchema = z
  .object({
    pumpId: z.number().int().positive(),
    purpose: pumpJobPurposeSchema,
    ml: z.number().positive().optional(),
    durationSeconds: z.number().positive().max(120).optional(),
  })
  .superRefine((command, ctx) => {
    if (
      command.purpose === 'prime' ||
      command.purpose === 'flush' ||
      command.purpose === 'sanitize' ||
      command.purpose === 'drain'
    ) {
      return;
    }
    if (command.ml === undefined && command.durationSeconds === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'Provide ml or durationSeconds for pump dispense',
        path: ['ml'],
      });
    }
  });

export type IngredientKind = z.infer<typeof ingredientKindSchema>;
export type ManualTiming = z.infer<typeof manualTimingSchema>;
export type RecipeIngredient = z.infer<typeof recipeIngredientSchema>;
export type Recipe = z.infer<typeof recipeSchema>;
export type IngredientBinding = z.infer<typeof ingredientBindingSchema>;
export type PourJobState = z.infer<typeof pourJobStateSchema>;
export type PourJob = z.infer<typeof pourJobSchema>;
export type PumpJobPurpose = z.infer<typeof pumpJobPurposeSchema>;
export type PumpJobState = z.infer<typeof pumpJobStateSchema>;
export type PumpJob = z.infer<typeof pumpJobSchema>;
export type DeviceStatus = z.infer<typeof deviceStatusSchema>;
export type PourStep = z.infer<typeof pourStepSchema>;
export type PourCommand = z.infer<typeof pourCommandSchema>;
export type RefillCommand = z.infer<typeof refillCommandSchema>;
export type PumpSlot = z.infer<typeof pumpSlotSchema>;
export type NotificationSeverity = z.infer<typeof notificationSeveritySchema>;
export type DeviceNotification = z.infer<typeof deviceNotificationSchema>;
export type PumpBindingCommand = z.infer<typeof pumpBindingCommandSchema>;
export type BottleSizeCommand = z.infer<typeof bottleSizeCommandSchema>;
export type InventoryLevelCommand = z.infer<typeof inventoryLevelCommandSchema>;
export type PumpCalibrationCommand = z.infer<
  typeof pumpCalibrationCommandSchema
>;
export type PrimedCommand = z.infer<typeof primedCommandSchema>;
export type PumpDispenseCommand = z.infer<typeof pumpDispenseCommandSchema>;
