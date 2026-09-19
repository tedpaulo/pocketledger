import { useEffect, useState } from 'react';
import { getDatabase } from '../db/database';
import { deleteAsset, deleteBudget, deleteTransaction, insertAsset, insertBudget, insertTransaction, listAssets, listBudgets, listTransactions, updateAsset, updateBudget, updateTransaction, type AssetInput, type BudgetInput, type NewTransaction } from '../db/repositories';
import type { Asset, Budget, Transaction } from '../models/finance';

const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

export function useFinanceData(month = currentMonth()) {
  const [data, setData] = useState<{ assets: Asset[]; budgets: Budget[]; transactions: Transaction[] }>({
    assets: [], budgets: [], transactions: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const reload = async () => {
    const db = await getDatabase();
    const [assets, budgets, transactions] = await Promise.all([
      listAssets(db), listBudgets(db, month), listTransactions(db, month),
    ]);
    setData({ assets, budgets, transactions });
  };

  useEffect(() => {
    let mounted = true;
    void getDatabase()
      .then(async (db) => {
        const [assets, budgets, transactions] = await Promise.all([
          listAssets(db), listBudgets(db, month), listTransactions(db, month),
        ]);
        if (mounted) setData({ assets, budgets, transactions });
      })
      .catch((cause: unknown) => {
        if (mounted) setError(cause instanceof Error ? cause : new Error('Unable to load financial data'));
      })
      .finally(() => { if (mounted) setIsLoading(false); });
    return () => { mounted = false; };
  }, [month]);

  const addTransaction = async (input: NewTransaction) => {
    const db = await getDatabase();
    await insertTransaction(db, input);
    // Insert succeeded — the transaction is committed.  Reload the UI data
    // in a separate try-catch so a transient query error (e.g. in
    // copyBudgetsIntoMonth) never makes the caller think the save failed.
    try { await reload(); } catch (_) { /* UI will refresh on next navigation */ }
  };

  const removeTransaction = async (id: string) => {
    const db = await getDatabase();
    await deleteTransaction(db, id);
    await reload();
  };

  const editTransaction = async (id: string, input: NewTransaction) => {
    const db = await getDatabase();
    await updateTransaction(db, id, input);
    try { await reload(); } catch (_) { /* UI will refresh on next navigation */ }
  };

  const addAsset = async (input: AssetInput) => { const db = await getDatabase(); await insertAsset(db, input); await reload(); };
  const editAsset = async (id: string, input: AssetInput) => { const db = await getDatabase(); await updateAsset(db, id, input); await reload(); };
  const removeAsset = async (id: string) => { const db = await getDatabase(); await deleteAsset(db, id); await reload(); };
  const addBudget = async (input: BudgetInput) => { const db = await getDatabase(); await insertBudget(db, input); await reload(); };
  const editBudget = async (id: string, input: BudgetInput) => { const db = await getDatabase(); await updateBudget(db, id, input); await reload(); };
  const removeBudget = async (id: string) => { const db = await getDatabase(); await deleteBudget(db, id); await reload(); };

  return { ...data, isLoading, error, reload, addTransaction, editTransaction, removeTransaction, addAsset, editAsset, removeAsset, addBudget, editBudget, removeBudget };
}
