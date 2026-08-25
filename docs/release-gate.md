# CartLift V1 Release Gate

Required before production launch:

1. Production environment checks pass.
2. Shopify install/auth flow passes on a development store.
3. Theme extension renders correctly.
4. Recommendation add-to-cart works.
5. Shipping progress updates correctly.
6. Events persist under the authenticated shop.
7. Dashboard reads only that shop's data.
8. Uninstall/session cleanup is verified.
9. Shopify Partner/App Store configuration is complete.

Code contracts for these checks are included in the API release gate and E2E validation modules.
