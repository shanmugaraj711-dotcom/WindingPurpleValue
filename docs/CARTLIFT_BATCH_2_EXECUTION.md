# CartLift Batch 2 — Shopify Foundation Execution

## Agent instructions

Implement ONLY this batch. Preserve the existing prototype and do not rebuild unrelated code.

### Goal
Prepare CartLift to be a real Shopify CLI-managed app while keeping the existing Express/TypeScript foundation usable.

### Required work
1. Add the Shopify CLI app configuration boundary using the current `shopify.app.toml` format.
2. Keep the app embedded in Shopify Admin (`embedded = true`).
3. Add the minimum access scopes needed for the current V1 foundation. Product/catalog read access is the expected starting point; do NOT add order/customer/write scopes yet unless the implementation proves they are required.
4. Add the Shopify authentication/session integration boundary using Shopify's current CLI-managed installation/authentication approach. Do not implement an obsolete custom OAuth callback flow.
5. Add a clean Admin GraphQL client/service boundary for future product/catalog work.
6. Add environment-variable handling for secrets; never commit API secrets.
7. Add a clear development setup/readme for linking the project to an existing Shopify app and running it against a development store.
8. Add or update automated checks for the new configuration/code where practical.

### Do NOT do in Batch 2
- Do not build the Theme App Extension yet.
- Do not build the cart UI yet.
- Do not build recommendations yet.
- Do not build analytics yet.
- Do not add AI.
- Do not add timers, bundles, gifts, discounts, or unrelated features.
- Do not invent a Shopify client ID, application URL, secret, store URL, or credentials.
- Do not claim real-store verification is complete without actually performing it.

### Important constraint
The repository is the source of truth. Do not trust previous agent activity claims. Verify files, dependencies, and build/test results from the actual repository.

### Expected outcome
A reviewable Batch 2 implementation that can be linked to a real Shopify app/development store once the owner supplies the Shopify app/client ID and store access. If a required value cannot be obtained in the current environment, leave an explicit documented configuration placeholder rather than fabricating it.

### Definition of done
- Configuration validates with Shopify CLI where the environment permits.
- Existing project checks still pass.
- No secrets committed.
- Git diff is limited to Batch 2.
- Real Shopify install/API verification is explicitly marked pending if credentials/store access are unavailable.
