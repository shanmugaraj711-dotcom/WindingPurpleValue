import type { CartLiftEvent, CartLiftMetrics } from './analytics';
import type { CartLiftMerchantSettings } from './merchant-settings';

export interface CartLiftStore {
  getSettings(shop: string): Promise<CartLiftMerchantSettings | undefined>;
  saveSettings(settings: CartLiftMerchantSettings): Promise<CartLiftMerchantSettings>;
  recordEvent(event: CartLiftEvent): Promise<CartLiftEvent>;
  getEvents(shop: string): Promise<CartLiftEvent[]>;
}

export function createMemoryStore(): CartLiftStore {
  const settings = new Map<string, CartLiftMerchantSettings>();
  const events = new Map<string, CartLiftEvent[]>();
  return {
    async getSettings(shop) { return settings.get(shop); },
    async saveSettings(value) { settings.set(value.shop, value); return value; },
    async recordEvent(value) {
      const list = events.get(value.shop) ?? [];
      list.push(value);
      events.set(value.shop, list);
      return value;
    },
    async getEvents(shop) { return events.get(shop) ?? []; },
  };
}

export interface DashboardSnapshot {
  settings?: CartLiftMerchantSettings;
  metrics: CartLiftMetrics;
}
