export interface AttributionInput {
  cartToken?: string;
  orderId?: string;
  revenueCents?: number;
}

export function calculateInfluencedRevenue(input: AttributionInput) {
  if (!input.cartToken || !input.orderId) return 0;
  return Math.max(0, input.revenueCents ?? 0);
}
