import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db, users } from '../../core/database/index.js';

export class AuthService {
  /**
   * Authenticates a user and returns their identity & tenant scope
   */
  static async login(email: string, passwordPlain: string) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .limit(1);

    if (!user) {
      throw new Error('Invalid email or password');
    }

    const isValid = await bcrypt.compare(passwordPlain, user.passwordHash);
    if (!isValid) {
      throw new Error('Invalid email or password');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      merchantId: user.merchantId,
      shopId: user.shopId,
    };
  }

  /**
   * Fetches user profile by ID
   */
  static async getUserById(userId: string) {
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        merchantId: users.merchantId,
        shopId: users.shopId,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return user || null;
  }
}
