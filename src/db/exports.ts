import type { ExportData } from './repositories';
import type { Transaction } from '../models/finance';

const csvValue = (value: string | number | null) => {
  const text = value === null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const csvType = (transaction: Transaction, hasDestination: boolean): 'Income' | 'Expense' | 'Transfer' | 'Savings contribution' => {
  if (hasDestination) return transaction.category === 'Future you' ? 'Savings contribution' : 'Transfer';
  return transaction.amountCents > 0 ? 'Income' : 'Expense';
};

export function transactionsToCsv(data: ExportData, options?: { month?: string }): string {
  const assets = new Map(data.assets.map((asset) => [asset.id, asset.name]));
  const budgets = new Map(data.budgets.map((budget) => [budget.id, budget.name]));
  // Transfers are stored as two rows (source + "-destination"). Index the
  // destination leg by source id so each transfer is exported exactly once.
  const destinationBySource = new Map<string, Transaction>();
  for (const transaction of data.transactions) {
    if (transaction.id.endsWith('-destination')) {
      destinationBySource.set(transaction.id.slice(0, -'-destination'.length), transaction);
    }
  }
  const header = ['id', 'date', 'month', 'type', 'description', 'amount', 'amount_cents', 'category', 'account', 'budget', 'related_account', 'icon'];
  const rows = data.transactions
    .filter((transaction) => !transaction.id.endsWith('-destination'))
    .filter((transaction) => !options?.month || transaction.occurredAt.slice(0, 7) === options.month)
    .map((transaction) => {
      const destination = destinationBySource.get(transaction.id);
      return [
        transaction.id,
        transaction.occurredAt,
        transaction.occurredAt.slice(0, 7),
        csvType(transaction, destination !== undefined),
        transaction.description,
        (transaction.amountCents / 100).toFixed(2),
        transaction.amountCents,
        transaction.category,
        assets.get(transaction.assetId) ?? transaction.assetId,
        transaction.budgetId ? budgets.get(transaction.budgetId) ?? transaction.budgetId : null,
        destination ? assets.get(destination.assetId) ?? destination.assetId : null,
        transaction.icon,
      ];
    });
  return [header, ...rows].map((row) => row.map(csvValue).join(',')).join('\r\n') + '\r\n';
}

export function backupToJson(data: ExportData): string {
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), ...data }, null, 2);
}
