# CartLift — Batch 1 Foundation Audit

Status: COMPLETE — foundation audited and frozen before Shopify integration.

## What exists

- pnpm monorepo with TypeScript workspace tooling.
- Express 5 API server with structured logging, CORS, JSON parsing, and `/api` routing.
- API health endpoint: `/api/healthz`.
- PostgreSQL + Drizzle package scaffold and database connection package.
- OpenAPI/Zod/API-client workspace packages.
- Replit mockup sandbox with React/Vite-style preview infrastructure and generic UI primitives.
- GitHub is the source-control baseline for the project.

## What is NOT implemented yet

- Shopify app configuration.
- Shopify authentication/session handling.
- Shopify Admin API integration.
- Shopify product/catalog synchronization.
- Merchant/store persistence models for CartLift settings.
- Free-shipping threshold configuration backed by real store data.
- Deterministic recommendation engine in production code.
- Theme App Extension / app embed.
- Real storefront cart integration.
- One-click add-to-cart integration.
- Event ingestion and analytics attribution.
- Influenced-revenue attribution.
- Production merchant onboarding/dashboard.

## Important correction

The Replit Agent described a data layer, merchant record, product catalog, event stream, recommendation logic, and dashboard work in its activity log. The pushed repository does not currently contain those implementations in the audited source paths. The database schema is still an empty scaffold and the API currently exposes only the health route. Therefore those items are treated as planned work, not completed work.

## V1 contract we are freezing

CartLift V1 remains intentionally small:

1. Merchant sets a free-shipping threshold.
2. CartLift shows progress toward that threshold.
3. CartLift shows one relevant product recommendation.
4. Customer can add that product without leaving the cart.
5. Storefront integration uses a Shopify Theme App Extension/app embed and does not edit theme code.
6. Recommendation logic is deterministic and has no AI dependency.
7. Merchant dashboard exposes defensible core event metrics.

Explicitly out of V1: timers, gifts, bundles, discount engines, large analytics suites, and unnecessary AI/integrations.

## Next batch

Batch 2: build the real Shopify app foundation — app configuration, authentication/session boundary, minimum required permissions, and development-store connection.

## Rule

Do not declare a batch complete from an agent message alone. Verify the actual repository, build/test output, and real Shopify behavior before advancing the batch.
