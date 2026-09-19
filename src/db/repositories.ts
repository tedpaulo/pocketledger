import type { SQLiteDatabase } from 'expo-sqlite';
import type { Asset, Budget, Transaction } from '../models/finance';

type AssetRow = Omit<Asset, 'initialBalanceCents' | 'balanceCents' | 'createdAt'> & {
  initial_balance_cents: number; balance_cents: number; created_at: string;
};
type BudgetRow = Omit<Budget, 'limitCents' | 'spentCents'> & { limit_cents: number; spent_cents: number };
type TransactionRow = Omit<Transaction, 'assetId' | 'budgetId' | 'amountCents' | 'occurredAt'> & {
  asset_id: string; budget_id: string | null; amount_cents: number; occurred_at: string;
};

export async function listAssets(db: SQLiteDatabase): Promise<Asset[]> {
  const rows = await db.getAllAsync<AssetRow>('SELECT id, name, type, balance_cents, initial_balance_cents, icon, created_at FROM assets ORDER BY created_at');
  return rows.map((row) => ({
    ...row,
    initialBalanceCents: row.initial_balance_cents,
    balanceCents: row.balance_cents,
    createdAt: row.created_at,
  }));
}

export async function recomputeAssetBalances(db: SQLiteDatabase): Promise<void> {
  // Transactions are the source of truth: balance = opening balance + all transactions.
  // Running this on launch keeps every balance mathematically correct (self-healing).
  await db.runAsync(
    `UPDATE assets
     SET balance_cents = initial_balance_cents + COALESCE((
       SELECT SUM(t.amount_cents) FROM transactions t WHERE t.asset_id = assets.id
     ), 0)`,
  );
}

export type AssetInput = { name: string; type: string; icon: string; balanceCents?: number };
export type BudgetInput = { name: string; category: string; limitCents: number; color: string; month: string };

export async function insertAsset(db: SQLiteDatabase, input: AssetInput): Promise<void> {
  const balanceCents = input.balanceCents ?? 0;
  await db.runAsync(
    'INSERT INTO assets (id, name, type, balance_cents, initial_balance_cents, icon, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    `asset-${new Date().getTime()}-${Math.random().toString(36).slice(2, 8)}`, input.name.trim(), input.type.trim(),
    balanceCents, balanceCents, input.icon, new Date().toISOString(),
  );
}

export async function updateAsset(db: SQLiteDatabase, id: string, input: AssetInput): Promise<void> {
  // balanceCents is the OPENING balance; the current balance is recomputed from it
  // plus the account's transactions, so opening-balance edits stay mathematically safe.
  await db.runAsync(
    'UPDATE assets SET name = ?, type = ?, icon = ?, initial_balance_cents = ? WHERE id = ?',
    input.name.trim(), input.type.trim(), input.icon, input.balanceCents ?? 0, id,
  );
  await recomputeAssetBalances(db);
}

export async function deleteAsset(db: SQLiteDatabase, id: string): Promise<void> {
  const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM transactions WHERE asset_id = ?', id);
  if ((row?.count ?? 0) > 0) throw new Error('This account has transactions. Delete or move those transactions before deleting it.');
  await db.runAsync('DELETE FROM assets WHERE id = ?', id);
}

export async function insertBudget(db: SQLiteDatabase, input: BudgetInput): Promise<void> {
  await db.runAsync(
    'INSERT INTO budgets (id, name, category, limit_cents, color, month) VALUES (?, ?, ?, ?, ?, ?)',
    `budget-${new Date().getTime()}-${Math.random().toString(36).slice(2, 8)}`, input.name.trim(), input.category.trim(), input.limitCents, input.color, input.month,
  );
}

export async function updateBudget(db: SQLiteDatabase, id: string, input: BudgetInput): Promise<void> {
  await db.runAsync('UPDATE budgets SET name = ?, category = ?, limit_cents = ?, color = ?, month = ? WHERE id = ?', input.name.trim(), input.category.trim(), input.limitCents, input.color, input.month, id);
}

export async function deleteBudget(db: SQLiteDatabase, id: string): Promise<void> {
  const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM transactions WHERE budget_id = ?', id);
  if ((row?.count ?? 0) > 0) throw new Error('This budget has transactions. Remove the budget from those transactions before deleting it.');
  await db.runAsync('DELETE FROM budgets WHERE id = ?', id);
}

