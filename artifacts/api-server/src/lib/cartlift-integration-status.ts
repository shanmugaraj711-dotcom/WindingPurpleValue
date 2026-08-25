export interface CartLiftIntegrationStatus {
  productionChecks: boolean;
  shopifyInstallValidation: boolean;
  storefrontContract: boolean;
  persistenceBoundary: boolean;
  releaseGate: boolean;
}

export function isIntegrationReady(status: CartLiftIntegrationStatus): boolean {
  return Object.values(status).every(Boolean);
}
