type ShopifyBridge = { idToken?: () => Promise<string> };

async function ensureCartLiftPixel(): Promise<void> {
  const bridge = (window as Window & { shopify?: ShopifyBridge }).shopify;
  if (!bridge?.idToken) return;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const token = await bridge.idToken();
      if (!token) return;
      const response = await fetch("/api/shopify/pixel", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        cache: "no-store",
      });
      if (response.ok) return;
      if (response.status === 401 && response.headers.get("X-Shopify-Retry-Invalid-Session-Request") === "1") continue;
      console.warn("CartLift web pixel activation failed.", await response.text());
      return;
    } catch (error) {
      if (attempt === 1) console.warn("CartLift web pixel activation failed.", error);
    }
  }
}

void ensureCartLiftPixel();
