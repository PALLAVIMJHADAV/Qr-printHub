export type UserRole = "PLATFORM_ADMIN" | "MERCHANT_ADMIN" | "SHOP_STAFF";

export interface UserJwtPayload {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  merchantId?: string | null;
  shopId?: string | null;
}

export enum Permission {
  // Platform Super-Admin
  PLATFORM_MANAGE = "platform:manage",
  PLATFORM_ANALYTICS_READ = "platform:analytics:read",
  MERCHANTS_MANAGE = "merchants:manage",
  DOCUMENTS_PURGE = "documents:purge",

  // Merchant Admin
  SHOPS_MANAGE = "shops:manage",
  RATE_CARDS_MANAGE = "rate_cards:manage",
  STAFF_MANAGE = "staff:manage",
  MERCHANT_ANALYTICS_READ = "merchant:analytics:read",

  // Shop Staff
  PRINT_QUEUE_READ = "print_queue:read",
  PRINT_JOBS_DISPATCH = "print_jobs:dispatch",
  PRINT_JOBS_COMPLETE = "print_jobs:complete",
}

export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  PLATFORM_ADMIN: Object.values(Permission),
  MERCHANT_ADMIN: [
    Permission.SHOPS_MANAGE,
    Permission.RATE_CARDS_MANAGE,
    Permission.STAFF_MANAGE,
    Permission.MERCHANT_ANALYTICS_READ,
    Permission.PRINT_QUEUE_READ,
    Permission.PRINT_JOBS_DISPATCH,
    Permission.PRINT_JOBS_COMPLETE,
  ],
  SHOP_STAFF: [
    Permission.PRINT_QUEUE_READ,
    Permission.PRINT_JOBS_DISPATCH,
    Permission.PRINT_JOBS_COMPLETE,
  ],
};

declare module "@fastify/jwt" {
  interface FastifyJWT {
    user: UserJwtPayload;
  }
}
