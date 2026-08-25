export type CartLiftEventType =
  | 'recommendation_impression'
  | 'recommendation_click'
  | 'recommendation_add'
  | 'shipping_goal_reached'
  | 'purchase_attributed';

export interface CartLiftEvent {
  shop: string;
  type: CartLiftEventType;
  sessionId?: string;
  cartToken?: string;
  revenueCents?: number;
  createdAt: string;
}

export interface CartLiftMetrics {
  recommendationImpressions: number;
  recommendationClicks: number;
  recommendationAdds: number;
  shippingGoalReaches: number;
  influencedRevenueCents: number;
}

export function summarizeEvents(events: CartLiftEvent[]): CartLiftMetrics {
  return events.reduce<CartLiftMetrics>((metrics, event) => {
    switch (event.type) {
      case 'recommendation_impression':
        metrics.recommendationImpressions += 1;
        break;
      case 'recommendation_click':
        metrics.recommendationClicks += 1;
        break;
      case 'recommendation_add':
        metrics.recommendationAdds += 1;
        break;
      case 'shipping_goal_reached':
        metrics.shippingGoalReaches += 1;
        break;
      case 'purchase_attributed':
        metrics.influencedRevenueCents += Math.max(0, event.revenueCents ?? 0);
        break;
    }
    return metrics;
  }, {
    recommendationImpressions: 0,
    recommendationClicks: 0,
    recommendationAdds: 0,
    shippingGoalReaches: 0,
    influencedRevenueCents: 0,
  });
}
