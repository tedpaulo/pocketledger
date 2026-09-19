import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { getDatabase } from '../db/database';
import { backupToJson } from '../db/exports';
import { recomputeAssetBalances, type ExportData, getExportData } from '../db/repositories';

export type RestoreResult = { assets: number; budgets: number; transactions: number };

export const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export class BackupValidationError extends Error {}

type RawEntities = {
  assets: Record<string, unknown>[];
  budgets: Record<string, unknown>[];
  transactions: Record<string, unknown>[];
};

function validateStructure(raw: unknown): RawEntities {
  if (!isRecord(raw)) throw new BackupValidationError('This is not a Pocket Ledger backup file.');
  if (raw.version !== 1) throw new BackupValidationError(`Unsupported backup version (${String(raw.version)}). Export a fresh backup from the current app first.`);
  const { assets, budgets, transactions } = raw;
  if (!Array.isArray(assets) || !Array.isArray(budgets) || !Array.isArray(transactions)) {
    throw new BackupValidationError('This backup is missing one of: assets, budgets, transactions.');
  }
  return {
    assets: assets as Record<string, unknown>[],
    budgets: budgets as Record<string, unknown>[],
    transactions: transactions as Record<string, unknown>[],
  };
}

/**
 * Validates a parsed backup and normalizes it into the app's data model.
 * Older backups (made before initial balances existed) have their opening
 * balance derived from the stored current balance minus all transactions,
 * so the restored account balances match exactly what was backed up.
 */
export function validateAndNormalizeBackup(raw: unknown): ExportData {
  const { assets, budgets, transactions } = validateStructure(raw);
  const assetIds = new Set<string>();
  for (const [index, asset] of assets.entries()) {
    if (!isRecord(asset) || typeof asset.id !== 'string' || typeof asset.name !== 'string') {
      throw new BackupValidationError(`Account #${index + 1} in the backup is invalid.`);
    }
    assetIds.add(asset.id);
  }
  const budgetIds = new Set<string>();
  for (const [index, budget] of budgets.entries()) {
    if (!isRecord(budget) || typeof budget.id !== 'string' || typeof budget.name !== 'string' || typeof budget.category !== 'string' || typeof budget.month !== 'string') {
      throw new BackupValidationError(`Budget #${index + 1} in the backup is invalid. Make a fresh backup from the app.`);
    }
    if (!isFiniteNumber(budget.limitCents)) throw new BackupValidationError(`Budget "${budget.name}" has no valid monthly limit.`);
    budgetIds.add(budget.id);
  }
  for (const [index, transaction] of transactions.entries()) {
    if (!isRecord(transaction) || typeof transaction.id !== 'string' || typeof transaction.description !== 'string' || typeof transaction.assetId !== 'string' || typeof transaction.occurredAt !== 'string') {
      throw new BackupValidationError(`Transaction #${index + 1} in the backup is invalid. Make a fresh backup from the app.`);
    }
    if (!isFiniteNumber(transaction.amountCents)) throw new BackupValidationError(`Transaction "${transaction.description}" has no valid amount.`);
    if (!assetIds.has(transaction.assetId)) throw new BackupValidationError(`Transaction "${transaction.description}" refers to an account that is missing from the backup.`);
    if (transaction.budgetId !== null && transaction.budgetId !== undefined) {
      if (typeof transaction.budgetId !== 'string' || !budgetIds.has(transaction.budgetId)) {
        throw new BackupValidationError(`Transaction "${transaction.description}" refers to a budget that is missing from the backup.`);
      }
    }
  }

  const amountsByAsset = new Map<string, number>();
  for (const transaction of transactions) {
    amountsByAsset.set(transaction.assetId as string, (amountsByAsset.get(transaction.assetId as string) ?? 0) + (transaction.amountCents as number));
  }
  const now = new Date().toISOString();
  return {
    assets: assets.map((asset) => {
      const current = isFiniteNumber(asset.balanceCents) ? (asset.balanceCents as number) : 0;
      return {
        id: asset.id as string,
        name: asset.name as string,
        type: typeof asset.type === 'string' ? asset.type : 'Account',
        icon: typeof asset.icon === 'string' ? asset.icon : 'wallet-outline',
        createdAt: typeof asset.createdAt === 'string' ? asset.createdAt : now,
        balanceCents: current,
        initialBalanceCents: isFiniteNumber(asset.initialBalanceCents)
          ? (asset.initialBalanceCents as number)
          : current - (amountsByAsset.get(asset.id as string) ?? 0),
      };
    }),
    budgets: budgets.map((budget) => ({
      id: budget.id as string,
      name: budget.name as string,
      category: budget.category as string,
      color: typeof budget.color === 'string' ? (budget.color as string) : '#0B8275',
      month: budget.month as string,
      limitCents: budget.limitCents as number,
      spentCents: 0,
    })),
    transactions: transactions.map((transaction) => ({
      id: transaction.id as string,
      assetId: transaction.assetId as string,
      budgetId: typeof transaction.budgetId === 'string' ? (transaction.budgetId as string) : null,
      description: transaction.description as string,
      amountCents: transaction.amountCents as number,
      category: typeof transaction.category === 'string' ? (transaction.category as string) : 'Expense',
      occurredAt: transaction.occurredAt as string,
      icon: typeof transaction.icon === 'string' ? (transaction.icon as string) : 'cart-outline',
    })),
  };
}
/**
 * Opens the device's file picker for a Pocket Ledger JSON backup.
 * Returns null when the user cancels. Throws on unreadable/invalid files.
 */
