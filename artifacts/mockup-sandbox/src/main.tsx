import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// CartLift handles Shopify authentication from App.tsx. Keep a single
// authentication request path so the page does not perform a duplicate
// token exchange during startup.

createRoot(document.getElementById("root")!).render(<App />);
