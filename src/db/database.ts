import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { migrateDatabase } from './migrations';
import { seedDatabase } from './seed';
import { recomputeAssetBalances } from './repositories';

let databasePromise: Promise<SQLiteDatabase> | undefined;

export function getDatabase(): Promise<SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = openDatabaseAsync('pocket-ledger.db').then(async (db) => {
      await db.execAsync('PRAGMA foreign_keys = ON;');
      await migrateDatabase(db);
      await seedDatabase(db);
      // Transactions are the single source of truth: recompute every balance on
      // launch so stored balances can never drift out of sync with the ledger.
      await recomputeAssetBalances(db);
      return db;
    });
  }
  return databasePromise;
}
