import { useEffect, useMemo, useState, type ComponentType, type FormEvent } from "react";

import { modules as discoveredModules } from "./.generated/mockup-components";

type ModuleMap = Record<string, () => Promise<Record<string, unknown>>>;

type ShopifyStatus = {
  loading: boolean;
  connected: boolean;
  shop?: { name?: string; myshopifyDomain?: string } | null;
  scope?: string;
  error?: string;
};

type OfferType = "percentage" | "fixed" | "free_shipping";

type Offer = {
  id: string;
  name: string;
  type: OfferType;
  value: number;
  minCartValue: number;
  enabled: boolean;
  createdAt: string;
};

const DEFAULT_OFFERS: Offer[] = [
  {
    id: "starter-offer",
    name: "10% off orders over ₹1,000",
    type: "percentage",
    value: 10,
    minCartValue: 1000,
    enabled: true,
    createdAt: new Date().toISOString(),
  },
];

function _resolveComponent(
  mod: Record<string, unknown>,
  name: string,
): ComponentType | undefined {
  const fns = Object.values(mod).filter(
    (v) => typeof v === "function",
  ) as ComponentType[];
  return (
    (mod.default as ComponentType) ||
    (mod.Preview as ComponentType) ||
    (mod[name] as ComponentType) ||
    fns[fns.length - 1]
  );
}

