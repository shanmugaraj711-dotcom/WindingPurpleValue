# CartLift App Store Readiness

## Product
- CartLift improves cart conversion with a shipping-progress incentive and product recommendation.
- Merchant controls remain minimal and understandable.

## Required launch checks
- [ ] Shopify Partner app configuration completed
- [ ] Production HTTPS URL configured
- [ ] OAuth/install flow tested on a development store
- [ ] Theme App Extension installed and rendered on a supported Online Store theme
- [ ] Cart Ajax add flow tested
- [ ] Settings persisted and isolated per shop
- [ ] Analytics events persisted and isolated per shop
- [ ] Privacy policy URL configured
- [ ] Support/contact information configured
- [ ] App listing assets and screenshots prepared
- [ ] Billing/plan configuration added only if monetization is enabled

## Security
- Never expose Shopify API secrets to the storefront.
- Validate and normalize the shop domain before using it as a tenant key.
- Keep all merchant data scoped to the authenticated shop.
