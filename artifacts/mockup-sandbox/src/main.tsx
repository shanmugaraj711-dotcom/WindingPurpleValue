import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// App Bridge normally injects the Shopify ID token automatically, but making
// it explicit here keeps every same-origin API request authenticated even
// when the fetch interceptor isn't available yet during app startup.
const nativeFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const isApiRequest = url.startsWith("/api/") || new URL(url, window.location.href).origin === window.location.origin;

  if (isApiRequest) {
    const shopify = (window as Window & { shopify?: { idToken?: () => Promise<string> } }).shopify;
    if (shopify?.idToken) {
      try {
        const token = await shopify.idToken();
        const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
        headers.set("Authorization", `Bearer ${token}`);
        return nativeFetch(input, { ...init, headers });
      } catch {
        // Let the original request run so the backend can return its normal
        // authentication error if App Bridge cannot issue a token.
      }
    }
  }

  return nativeFetch(input, init);
};

createRoot(document.getElementById("root")!).render(<App />);
