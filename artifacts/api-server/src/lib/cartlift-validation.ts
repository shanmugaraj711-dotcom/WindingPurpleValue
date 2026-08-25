import type { CartLiftEventType } from './analytics';
import type { RecommendationMode } from './merchant-settings';

const eventTypes = new Set<CartLiftEventType>([
  'recommendation_impression',
  'recommendation_click',
  'recommendation_add',
  'shipping_goal_reached',
  'purchase_attributed',
]);

export function validateShop(shop: string) {
  if (!shop || shop.length > 255 || !/^[a-z0-9][a-z0-9.-]*\.myshopify\.com$/i.test(shop)) {
    throw new Error('Invalid Shopify shop');
  }
  return shop;
}

export function validateSettingsInput(input: {
  freeShippingThresholdCents: number;
  recommendationMode: RecommendationMode;
  recommendationProductId?: string;
  enabled: boolean;
}) {
  if (!Number.isInteger(input.freeShippingThresholdCents) || input.freeShippingThresholdCents < 0) {
    throw new Error('Invalid shipping threshold');
  }
  if (input.recommendationMode === 'manual' && !input.recommendationProductId) {
    throw new Error('Manual recommendations require a product');
  }
  return input;
}

export function validateEventType(type: string): CartLiftEventType {
  if (!eventTypes.has(type as CartLiftEventType)) throw new Error('Unsupported CartLift event');
  return type as CartLiftEventType;
}

export function sanitizeRevenueCents(value?: number) {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 0) throw new Error('Invalid revenue');
  return value;
}
