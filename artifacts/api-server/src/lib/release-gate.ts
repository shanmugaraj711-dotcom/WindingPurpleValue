export interface ReleaseGate {
  name: string;
  required: boolean;
  passed: boolean;
}

export function evaluateReleaseGate(checks: Record<string, boolean>): ReleaseGate[] {
  return Object.entries(checks).map(([name, passed]) => ({ name, required: true, passed }));
}

export function isReleaseReady(checks: Record<string, boolean>): boolean {
  return Object.values(checks).every(Boolean);
}
