export function validateShopifyInstallRequest(shop: string | undefined): boolean {
  if (!shop) return false;
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop);
}

export function normalizeShop(shop: string): string {
  return shop.trim().toLowerCase();
}
