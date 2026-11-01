import { FastifyRequest, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import { db, shops } from "../../core/database/index.js";

/**
 * Fastify preHandler hook to enforce shop-level multi-tenant isolation.
 * Guarantees that staff can only access their assigned shop,
 * merchant admins can only access shops within their organization,
 * and platform admins have global oversight.
 */
export async function enforceShopScope(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const user = request.user;
  if (!user) {
    return reply.status(401).send({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required before tenant scoping",
      },
    });
  }

  // 1. Platform Admins have global access
  if (user.role === "PLATFORM_ADMIN") {
    return;
  }

  // 2. Extract requested shopId from query, params, or body
  const query = request.query as Record<string, unknown> | undefined;
  const params = request.params as Record<string, unknown> | undefined;
  const body = request.body as Record<string, unknown> | undefined;

  const requestedShopId = (query?.shopId || params?.shopId || body?.shopId) as
    string | undefined;

  if (!requestedShopId) {
    return reply.status(400).send({
      success: false,
      error: {
        code: "MISSING_SHOP_ID",
        message: "shopId must be provided to enforce tenant boundary",
      },
    });
  }

  // 3. Shop Staff: Must strictly match assigned shopId
  if (user.role === "SHOP_STAFF") {
    if (user.shopId !== requestedShopId) {
      return reply.status(403).send({
        success: false,
        error: {
          code: "CROSS_TENANT_ACCESS_DENIED",
          message:
            "Staff members are strictly restricted to their assigned shop",
        },
      });
    }
    return;
  }

  // 4. Merchant Admin: Must belong to their merchant organization
  if (user.role === "MERCHANT_ADMIN") {
    if (!user.merchantId) {
      return reply.status(403).send({
        success: false,
        error: {
          code: "MERCHANT_NOT_CONFIGURED",
          message: "User is not associated with any merchant organization",
        },
      });
    }

    const [shop] = await db
      .select({ id: shops.id, merchantId: shops.merchantId })
      .from(shops)
      .where(eq(shops.id, requestedShopId))
      .limit(1);

    if (!shop || shop.merchantId !== user.merchantId) {
      return reply.status(403).send({
        success: false,
        error: {
          code: "CROSS_TENANT_ACCESS_DENIED",
          message: "Shop does not belong to your merchant organization",
        },
      });
    }
    return;
  }

  return reply.status(403).send({
    success: false,
    error: {
      code: "UNAUTHORIZED_ROLE",
      message: "Role is not authorized for shop operations",
    },
  });
}
