import { useEffect, useState, type ComponentType } from "react";

import { modules as discoveredModules } from "./.generated/mockup-components";

type ModuleMap = Record<string, () => Promise<Record<string, unknown>>>;

type ShopifyStatus = {
  loading: boolean;
  connected: boolean;
  shop?: { name?: string; myshopifyDomain?: string } | null;
  scope?: string;
  error?: string;
};

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

function CartLiftApp() {
  const [status, setStatus] = useState<ShopifyStatus>({ loading: true, connected: false });

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

      <main className="mx-auto max-w-6xl px-6 py-10">
        <section className="rounded-2xl border bg-white p-8 shadow-sm">
          <p className="mb-2 text-sm font-medium text-gray-500">CARTLIFT</p>
          <h2 className="text-3xl font-semibold tracking-tight">Increase cart value with smarter offers.</h2>
          <p className="mt-3 max-w-2xl text-gray-600">
            Your Shopify connection is being prepared first. Once connected, this dashboard will power CartLift offers, cart insights, and conversion controls.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              ["Offers", "Create and manage cart offers"],
              ["Cart insights", "Understand what shoppers add"],
              ["Performance", "Track lift and conversion"],
            ].map(([title, description]) => (
              <div key={title} className="rounded-xl border p-5">
                <h3 className="font-medium">{title}</h3>
                <p className="mt-2 text-sm text-gray-500">{description}</p>
              </div>
            ))}
          </div>

          {status.connected && (
            <div className="mt-6 rounded-xl border bg-gray-50 p-5 text-sm">
              <p className="font-medium">Connected store</p>
              <p className="mt-1 text-gray-600">{status.shop?.name || status.shop?.myshopifyDomain}</p>
              {status.scope && <p className="mt-1 text-gray-500">Granted scope: {status.scope}</p>}
            </div>
          )}

          {status.error && (
            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
              {status.error}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function App() {
  const previewPath = getPreviewPath();
  if (previewPath) {
    return <PreviewRenderer componentPath={previewPath} modules={discoveredModules} />;
  }
  return <CartLiftApp />;
}

export default App;
