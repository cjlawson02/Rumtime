import type { PourJob } from '@/api/types';

export function isActivePourJob(job: PourJob): boolean {
  return job.state === 'pouring' || job.state === 'prompt';
}

export function isTerminalPourJob(job: PourJob): boolean {
  return (
    job.state === 'complete' ||
    job.state === 'cancelled' ||
    job.state === 'error' ||
    job.state === 'idle'
  );
}
