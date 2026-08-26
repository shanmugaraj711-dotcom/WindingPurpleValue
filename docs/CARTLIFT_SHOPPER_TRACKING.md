# CartLift Shopper Tracking

## Implemented

CartLift now contains the Shopify Web Pixel app-extension source under `extensions/cartlift-web-pixel`.

The extension uses Shopify's `web_pixel_extension` format and subscribes to these Shopify standard events:

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

## Shopify activation flow

CartLift requests:

- `write_pixels`
- `read_customer_events`

The app's `/api/shopify/shop` endpoint now checks for an existing Shopify web pixel and automatically calls `webPixelCreate` with the CartLift analytics endpoint when no pixel exists. This removes the need for the merchant to create a Custom Pixel manually.

The Shopify app version still must contain and release the `cartlift-web-pixel` extension before `webPixelCreate` can succeed. After the version is released, opening CartLift triggers the activation check automatically.

## Required Cloudflare step

Create/bind a Cloudflare KV namespace named `CARTLIFT_ANALYTICS_KV` to the production Pages Functions environment. The analytics endpoint is intentionally safe without this binding, but returns `persisted: false` until the binding exists.

## Verification

1. Release the Shopify app version containing `cartlift-web-pixel`.
2. Open CartLift in the development store.
3. Open Settings > Customer events and confirm the CartLift app pixel is present/connected.
4. Open the development store storefront.
5. Visit a product page.
6. Add a product to cart.
7. Open the cart.
8. Start checkout if possible.
9. Return to CartLift > Cart Insights.
10. Verify the event counters are greater than zero.

Do not use Replit for this workflow. The working project path is GitHub -> Cloudflare Pages -> Shopify.
