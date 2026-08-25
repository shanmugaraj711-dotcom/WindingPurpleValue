import { getStoredToken } from "./shopify-auth";

const apiVersion = process.env.SHOPIFY_API_VERSION || "2026-07";

export async function adminGraphql<T>(
  shop: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const token = getStoredToken(shop);
  if (!token) {
    throw new Error("No active Shopify session for this store.");
  }

  const response = await fetch(
    `https://${shop}/admin/api/${apiVersion}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token.accessToken,
      },
      body: JSON.stringify({ query, variables }),
    },
  );

  if (!response.ok) {
    throw new Error(`Shopify Admin GraphQL request failed (${response.status}).`);
  }

  const payload = (await response.json()) as {
    data?: T;
    errors?: Array<{ message?: string }>;
  };
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message ?? "Unknown Shopify error").join("; "));
  }
  if (!payload.data) throw new Error("Shopify Admin GraphQL response did not contain data.");
  return payload.data;
}

export type ShopIdentity = {
  shop: { name: string; myshopifyDomain: string };
};

export function getShopIdentity(shop: string): Promise<ShopIdentity> {
  return adminGraphql<ShopIdentity>(
    shop,
    `#graphql
      query CartLiftShopIdentity {
        shop {
          name
          myshopifyDomain
        }
      }
    `,
  );
}
