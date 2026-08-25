import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

async function verifyShopifySession() {
  if (window.top === window.self) return;

  try {
    const response = await fetch("/api/shopify/shop", { credentials: "same-origin" });
    if (!response.ok) {
      console.info("CartLift Shopify session is not ready yet.");
      return;
    }

    const payload = (await response.json()) as {
      shop?: { name?: string; myshopifyDomain?: string };
      scope?: string;
    };
    console.info("CartLift connected to Shopify store:", payload.shop?.myshopifyDomain ?? payload.shop?.name);
  } catch {
    console.info("CartLift Shopify connection check is unavailable.");
  }
}

void verifyShopifySession();

createRoot(document.getElementById("root")!).render(<App />);