/**
 * When a month has no budgets yet, copies the budgets of the most recent
 * earlier month into it so recurring budgets don't have to be re-created
 * every month. The copies are brand-new independent rows: editing or
 * deleting them in the new month never affects the past month.
 */
export async function copyBudgetsIntoMonth(db: SQLiteDatabase, month: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO budgets (id, name, category, limit_cents, color, month)
     SELECT 'budget-' || lower(hex(randomblob(8))), name, category, limit_cents, color, ?
     FROM budgets
     WHERE month = (SELECT MAX(month) FROM budgets WHERE month < ?)
       AND NOT EXISTS (SELECT 1 FROM budgets WHERE month = ?)`,
    month, month, month,
  );
}

export async function listBudgets(db: SQLiteDatabase, month: string): Promise<Budget[]> {
  await copyBudgetsIntoMonth(db, month);
  const rows = await db.getAllAsync<BudgetRow>(
    `SELECT b.id, b.name, b.category, b.limit_cents, b.color, b.month,
      COALESCE(SUM(CASE WHEN t.amount_cents < 0 THEN -t.amount_cents ELSE 0 END), 0) AS spent_cents
     FROM budgets b LEFT JOIN transactions t ON t.budget_id = b.id
       AND substr(t.occurred_at, 1, 7) = b.month
     WHERE b.month = ? GROUP BY b.id ORDER BY b.rowid`, month,
  );
  return rows.map((row) => ({ ...row, limitCents: row.limit_cents, spentCents: row.spent_cents }));
}

export async function listTransactions(db: SQLiteDatabase, month?: string): Promise<Transaction[]> {
  const rows = await db.getAllAsync<TransactionRow>(
    `SELECT id, asset_id, budget_id, description, amount_cents, category, occurred_at, icon
     FROM transactions ${month ? 'WHERE substr(occurred_at, 1, 7) = ?' : ''}
     ORDER BY occurred_at DESC, rowid DESC ${month ? '' : 'LIMIT 20'}`,
    ...(month ? [month] : []),
  );
  return rows.map((row) => ({
    ...row, assetId: row.asset_id, budgetId: row.budget_id, amountCents: row.amount_cents, occurredAt: row.occurred_at,
  }));
}

export type ExportData = {
  assets: Asset[];
  budgets: Budget[];
  transactions: Transaction[];
};

/** Returns the complete database contents for backup/export, not just the current month. */
export async function getExportData(db: SQLiteDatabase): Promise<ExportData> {
  const [assets, budgets, transactions] = await Promise.all([
    listAssets(db),
    db.getAllAsync<BudgetRow>(
      `SELECT b.id, b.name, b.category, b.limit_cents, b.color, b.month,
        COALESCE(SUM(CASE WHEN t.amount_cents < 0 THEN -t.amount_cents ELSE 0 END), 0) AS spent_cents
       FROM budgets b LEFT JOIN transactions t ON t.budget_id = b.id
         AND substr(t.occurred_at, 1, 7) = b.month
       GROUP BY b.id ORDER BY b.month, b.rowid`,
    ).then((rows) => rows.map((row) => ({ ...row, limitCents: row.limit_cents, spentCents: row.spent_cents }))),
    db.getAllAsync<TransactionRow>(
      `SELECT id, asset_id, budget_id, description, amount_cents, category, occurred_at, icon
       FROM transactions ORDER BY occurred_at DESC, rowid DESC`,
    ).then((rows) => rows.map((row) => ({
      id: row.id,
      assetId: row.asset_id,
      budgetId: row.budget_id,
      description: row.description,
      amountCents: row.amount_cents,
      category: row.category,
      occurredAt: row.occurred_at,
      icon: row.icon,
    }))),
  ]);
  return { assets, budgets, transactions };
}

export async function deleteTransaction(db: SQLiteDatabase, transactionId: string): Promise<void> {
  const ids = transactionId.endsWith('-destination')
    ? [transactionId.slice(0, -'-destination'.length), transactionId]
    : [transactionId, `${transactionId}-destination`];

  await db.withTransactionAsync(async () => {
    const rows = await db.getAllAsync<{ id: string; asset_id: string; amount_cents: number }>(
      `SELECT id, asset_id, amount_cents FROM transactions WHERE id IN (?, ?)`, ids[0], ids[1],
    );
    for (const row of rows) {
      await db.runAsync('UPDATE assets SET balance_cents = balance_cents - ? WHERE id = ?', row.amount_cents, row.asset_id);
    }
    await db.runAsync('DELETE FROM transactions WHERE id IN (?, ?)', ids[0], ids[1]);
  });
}

export type NewTransaction = {
  assetId: string;
  destinationAssetId?: string;
  budgetId?: string | null;
  description: string;
  amountCents: number;
  category: string;
  occurredAt: string;
  icon: string;
  isTransfer?: boolean;
};

export async function insertTransaction(db: SQLiteDatabase, input: NewTransaction): Promise<void> {
  const id = `transaction-${new Date().getTime()}-${Math.random().toString(36).slice(2, 8)}`;
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'INSERT INTO transactions (id, asset_id, budget_id, description, amount_cents, category, occurred_at, icon) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      id, input.assetId, input.budgetId ?? null, input.description,
      input.isTransfer ? -Math.abs(input.amountCents) : input.amountCents, input.category, input.occurredAt, input.icon,
    );
    await db.runAsync('UPDATE assets SET balance_cents = balance_cents + ? WHERE id = ?', input.isTransfer ? -Math.abs(input.amountCents) : input.amountCents, input.assetId);
    if (input.isTransfer && input.destinationAssetId) {
      const destinationId = `${id}-destination`;
      await db.runAsync(
        'INSERT INTO transactions (id, asset_id, budget_id, description, amount_cents, category, occurred_at, icon) VALUES (?, ?, NULL, ?, ?, ?, ?, ?)',
        destinationId, input.destinationAssetId, input.description, Math.abs(input.amountCents), input.category, input.occurredAt, input.icon,
      );
      await db.runAsync('UPDATE assets SET balance_cents = balance_cents + ? WHERE id = ?', Math.abs(input.amountCents), input.destinationAssetId);
    }
  });
}

export async function updateTransaction(db: SQLiteDatabase, transactionId: string, input: NewTransaction): Promise<void> {
  const id = transactionId.endsWith('-destination')
    ? transactionId.slice(0, -'-destination'.length)
    : transactionId;
  const destinationId = `${id}-destination`;
  const amountCents = input.isTransfer ? -Math.abs(input.amountCents) : input.amountCents;

  await db.withTransactionAsync(async () => {
    const oldRows = await db.getAllAsync<{ id: string; asset_id: string; amount_cents: number }>(
      'SELECT id, asset_id, amount_cents FROM transactions WHERE id IN (?, ?)', id, destinationId,
    );
    if (!oldRows.some((row) => row.id === id)) throw new Error('Transaction no longer exists.');
    for (const row of oldRows) {
      await db.runAsync('UPDATE assets SET balance_cents = balance_cents - ? WHERE id = ?', row.amount_cents, row.asset_id);
    }

    await db.runAsync(
      'UPDATE transactions SET asset_id = ?, budget_id = ?, description = ?, amount_cents = ?, category = ?, occurred_at = ?, icon = ? WHERE id = ?',
      input.assetId, input.budgetId ?? null, input.description, amountCents, input.category, input.occurredAt, input.icon, id,
    );
    await db.runAsync('UPDATE assets SET balance_cents = balance_cents + ? WHERE id = ?', amountCents, input.assetId);

    if (input.isTransfer && input.destinationAssetId) {
      await db.runAsync(
        'INSERT INTO transactions (id, asset_id, budget_id, description, amount_cents, category, occurred_at, icon) VALUES (?, ?, NULL, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET asset_id = excluded.asset_id, description = excluded.description, amount_cents = excluded.amount_cents, category = excluded.category, occurred_at = excluded.occurred_at, icon = excluded.icon',
        destinationId, input.destinationAssetId, input.description, Math.abs(input.amountCents), input.category, input.occurredAt, input.icon,
      );
      await db.runAsync('UPDATE assets SET balance_cents = balance_cents + ? WHERE id = ?', Math.abs(input.amountCents), input.destinationAssetId);
    } else {
      await db.runAsync('DELETE FROM transactions WHERE id = ?', destinationId);
    }
  });
}
