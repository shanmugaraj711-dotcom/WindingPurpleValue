export interface PrivacyBoundary {
  shop: string;
  dataScope: 'merchant';
  retentionDays: number;
}

export function createPrivacyBoundary(shop: string, retentionDays = 90): PrivacyBoundary {
  if (!shop || !shop.endsWith('.myshopify.com')) {
    throw new Error('Invalid Shopify shop');
  }
  return { shop: shop.toLowerCase(), dataScope: 'merchant', retentionDays };
}
