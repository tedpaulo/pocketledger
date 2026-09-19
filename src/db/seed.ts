import type { SQLiteDatabase } from 'expo-sqlite';

const seededAtKey = 'seeded_at';

export async function seedDatabase(db: SQLiteDatabase): Promise<void> {
  const marker = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_meta WHERE key = ?',
    seededAtKey,
  );
  if (marker) return;

  const now = new Date().toISOString();
  const month = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const sampleDate = (daysAgo: number) => {
    const date = new Date();
    date.setDate(Math.max(1, date.getDate() - daysAgo));
    date.setHours(12, 0, 0, 0);
    return date.toISOString();
  };
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'INSERT OR IGNORE INTO assets (id, name, type, balance_cents, initial_balance_cents, icon, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      'asset-bdo', 'BDO', 'Savings account', 2_000_000, 2_000_000, 'business-outline', now,
    );
    await db.runAsync(
      'INSERT OR IGNORE INTO assets (id, name, type, balance_cents, initial_balance_cents, icon, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      'asset-maya', 'Maya', 'E-wallet', 500_000, 500_000, 'phone-portrait-outline', now,
    );
    await db.runAsync(
      'INSERT OR IGNORE INTO assets (id, name, type, balance_cents, initial_balance_cents, icon, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      'asset-maribank', 'MariBank', 'Digital bank', 1_500_000, 1_500_000, 'wallet-outline', now,
    );
    await db.runAsync(
      'INSERT OR IGNORE INTO budgets (id, name, category, limit_cents, color, month) VALUES (?, ?, ?, ?, ?, ?)',
      'budget-essentials', 'Essentials', 'Needs', 1_500_000, '#0B8275', month,
    );
    await db.runAsync(
      'INSERT OR IGNORE INTO budgets (id, name, category, limit_cents, color, month) VALUES (?, ?, ?, ?, ?, ?)',
      'budget-lifestyle', 'Lifestyle', 'Wants', 500_000, '#E77B62', month,
    );
    await db.runAsync(
      'INSERT OR IGNORE INTO budgets (id, name, category, limit_cents, color, month) VALUES (?, ?, ?, ?, ?, ?)',
      'budget-future', 'Future you', 'Savings', 1_000_000, '#D99A3D', month,
    );
    await db.runAsync(
      'INSERT OR IGNORE INTO transactions (id, asset_id, budget_id, description, amount_cents, category, occurred_at, icon) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      'transaction-groceries', 'asset-bdo', 'budget-essentials', 'Groceries', -124_000, 'Essentials', sampleDate(1), 'cart-outline',
    );
    await db.runAsync(
      'INSERT OR IGNORE INTO transactions (id, asset_id, budget_id, description, amount_cents, category, occurred_at, icon) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      'transaction-salary', 'asset-bdo', null, 'Salary', 3_000_000, 'Income', sampleDate(4), 'arrow-down-outline',
    );
    await db.runAsync(
      'INSERT OR IGNORE INTO transactions (id, asset_id, budget_id, description, amount_cents, category, occurred_at, icon) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      'transaction-maya-transfer', 'asset-maya', null, 'Move to Maya', -200_000, 'Transfer', sampleDate(5), 'phone-portrait-outline',
    );
    await db.runAsync(
      'INSERT OR IGNORE INTO transactions (id, asset_id, budget_id, description, amount_cents, category, occurred_at, icon) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      'transaction-utilities', 'asset-bdo', 'budget-essentials', 'Utilities', -718_000, 'Essentials', sampleDate(8), 'flash-outline',
    );
    await db.runAsync(
      'INSERT OR IGNORE INTO transactions (id, asset_id, budget_id, description, amount_cents, category, occurred_at, icon) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      'transaction-dining', 'asset-bdo', 'budget-lifestyle', 'Dining out', -128_000, 'Lifestyle', sampleDate(10), 'restaurant-outline',
    );
    await db.runAsync(
      'INSERT OR IGNORE INTO transactions (id, asset_id, budget_id, description, amount_cents, category, occurred_at, icon) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      'transaction-savings', 'asset-bdo', 'budget-future', 'Automatic savings', -500_000, 'Savings', sampleDate(13), 'arrow-up-outline',
    );
    // Backfill the opening balance so current balances equal the seeded sample
    // values even after launch-time recomputation: opening = balance - sum(transactions).
    await db.runAsync(`
      UPDATE assets
      SET initial_balance_cents = balance_cents - COALESCE((
        SELECT SUM(t.amount_cents) FROM transactions t WHERE t.asset_id = assets.id
      ), 0);
    `);
    await db.runAsync('INSERT INTO app_meta (key, value) VALUES (?, ?)', seededAtKey, now);
  });
}
