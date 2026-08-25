import { Session, type OnlineAccessInfo } from "@shopify/shopify-api";
import { db } from "@workspace/db";
import { shopifySessionsTable, type ShopifySession } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

export class DrizzleSessionStorage {
  async storeSession(session: Session): Promise<boolean> {
    const data = {
      id: session.id,
      shop: session.shop,
      state: session.state,
      isOnline: session.isOnline,
      scope: session.scope ?? null,
      expires: session.expires ?? null,
      accessToken: session.accessToken!,
      userId: session.onlineAccessInfo?.associated_user?.id?.toString() ?? null,
    };

    await db
      .insert(shopifySessionsTable)
      .values(data)
      .onConflictDoUpdate({
        target: shopifySessionsTable.id,
        set: data,
      });

    return true;
  }

  async loadSession(id: string): Promise<Session | undefined> {
    const [row] = await db
      .select()
      .from(shopifySessionsTable)
      .where(eq(shopifySessionsTable.id, id))
      .limit(1);

    if (!row) return undefined;

    const session = new Session({
      id: row.id,
      shop: row.shop,
      state: row.state,
      isOnline: row.isOnline,
      accessToken: row.accessToken,
      scope: row.scope ?? undefined,
      expires: row.expires ?? undefined,
    });

    if (row.userId) {
      session.onlineAccessInfo = {
        expires_in: 0,
        associated_user_scope: "",
        associated_user: {
          id: parseInt(row.userId),
          first_name: "",
          last_name: "",
          email: "",
          account_owner: false,
          locale: "",
          collaborator: false,
          email_verified: false,
        },
      } as OnlineAccessInfo;
    }

    return session;
  }

  async deleteSession(id: string): Promise<boolean> {
    await db.delete(shopifySessionsTable).where(eq(shopifySessionsTable.id, id));
    return true;
  }

  async deleteSessions(ids: string[]): Promise<boolean> {
    // This is a simple implementation for foundation
    for (const id of ids) {
      await this.deleteSession(id);
    }
    return true;
  }

  async findSessionsByShop(shop: string): Promise<Session[]> {
    const rows = await db
      .select()
      .from(shopifySessionsTable)
      .where(eq(shopifySessionsTable.shop, shop));

    return rows.map((row: ShopifySession) => {
      const session = new Session({
        id: row.id,
        shop: row.shop,
        state: row.state,
        isOnline: row.isOnline,
        accessToken: row.accessToken,
        scope: row.scope ?? undefined,
        expires: row.expires ?? undefined,
      });
      return session;
    });
  }
}
