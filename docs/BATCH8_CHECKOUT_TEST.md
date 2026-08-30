# CartLift Batch 8 — Real Checkout Verification

This is a live-store verification checklist. It does not fabricate checkout analytics.

## Before starting

- Open CartLift inside Shopify Admin.
- Open **Cart Insights** and note the current values for:
  - Add to cart
  - Cart views
  - Checkout started
  - Checkouts completed
  - All tracked events
  - Pixel health / last event received
- Keep the Cart Insights page available for the final verification.

## Live storefront test

1. Open the real development-store storefront in a fresh session.
2. Open a product and allow the storefront to finish loading.
3. Add one product to the cart.
4. Open/view the cart.
5. Proceed to Shopify checkout.
6. Complete checkout using the store's approved development/test payment flow.
7. Wait briefly for the web pixel event delivery to finish.
8. Return to CartLift → **Cart Insights** and choose **Refresh events**.

## Expected event progression

The test should produce these standard Shopify customer events in order where the storefront surface supports them:

`product_viewed` → `product_added_to_cart` → `cart_viewed` → `checkout_started` → `checkout_completed`

Shopify defines `checkout_started` as the event for starting checkout and `checkout_completed` as the event for completing a purchase.

## Pass criteria

- `checkout_started` increases by at least 1.
- `checkout_completed` increases by at least 1 after a successful test purchase.
- **All tracked events** increases accordingly.
- **Last event received** advances to the checkout completion time.
- Pixel health remains active after the test.
- Delivery diagnostics show the event reaching `KV persisted` rather than `request failed`, `endpoint rejected`, or `KV persistence failed`.

## If checkout completes but CartLift stays at 0

Do not repeat the checkout blindly. Capture:

1. The Cart Insights counters before and after.
2. The Pixel health / last-event status.
3. The Delivery diagnostic stage and counts.
4. The Cloudflare Real-time Logs for `/api/analytics` around the checkout time.

That evidence should identify whether checkout failed to emit from Shopify, was blocked by privacy, failed in transport, was rejected by the endpoint, or failed during KV persistence.
