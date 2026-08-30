import { useEffect, useMemo, useState, type ComponentType, type FormEvent } from "react";
import { modules as discoveredModules } from "./.generated/mockup-components";

type ModuleMap = Record<string, () => Promise<Record<string, unknown>>>;
type ShopifyStatus = { loading: boolean; connected: boolean; shop?: { name?: string; myshopifyDomain?: string } | null; scope?: string; error?: string };
type OfferType = "percentage" | "fixed" | "free_shipping";
type Offer = { id: string; name: string; type: OfferType; value: number; minCartValue: number; enabled: boolean; createdAt: string };
type Product = { id: string; title: string; status: string; totalInventory: number; priceRangeV2?: { minVariantPrice?: { amount: string; currencyCode: string }; maxVariantPrice?: { amount: string; currencyCode: string } } };
type DeliveryDiagnostics = { counts?: Record<string, number>; lastStage?: string; lastStatus?: string; lastUpdatedAt?: number; lastEvent?: string; lastError?: string };
type Analytics = { configured: boolean; events: Record<string, number>; total: number; lastEventAt?: number | null; delivery?: DeliveryDiagnostics | null };

type ShopifyBridge = { idToken?: () => Promise<string> };

const DEFAULT_OFFERS: Offer[] = [{ id: "starter-offer", name: "10% off orders over ₹1,000", type: "percentage", value: 10, minCartValue: 1000, enabled: true, createdAt: new Date().toISOString() }];
const HEALTH_WINDOW_MS = 15 * 60 * 1000;

function resolveComponent(mod: Record<string, unknown>, name: string): ComponentType | undefined {
  const fns = Object.values(mod).filter((v) => typeof v === "function") as ComponentType[];
  return (mod.default as ComponentType) || (mod.Preview as ComponentType) || (mod[name] as ComponentType) || fns[fns.length - 1];
}

function PreviewRenderer({ componentPath, modules }: { componentPath: string; modules: ModuleMap }) {
  const [Component, setComponent] = useState<ComponentType | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      setComponent(undefined); setError(null);
      const loader = modules[`./components/mockups/${componentPath}.tsx`];
      if (!loader) { setError(`No component found at ${componentPath}.tsx`); return; }
      try {
        const mod = await loader();
        if (!cancelled) setComponent(() => resolveComponent(mod, componentPath.split("/").pop()!));
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); }
    }
    void load();
    return () => { cancelled = true; };
  }, [componentPath, modules]);
  if (error) return <pre className="p-8 text-red-600">{error}</pre>;
  return Component ? <Component /> : null;
}

function getPreviewPath(): string | null {
  const pathname = window.location.pathname;
  const match = pathname.match(/^\/preview\/(.+)$/);
  return match ? match[1] : null;
}
function storageKey(shop?: ShopifyStatus["shop"]): string { return `cartlift:offers:${shop?.myshopifyDomain || shop?.name || "unconnected"}`; }
function offerText(offer: Offer): string {
  if (offer.type === "percentage") return `${offer.value}% off`;
  if (offer.type === "fixed") return `₹${offer.value.toLocaleString("en-IN")} off`;
  return "Free shipping";
}

async function shopifyIdToken(): Promise<string> {
  const bridge = (window as Window & { shopify?: ShopifyBridge }).shopify;
  if (!bridge?.idToken) throw new Error("Shopify App Bridge authentication is unavailable. Reopen CartLift from Shopify Admin.");
  const token = await bridge.idToken();
  if (!token) throw new Error("Shopify did not provide an ID token. Reopen CartLift from Shopify Admin.");
  return token;
}

async function shopifyFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = await shopifyIdToken();
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(input, { ...init, headers });
    if (response.status !== 401 || response.headers.get("X-Shopify-Retry-Invalid-Session-Request") !== "1") return response;
  }
  throw new Error("Shopify session expired. Please reopen CartLift from Shopify Admin.");
}

