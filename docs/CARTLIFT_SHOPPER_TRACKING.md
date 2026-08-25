# CartLift Shopper Tracking

## Implemented

CartLift now contains a Shopify Web Pixel app-extension source under `extensions/cartlift-pixel`.

The pixel subscribes to these Shopify standard events:

- `page_viewed`
- `product_viewed`
- `product_added_to_cart`
- `product_removed_from_cart`
- `cart_viewed`
- `checkout_started`
- `checkout_completed`

Events are sent to:

`https://windingpurplevalue.pages.dev/api/analytics`

The Cloudflare Pages endpoint already accepts these events and can persist per-shop counters when the `CARTLIFT_ANALYTICS_KV` binding is configured.

## Required Shopify release step

Shopify requires the app to request:

- `write_pixels`
- `read_customer_events`

before the web pixel can be activated. Add those scopes to the CartLift app version in Shopify Dev Dashboard, include the `CartLift Shopper Analytics` web-pixel extension in the version, and release the version.

After release, activate/configure the app pixel for the development store.

## Required Cloudflare step

Create/bind a Cloudflare KV namespace named `CARTLIFT_ANALYTICS_KV` to the production Pages Functions environment. The analytics endpoint is intentionally safe without this binding, but returns `persisted: false` until the binding exists.

## Verification

1. Open the development store storefront.
2. Visit a product page.
3. Add a product to cart.
4. Open the cart.
5. Start checkout if possible.
6. Return to CartLift > Cart Insights.
7. Verify the event counters are greater than zero.

Do not use Replit for this workflow. The working project path is GitHub -> Cloudflare Pages -> Shopify.
