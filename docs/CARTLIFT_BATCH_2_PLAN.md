# CartLift — Batch 2

## Goal
Establish the real Shopify app foundation without rebuilding the existing prototype.

## Scope
- Shopify app configuration boundary
- Current Shopify authentication/session boundary
- Minimum required access scopes
- Development-store connection contract
- Server-only secret handling
- Shopify Admin GraphQL integration boundary
- Verification checklist

## Hard definition of done
Batch 2 is complete only after a real Shopify development store can install/open CartLift and the app can make an authenticated Shopify API request.

## Current blocker
The repository currently contains only the prototype Express API and database scaffold. No Shopify app configuration or authentication implementation is present yet. Implementation therefore requires a development environment with the Shopify CLI/app tooling or an equivalent supported build environment.

## Constraints
- Do not use Replit Agent while its monthly quota is exhausted.
- Do not pay for tooling without user approval.
- Do not request unnecessary Shopify permissions.
- Do not claim Shopify integration is complete until real-store verification succeeds.
- Preserve the existing foundation; do not rebuild it.
