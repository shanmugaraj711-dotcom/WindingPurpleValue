# CartLift Shopify setup — next exact steps

Current public frontend: https://windingpurplevalue.pages.dev

Dev Dashboard values currently intended:
- App name: CartLift
- App URL: https://windingpurplevalue.pages.dev
- Embedded app: enabled
- Webhook API version: 2026-07

Do not release a Shopify app version until the production authentication/backend callback is deployed and the exact callback URL is entered in Dev Dashboard. The current pages.dev deployment is the frontend preview/hosting layer; Shopify Admin API credentials and token exchange must remain server-side.

Required next verification:
1. Deploy the API/auth service on a runtime that supports the Express server (not static Pages-only hosting).
2. Set SHOPIFY_API_KEY and SHOPIFY_API_SECRET as deployment secrets.
3. Set SHOPIFY_APP_URL to the public API origin.
4. Configure the Shopify app's allowed redirect URL to the actual deployed callback endpoint.
5. Install on the development store and verify an authenticated Admin GraphQL call.
6. Only then release the Shopify app version.
