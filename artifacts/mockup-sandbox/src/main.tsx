import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { ensureCartLiftPixel } from "./lib/ensureCartLiftPixel";

// Shopify App Bridge automatically adds a fresh ID token to same-origin
// fetch() requests. Keep the native fetch path untouched so App Bridge can
// also handle its invalid-session retry flow correctly.

createRoot(document.getElementById("root")!).render(<App />);

// App Bridge can initialize after the first module evaluation. The activation
// helper waits for the global bridge and retries the server-side pixel upsert.
void ensureCartLiftPixel();
