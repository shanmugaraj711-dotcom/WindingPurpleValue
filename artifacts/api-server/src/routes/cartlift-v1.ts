import { summarizeEvents, type CartLiftEvent } from '../lib/analytics';
import { createDefaultSettings, type CartLiftMerchantSettings } from '../lib/merchant-settings';

const settingsByShop = new Map<string, CartLiftMerchantSettings>();
const eventsByShop = new Map<string, CartLiftEvent[]>();

export function getSettings(shop: string) {
  return settingsByShop.get(shop) ?? createDefaultSettings(shop);
}

export function saveSettings(shop: string, patch: Partial<CartLiftMerchantSettings>) {
  const current = getSettings(shop);
  const next = { ...current, ...patch, shop, updatedAt: new Date().toISOString() };
  settingsByShop.set(shop, next);
  return next;
}

export function recordEvent(event: Omit<CartLiftEvent, 'createdAt'>) {
  const events = eventsByShop.get(event.shop) ?? [];
  events.push({ ...event, createdAt: new Date().toISOString() });
  eventsByShop.set(event.shop, events);
  return events[events.length - 1];
}

export function getMetrics(shop: string) {
  return summarizeEvents(eventsByShop.get(shop) ?? []);
}