export async function pickBackupFile(): Promise<ExportData | null> {
  if (Platform.OS === 'web') return pickBackupFileWeb();
  let expoFileSystem: typeof import('expo-file-system');
  try {
    // Loaded lazily so the rest of the app always boots, even if this device
    // can't open file pickers. Only the restore button is affected.
    expoFileSystem = await import('expo-file-system');
  } catch {
    throw new BackupValidationError('This device can’t open the file picker. Export a backup on a phone and import from there.');
  }
  const picked = await expoFileSystem.File.pickFileAsync({ mimeTypes: ['application/json'] });
  if (picked.canceled || !picked.result) return null;
  let raw: unknown;
  try {
    raw = await picked.result.json();
  } catch {
    throw new BackupValidationError('Couldn\'t read that file. Choose a Pocket Ledger JSON backup.');
  }
  return validateAndNormalizeBackup(raw);
}

/** Web: read the chosen backup through a plain <input type="file"> (Safari-friendly). */
function pickBackupFileWeb(): Promise<ExportData | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    const cleanup = () => input.remove();
    input.addEventListener('cancel', () => { cleanup(); resolve(null); });
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) { cleanup(); resolve(null); return; }
      file.text()
        .then((text) => {
          try {
            resolve(validateAndNormalizeBackup(JSON.parse(text)));
          } catch (error) {
            reject(error instanceof BackupValidationError ? error : new BackupValidationError('Couldn\'t read that file. Choose a Pocket Ledger JSON backup.'));
          }
        })
        .catch(() => reject(new BackupValidationError('Couldn\'t read that file. Choose a Pocket Ledger JSON backup.')))
        .finally(cleanup);
    });
    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Replaces ALL current data with a backup. A safety copy of the current data is
 * written to the app cache first, then everything is wiped and re-inserted in one
 * atomic transaction so a failure can never leave a half-restored database.
 */
export async function replaceAllData(data: ExportData): Promise<RestoreResult> {
  const db = await getDatabase();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  try {
    // Safety net: keep what's here NOW before it is replaced.
    const current = await getExportData(db);
    const content = backupToJson(current);
    if (Platform.OS === 'web') {
      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `pocket-ledger-pre-restore-${stamp}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } else {
      const directory = FileSystem.cacheDirectory;
      if (directory) {
        await FileSystem.writeAsStringAsync(
          `${directory}pocket-ledger-pre-restore-${stamp}.json`,
          content,
          { encoding: FileSystem.EncodingType.UTF8 },
        );
      }
    }
  } catch {
    // The safety backup is best-effort; never block a restore because of it.
  }

  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM transactions');
    await db.runAsync('DELETE FROM budgets');
    await db.runAsync('DELETE FROM assets');
    for (const asset of data.assets) {
      await db.runAsync(
        'INSERT INTO assets (id, name, type, balance_cents, initial_balance_cents, icon, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        asset.id, asset.name, asset.type, asset.balanceCents, asset.initialBalanceCents, asset.icon, asset.createdAt,
      );
    }
    for (const budget of data.budgets) {
      await db.runAsync(
        'INSERT INTO budgets (id, name, category, limit_cents, color, month) VALUES (?, ?, ?, ?, ?, ?)',
        budget.id, budget.name, budget.category, budget.limitCents, budget.color, budget.month,
      );
    }
    for (const transaction of data.transactions) {
      await db.runAsync(
        'INSERT INTO transactions (id, asset_id, budget_id, description, amount_cents, category, occurred_at, icon) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        transaction.id, transaction.assetId, transaction.budgetId ?? null, transaction.description,
        transaction.amountCents, transaction.category, transaction.occurredAt, transaction.icon,
      );
    }
    // Prevent the built-in sample data from re-seeding after a restore.
    await db.runAsync('INSERT OR IGNORE INTO app_meta (key, value) VALUES (?, ?)', 'seeded_at', new Date().toISOString());
  });

  // Balances always come from transactions: opening balance + all transactions.
  await recomputeAssetBalances(db);
  return { assets: data.assets.length, budgets: data.budgets.length, transactions: data.transactions.length };
}