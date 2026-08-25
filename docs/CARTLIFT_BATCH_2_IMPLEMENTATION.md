# CartLift Batch 2 — Implementation Status

Batch 2 establishes the Shopify foundation without rebuilding the existing prototype.

## Implemented

- Added `shopify.app.toml` with embedded-app configuration and the minimum `read_products` scope.
- Added server-only Shopify credential placeholders through `artifacts/api-server/.env.example`.
- Added a managed-install/token-exchange boundary for embedded Shopify sessions.
- Added server-side Admin GraphQL service boundary.
- Added `/api/shopify/exchange/offline` and `/api/shopify/shop` endpoints.
- Kept the existing Express/TypeScript foundation intact.

## Required before real Shopify verification

1. Link the repository to the existing CartLift app from Shopify Dev Dashboard with `shopify app config link`.
2. Replace the placeholder `client_id` in the linked local configuration with the real Dev Dashboard value (the CLI normally manages this during linking).
3. Provide `SHOPIFY_API_SECRET` only as a deployment secret; never commit it.
4. Ensure the public backend URL, not only the static frontend URL, is used for the production Shopify app URL and auth endpoints when the Express API is deployed.
5. Install CartLift on the development store and verify an authenticated Admin GraphQL request.

## Verification status

- Repository changes: implemented.
- Secrets committed: no.
- Real Shopify development-store installation: **pending**.
- Real authenticated Shopify Admin API request: **pending**.

Do not mark Batch 2 as fully complete until the last two checks succeed.
