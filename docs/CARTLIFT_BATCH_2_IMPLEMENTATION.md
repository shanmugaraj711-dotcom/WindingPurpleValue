# CartLift Batch 2 — Implementation Status

Batch 2 establishes the Shopify foundation without rebuilding the existing prototype.

## Implemented

- Added `shopify.app.toml` with embedded-app configuration and the minimum `read_products` scope.
- Added Shopify managed-install/token-exchange support.
- Added a Cloudflare Pages Function at `/api/shopify/shop` that validates the App Bridge ID token, exchanges it for an expiring offline Admin API token, and performs a real Admin GraphQL shop-identity query.
- Added the required authorization callback URL endpoint for Shopify app configuration.
- Added Shopify App Bridge from Shopify's official CDN to the frontend.
- Added an embedded startup connection check so CartLift exercises the authenticated Shopify request path when opened inside Shopify Admin.
- Kept the existing Express/TypeScript foundation intact for future backend workloads.
- No Shopify secret is committed to Git.

## Cloudflare configuration required

Set these as Cloudflare Pages environment variables for Production and Preview as appropriate:

- `VITE_SHOPIFY_API_KEY` — the public Shopify client ID, used by App Bridge in the frontend.
- `SHOPIFY_API_KEY` — the same Shopify client ID, used by the Pages Function.
- `SHOPIFY_API_SECRET` — the Shopify client secret; store it as a secret and never commit it.
- `SHOPIFY_API_VERSION` — optional; defaults to `2026-07`.

The Pages project should keep the current monorepo build settings that successfully build `@workspace/mockup-sandbox` to its Vite output directory. The root-level `functions/` directory is intentionally outside the static output directory because Cloudflare Pages discovers Pages Functions from the project root. citeturn2search0turn2search1

## Shopify configuration required

1. Link the repository to the existing CartLift app from Shopify Dev Dashboard with Shopify CLI when running the CLI locally.
2. Replace the placeholder `client_id` in `shopify.app.toml` with the real Dev Dashboard value when the configuration is linked.
3. Deploy the Shopify app configuration so the managed-install settings and `read_products` scope are active.
4. Install CartLift on the development store.
5. Open CartLift inside Shopify Admin and verify that the startup request reaches `/api/shopify/shop` and returns the store identity.

Shopify's current embedded-app flow uses App Bridge ID tokens, token exchange, and Admin GraphQL; new public apps should request expiring offline tokens with `expiring=1`. citeturn1search0turn3search0turn6search9

## Verification status

- Repository implementation: **done**.
- Cloudflare deployment trigger: **automatic via Git integration**.
- Shopify credentials configured in Cloudflare: **pending**.
- Real Shopify development-store installation: **pending**.
- Real authenticated Shopify Admin API request: **pending**.

Do not mark Batch 2 as fully complete until the last two checks succeed.
