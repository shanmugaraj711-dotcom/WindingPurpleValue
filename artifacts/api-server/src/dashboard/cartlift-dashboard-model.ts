import { getMetrics, getSettings, saveSettings } from '../routes/cartlift-v1';

export interface CartLiftDashboardModel {
  shop: string;
  setupComplete: boolean;
  enabled: boolean;
  freeShippingThresholdCents: number;
  recommendationMode: 'automatic' | 'manual';
  recommendationProductId?: string;
  metrics: ReturnType<typeof getMetrics>;
}

export function getDashboardModel(shop: string): CartLiftDashboardModel {
  const settings = getSettings(shop);
  return {
    shop,
    setupComplete: settings.freeShippingThresholdCents > 0,
    enabled: settings.enabled,
    freeShippingThresholdCents: settings.freeShippingThresholdCents,
    recommendationMode: settings.recommendationMode,
    recommendationProductId: settings.recommendationProductId,
    metrics: getMetrics(shop),
  };
}

export { saveSettings };
