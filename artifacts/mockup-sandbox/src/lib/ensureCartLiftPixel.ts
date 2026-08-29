type ShopifyBridge = { idToken?: () => Promise<string> };

function getBridge(): ShopifyBridge | null {
  return (window as Window & { shopify?: ShopifyBridge }).shopify || null;
}

async function waitForBridge(timeoutMs = 10000): Promise<ShopifyBridge | null> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const bridge = getBridge();
    if (bridge?.idToken) return bridge;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

export async function ensureCartLiftPixel(): Promise<boolean> {
  const bridge = await waitForBridge();
  if (!bridge?.idToken) return false;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const token = await bridge.idToken();
      if (!token) return false;
      const response = await fetch("/api/shopify/pixel", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        cache: "no-store",
      });
      if (response.ok) return true;
      if (response.status === 401 && response.headers.get("X-Shopify-Retry-Invalid-Session-Request") === "1") {
        await new Promise((resolve) => setTimeout(resolve, 250));
        continue;
      }
      console.warn("CartLift web pixel activation failed.", await response.text());
      return false;
    } catch (error) {
      if (attempt === 2) console.warn("CartLift web pixel activation failed.", error);
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  return false;
}