function PreviewRenderer({
  componentPath,
  modules,
}: {
  componentPath: string;
  modules: ModuleMap;
}) {
  const [Component, setComponent] = useState<ComponentType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setComponent(null);
    setError(null);

    async function loadComponent(): Promise<void> {
      const key = `./components/mockups/${componentPath}.tsx`;
      const loader = modules[key];
      if (!loader) {
        setError(`No component found at ${componentPath}.tsx`);
        return;
      }
      try {
        const mod = await loader();
        if (cancelled) return;
        const name = componentPath.split("/").pop()!;
        const comp = _resolveComponent(mod, name);
        if (!comp) {
          setError(`No exported React component found in ${componentPath}.tsx`);
          return;
        }
        setComponent(() => comp);
      } catch (e) {
        if (!cancelled) {
          setError(`Failed to load preview.\n${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    void loadComponent();
    return () => {
      cancelled = true;
    };
  }, [componentPath, modules]);

  if (error) return <pre style={{ color: "red", padding: "2rem" }}>{error}</pre>;
  if (!Component) return null;
  return <Component />;
}

function getBasePath(): string {
  return import.meta.env.BASE_URL.replace(/\/$/, "");
}

function getPreviewPath(): string | null {
  const basePath = getBasePath();
  const { pathname } = window.location;
  const local = basePath && pathname.startsWith(basePath)
    ? pathname.slice(basePath.length) || "/"
    : pathname;
  const match = local.match(/^\/preview\/(.+)$/);
  return match ? match[1] : null;
}

function getOfferStorageKey(shop?: ShopifyStatus["shop"]): string {
  const shopKey = shop?.myshopifyDomain || shop?.name || "unconnected";
  return `cartlift:offers:${shopKey}`;
}

function formatOffer(offer: Offer): string {
  if (offer.type === "percentage") return `${offer.value}% off`;
  if (offer.type === "fixed") return `₹${offer.value.toLocaleString("en-IN")} off`;
  return "Free shipping";
}

function CartLiftApp() {
  const [status, setStatus] = useState<ShopifyStatus>({ loading: true, connected: false });
  const [activeSection, setActiveSection] = useState<"overview" | "offers" | "insights" | "performance">("overview");
  const [offers, setOffers] = useState<Offer[]>([]);
  const [showOfferForm, setShowOfferForm] = useState(false);
  const [editingOfferId, setEditingOfferId] = useState<string | null>(null);
  const [offerName, setOfferName] = useState("");
  const [offerType, setOfferType] = useState<OfferType>("percentage");
  const [offerValue, setOfferValue] = useState("10");
  const [minCartValue, setMinCartValue] = useState("1000");

  useEffect(() => {
    let cancelled = false;

    async function connectShop(): Promise<void> {
      try {
        const shopify = (window as unknown as { shopify?: { idToken?: () => Promise<string> } }).shopify;
        if (!shopify?.idToken) {
          if (!cancelled) setStatus({ loading: false, connected: false, error: "Open CartLift from Shopify Admin to authenticate." });
          return;
        }

        const idToken = await shopify.idToken();
        const response = await fetch("/api/shopify/shop", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const payload = await response.json() as ShopifyStatus & { error?: string };

        if (!response.ok) {
          throw new Error(payload.error || `Shopify connection failed (${response.status}).`);
        }

        if (!cancelled) {
          setStatus({ loading: false, connected: true, shop: payload.shop, scope: payload.scope });
        }
      } catch (error) {
        if (!cancelled) {
          setStatus({
            loading: false,
            connected: false,
            error: error instanceof Error ? error.message : "Unable to connect to Shopify.",
          });
        }
      }
    }

    void connectShop();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!status.connected) return;
    const key = getOfferStorageKey(status.shop);
    try {
      const saved = window.localStorage.getItem(key);
      setOffers(saved ? JSON.parse(saved) as Offer[] : DEFAULT_OFFERS);
    } catch {
      setOffers(DEFAULT_OFFERS);
    }
  }, [status.connected, status.shop]);

  useEffect(() => {
    if (!status.connected) return;
    try {
      window.localStorage.setItem(getOfferStorageKey(status.shop), JSON.stringify(offers));
    } catch {
      // Keep the UI usable if browser storage is unavailable.
    }
  }, [offers, status.connected, status.shop]);

  const enabledOffers = useMemo(() => offers.filter((offer) => offer.enabled).length, [offers]);

  function resetOfferForm(): void {
    setEditingOfferId(null);
    setOfferName("");
    setOfferType("percentage");
    setOfferValue("10");
    setMinCartValue("1000");
    setShowOfferForm(false);
  }

  function openCreateOffer(): void {
    setEditingOfferId(null);
    setOfferName("");
    setOfferType("percentage");
    setOfferValue("10");
    setMinCartValue("1000");
    setShowOfferForm(true);
  }

  function openEditOffer(offer: Offer): void {
    setEditingOfferId(offer.id);
    setOfferName(offer.name);
    setOfferType(offer.type);
    setOfferValue(String(offer.value));
    setMinCartValue(String(offer.minCartValue));
    setShowOfferForm(true);
  }

  function saveOffer(event: FormEvent): void {
    event.preventDefault();
    const value = Math.max(0, Number(offerValue) || 0);
    const minimum = Math.max(0, Number(minCartValue) || 0);
    const cleanName = offerName.trim() || `${formatOffer({ id: "", name: "", type: offerType, value, minCartValue: minimum, enabled: true, createdAt: "" })} offer`;

    if (editingOfferId) {
      setOffers((current) => current.map((offer) => offer.id === editingOfferId
        ? { ...offer, name: cleanName, type: offerType, value, minCartValue: minimum }
        : offer));
    } else {
      setOffers((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          name: cleanName,
          type: offerType,
          value,
          minCartValue: minimum,
          enabled: true,
          createdAt: new Date().toISOString(),
        },
      ]);
    }
    resetOfferForm();
  }

  function toggleOffer(id: string): void {
    setOffers((current) => current.map((offer) => offer.id === id ? { ...offer, enabled: !offer.enabled } : offer));
  }

  function deleteOffer(id: string): void {
    setOffers((current) => current.filter((offer) => offer.id !== id));
  }

  const navItems = [
    ["overview", "Overview"],
    ["offers", "Offers"],
    ["insights", "Cart insights"],
    ["performance", "Performance"],
  ] as const;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div>
            <h1 className="text-2xl font-semibold">CartLift</h1>
            <p className="text-sm text-gray-500">Smart cart conversion tools for Shopify</p>
          </div>
          <div className="rounded-full border px-3 py-1.5 text-sm">
            {status.loading ? "Connecting…" : status.connected ? "Shopify connected" : "Not connected"}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <nav className="mb-6 flex flex-wrap gap-2">
          {navItems.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveSection(id)}
              className={`rounded-lg border px-4 py-2 text-sm font-medium ${activeSection === id ? "bg-gray-900 text-white" : "bg-white hover:bg-gray-100"}`}
            >
              {label}
            </button>
          ))}
        </nav>

        {!status.connected && !status.loading && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">{status.error}</div>
        )}

        {activeSection === "overview" && (
          <section className="rounded-2xl border bg-white p-8 shadow-sm">
            <p className="mb-2 text-sm font-medium text-gray-500">CARTLIFT</p>
            <h2 className="text-3xl font-semibold tracking-tight">Increase cart value with smarter offers.</h2>
            <p className="mt-3 max-w-2xl text-gray-600">Create conversion offers, understand cart behavior, and track performance from one Shopify-native dashboard.</p>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <button type="button" onClick={() => setActiveSection("offers")} className="rounded-xl border p-5 text-left hover:bg-gray-50">
                <h3 className="font-medium">Offers</h3>
                <p className="mt-2 text-sm text-gray-500">{offers.length} saved · {enabledOffers} active</p>
              </button>
              <button type="button" onClick={() => setActiveSection("insights")} className="rounded-xl border p-5 text-left hover:bg-gray-50">
                <h3 className="font-medium">Cart insights</h3>
                <p className="mt-2 text-sm text-gray-500">Ready for live cart data</p>
              </button>
              <button type="button" onClick={() => setActiveSection("performance")} className="rounded-xl border p-5 text-left hover:bg-gray-50">
                <h3 className="font-medium">Performance</h3>
                <p className="mt-2 text-sm text-gray-500">Offer tracking workspace</p>
              </button>
            </div>

            {status.connected && (
              <div className="mt-6 rounded-xl border bg-gray-50 p-5 text-sm">
                <p className="font-medium">Connected store</p>
                <p className="mt-1 text-gray-600">{status.shop?.name || status.shop?.myshopifyDomain}</p>
                {status.scope && <p className="mt-1 text-gray-500">Granted scope: {status.scope}</p>}
              </div>
            )}
          </section>
        )}

        {activeSection === "offers" && (
          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-semibold">Offers</h2>
                <p className="mt-1 text-sm text-gray-500">Create and manage CartLift offer rules for this store.</p>
              </div>
              <button type="button" onClick={openCreateOffer} disabled={!status.connected} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40">Create offer</button>
            </div>

            {showOfferForm && (
              <form onSubmit={saveOffer} className="mt-6 rounded-xl border bg-gray-50 p-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm font-medium">Offer name<input value={offerName} onChange={(e) => setOfferName(e.target.value)} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 font-normal" placeholder="Weekend cart boost" /></label>
                  <label className="text-sm font-medium">Offer type<select value={offerType} onChange={(e) => setOfferType(e.target.value as OfferType)} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 font-normal"><option value="percentage">Percentage discount</option><option value="fixed">Fixed discount</option><option value="free_shipping">Free shipping</option></select></label>
                  <label className="text-sm font-medium">Value<input type="number" min="0" value={offerValue} onChange={(e) => setOfferValue(e.target.value)} disabled={offerType === "free_shipping"} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 font-normal disabled:opacity-50" /></label>
                  <label className="text-sm font-medium">Minimum cart value<input type="number" min="0" value={minCartValue} onChange={(e) => setMinCartValue(e.target.value)} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 font-normal" /></label>
                </div>
                <div className="mt-4 flex gap-2"><button type="submit" className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white">{editingOfferId ? "Save changes" : "Create offer"}</button><button type="button" onClick={resetOfferForm} className="rounded-lg border bg-white px-4 py-2 text-sm font-medium">Cancel</button></div>
              </form>
            )}

            <div className="mt-6 space-y-3">
              {offers.length === 0 && <div className="rounded-xl border border-dashed p-8 text-center text-sm text-gray-500">No offers yet. Create your first CartLift offer.</div>}
              {offers.map((offer) => (
                <div key={offer.id} className="flex flex-col gap-4 rounded-xl border p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2"><h3 className="font-medium">{offer.name}</h3><span className={`rounded-full px-2 py-1 text-xs ${offer.enabled ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>{offer.enabled ? "Active" : "Paused"}</span></div>
                    <p className="mt-2 text-sm text-gray-500">{formatOffer(offer)} · minimum cart ₹{offer.minCartValue.toLocaleString("en-IN")}</p>
                  </div>
                  <div className="flex gap-2"><button type="button" onClick={() => toggleOffer(offer.id)} className="rounded-lg border px-3 py-2 text-sm">{offer.enabled ? "Pause" : "Enable"}</button><button type="button" onClick={() => openEditOffer(offer)} className="rounded-lg border px-3 py-2 text-sm">Edit</button><button type="button" onClick={() => deleteOffer(offer.id)} className="rounded-lg border px-3 py-2 text-sm text-red-700">Delete</button></div>
                </div>
              ))}
            </div>
            <p className="mt-5 text-xs text-gray-400">Offer rules are currently saved per connected store in this browser. Shopify discount creation and live storefront application will be wired in the next integration step.</p>
          </section>
        )}

        {activeSection === "insights" && (
          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-semibold">Cart insights</h2>
            <p className="mt-1 text-sm text-gray-500">Live Shopify cart analytics will appear here once the storefront tracking layer is enabled.</p>
            <div className="mt-6 grid gap-4 md:grid-cols-3"><div className="rounded-xl border p-5"><p className="text-sm text-gray-500">Tracked carts</p><p className="mt-2 text-2xl font-semibold">—</p></div><div className="rounded-xl border p-5"><p className="text-sm text-gray-500">Average cart value</p><p className="mt-2 text-2xl font-semibold">—</p></div><div className="rounded-xl border p-5"><p className="text-sm text-gray-500">Top cart item</p><p className="mt-2 text-2xl font-semibold">—</p></div></div>
          </section>
        )}

        {activeSection === "performance" && (
          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-semibold">Performance</h2>
            <p className="mt-1 text-sm text-gray-500">Performance tracking is ready for storefront event data.</p>
            <div className="mt-6 grid gap-4 md:grid-cols-3"><div className="rounded-xl border p-5"><p className="text-sm text-gray-500">Offer views</p><p className="mt-2 text-2xl font-semibold">—</p></div><div className="rounded-xl border p-5"><p className="text-sm text-gray-500">Conversions</p><p className="mt-2 text-2xl font-semibold">—</p></div><div className="rounded-xl border p-5"><p className="text-sm text-gray-500">Lift</p><p className="mt-2 text-2xl font-semibold">—</p></div></div>
          </section>
        )}
      </main>
    </div>
  );
}

function App() {
  const previewPath = getPreviewPath();
  if (previewPath) return <PreviewRenderer componentPath={previewPath} modules={discoveredModules} />;
  return <CartLiftApp />;
}

export default App;
