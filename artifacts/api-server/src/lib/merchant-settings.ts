export type RecommendationMode = 'automatic' | 'manual';

export interface CartLiftMerchantSettings {
  shop: string;
  freeShippingThresholdCents: number;
  recommendationMode: RecommendationMode;
  recommendationProductId?: string;
  enabled: boolean;
  updatedAt: string;
}

export function createDefaultSettings(shop: string): CartLiftMerchantSettings {
  return {
    shop,
    freeShippingThresholdCents: 0,
    recommendationMode: 'automatic',
    enabled: false,
    updatedAt: new Date().toISOString(),
  };
}
