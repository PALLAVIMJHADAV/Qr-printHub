import bcrypt from "bcryptjs";
import { eq, and } from "drizzle-orm";
import { db, shops, users, rateCards } from "../../core/database/index.js";

export interface CreateShopParams {
  name: string;
  city: string;
  address?: string;
}

export interface CreateStaffParams {
  shopId: string;
  name: string;
  email: string;
  password: string;
}

export class MerchantService {
  /**
   * Fetches all shops belonging to the authenticated merchant
   */
  static async listShops(merchantId: string) {
    return await db
      .select({
        id: shops.id,
        merchantId: shops.merchantId,
        name: shops.name,
        slug: shops.slug,
        qrCodeToken: shops.qrCodeToken,
        address: shops.address,
        city: shops.city,
        isOpen: shops.isOpen,
        operatingHours: shops.operatingHours,
        createdAt: shops.createdAt,
      })
      .from(shops)
      .where(eq(shops.merchantId, merchantId));
  }

  /**
   * Creates a new physical shop location for the merchant and initializes default rate cards
   */
  static async createShop(merchantId: string, params: CreateShopParams) {
    const slug = params.name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-");
    const qrToken = `QR_${slug.toUpperCase().slice(0, 8)}_${Date.now().toString().slice(-4)}`;

    const [newShop] = await db
      .insert(shops)
      .values({
        merchantId,
        name: params.name,
        slug,
        qrCodeToken: qrToken,
        address: params.address || null,
        city: params.city,
        isOpen: true,
      })
      .returning();

    // Initialize standard A4 rate cards for this new shop
    await db.insert(rateCards).values([
      {
        shopId: newShop.id,
        paperSize: "A4",
        colorMode: "BW",
        duplexMode: "SIMPLEX",
        pricePerPageCents: 100, // ₹1.00
      },
      {
        shopId: newShop.id,
        paperSize: "A4",
        colorMode: "COLOR",
        duplexMode: "SIMPLEX",
        pricePerPageCents: 500, // ₹5.00
      },
    ]);

    return newShop;
  }

  /**
   * Lists all staff members across the merchant's shops
   */
  static async listStaff(merchantId: string) {
    const staffMembers = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        shopId: users.shopId,
        shopName: shops.name,
        createdAt: users.createdAt,
      })
      .from(users)
      .leftJoin(shops, eq(users.shopId, shops.id))
      .where(
        and(eq(users.merchantId, merchantId), eq(users.role, "SHOP_STAFF")),
      );

    return staffMembers;
  }

  /**
   * Provisions a new SHOP_STAFF user and binds them to a specific shop within the merchant's organization
   */
  static async createStaff(merchantId: string, params: CreateStaffParams) {
    // 1. Strict Tenant Verification: Confirm target shop belongs to this merchant
    const [shop] = await db
      .select({ id: shops.id, merchantId: shops.merchantId })
      .from(shops)
      .where(eq(shops.id, params.shopId))
      .limit(1);

    if (!shop || shop.merchantId !== merchantId) {
      const error: any = new Error(
        "Shop does not belong to your merchant organization",
      );
      error.code = "CROSS_TENANT_ACCESS_DENIED";
      error.statusCode = 403;
      throw error;
    }

    // 2. Check for email collision
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, params.email))
      .limit(1);

    if (existing) {
      const error: any = new Error(
        "A user with this email address already exists",
      );
      error.code = "EMAIL_ALREADY_EXISTS";
      error.statusCode = 409;
      throw error;
    }

    // 3. Hash password and insert user with SHOP_STAFF role
    const passwordHash = await bcrypt.hash(params.password, 10);
    const [createdUser] = await db
      .insert(users)
      .values({
        merchantId,
        shopId: params.shopId,
        name: params.name,
        email: params.email,
        passwordHash,
        role: "SHOP_STAFF",
      })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        shopId: users.shopId,
        merchantId: users.merchantId,
        createdAt: users.createdAt,
      });

    return createdUser;
  }

  /**
   * Removes a staff member from the merchant's organization
   */
  static async deleteStaff(merchantId: string, staffId: string) {
    const [staff] = await db
      .select({ id: users.id, merchantId: users.merchantId, role: users.role })
      .from(users)
      .where(and(eq(users.id, staffId), eq(users.merchantId, merchantId)))
      .limit(1);

    if (!staff) {
      const error: any = new Error(
        "Staff member not found in your organization",
      );
      error.code = "STAFF_NOT_FOUND";
      error.statusCode = 404;
      throw error;
    }

    await db.delete(users).where(eq(users.id, staffId));
    return { success: true, deletedStaffId: staffId };
  }
}
