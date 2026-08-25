export interface ProductionReadinessResult {
  ok: boolean;
  checks: Record<string, boolean>;
}

export function checkProductionReadiness(env: NodeJS.ProcessEnv): ProductionReadinessResult {
  const checks = {
    databaseConfigured: Boolean(env.DATABASE_URL),
    shopifyConfigured: Boolean(env.SHOPIFY_API_KEY && env.SHOPIFY_API_SECRET),
    appUrlConfigured: Boolean(env.SHOPIFY_APP_URL || env.HOST),
  };
  return { ok: Object.values(checks).every(Boolean), checks };
}
