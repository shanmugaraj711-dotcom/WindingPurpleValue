# CartLift Batch 5 — Release Hardening

## Scope
- Keep all merchant data scoped by authenticated Shopify shop.
- Keep CartLift analytics limited to the five V1 event types.
- Keep influenced revenue attribution non-negative.
- Keep storefront behavior graceful when CartLift is disabled or not configured.
- Do not require theme code edits outside the Theme App Extension.
- Do not expose database credentials or raw Shopify access tokens to storefront code.

## Release gates
1. OAuth/session authentication is required before merchant settings or analytics are read/written.
2. Every settings/event operation is keyed by the authenticated shop.
3. Database migrations are applied before production use.
4. Theme extension can be enabled/disabled without breaking the cart.
5. Add-to-cart failure leaves the existing cart intact and surfaces a recoverable UI state.
6. Analytics failures must never block cart operations.

## V1 acceptance
- Free-shipping progress renders from cart state.
- Merchant-selected recommendation can be added with one click.
- Merchant settings persist.
- Analytics persist.
- Dashboard metrics are merchant-scoped.

## Explicit non-goals
No billing, subscription enforcement, advanced attribution, automatic product ranking, or App Store submission automation in V1.
