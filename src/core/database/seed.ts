import bcrypt from 'bcryptjs';
import { db, queryClient } from './index.js';
import { merchants, shops, users, rateCards } from './schema.js';

async function seed(): Promise<void> {
  console.log('🌱 Seeding QR-PrintHub database with demo multi-tenant records...');

  try {
    // 1. Create Demo Merchant
    const [merchant] = await db
      .insert(merchants)
      .values({
        name: 'Campus Prints Global',
        slug: 'campus-prints',
        email: 'billing@campusprints.com',
        status: 'ACTIVE',
        subscriptionTier: 'ENTERPRISE',
        payoutAccount: { bank: 'HDFC', account_last4: '9876' },
      })
      .onConflictDoUpdate({
        target: merchants.slug,
        set: { name: 'Campus Prints Global' },
      })
      .returning();

    console.log(`✅ Merchant: ${merchant.name} (${merchant.id})`);

    // 2. Create Two Shops
    const [shop1] = await db
      .insert(shops)
      .values({
        merchantId: merchant.id,
        name: 'North Campus Central Library',
        slug: 'north-library',
        qrCodeToken: 'QR_CAMPUS_NORTH_LIB_01',
        address: 'Ground Floor, Central Library, University Campus',
        city: 'Mumbai',
        isOpen: true,
        operatingHours: { open: '08:00', close: '21:00' },
      })
      .onConflictDoUpdate({
        target: shops.qrCodeToken,
        set: { isOpen: true },
      })
      .returning();

    const [shop2] = await db
      .insert(shops)
      .values({
        merchantId: merchant.id,
        name: 'Engineering Building Kiosk',
        slug: 'eng-kiosk',
        qrCodeToken: 'QR_CAMPUS_ENG_KIOSK_02',
        address: 'Block B, Faculty of Engineering & Technology',
        city: 'Mumbai',
        isOpen: true,
        operatingHours: { open: '09:00', close: '18:00' },
      })
      .onConflictDoUpdate({
        target: shops.qrCodeToken,
        set: { isOpen: true },
      })
      .returning();

    console.log(`✅ Shops: ${shop1.name} & ${shop2.name}`);

    // 3. Create Demo Users
    const passwordHash = await bcrypt.hash('Password123!', 10);

    await db
      .insert(users)
      .values([
        {
          name: 'Platform Super Admin',
          email: 'admin@qrprinthub.com',
          passwordHash,
          role: 'PLATFORM_ADMIN',
        },
        {
          merchantId: merchant.id,
          name: 'Rajesh Merchant (Owner)',
          email: 'rajesh@campusprints.com',
          passwordHash,
          role: 'MERCHANT_ADMIN',
        },
        {
          merchantId: merchant.id,
          shopId: shop1.id,
          name: 'Pooja Staff (Library Operator)',
          email: 'pooja@campusprints.com',
          passwordHash,
          role: 'SHOP_STAFF',
        },
      ])
      .onConflictDoNothing();

    console.log('✅ Users created: admin@qrprinthub.com, rajesh@campusprints.com, pooja@campusprints.com (Password: Password123!)');

    // 4. Create Standard Rate Cards for Shop 1
    await db
      .insert(rateCards)
      .values([
        { shopId: shop1.id, paperSize: 'A4', colorMode: 'BW', duplexMode: 'SIMPLEX', pricePerPageCents: 100 },
        { shopId: shop1.id, paperSize: 'A4', colorMode: 'BW', duplexMode: 'DUPLEX', pricePerPageCents: 80 },
        { shopId: shop1.id, paperSize: 'A4', colorMode: 'COLOR', duplexMode: 'SIMPLEX', pricePerPageCents: 500 },
        { shopId: shop1.id, paperSize: 'A4', colorMode: 'COLOR', duplexMode: 'DUPLEX', pricePerPageCents: 450 },
        { shopId: shop1.id, paperSize: 'A3', colorMode: 'BW', duplexMode: 'SIMPLEX', pricePerPageCents: 300 },
        { shopId: shop1.id, paperSize: 'A3', colorMode: 'COLOR', duplexMode: 'SIMPLEX', pricePerPageCents: 1200 },
        // Shop 2 Rate Cards
        { shopId: shop2.id, paperSize: 'A4', colorMode: 'BW', duplexMode: 'SIMPLEX', pricePerPageCents: 150 },
        { shopId: shop2.id, paperSize: 'A4', colorMode: 'COLOR', duplexMode: 'SIMPLEX', pricePerPageCents: 600 },
      ])
      .onConflictDoNothing();

    console.log('✅ Rate cards populated for both shops.');
    console.log('🎉 Database seeding completed successfully.');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await queryClient.end();
  }
}

seed();
