import { CARTLIFT_E2E_STEPS } from './cartlift-e2e-contract';

export function validateE2ESequence(completed: string[]): boolean {
  return CARTLIFT_E2E_STEPS.every((step) => completed.includes(step));
}
