import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as dotenv from 'dotenv';
dotenv.config();
async function runMigrations() {
    const connectionString = process.env.DATABASE_URL || 'postgresql://qrprint_user:qrprint_secure_pass@localhost:5432/qrprint_db';
    console.log('🔄 Running database migrations on:', connectionString.replace(/:[^:@]+@/, ':****@'));
    // Migration client uses max: 1 connection
    const migrationClient = postgres(connectionString, { max: 1 });
    const db = drizzle(migrationClient);
    try {
        await migrate(db, { migrationsFolder: './drizzle' });
        console.log('✅ Migrations completed successfully.');
    }
    catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
    finally {
        await migrationClient.end();
    }
}
runMigrations();
