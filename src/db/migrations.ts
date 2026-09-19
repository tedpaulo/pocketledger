import type { SQLiteDatabase } from 'expo-sqlite';

export const DATABASE_VERSION = 3;

export async function migrateDatabase(db: SQLiteDatabase): Promise<void> {
  const versionRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = versionRow?.user_version ?? 0;

  if (currentVersion < 1) {
    await db.execAsync(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        balance_cents INTEGER NOT NULL DEFAULT 0,
        icon TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS budgets (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        limit_cents INTEGER NOT NULL,
        color TEXT NOT NULL,
        month TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY NOT NULL,
        asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
        budget_id TEXT REFERENCES budgets(id) ON DELETE SET NULL,
        description TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        category TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        icon TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS transactions_occurred_at_idx ON transactions(occurred_at DESC);
      CREATE INDEX IF NOT EXISTS transactions_budget_id_idx ON transactions(budget_id);
      PRAGMA user_version = 1;
    `);
  }

  if (currentVersion < 2) {
    await db.execAsync(`
      UPDATE transactions
      SET budget_id = (
        SELECT b.id
        FROM budgets b
        WHERE b.category = 'Savings'
          AND b.month = substr(transactions.occurred_at, 1, 7)
        ORDER BY b.rowid
        LIMIT 1
      )
      WHERE category = 'Future you'
        AND amount_cents < 0
        AND budget_id IS NULL;
      PRAGMA user_version = 2;
    `);
  }

  if (currentVersion < 3) {
    // Track the opening balance separately so the current balance can always be
    // recomputed from transactions (transactions stay the source of truth).
    // Backfill: opening = current stored balance MINUS the net effect of every
    // tracked transaction. This avoids double-counting existing data.
    await db.execAsync(`
      ALTER TABLE assets ADD COLUMN initial_balance_cents INTEGER NOT NULL DEFAULT 0;
      UPDATE assets
      SET initial_balance_cents =
        balance_cents - COALESCE((
          SELECT SUM(t.amount_cents) FROM transactions t WHERE t.asset_id = assets.id
        ), 0);
      PRAGMA user_version = 3;
    `);
  }
}
