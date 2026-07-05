import type { PourJob } from '@/api/types';

type CancelPourOnLeaveOptions = {
  /** True once the device pour has been requested (not during guest pre-steps). */
  expectActivePour?: boolean;
};

/** Whether leaving the pour page should call cancelPour for this recipe. */
export function shouldCancelPourOnLeave(
  job: PourJob | null | undefined,
  recipeId: string,
  options: CancelPourOnLeaveOptions = {},
): boolean {
  if (!recipeId) return false;
  if (!job) return options.expectActivePour ?? false;
  if (job.recipeId !== recipeId) return false;
  return job.state === 'pouring';
}