async function offersApi(method: "GET" | "POST", offers?: Offer[]): Promise<Offer[]> {
  const response = await shopifyFetch("/api/shopify/offers", { method, headers: method === "POST" ? { "Content-Type": "application/json" } : undefined, body: method === "POST" ? JSON.stringify({ offers }) : undefined, cache: "no-store" });
  const payload = await response.json() as { offers?: Offer[]; error?: string };
  if (!response.ok) throw new Error(payload.error || `Offer API failed (${response.status}).`);
  return payload.offers ?? [];
}
async function productsApi(): Promise<Product[]> {
  const response = await shopifyFetch("/api/shopify/products", { cache: "no-store" });
  const payload = await response.json() as { products?: Product[]; error?: string };
  if (!response.ok) throw new Error(payload.error || `Product API failed (${response.status}).`);
  return payload.products ?? [];
}
async function analyticsApi(): Promise<Analytics> {
  const response = await shopifyFetch("/api/analytics", { cache: "no-store" });
  const payload = await response.json() as Analytics & { error?: string };
  if (!response.ok) throw new Error(payload.error || `Analytics API failed (${response.status}).`);
  return {
    configured: Boolean(payload.configured),
    events: payload.events ?? {},
    total: payload.total ?? 0,
    lastEventAt: payload.lastEventAt ?? null,
    delivery: payload.delivery ?? null,
  };
}
function formatLastEvent(lastEventAt?: number | null): string {
  if (!lastEventAt) return "No event received yet";
  const age = Math.max(0, Date.now() - lastEventAt);
  if (age < 60_000) return "Less than a minute ago";
  const minutes = Math.floor(age / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"} ago`;
}
function deliveryLabel(stage?: string): string {
  const labels: Record<string, string> = {
    pixel_initialized: "Pixel initialized",
    privacy_blocked: "Privacy blocked",
    request_failed: "Request failed",
    endpoint_rejected: "Endpoint rejected",
    endpoint_accepted: "Endpoint accepted",
    kv_persisted: "KV persisted",
    kv_persist_failed: "KV persistence failed",
    duplicate_event: "Duplicate ignored",
  };
  return labels[stage || ""] || stage || "No delivery diagnostic yet";
}

function CartLiftApp() {
  const [status, setStatus] = useState<ShopifyStatus>({ loading: true, connected: false });
  const [section, setSection] = useState<"overview" | "offers" | "insights" | "performance">("overview");
  const [offers, setOffers] = useState<Offer[]>([]);
  const [offerError, setOfferError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<OfferType>("percentage");
  const [value, setValue] = useState("10");
  const [minimum, setMinimum] = useState("1000");
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<Analytics>({ configured: false, events: {}, total: 0, lastEventAt: null, delivery: null });
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    shopifyFetch("/api/shopify/shop", { cache: "no-store" }).then(async (r) => {
      const p = await r.json() as ShopifyStatus & { error?: string };
      if (!r.ok) throw new Error(p.error || `Shopify connection failed (${r.status}).`);
      if (!cancelled) setStatus({ loading: false, connected: true, shop: p.shop, scope: p.scope });
    }).catch((e) => { if (!cancelled) setStatus({ loading: false, connected: false, error: e instanceof Error ? e.message : "Unable to connect to Shopify." }); });
    return () => { cancelled = true; };
  }, []);

  async function loadOffers(): Promise<void> {
    if (!status.connected) return;
    try {
      setOfferError(null);
      const remote = await offersApi("GET");
      if (remote.length) { setOffers(remote); localStorage.setItem(storageKey(status.shop), JSON.stringify(remote)); return; }
      const seeded = await offersApi("POST", DEFAULT_OFFERS);
      const finalOffers = seeded.length ? seeded : DEFAULT_OFFERS;
      setOffers(finalOffers); localStorage.setItem(storageKey(status.shop), JSON.stringify(finalOffers));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unable to load Shopify offers.";
      try { setOffers(JSON.parse(localStorage.getItem(storageKey(status.shop)) || "null") || DEFAULT_OFFERS); } catch { setOffers(DEFAULT_OFFERS); }
      setOfferError(message);
    }
  }
  useEffect(() => { void loadOffers(); }, [status.connected, status.shop?.myshopifyDomain, status.shop?.name]);

  async function loadProducts(): Promise<void> {
    if (!status.connected) return;
    setProductsLoading(true); setProductsError(null);
    try { setProducts(await productsApi()); } catch (e) { setProductsError(e instanceof Error ? e.message : "Unable to load products."); } finally { setProductsLoading(false); }
  }
  useEffect(() => { if (status.connected) void loadProducts(); }, [status.connected]);

  async function loadAnalytics(): Promise<void> {
    if (!status.connected) return;
    setAnalyticsLoading(true); setAnalyticsError(null);
    try { setAnalytics(await analyticsApi()); } catch (e) { setAnalyticsError(e instanceof Error ? e.message : "Unable to load shopper events."); } finally { setAnalyticsLoading(false); }
  }
  useEffect(() => { if (status.connected) void loadAnalytics(); }, [status.connected]);
  useEffect(() => {
    if (!status.connected) return;
    const timer = window.setInterval(() => void loadAnalytics(), 60_000);
    return () => window.clearInterval(timer);
  }, [status.connected]);

  const enabled = useMemo(() => offers.filter((o) => o.enabled).length, [offers]);
  const inventory = useMemo(() => products.reduce((sum, p) => sum + (p.totalInventory || 0), 0), [products]);
  const activeProducts = useMemo(() => products.filter((p) => p.status === "ACTIVE").length, [products]);
  const event = (name: string): number => analytics.events[name] ?? 0;
  const pixelActive = Boolean(analytics.configured && analytics.lastEventAt && Date.now() - analytics.lastEventAt < HEALTH_WINDOW_MS);

  async function persist(next: Offer[]): Promise<void> {
    setOffers(next); setSaving(true); setOfferError(null);
    try { const saved = await offersApi("POST", next); setOffers(saved); localStorage.setItem(storageKey(status.shop), JSON.stringify(saved)); }
    catch (e) { localStorage.setItem(storageKey(status.shop), JSON.stringify(next)); setOfferError(e instanceof Error ? e.message : "Unable to save offers to Shopify."); }
    finally { setSaving(false); }
  }
  function reset(): void { setFormOpen(false); setEditing(null); setName(""); setType("percentage"); setValue("10"); setMinimum("1000"); }
  function create(): void { setEditing(null); setName(""); setType("percentage"); setValue("10"); setMinimum("1000"); setFormOpen(true); }
  function edit(o: Offer): void { setEditing(o.id); setName(o.name); setType(o.type); setValue(String(o.value)); setMinimum(String(o.minCartValue)); setFormOpen(true); }
  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    const numericValue = Math.max(0, Number(value) || 0); const numericMinimum = Math.max(0, Number(minimum) || 0);
    const cleanName = name.trim() || `${offerText({ id: "", name: "", type, value: numericValue, minCartValue: numericMinimum, enabled: true, createdAt: "" })} offer`;
    const next = editing ? offers.map((o) => o.id === editing ? { ...o, name: cleanName, type, value: numericValue, minCartValue: numericMinimum } : o) : [...offers, { id: crypto.randomUUID(), name: cleanName, type, value: numericValue, minCartValue: numericMinimum, enabled: true, createdAt: new Date().toISOString() }];
    await persist(next); reset();
  }

  const nav = [["overview", "Overview"], ["offers", "Offers"], ["insights", "Cart insights"], ["performance", "Performance"]] as const;
  return <div className="min-h-screen bg-gray-50 text-gray-900">
    <header className="border-b bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5"><div><h1 className="text-2xl font-semibold">CartLift</h1><p className="text-sm text-gray-500">Smart cart conversion tools for Shopify</p></div><div className={`rounded-full border px-3 py-1.5 text-sm ${status.connected ? "bg-gray-50" : ""}`}>{status.loading ? "Connecting…" : status.connected ? "Shopify connected" : "Not connected"}</div></div></header>
    <main className="mx-auto max-w-6xl px-6 py-8">
      <nav className="mb-6 flex flex-wrap gap-2">{nav.map(([id, label]) => <button key={id} type="button" onClick={() => setSection(id)} className={`rounded-lg border px-4 py-2 text-sm font-medium ${section === id ? "bg-gray-900 text-white" : "bg-white hover:bg-gray-100"}`}>{label}</button>)}</nav>
      {!status.connected && !status.loading && <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{status.error}</div>}

      {section === "overview" && <section className="rounded-2xl border bg-white p-8 shadow-sm"><p className="text-sm font-medium text-gray-500">CARTLIFT</p><h2 className="mt-1 text-3xl font-semibold tracking-tight">Increase cart value with smarter offers.</h2><p className="mt-3 max-w-2xl text-gray-600">A Shopify-native workspace for offers, product signals, and real shopper conversion tracking.</p><div className="mt-8 grid gap-4 md:grid-cols-3"><button type="button" onClick={() => setSection("offers")} className="rounded-xl border p-5 text-left hover:bg-gray-50"><p className="font-medium">Offers</p><p className="mt-2 text-sm text-gray-500">{offers.length} saved · {enabled} active</p></button><button type="button" onClick={() => setSection("insights")} className="rounded-xl border p-5 text-left hover:bg-gray-50"><p className="font-medium">Cart insights</p><p className="mt-2 text-sm text-gray-500">{analyticsLoading ? "Loading shopper events…" : `${analytics.total} shopper events`}</p></button><button type="button" onClick={() => setSection("performance")} className="rounded-xl border p-5 text-left hover:bg-gray-50"><p className="font-medium">Performance</p><p className="mt-2 text-sm text-gray-500">{event("checkout_completed")} completed checkouts tracked</p></button></div>{status.connected && <div className="mt-6 rounded-xl border bg-gray-50 p-5 text-sm"><p className="font-medium">Connected store</p><p className="mt-1 text-gray-600">{status.shop?.name || status.shop?.myshopifyDomain}</p>{status.scope && <p className="mt-1 text-gray-500">Granted scope: {status.scope}</p>}</div>}</section>}

      {section === "offers" && <section className="rounded-2xl border bg-white p-6 shadow-sm"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-2xl font-semibold">Offers</h2><p className="mt-1 text-sm text-gray-500">Create and manage offer rules stored on this Shopify store.</p></div><button type="button" onClick={create} disabled={!status.connected || saving} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">Create offer</button></div>{offerError && <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-medium">Shopify offer storage needs attention</p><p className="mt-1">{offerError}</p><button type="button" onClick={() => void loadOffers()} className="mt-3 rounded-md border border-amber-300 bg-white px-3 py-1.5 font-medium">Retry</button></div>}{formOpen && <form onSubmit={submit} className="mt-6 rounded-xl border bg-gray-50 p-5"><div className="grid gap-4 md:grid-cols-2"><label className="text-sm font-medium">Offer name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Weekend cart boost" className="mt-1 w-full rounded-lg border bg-white px-3 py-2 font-normal" /></label><label className="text-sm font-medium">Offer type<select value={type} onChange={(e) => setType(e.target.value as OfferType)} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 font-normal"><option value="percentage">Percentage discount</option><option value="fixed">Fixed discount</option><option value="free_shipping">Free shipping</option></select></label><label className="text-sm font-medium">Value<input type="number" min="0" value={value} onChange={(e) => setValue(e.target.value)} disabled={type === "free_shipping"} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 font-normal disabled:opacity-50" /></label><label className="text-sm font-medium">Minimum cart value<input type="number" min="0" value={minimum} onChange={(e) => setMinimum(e.target.value)} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 font-normal" /></label></div><div className="mt-4 flex gap-2"><button type="submit" disabled={saving} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">{saving ? "Saving…" : editing ? "Save changes" : "Create offer"}</button><button type="button" onClick={reset} className="rounded-lg border bg-white px-4 py-2 text-sm font-medium">Cancel</button></div></form>}<div className="mt-6 space-y-3">{offers.length === 0 && <div className="rounded-xl border border-dashed p-8 text-center text-sm text-gray-500">No offers yet. Create your first CartLift offer.</div>}{offers.map((o) => <div key={o.id} className="flex flex-col gap-4 rounded-xl border p-5 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><h3 className="font-medium">{o.name}</h3><span className={`rounded-full px-2 py-0.5 text-xs ${o.enabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>{o.enabled ? "Active" : "Paused"}</span></div><p className="mt-1 text-sm text-gray-500">{offerText(o)} · minimum cart ₹{o.minCartValue.toLocaleString("en-IN")}</p></div><div className="flex gap-2"><button type="button" disabled={saving} onClick={() => void persist(offers.map((x) => x.id === o.id ? { ...x, enabled: !x.enabled } : x))} className="rounded-lg border px-3 py-2 text-sm">{o.enabled ? "Pause" : "Activate"}</button><button type="button" disabled={saving} onClick={() => edit(o)} className="rounded-lg border px-3 py-2 text-sm">Edit</button><button type="button" disabled={saving} onClick={() => void persist(offers.filter((x) => x.id !== o.id))} className="rounded-lg border px-3 py-2 text-sm text-red-600">Delete</button></div></div>)}</div><p className="mt-5 text-xs text-gray-400">Rules are persisted in Shopify metafields. Local browser storage is only a temporary fallback.</p></section>}

      {section === "insights" && <section className="rounded-2xl border bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="text-2xl font-semibold">Cart insights</h2><p className="mt-1 text-sm text-gray-500">Live store products plus real storefront shopper events.</p></div><div className="flex gap-2"><button type="button" onClick={() => void loadProducts()} disabled={productsLoading} className="rounded-lg border bg-white px-3 py-2 text-sm">{productsLoading ? "Refreshing…" : "Refresh products"}</button><button type="button" onClick={() => void loadAnalytics()} disabled={analyticsLoading} className="rounded-lg border bg-white px-3 py-2 text-sm">{analyticsLoading ? "Refreshing…" : "Refresh events"}</button></div></div>{productsError && <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{productsError}</div>}{analyticsError && <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-medium">Shopper event tracking needs attention</p><p className="mt-1">{analyticsError}</p></div>}
        <div className={`mt-6 rounded-xl border p-5 ${pixelActive ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div><div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${pixelActive ? "bg-green-500" : "bg-amber-500"}`} /><p className="font-semibold">Pixel: {pixelActive ? "Active" : analytics.lastEventAt ? "No recent events" : "Waiting for first event"}</p></div><p className="mt-1 text-sm text-gray-600">Last event received: {formatLastEvent(analytics.lastEventAt)} · {analytics.total} total events</p></div>
            <div className="text-left text-xs text-gray-600 sm:text-right"><p>Delivery: <span className="font-medium">{deliveryLabel(analytics.delivery?.lastStage)}</span></p>{analytics.delivery?.lastUpdatedAt && <p className="mt-1">Diagnostic: {formatLastEvent(analytics.delivery.lastUpdatedAt)}</p>}</div>
          </div>
          {analytics.delivery?.lastError && <p className="mt-3 rounded-lg border border-amber-300 bg-white/70 px-3 py-2 text-xs text-amber-900">Last delivery error: {analytics.delivery.lastError}</p>}
          {analytics.delivery?.counts && <div className="mt-4 flex flex-wrap gap-2">{Object.entries(analytics.delivery.counts).map(([stage, count]) => <span key={stage} className="rounded-full border bg-white px-2.5 py-1 text-xs text-gray-600">{deliveryLabel(stage)} · {count}</span>)}</div>}
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3"><div className="rounded-xl border p-5"><p className="text-sm text-gray-500">Products</p><p className="mt-1 text-2xl font-semibold">{products.length}</p></div><div className="rounded-xl border p-5"><p className="text-sm text-gray-500">Active products</p><p className="mt-1 text-2xl font-semibold">{activeProducts}</p></div><div className="rounded-xl border p-5"><p className="text-sm text-gray-500">Inventory units</p><p className="mt-1 text-2xl font-semibold">{inventory.toLocaleString("en-IN")}</p></div></div><div className="mt-5 grid gap-4 md:grid-cols-4"><div className="rounded-xl border p-5"><p className="text-sm text-gray-500">Product views</p><p className="mt-1 text-2xl font-semibold">{event("product_viewed")}</p></div><div className="rounded-xl border p-5"><p className="text-sm text-gray-500">Add to cart</p><p className="mt-1 text-2xl font-semibold">{event("product_added_to_cart")}</p></div><div className="rounded-xl border p-5"><p className="text-sm text-gray-500">Cart views</p><p className="mt-1 text-2xl font-semibold">{event("cart_viewed")}</p></div><div className="rounded-xl border p-5"><p className="text-sm text-gray-500">Checkout started</p><p className="mt-1 text-2xl font-semibold">{event("checkout_started")}</p></div></div><div className="mt-4 grid gap-4 md:grid-cols-4"><div className="rounded-xl border p-5"><p className="text-sm text-gray-500">Removed from cart</p><p className="mt-1 text-2xl font-semibold">{event("product_removed_from_cart")}</p></div><div className="rounded-xl border p-5"><p className="text-sm text-gray-500">Checkouts completed</p><p className="mt-1 text-2xl font-semibold">{event("checkout_completed")}</p></div><div className="rounded-xl border p-5"><p className="text-sm text-gray-500">Page views</p><p className="mt-1 text-2xl font-semibold">{event("page_viewed")}</p></div><div className="rounded-xl border p-5"><p className="text-sm text-gray-500">All tracked events</p><p className="mt-1 text-2xl font-semibold">{analytics.total}</p></div></div><div className="mt-6 overflow-hidden rounded-xl border"><div className="border-b bg-gray-50 px-4 py-3 text-sm font-medium">Product signals</div>{products.slice(0, 10).map((p) => <div key={p.id} className="flex items-center justify-between border-b px-4 py-3 last:border-0"><div><p className="font-medium">{p.title}</p><p className="text-xs text-gray-500">{p.status}</p></div><p className="text-sm text-gray-600">{p.totalInventory ?? 0} units</p></div>)}{!productsLoading && products.length === 0 && <div className="p-6 text-center text-sm text-gray-500">No products returned.</div>}</div><div className="mt-5 rounded-xl border bg-gray-50 p-4 text-sm text-gray-600">{analytics.configured ? `Analytics storage is configured. ${analytics.total} shopper events are persisted.` : "Analytics storage is not configured on this deployment yet."}{analytics.lastEventAt ? ` Last event: ${new Date(analytics.lastEventAt).toLocaleString()}.` : " No shopper event has reached CartLift yet."}</div></section>}

      {section === "performance" && <section className="rounded-2xl border bg-white p-6 shadow-sm"><h2 className="text-2xl font-semibold">Performance</h2><p className="mt-1 text-sm text-gray-500">Real storefront event counts from the connected store.</p><div className="mt-6 grid gap-4 md:grid-cols-4"><div className="rounded-xl border p-5"><p className="text-sm text-gray-500">Offer rules</p><p className="mt-1 text-2xl font-semibold">{offers.length}</p></div><div className="rounded-xl border p-5"><p className="text-sm text-gray-500">Active rules</p><p className="mt-1 text-2xl font-semibold">{enabled}</p></div><div className="rounded-xl border p-5"><p className="text-sm text-gray-500">Add to carts</p><p className="mt-1 text-2xl font-semibold">{event("product_added_to_cart")}</p></div><div className="rounded-xl border p-5"><p className="text-sm text-gray-500">Completed checkouts</p><p className="mt-1 text-2xl font-semibold">{event("checkout_completed")}</p></div></div><div className="mt-6 flex items-center justify-between rounded-xl border bg-gray-50 p-5"><div><p className="font-medium">Tracked shopper events</p><p className="mt-1 text-sm text-gray-600">{analytics.total} total events persisted for this store.</p></div><button type="button" onClick={() => void loadAnalytics()} disabled={analyticsLoading} className="rounded-lg border bg-white px-3 py-2 text-sm">{analyticsLoading ? "Refreshing…" : "Refresh"}</button></div></section>}
    </main>
  </div>;
}

export default function App() {
  const previewPath = getPreviewPath();
  if (previewPath) return <PreviewRenderer componentPath={previewPath} modules={discoveredModules as ModuleMap} />;
  return <CartLiftApp />;
}
