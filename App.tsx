import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFinanceData } from './src/hooks/useFinanceData';
import type { AssetInput, BudgetInput, NewTransaction } from './src/db/repositories';
import type { Asset, Budget, Transaction } from './src/models/finance';
import { exportFinanceData, type ExportFormat } from './src/services/backup';
import { pickBackupFile, replaceAllData } from './src/services/restore';


type IconName = React.ComponentProps<typeof Ionicons>['name'];
type Tab = 'Home' | 'Activity' | 'Budgets' | 'Accounts';
type EntryType = 'Expense' | 'Income' | 'Transfer' | 'Savings contribution';
const budgetCategories = ['Needs', 'Wants', 'Savings'] as const;
type BudgetCategory = typeof budgetCategories[number];
const notify = (title: string, message?: string) => Alert.alert(title, message ?? '');
const confirmAsync = (title: string, message?: string, confirmLabel?: string) => new Promise<boolean>((resolve) => { Alert.alert(title, message ?? '', [{ text: 'Cancel', style: 'cancel', onPress: () => resolve(false) }, { text: confirmLabel ?? 'OK', onPress: () => resolve(true) }]); });

const colors = {
  ink: '#1E2A38',
  muted: '#7A8B9A',
  canvas: '#EEF3FA',
  card: '#FFFFFF',
  line: '#D8E2EE',
  teal: '#5B9BD5',
  tealSoft: '#DAE8F8',
  coral: '#E07070',
  amber: '#E0A84B',
  navy: '#2B3E50',
  memeblue: '#0d5190ff',
};

const navItems: { label: Tab; icon: IconName; activeIcon: IconName }[] = [
  { label: 'Home', icon: 'home-outline', activeIcon: 'home' },
  { label: 'Activity', icon: 'list-outline', activeIcon: 'list' },
  { label: 'Budgets', icon: 'pie-chart-outline', activeIcon: 'pie-chart' },
  { label: 'Accounts', icon: 'wallet-outline', activeIcon: 'wallet' },
];

const accountIconOptions: { name: IconName; label: string }[] = [
  { name: 'wallet-outline', label: 'Wallet' },
  { name: 'card-outline', label: 'Card' },
  { name: 'cash-outline', label: 'Cash' },
  { name: 'business-outline', label: 'Bank' },
  { name: 'phone-portrait-outline', label: 'E-wallet' },
  { name: 'briefcase-outline', label: 'Work' },
  { name: 'home-outline', label: 'Home' },
  { name: 'trending-up-outline', label: 'Invest' },
];

const money = (cents: number) =>
  `₱${(cents / 100).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;

const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const monthDate = (month: string) => new Date(`${month}-15T12:00:00`);
const monthLabel = (month: string) => monthDate(month).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const shiftMonth = (month: string, amount: number) => {
  const date = monthDate(month);
  date.setMonth(date.getMonth() + amount);
  return monthKey(date);
};

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('Home');
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [sheetOpen, setSheetOpen] = useState(false);
  const [entryType, setEntryType] = useState<EntryType | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [editingAccount, setEditingAccount] = useState<Asset | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<Asset | null>(null);
  const [accountReturnTab, setAccountReturnTab] = useState<Tab>('Accounts');
  useEffect(() => {
    // PWA support on web: so Safari's "Add to Home Screen" opens Pocket Ledger
    // as a standalone app with its own icon.
    if (Platform.OS !== 'web') return;
    const addTag = (tag: string, attrs: Record<string, string>) => {
      const element = document.createElement(tag);
      for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
      document.head.appendChild(element);
    };
    addTag('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
    addTag('meta', { name: 'apple-mobile-web-app-title', content: 'Pocket Ledger' });
    addTag('meta', { name: 'theme-color', content: '#5B9BD5' });
    addTag('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no' });
    addTag('link', { rel: 'apple-touch-icon', href: './favicon.ico' });
    const style = document.createElement('style');
    style.innerHTML = 'body { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; } input, textarea { -webkit-user-select: auto; user-select: auto; }';
    document.head.appendChild(style);
    const manifest = {
      name: 'Pocket Ledger',
      short_name: 'Ledger',
      start_url: '.',
      display: 'standalone',
      background_color: '#F7F8F6',
      theme_color: '#5B9BD5',
      icons: [{ src: './favicon.ico', sizes: 'any', type: 'image/x-icon' }],
    };
    const manifestUrl = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/json' }));
    addTag('link', { rel: 'manifest', href: manifestUrl });
  }, []);
  const { assets, budgets, transactions, isLoading, error, reload, addTransaction, editTransaction, removeTransaction, addAsset, editAsset, removeAsset, addBudget, editBudget, removeBudget } = useFinanceData(month);
  const totalBalance = assets.reduce((sum, asset) => sum + asset.balanceCents, 0);
  const totalBudgetRemaining = budgets.reduce((sum, budget) => sum + budget.limitCents - budget.spentCents, 0);
  const monthNetMovement = transactions.reduce((sum, transaction) => sum + transaction.amountCents, 0);
  const balanceBeforeMonth = totalBalance - monthNetMovement;
  const balanceChangePercent = balanceBeforeMonth === 0
    ? (monthNetMovement === 0 ? 0 : null)
    : (monthNetMovement / Math.abs(balanceBeforeMonth)) * 100;
  const balanceChangeLabel = balanceChangePercent === null
    ? '—'
    : `${balanceChangePercent >= 0 ? '+' : ''}${balanceChangePercent.toFixed(1)}%`;
  const handleTabChange = (tab: Tab) => {
    setSelectedAccount(null);
    setActiveTab(tab);
  };
  const restoreFromBackup = async () => {
    let backup: Awaited<ReturnType<typeof pickBackupFile>>;
    try {
      backup = await pickBackupFile();
    } catch (error) {
      notify('Restore failed', error instanceof Error ? error.message : 'Couldn’t read that backup file.');
      return;
    }
    if (!backup) return;
    const preview = `${backup.assets.length} accounts, ${backup.budgets.length} budgets, ${backup.transactions.length} transactions`;
    const ok = await confirmAsync(
      'Restore backup?',
      `This replaces ALL current data with the selected backup (${preview}). A safety backup is saved first.`,
      'Restore',
    );
    if (!ok) return;
    try {
      const result = await replaceAllData(backup);
      await reload();
      notify('Backup restored', `Restored ${result.assets} accounts, ${result.budgets} budgets, and ${result.transactions} transactions.`);
    } catch {
      notify('Restore failed', 'The database was not changed. Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.app}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {isLoading && <View style={styles.loadingBanner}><ActivityIndicator color={colors.teal} /><Text style={styles.statusText}>Loading your finances…</Text></View>}
          {error && <Text style={styles.errorText}>Couldn’t load your finances. Please reopen the app.</Text>}
          {selectedAccount ? (
            <AccountDetailScreen account={selectedAccount} month={month} transactions={transactions} onChangeMonth={setMonth}
              onBack={() => { setSelectedAccount(null); setActiveTab(accountReturnTab); }} onEdit={() => setEditingAccount(selectedAccount)} />
          ) : activeTab === 'Activity' ? (
            <ActivityScreen
              month={month}
              transactions={transactions}
              onChangeMonth={setMonth}
              onEdit={(transaction) => setEditingTransaction(transaction)}
              onDelete={(transaction) => {
                void (async () => {
                  const ok = await confirmAsync('Delete transaction?', 'This will reverse the account balance.', 'Delete');
                  if (!ok) return;
                  try { await removeTransaction(transaction.id); } catch { notify('Couldn’t delete transaction', 'Please try again.'); }
                })();
              }}
              assets={assets}
              budgets={budgets}
            />
          ) : activeTab === 'Accounts' ? (
            <AssetsScreen assets={assets} month={month} onAdd={addAsset} onEdit={editAsset} onDelete={removeAsset} onExport={exportFinanceData} onRestore={restoreFromBackup}
              onSelect={(account) => { setAccountReturnTab('Accounts'); setSelectedAccount(account); }} />
          ) : activeTab === 'Budgets' ? (
            <BudgetsScreen month={month} onChangeMonth={setMonth} budgets={budgets} onAdd={addBudget} onEdit={editBudget} onDelete={removeBudget} />
          ) : (
            <>
              <View style={styles.header}>
                <View>
                  <Text style={styles.eyebrow}>{new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}</Text>
                  <Text style={styles.greeting}>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, Ted</Text>
                </View>
                <Pressable style={styles.avatar} accessibilityLabel="Profile">
                  <Text style={styles.avatarText}>T</Text>
                </Pressable>
              </View>

              <View style={styles.totalCard}>
                <View style={styles.totalTopRow}>
                  <View>
                    <Text style={styles.totalLabel}>TOTAL BALANCE</Text>
                    <Text style={styles.totalAmount}>{money(totalBalance)}</Text>
                  </View>
                  <View style={styles.trendPill}>
                    <Ionicons name={monthNetMovement >= 0 ? 'trending-up' : 'trending-down'} size={14} color={monthNetMovement >= 0 ? colors.teal : colors.coral} />
                    <Text style={[styles.trendText, monthNetMovement < 0 && styles.negativeTrendText]}>{balanceChangeLabel}</Text>
                  </View>
                </View>
                <View style={styles.totalFooter}>
                  <Text style={styles.totalFooterText}>Across {assets.length} accounts</Text>
                </View>
              </View>

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Your accounts</Text>
                <Pressable accessibilityLabel="View all accounts" onPress={() => setActiveTab('Accounts')}>
                  <Text style={styles.linkText}>View all</Text>
                </Pressable>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.accountRow}
              >
                {assets.length === 0 && !isLoading ? <View style={styles.inlineEmpty}><Ionicons name="wallet-outline" size={22} color={colors.teal} /><Text style={styles.inlineEmptyTitle}>No accounts yet</Text><Text style={styles.inlineEmptyText}>Add your first account to see your balance here.</Text></View> : assets.map((account) => (
                  <Pressable key={account.id} style={styles.accountCard} onPress={() => { setAccountReturnTab('Home'); setSelectedAccount(account); }}>
                    <View style={styles.accountIcon}>
                      <Ionicons name={account.icon as IconName} size={19} color={colors.teal} />
                    </View>
                    <Text style={styles.accountName}>{account.name}</Text>
                    <Text style={styles.accountType}>{account.type}</Text>
                    <Text style={styles.accountAmount}>{money(account.balanceCents)}</Text>
                  </Pressable>
                ))}
                <Pressable style={[styles.accountCard, styles.addAccountCard]} onPress={() => setActiveTab('Accounts')}>
                  <View style={styles.addIcon}>
                    <Ionicons name="add" size={22} color={colors.teal} />
                  </View>
                  <Text style={styles.addAccountText}>Add account</Text>
                </Pressable>
              </ScrollView>

              <View style={styles.monthPicker}>
                <Pressable onPress={() => setMonth(shiftMonth(month, -1))} accessibilityLabel="Previous month"><Ionicons name="chevron-back" size={22} color={colors.ink} /></Pressable>
                <Text style={styles.monthLabel}>{monthLabel(month)}</Text>
                <Pressable onPress={() => setMonth(shiftMonth(month, 1))} accessibilityLabel="Next month"><Ionicons name="chevron-forward" size={22} color={colors.ink} /></Pressable>
              </View>

              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionTitle}>{monthLabel(month)} budgets</Text>
                  <Text style={styles.sectionSubtitle}>{money(totalBudgetRemaining)} remaining this month</Text>
                </View>
                <Pressable accessibilityLabel="Manage budgets" onPress={() => setActiveTab('Budgets')}>
                  <Ionicons name="options-outline" size={22} color={colors.ink} />
                </Pressable>
              </View>

              <View style={styles.budgetList}>
                {budgetCategories.map((category) => {
                  const categoryBudgets = budgets.filter((budget) => budget.category === category);
                  return (
                    <View key={category} style={styles.budgetGroup}>
                      <View style={styles.budgetGroupHeader}>
                        <Text style={styles.budgetGroupTitle}>{category}</Text>
                        <View style={styles.budgetGroupRule} />
                      </View>
                      {categoryBudgets.length === 0 ? (
                        <View style={styles.budgetGroupEmptyRow}><Ionicons name="add-circle-outline" size={16} color={colors.teal} /><Text style={styles.budgetGroupEmpty}>No {category.toLowerCase()} budgets yet.</Text></View>
                      ) : categoryBudgets.map((budget) => (
                        <Pressable key={budget.id} style={styles.budgetCard}>
                          <View style={styles.budgetHeading}>
                            <View style={[styles.budgetDot, { backgroundColor: budget.color }]} />
                            <View style={styles.budgetNameWrap}>
                              <Text style={styles.budgetName}>{budget.name}</Text>
                              <Text style={styles.budgetCategory}>{budget.category}</Text>
                            </View>
                            <View style={styles.budgetNumbers}>
                              <Text style={styles.budgetSpent}>{money(budget.spentCents)}</Text>
                              <Text style={styles.budgetTotal}>of {money(budget.limitCents)}</Text>
                            </View>
                          </View>
                          <View style={styles.progressTrack}>
                            <View
                              style={[
                                styles.progressFill,
                                { width: `${Math.min(budget.spentCents / Math.max(budget.limitCents, 1), 1) * 100}%`, backgroundColor: budget.color },
                              ]}
                            />
                          </View>
                        </Pressable>
                      ))}
                    </View>
                  );
                })}
              </View>

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Recent activity</Text>
                <Pressable accessibilityLabel="View activity" onPress={() => setActiveTab('Activity')}>
                  <Text style={styles.linkText}>See all</Text>
                </Pressable>
              </View>

              <View style={styles.activityCard}>
                {transactions.length === 0 ? <EmptyState icon="receipt-outline" title="No recent activity" detail="Your latest transactions will appear here." /> : transactions.slice(0, 4).map((transaction, index) => (
                  <ActivityRow
                    key={transaction.id}
                    icon={transaction.icon as IconName}
                    label={transaction.description}
                    detail={`${index === 0 ? 'Today' : new Date(transaction.occurredAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} · ${transaction.category}`}
                    amount={`${transaction.amountCents >= 0 ? '+' : '-'}${money(Math.abs(transaction.amountCents))}`}
                    iconColor={transaction.amountCents >= 0 ? colors.teal : index === 1 ? colors.memeblue : colors.coral}
                    positive={transaction.amountCents >= 0}
                    last={index === Math.min(transactions.length, 4) - 1}
                  />
                ))}
              </View>
            </>
          )}
        </ScrollView>

        <Pressable style={styles.fab} accessibilityLabel="Add transaction" onPress={() => setSheetOpen(true)}>
          <Ionicons name="add" size={28} color="#FFFFFF" />
        </Pressable>

        <View style={styles.tabBar}>
          {navItems.map((item) => {
            const isActive = activeTab === item.label;
            return (
              <Pressable
                key={item.label}
                style={styles.tabItem}
                onPress={() => handleTabChange(item.label)}
                accessibilityRole="button"
                accessibilityLabel={item.label}
              >
                <Ionicons
                  name={isActive ? item.activeIcon : item.icon}
                  size={22}
                  color={isActive ? colors.teal : colors.muted}
                />
                <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
          <View style={styles.modalBackdrop}>
            <Pressable style={styles.modalDismiss} onPress={() => setSheetOpen(false)} />
            <View style={styles.sheet}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>Add to your ledger</Text>
              {(['Expense', 'Income', 'Transfer', 'Savings contribution'] as EntryType[]).map((type) => (
                <Pressable
                  key={type}
                  style={styles.sheetOption}
                  onPress={() => { setSheetOpen(false); setEntryType(type); }}
                >
                  <View style={[styles.sheetIcon, { backgroundColor: type === 'Expense' ? '#FDE9E4' : colors.tealSoft }]}>
                    <Ionicons
                      name={type === 'Expense' ? 'arrow-up-outline' : type === 'Income' ? 'arrow-down-outline' : type === 'Transfer' ? 'swap-horizontal-outline' : 'sparkles-outline'}
                      size={21}
                      color={type === 'Expense' ? colors.coral : colors.teal}
                    />
                  </View>
                  <Text style={styles.sheetOptionText}>{type}</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                </Pressable>
              ))}
              <Pressable style={styles.cancelButton} onPress={() => setSheetOpen(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
        {entryType && (
          <TransactionForm
            type={entryType}
            assets={assets}
            budgets={budgets}
            onClose={() => setEntryType(null)}
            onSave={async (input) => { await addTransaction(input); setEntryType(null); }}
          />
        )}
        {editingTransaction && (
          <TransactionForm
            type={editingTransaction.category === 'Income' ? 'Income' : editingTransaction.category === 'Transfer' || editingTransaction.category === 'Future you' ? 'Transfer' : editingTransaction.category === 'Savings' ? 'Savings contribution' : 'Expense'}
            transaction={editingTransaction}
            pairedTransaction={transactions.find((transaction) => transaction.id === `${editingTransaction.id}-destination`)}
            assets={assets}
            budgets={budgets}
            onClose={() => setEditingTransaction(null)}
            onSave={async (input) => { await editTransaction(editingTransaction.id, input); setEditingTransaction(null); }}
          />
        )}
        {editingAccount && <AssetForm asset={editingAccount} onClose={() => setEditingAccount(null)} onSave={async (input) => {
          await editAsset(editingAccount.id, input);
          setEditingAccount(null);
          setSelectedAccount({ ...editingAccount, name: input.name, type: input.type, icon: input.icon });
        }} />}
      </View>

    </SafeAreaView>
  );
}

function AssetsScreen({ assets, month, onAdd, onEdit, onDelete, onExport, onRestore, onSelect }: { assets: Asset[]; month: string; onAdd: (input: AssetInput) => Promise<void>; onEdit: (id: string, input: AssetInput) => Promise<void>; onDelete: (id: string) => Promise<void>; onExport: (format: ExportFormat, scope?: { month?: string }) => Promise<void>; onRestore: () => Promise<void>; onSelect: (asset: Asset) => void }) {
  const [editing, setEditing] = useState<Asset | null | undefined>(undefined);
  const [busy, setBusy] = useState<'month-csv' | 'all-csv' | 'json' | 'restore' | null>(null);
  const exportData = async (format: ExportFormat, scope?: { month?: string }) => {
    setBusy(scope?.month ? 'month-csv' : format === 'csv' ? 'all-csv' : 'json');
    try {
      await onExport(format, scope);
    } catch (error) {
      Alert.alert('Export failed', error instanceof Error ? error.message : 'Unable to create the export. Please try again.');
    } finally {
      setBusy(null);
    }
  };
  const restoreBackup = async () => {
    setBusy('restore');
    try {
      await onRestore();
    } finally {
      setBusy(null);
    }
  };
  const monthShort = monthDate(month).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' });
  return <View>
    <View style={styles.header}><View><Text style={styles.eyebrow}>ACCOUNTS</Text><Text style={styles.greeting}>Your accounts</Text></View><Pressable style={styles.roundAdd} onPress={() => setEditing(null)}><Ionicons name="add" size={22} color="#FFF" /></Pressable></View>
    <Text style={styles.screenIntro}>Manage the places where you keep your money.</Text>
    <View style={styles.exportCard}>
      <View style={styles.exportCopy}>
        <Text style={styles.exportTitle}>Export, backup & restore</Text>
        <Text style={styles.exportDescription}>Export transactions, back up the whole database, or restore a JSON backup. Restoring replaces all current data.</Text>
      </View>
      <View style={styles.exportActions}>
        <Pressable style={styles.exportButton} onPress={() => void exportData('csv', { month })} disabled={!!busy}>
          {busy === 'month-csv' ? <ActivityIndicator color={colors.teal} /> : <Ionicons name="calendar-outline" size={18} color={colors.teal} />}
          <Text style={styles.exportButtonText}>{monthShort} CSV</Text>
        </Pressable>
        <Pressable style={styles.exportButton} onPress={() => void exportData('csv')} disabled={!!busy}>
          {busy === 'all-csv' ? <ActivityIndicator color={colors.teal} /> : <Ionicons name="document-text-outline" size={18} color={colors.teal} />}
          <Text style={styles.exportButtonText}>All months CSV</Text>
        </Pressable>
      </View>
      <View style={[styles.exportActions, styles.exportActionsSpaced]}>
        <Pressable style={styles.exportButton} onPress={() => void exportData('json')} disabled={!!busy}>
          {busy === 'json' ? <ActivityIndicator color={colors.teal} /> : <Ionicons name="archive-outline" size={18} color={colors.teal} />}
          <Text style={styles.exportButtonText}>Full JSON backup</Text>
        </Pressable>
        <Pressable style={styles.exportButton} onPress={() => void restoreBackup()} disabled={!!busy}>
          {busy === 'restore' ? <ActivityIndicator color={colors.teal} /> : <Ionicons name="download-outline" size={18} color={colors.teal} />}
          <Text style={styles.exportButtonText}>Restore JSON backup</Text>
        </Pressable>
      </View>
    </View>
    <View style={styles.managementList}>{assets.length === 0 ? <EmptyState icon="wallet-outline" title="No accounts yet" detail="Add a bank account, card, or e-wallet to get started." actionLabel="Add account" onAction={() => setEditing(null)} /> : assets.map((asset) => <Pressable key={asset.id} style={styles.managementCard} onPress={() => onSelect(asset)} onLongPress={() => Alert.alert('Account options', asset.name, [{ text: 'Edit', onPress: () => setEditing(asset) }, { text: 'Delete', style: 'destructive', onPress: async () => { try { await onDelete(asset.id); } catch (e) { Alert.alert('Can’t delete account', e instanceof Error ? e.message : 'This account is in use.'); } } }, { text: 'Cancel', style: 'cancel' }])}>
      <View style={styles.managementIcon}><Ionicons name={asset.icon as IconName} size={21} color={colors.teal} /></View><View style={styles.managementCopy}><Text style={styles.managementName}>{asset.name}</Text><Text style={styles.managementDetail}>{asset.type}</Text></View><View style={styles.managementAmount}><Text style={styles.managementValue}>{money(asset.balanceCents)}</Text><Text style={styles.managementHint}>Tap to edit</Text></View>
    </Pressable>)}</View>
    <Text style={styles.activityHint}>Tap an account for details, or press and hold to edit or delete.</Text>
    {editing !== undefined && <AssetForm asset={editing} onClose={() => setEditing(undefined)} onSave={async (input) => { if (editing) await onEdit(editing.id, input); else await onAdd(input); setEditing(undefined); }} />}
  </View>;
}

function AccountDetailScreen({ account, month, transactions, onChangeMonth, onBack, onEdit }: {
  account: Asset; month: string; transactions: Transaction[]; onChangeMonth: (month: string) => void; onBack: () => void; onEdit: () => void;
}) {
  const accountTransactions = transactions.filter((transaction) => transaction.assetId === account.id);
  const income = accountTransactions.filter((transaction) => transaction.amountCents > 0).reduce((sum, transaction) => sum + transaction.amountCents, 0);
  const spending = accountTransactions.filter((transaction) => transaction.amountCents < 0).reduce((sum, transaction) => sum + Math.abs(transaction.amountCents), 0);
  const categories = accountTransactions.filter((transaction) => transaction.amountCents < 0).reduce<Record<string, number>>((result, transaction) => {
    result[transaction.category] = (result[transaction.category] ?? 0) + Math.abs(transaction.amountCents);
    return result;
  }, {});
  const breakdown = Object.entries(categories).sort(([, a], [, b]) => b - a).slice(0, 4);
  const maxCategory = breakdown[0]?.[1] ?? 1;
  return <View>
    <View style={styles.detailHeader}>
      <Pressable onPress={onBack} accessibilityLabel="Back to accounts" style={styles.backButton}><Ionicons name="arrow-back" size={22} color={colors.ink} /></Pressable>
      <View style={styles.detailHeaderCopy}><Text style={styles.eyebrow}>ACCOUNT DETAILS</Text><Text style={styles.detailTitle}>{account.name}</Text></View>
      <Pressable onPress={onEdit} accessibilityLabel="Edit account"><Ionicons name="create-outline" size={21} color={colors.teal} /></Pressable>
    </View>
    <View style={styles.accountHero}>
      <View style={styles.accountHeroIcon}><Ionicons name={account.icon as IconName} size={24} color={colors.teal} /></View>
      <Text style={styles.accountHeroType}>{account.type}</Text>
      <Text style={styles.accountHeroBalance}>{money(account.balanceCents)}</Text>
      <Text style={styles.accountHeroLabel}>CURRENT BALANCE</Text>
    </View>
    <View style={styles.monthPicker}>
      <Pressable onPress={() => onChangeMonth(shiftMonth(month, -1))} accessibilityLabel="Previous month"><Ionicons name="chevron-back" size={22} color={colors.ink} /></Pressable>
      <Text style={styles.monthLabel}>{monthLabel(month)}</Text>
      <Pressable onPress={() => onChangeMonth(shiftMonth(month, 1))} accessibilityLabel="Next month"><Ionicons name="chevron-forward" size={22} color={colors.ink} /></Pressable>
    </View>
    <View style={styles.summaryRow}>
      <View style={styles.summaryCard}><Text style={styles.summaryLabel}>INCOME</Text><Text style={[styles.summaryAmount, styles.positiveAmount]}>+{money(income)}</Text></View>
      <View style={styles.summaryCard}><Text style={styles.summaryLabel}>SPENDING</Text><Text style={[styles.summaryAmount, { color: colors.coral }]}>-{money(spending)}</Text></View>
    </View>
    <View style={styles.analyticsCard}>
      <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Spending breakdown</Text><Text style={styles.sectionSubtitle}>By category this month</Text></View><Ionicons name="bar-chart-outline" size={20} color={colors.teal} /></View>
      {breakdown.length === 0 ? <EmptyState icon="bar-chart-outline" title="No spending recorded" detail="Category insights will appear after you record an expense." /> : breakdown.map(([category, value]) => <View key={category} style={styles.breakdownRow}>
        <View style={styles.breakdownLabel}><Text style={styles.activityLabel}>{category}</Text><Text style={styles.activityDetail}>{money(value)}</Text></View>
        <View style={styles.breakdownTrack}><View style={[styles.breakdownFill, { width: `${(value / maxCategory) * 100}%` }]} /></View>
      </View>)}
    </View>
    <Text style={styles.sectionTitle}>Transactions</Text>
    <View style={styles.activityCard}>
      {accountTransactions.length === 0 ? <EmptyState icon="receipt-outline" title="No transactions this month" detail="Transactions for this account will appear here." /> : accountTransactions.map((transaction, index) => <ActivityRow key={transaction.id} icon={transaction.icon as IconName} label={transaction.description} detail={`${new Date(transaction.occurredAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} · ${transaction.category}`} amount={`${transaction.amountCents >= 0 ? '+' : '-'}${money(Math.abs(transaction.amountCents))}`} iconColor={transaction.amountCents >= 0 ? colors.teal : colors.coral} positive={transaction.amountCents >= 0} last={index === accountTransactions.length - 1} />)}
    </View>
  </View>;
}

function BudgetsScreen({ month, onChangeMonth, budgets, onAdd, onEdit, onDelete }: { month: string; onChangeMonth: (month: string) => void; budgets: Budget[]; onAdd: (input: BudgetInput) => Promise<void>; onEdit: (id: string, input: BudgetInput) => Promise<void>; onDelete: (id: string) => Promise<void> }) {
  const [editing, setEditing] = useState<Budget | null | undefined>(undefined);
  return <View>
    <View style={styles.header}><View><Text style={styles.eyebrow}>BUDGETS</Text><Text style={styles.greeting}>Plan your month</Text></View><Pressable style={styles.roundAdd} onPress={() => setEditing(null)}><Ionicons name="add" size={22} color="#FFF" /></Pressable></View>
    <Text style={styles.screenIntro}>Keep spending intentional with simple monthly limits.</Text>
    <View style={styles.monthPicker}>
      <Pressable onPress={() => onChangeMonth(shiftMonth(month, -1))} accessibilityLabel="Previous month"><Ionicons name="chevron-back" size={22} color={colors.ink} /></Pressable>
      <Text style={styles.monthLabel}>{monthLabel(month)}</Text>
      <Pressable onPress={() => onChangeMonth(shiftMonth(month, 1))} accessibilityLabel="Next month"><Ionicons name="chevron-forward" size={22} color={colors.ink} /></Pressable>
    </View>
    <View style={styles.managementList}>{budgets.length === 0 ? <EmptyState icon="pie-chart-outline" title="No budgets for this month" detail="Create a monthly limit to give your spending a clear direction." actionLabel="Add budget" onAction={() => setEditing(null)} /> : budgets.map((budget) => <Pressable key={budget.id} style={styles.managementCard} onPress={() => setEditing(budget)} onLongPress={() => Alert.alert('Delete budget?', budget.name, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { try { await onDelete(budget.id); } catch (e) { Alert.alert('Can’t delete budget', e instanceof Error ? e.message : 'This budget is in use.'); } } }])}>
      <View style={[styles.managementIcon, { backgroundColor: `${budget.color}20` }]}><View style={[styles.budgetDot, { backgroundColor: budget.color, marginRight: 0 }]} /></View><View style={styles.managementCopy}><Text style={styles.managementName}>{budget.name}</Text><Text style={styles.managementDetail}>{budget.category} · {budget.month}</Text><View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.min(budget.spentCents / Math.max(budget.limitCents, 1), 1) * 100}%`, backgroundColor: budget.color }]} /></View></View><View style={styles.managementAmount}><Text style={styles.managementValue}>{money(budget.spentCents)}</Text><Text style={styles.managementHint}>of {money(budget.limitCents)}</Text></View>
    </Pressable>)}</View>
    <Text style={styles.activityHint}>Tap a budget to edit, or press and hold to delete.</Text>
    {editing !== undefined && <BudgetForm budget={editing} month={month} onClose={() => setEditing(undefined)} onSave={async (input) => { if (editing) await onEdit(editing.id, input); else await onAdd(input); setEditing(undefined); }} />}
  </View>;
}

function AssetForm({ asset, onClose, onSave }: { asset: Asset | null; onClose: () => void; onSave: (input: AssetInput) => Promise<void> }) {
  const [name, setName] = useState(asset?.name ?? ''); const [type, setType] = useState(asset?.type ?? 'Bank account'); const [balance, setBalance] = useState(asset ? String((asset.initialBalanceCents ?? 0) / 100) : ''); const [icon, setIcon] = useState<IconName>((asset?.icon as IconName) ?? 'wallet-outline'); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const save = async () => { const value = Number(balance.replace(',', '.')); if (!name.trim()) return setError('Add an account name.'); if (!type.trim()) return setError('Add an account type.'); if (!Number.isFinite(value)) return setError('Enter a valid opening balance.'); setSaving(true); try { await onSave({ name, type, icon, balanceCents: Math.round(value * 100) }); } catch { setSaving(false); Alert.alert('Couldn’t save account', 'Please try again.'); } };
  return <SimpleForm title={asset ? 'Edit account' : 'Add account'} onClose={onClose}><Field label="NAME" value={name} onChangeText={setName} placeholder="e.g. Main checking" /><Field label="TYPE" value={type} onChangeText={setType} placeholder="Bank account, e-wallet…" /><Text style={styles.inputLabel}>ACCOUNT ICON</Text><View style={styles.iconPicker}>{accountIconOptions.map((option) => <Pressable key={option.name} accessibilityLabel={`Use ${option.label} icon`} onPress={() => setIcon(option.name)} style={[styles.iconChoice, option.name === icon && styles.iconChoiceSelected]}><Ionicons name={option.name} size={20} color={option.name === icon ? colors.teal : colors.muted} /><Text style={[styles.iconChoiceLabel, option.name === icon && styles.iconChoiceLabelSelected]}>{option.label}</Text></Pressable>)}</View><Field label="OPENING BALANCE" value={balance} onChangeText={setBalance} placeholder="0.00" keyboardType="decimal-pad" />{!!error && <Text style={styles.validationError}>{error}</Text>}<Pressable style={[styles.saveButton, saving && styles.saveButtonDisabled]} onPress={save} disabled={saving}>{saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveButtonText}>{asset ? 'Save account' : 'Add account'}</Text>}</Pressable></SimpleForm>;
}

function EmptyState({ icon, title, detail, actionLabel, onAction }: { icon: IconName; title: string; detail: string; actionLabel?: string; onAction?: () => void }) {
  return <View style={styles.emptyState}><View style={styles.emptyStateIcon}><Ionicons name={icon} size={24} color={colors.teal} /></View><Text style={styles.emptyStateTitle}>{title}</Text><Text style={styles.emptyStateDetail}>{detail}</Text>{actionLabel && onAction && <Pressable style={styles.emptyStateButton} onPress={onAction}><Ionicons name="add" size={16} color="#FFF" /><Text style={styles.emptyStateButtonText}>{actionLabel}</Text></Pressable>}</View>;
}

function BudgetForm({ budget, month, onClose, onSave }: { budget: Budget | null; month: string; onClose: () => void; onSave: (input: BudgetInput) => Promise<void> }) {
  const initialCategory = budgetCategories.includes(budget?.category as BudgetCategory) ? budget?.category as BudgetCategory : 'Needs';
  const [name, setName] = useState(budget?.name ?? ''); const [category, setCategory] = useState<BudgetCategory>(initialCategory); const [limit, setLimit] = useState(budget ? String(budget.limitCents / 100) : ''); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const save = async () => { const value = Number(limit.replace(',', '.')); if (!name.trim()) return setError('Add a budget name.'); if (!budgetCategories.includes(category)) return setError('Choose a budget category.'); if (!Number.isFinite(value) || value <= 0) return setError('Enter a limit greater than zero.'); setSaving(true); try { await onSave({ name, category, limitCents: Math.round(value * 100), color: budget?.color ?? colors.teal, month: budget?.month ?? month }); } catch { setSaving(false); Alert.alert('Couldn’t save budget', 'Please try again.'); } };
  return <SimpleForm title={budget ? 'Edit budget' : 'Add budget'} onClose={onClose}><Field label="NAME" value={name} onChangeText={setName} placeholder="e.g. Groceries" /><Text style={styles.inputLabel}>CATEGORY</Text><ChoiceRow items={budgetCategories.map((item) => ({ id: item, name: item }))} value={category} onChange={(value) => setCategory(value as BudgetCategory)} /><Field label="MONTHLY LIMIT" value={limit} onChangeText={setLimit} placeholder="0.00" keyboardType="decimal-pad" />{!!error && <Text style={styles.validationError}>{error}</Text>}<Pressable style={[styles.saveButton, saving && styles.saveButtonDisabled]} onPress={save} disabled={saving}>{saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveButtonText}>{budget ? 'Save budget' : 'Add budget'}</Text>}</Pressable></SimpleForm>;
}

function Field({ label, ...props }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; keyboardType?: 'default' | 'decimal-pad' }) {
  return <><Text style={styles.inputLabel}>{label}</Text><TextInput style={styles.textInput} {...props} placeholderTextColor="#A4AFB3" /></>;
}

function SimpleForm({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <Modal visible transparent animationType="slide" onRequestClose={onClose}><KeyboardAvoidingView style={styles.formBackdrop} behavior="padding"><View style={styles.formCard}><View style={styles.formHeader}><Pressable onPress={onClose}><Ionicons name="close" size={24} color={colors.ink} /></Pressable><Text style={styles.formTitle}>{title}</Text><View style={{ width: 24 }} /></View><ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView></View></KeyboardAvoidingView></Modal>;
}

function ActivityScreen({
  month, transactions, onChangeMonth, onDelete, onEdit, assets, budgets,
}: {
  month: string;
  transactions: Transaction[];
  onChangeMonth: (month: string) => void;
  onDelete: (transaction: Transaction) => void;
  onEdit: (transaction: Transaction) => void;
  assets: { id: string; name: string }[];
  budgets: { id: string; name: string; category: string; month: string }[];
}) {
  return (
    <View>
      <View style={styles.header}>
        <View><Text style={styles.eyebrow}>ACTIVITY</Text><Text style={styles.greeting}>Transaction history</Text></View>
      </View>
      <View style={styles.monthPicker}>
        <Pressable onPress={() => onChangeMonth(shiftMonth(month, -1))} accessibilityLabel="Previous month"><Ionicons name="chevron-back" size={22} color={colors.ink} /></Pressable>
        <Text style={styles.monthLabel}>{monthLabel(month)}</Text>
        <Pressable onPress={() => onChangeMonth(shiftMonth(month, 1))} accessibilityLabel="Next month"><Ionicons name="chevron-forward" size={22} color={colors.ink} /></Pressable>
      </View>
      <View style={styles.activityCard}>
        {transactions.length === 0 ? <EmptyState icon="receipt-outline" title="No transactions this month" detail="Add an expense, income, or transfer to start your activity history." /> : transactions.map((transaction, index) => {
          const editTarget = transaction.id.endsWith('-destination')
            ? transactions.find((candidate) => candidate.id === transaction.id.slice(0, -'-destination'.length)) ?? transaction
            : transaction;
          return (
            <Pressable key={transaction.id} onPress={() => onEdit(editTarget)} onLongPress={() => Alert.alert('Transaction options', transaction.description, [
              { text: 'Edit', onPress: () => onEdit(editTarget) },
              { text: 'Delete', style: 'destructive', onPress: () => onDelete(transaction) },
              { text: 'Cancel', style: 'cancel' },
            ])} accessibilityLabel={`Edit ${transaction.description}`}>
              <ActivityRow
                icon={transaction.icon as IconName}
                label={transaction.description}
                detail={`${new Date(transaction.occurredAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} · ${transaction.category}`}
                amount={`${transaction.amountCents >= 0 ? '+' : '-'}${money(Math.abs(transaction.amountCents))}`}
                iconColor={transaction.amountCents >= 0 ? colors.teal : colors.coral}
                positive={transaction.amountCents >= 0}
                last={index === transactions.length - 1}
              />
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.activityHint}>Tap to edit, or press and hold for more options.</Text>
    </View>
  );
}

function TransactionForm({
  type, transaction, pairedTransaction, assets, budgets, onClose, onSave,
}: {
  type: EntryType;
  transaction?: Transaction;
  pairedTransaction?: Transaction;
  assets: Asset[];
  budgets: { id: string; name: string; category: string; month: string }[];
  onClose: () => void;
  onSave: (input: NewTransaction) => Promise<void>;
}) {
  const [assetId, setAssetId] = useState(transaction?.assetId ?? assets[0]?.id ?? '');
  const [destinationAssetId, setDestinationAssetId] = useState(pairedTransaction?.assetId ?? assets[1]?.id ?? assets[0]?.id ?? '');
  const [budgetId, setBudgetId] = useState(transaction?.budgetId ?? (type === 'Savings contribution' ? budgets.find((b) => b.category === 'Savings')?.id ?? null : null));
  const [transferPurpose, setTransferPurpose] = useState(transaction?.category === 'Future you' ? 'Future you' : 'Other');
  const [amount, setAmount] = useState(transaction ? String(Math.abs(transaction.amountCents) / 100) : '');
  const [description, setDescription] = useState(transaction?.description ?? (type === 'Savings contribution' ? 'Savings contribution' : ''));
  const [date, setDate] = useState(transaction ? transaction.occurredAt.slice(0, 10) : dateKey(new Date()));
  const [validationError, setValidationError] = useState('');
  const [saving, setSaving] = useState(false);
  const isExpense = type === 'Expense';
  const isTransfer = type === 'Transfer';
  useEffect(() => {
    if (assets.length === 0) return;
    if (!assets.some((a) => a.id === assetId)) setAssetId(assets[0].id);
    if (isTransfer && !assets.some((a) => a.id === destinationAssetId)) {
      setDestinationAssetId(assets.find((a) => a.id !== assetId)?.id ?? assets[0].id);
    }
  }, [assets]);
  const selectedBudgetId = budgetId;
  const money = (cents: number) => 'P' + (cents / 100).toFixed(2);
  const save = async () => {
    const value = Number(amount.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) return setValidationError('Enter an amount greater than zero.');
    if (!description.trim()) return setValidationError('Add a description.');
    const occurredAt = new Date(`${date}T12:00:00`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(occurredAt.getTime()) || dateKey(occurredAt) !== date) return setValidationError('Use a valid date (YYYY-MM-DD).');
    if (!assetId || (isTransfer && (!destinationAssetId || destinationAssetId === assetId))) return setValidationError('Choose different accounts for a transfer.');
    if (isExpense) { const src = assets.find((a) => a.id === assetId); const bal = src?.balanceCents ?? 0; const amountCents = Math.round(value * 100); let available = bal; if (transaction && transaction.assetId === assetId) available = bal + Math.abs(transaction.amountCents); if (amountCents > available) return setValidationError(`Insufficient funds. Your ${src?.name ?? 'account'} has only ${money(bal)}, but you're trying to spend ${money(amountCents)}.`); }
    if (isTransfer) { const src = assets.find((a) => a.id === assetId); const bal = src?.balanceCents ?? 0; const amountCents = Math.round(value * 100); let available = bal; if (transaction && transaction.assetId === assetId) available = bal + Math.abs(transaction.amountCents); if (amountCents > available) return setValidationError(`Insufficient funds. Your ${src?.name ?? 'account'} has only ${money(bal)}, but you're trying to transfer ${money(amountCents)}.`); }
    setValidationError('');
    setSaving(true);
    try {
      await onSave({ assetId, destinationAssetId: isTransfer ? destinationAssetId : undefined, budgetId: isExpense || isTransfer ? (budgets.find((b) => b.id === selectedBudgetId && b.month === date.slice(0, 7))?.id ?? null) : null, description: description.trim(), amountCents: Math.round(value * 100) * (isExpense ? -1 : 1), category: isTransfer ? transferPurpose : type === 'Income' ? 'Income' : type === 'Savings contribution' ? 'Savings' : budgets.find((b) => b.id === budgetId)?.category ?? 'Expense', occurredAt: occurredAt.toISOString(), icon: isTransfer ? 'swap-horizontal-outline' : type === 'Income' ? 'arrow-down-outline' : type === 'Savings contribution' ? 'sparkles-outline' : 'cart-outline', isTransfer });
    } catch (e) { setValidationError(e instanceof Error ? e.message : 'Could not save. Try again.'); } finally { setSaving(false); }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.formBackdrop} behavior="padding">
        <View style={styles.formCard}>
          <View style={styles.formHeader}>
            <Pressable onPress={onClose} accessibilityLabel="Close"><Ionicons name="close" size={24} color={colors.ink} /></Pressable>
            <Text style={styles.formTitle}>{type}</Text>
            <View style={{ width: 24 }} />
          </View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.amountLabel}>AMOUNT</Text>
            <View style={styles.amountInputRow}><Text style={styles.currency}>₱</Text><TextInput style={styles.amountInput} value={amount} onChangeText={setAmount} placeholder="0.00" placeholderTextColor="#B7C0C4" keyboardType="decimal-pad" /></View>
            <Text style={styles.inputLabel}>{isTransfer ? 'FROM ACCOUNT' : 'ACCOUNT'}</Text>
            <ChoiceRow items={assets} value={assetId} onChange={setAssetId} />
            {isTransfer && <><Text style={styles.inputLabel}>TO ACCOUNT</Text><ChoiceRow items={assets} value={destinationAssetId} onChange={setDestinationAssetId} /></>}
            {isTransfer && <><Text style={styles.inputLabel}>TRANSFER PURPOSE</Text><ChoiceRow items={[{ id: 'Future you', name: 'Future you' }, { id: 'Other', name: 'Other' }]} value={transferPurpose} onChange={setTransferPurpose} /></>}
            {isExpense && <><Text style={styles.inputLabel}>BUDGET</Text><ChoiceRow items={budgets} value={budgetId ?? ''} onChange={(value) => setBudgetId(value || null)} /></>}
            <Text style={styles.inputLabel}>DESCRIPTION</Text>
            <TextInput style={styles.textInput} value={description} onChangeText={setDescription} placeholder="What was this for?" placeholderTextColor="#A4AFB3" />
            <Text style={styles.inputLabel}>DATE</Text>
            <TextInput style={styles.textInput} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor="#A4AFB3" keyboardType="numbers-and-punctuation" />
            {!!validationError && <Text style={styles.validationError}>{validationError}</Text>}
            <Pressable style={[styles.saveButton, saving && styles.saveButtonDisabled]} onPress={save} disabled={saving}>
              {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveButtonText}>Save transaction</Text>}
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ChoiceRow({ items, value, onChange }: { items: { id: string; name: string }[]; value: string; onChange: (value: string) => void }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>{items.map((item) => <Pressable key={item.id || 'none'} style={[styles.choice, item.id === value && styles.choiceSelected]} onPress={() => onChange(item.id)}><Text style={[styles.choiceText, item.id === value && styles.choiceTextSelected]}>{item.name}</Text></Pressable>)}</ScrollView>;
}

function ActivityRow({
  icon,
  label,
  detail,
  amount,
  iconColor,
  positive,
  last,
}: {
  icon: IconName;
  label: string;
  detail: string;
  amount: string;
  iconColor: string;
  positive?: boolean;
  last?: boolean;
}) {
  return (
    <View style={[styles.activityRow, !last && styles.activityBorder]}>
      <View style={[styles.activityIcon, { backgroundColor: `${iconColor}18` }]}>
        <Ionicons name={icon} size={19} color={iconColor} />
      </View>
      <View style={styles.activityCopy}>
        <Text style={styles.activityLabel}>{label}</Text>
        <Text style={styles.activityDetail}>{detail}</Text>
      </View>
      <Text style={[styles.activityAmount, positive && styles.positiveAmount]}>{amount}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.canvas },
  app: { flex: 1, backgroundColor: colors.canvas },
  scrollContent: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 118 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  eyebrow: { color: colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, marginBottom: 6 },
  greeting: { color: colors.ink, fontSize: 26, fontWeight: '700', letterSpacing: -0.6 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.memeblue, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  totalCard: { backgroundColor: colors.memeblue, borderRadius: 24, padding: 22, marginBottom: 28, shadowColor: colors.memeblue, shadowOpacity: 0.16, shadowRadius: 15, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  totalTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  totalLabel: { color: '#A8BDC7', fontSize: 11, fontWeight: '700', letterSpacing: 1.1, marginBottom: 8 },
  totalAmount: { color: '#FFFFFF', fontSize: 34, fontWeight: '700', letterSpacing: -1.2 },
  trendPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#DAE8F8', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  trendText: { color: colors.teal, fontSize: 12, fontWeight: '700' },
  negativeTrendText: { color: colors.coral },
  totalFooter: { borderTopWidth: 1, borderTopColor: colors.teal, marginTop: 22, paddingTop: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalFooterText: { color: '#B9C9D0', fontSize: 13 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
  sectionSubtitle: { color: colors.muted, fontSize: 12, marginTop: 4 },
  linkText: { color: colors.teal, fontSize: 13, fontWeight: '700' },
  accountRow: { gap: 12, paddingBottom: 28 },
  accountCard: { width: 148, minHeight: 151, backgroundColor: colors.card, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: colors.line },
  accountIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 15 },
  accountName: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  accountType: { color: colors.muted, fontSize: 11, marginTop: 3 },
  accountAmount: { color: colors.ink, fontSize: 16, fontWeight: '700', marginTop: 'auto' },
  addAccountCard: { borderStyle: 'dashed', borderColor: '#A3C4E0', alignItems: 'center', justifyContent: 'center' },
  addIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 11 },
  addAccountText: { color: colors.teal, fontSize: 13, fontWeight: '700' },
  budgetList: { gap: 18, marginBottom: 28 },
  budgetGroup: { gap: 10 },
  budgetGroupHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  budgetGroupTitle: { color: colors.ink, fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },
  budgetGroupRule: { flex: 1, height: 1, backgroundColor: colors.line },
  budgetGroupEmpty: { color: colors.muted, fontSize: 13, paddingVertical: 8 },
  budgetGroupEmptyRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 8 },
  budgetCard: { backgroundColor: colors.card, borderRadius: 17, padding: 16, borderWidth: 1, borderColor: colors.line },
  budgetHeading: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  budgetDot: { width: 9, height: 9, borderRadius: 5, marginRight: 10 },
  budgetNameWrap: { flex: 1 },
  budgetName: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  budgetCategory: { color: colors.muted, fontSize: 11, marginTop: 3 },
  budgetNumbers: { alignItems: 'flex-end' },
  budgetSpent: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  budgetTotal: { color: colors.muted, fontSize: 11, marginTop: 2 },
  progressTrack: { height: 7, borderRadius: 5, backgroundColor: '#EDF0EE', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 5 },
  activityCard: { backgroundColor: colors.card, borderRadius: 18, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.line },
  monthPicker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.card, borderRadius: 15, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 14 },
  monthLabel: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  emptyText: { color: colors.muted, textAlign: 'center', paddingVertical: 30, fontSize: 14 },
  activityHint: { color: colors.muted, textAlign: 'center', fontSize: 11, marginTop: 12 },
  screenIntro: { color: colors.muted, fontSize: 14, lineHeight: 21, marginBottom: 18 },
  roundAdd: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center' },
  exportCard: { backgroundColor: colors.card, borderRadius: 18, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: colors.line },
  exportCopy: { marginBottom: 14 },
  exportTitle: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  exportDescription: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 5 },
  exportActions: { flexDirection: 'row', gap: 10 },
  exportActionsSpaced: { marginTop: 8 },
  exportButton: { flex: 1, minHeight: 46, borderRadius: 12, backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 6 },
  exportButtonText: { color: colors.teal, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  managementList: { gap: 10 },
  managementCard: { minHeight: 82, backgroundColor: colors.card, borderRadius: 17, padding: 14, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center' },
  managementIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  managementCopy: { flex: 1 },
  managementName: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  managementDetail: { color: colors.muted, fontSize: 11, marginTop: 4 },
  managementAmount: { alignItems: 'flex-end', marginLeft: 8 },
  managementValue: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  managementHint: { color: colors.muted, fontSize: 10, marginTop: 3 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  backButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  detailHeaderCopy: { flex: 1 },
  detailTitle: { color: colors.ink, fontSize: 24, fontWeight: '700', letterSpacing: -0.5 },
  accountHero: { backgroundColor: colors.memeblue, borderRadius: 22, padding: 20, alignItems: 'center', marginBottom: 16 },
  accountHeroIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  accountHeroType: { color: '#B9C9D0', fontSize: 12 },
  accountHeroBalance: { color: '#FFFFFF', fontSize: 32, fontWeight: '700', marginTop: 5 },
  accountHeroLabel: { color: '#A8BDC7', fontSize: 10, letterSpacing: 1, fontWeight: '700', marginTop: 7 },
  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  summaryCard: { flex: 1, backgroundColor: colors.card, borderRadius: 16, padding: 15, borderWidth: 1, borderColor: colors.line },
  summaryLabel: { color: colors.muted, fontSize: 10, letterSpacing: 1, fontWeight: '700', marginBottom: 7 },
  summaryAmount: { color: colors.ink, fontSize: 18, fontWeight: '700' },
  analyticsCard: { backgroundColor: colors.card, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: colors.line, marginBottom: 24 },
  breakdownRow: { marginTop: 14 },
  breakdownLabel: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 },
  breakdownTrack: { height: 8, borderRadius: 5, backgroundColor: '#EDF0EE', overflow: 'hidden' },
  breakdownFill: { height: '100%', borderRadius: 5, backgroundColor: colors.coral },
  activityRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center' },
  activityBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  activityIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  activityCopy: { flex: 1 },
  activityLabel: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  activityDetail: { color: colors.muted, fontSize: 11, marginTop: 4 },
  activityAmount: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  positiveAmount: { color: colors.teal },
  fab: { position: 'absolute', right: 22, bottom: Platform.OS === 'web' ? 91 : 60, width: 57, height: 57, borderRadius: 29, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center', shadowColor: colors.teal, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 8 },
  tabBar: { position: 'absolute', bottom: Platform.OS === 'web' ? 0 : -70, left: 0, right: 0, height: Platform.OS === 'web' ? 78 : 112, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: colors.line, flexDirection: 'row', justifyContent: 'space-around', paddingTop: 11, paddingBottom: Platform.OS === 'web' ? 0 : 34 },
  tabItem: { alignItems: 'center', width: 76, gap: 4 },
  tabLabel: { color: colors.muted, fontSize: 10, fontWeight: '600' },
  tabLabelActive: { color: colors.teal },
  statusText: { color: colors.muted, textAlign: 'center', marginTop: 24, marginBottom: 16, fontSize: 14 },
  loadingBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: colors.tealSoft, borderRadius: 14, paddingVertical: 11, marginBottom: 16 },
  errorText: { color: colors.coral, textAlign: 'center', marginTop: 24, marginBottom: 16, fontSize: 14 },
  inlineEmpty: { width: 250, minHeight: 151, backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', padding: 16 },
  inlineEmptyTitle: { color: colors.ink, fontSize: 14, fontWeight: '700', marginTop: 8 },
  inlineEmptyText: { color: colors.muted, fontSize: 11, textAlign: 'center', lineHeight: 16, marginTop: 4 },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22, paddingVertical: 28 },
  emptyStateIcon: { width: 52, height: 52, borderRadius: 18, backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  emptyStateTitle: { color: colors.ink, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  emptyStateDetail: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 5, maxWidth: 280 },
  emptyStateButton: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.teal, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginTop: 15 },
  emptyStateButtonText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(23,33,43,0.35)' },
  modalDismiss: { flex: 1 },
  sheet: { backgroundColor: colors.canvas, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 28 },
  sheetHandle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: '#CBD3D2', marginBottom: 18 },
  sheetTitle: { color: colors.ink, fontSize: 21, fontWeight: '700', marginBottom: 14 },
  sheetOption: { minHeight: 64, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 9 },
  sheetIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  sheetOptionText: { flex: 1, color: colors.ink, fontSize: 15, fontWeight: '700' },
  cancelButton: { alignItems: 'center', paddingVertical: 15 },
  cancelButtonText: { color: colors.teal, fontSize: 15, fontWeight: '700' },
  formBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(23,33,43,0.35)' },
  formCard: { maxHeight: '94%', backgroundColor: colors.canvas, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 17, paddingBottom: 28 },
  formHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  formTitle: { color: colors.ink, fontSize: 19, fontWeight: '700' },
  amountLabel: { color: colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1.1, marginBottom: 7 },
  amountInputRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.teal, marginBottom: 20 },
  currency: { color: colors.teal, fontSize: 30, fontWeight: '700', paddingBottom: 5 },
  amountInput: { flex: 1, color: colors.ink, fontSize: 34, fontWeight: '700', paddingVertical: 2, paddingLeft: 7 },
  inputLabel: { color: colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginTop: 13, marginBottom: 8 },
  choiceRow: { gap: 8, paddingBottom: 2 },
  choice: { borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, paddingHorizontal: 14, paddingVertical: 11 },
  choiceSelected: { backgroundColor: colors.tealSoft, borderColor: '#A3C4E0' },
  choiceText: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  choiceTextSelected: { color: colors.teal },
  iconPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  iconChoice: { width: '23%', minHeight: 62, borderRadius: 13, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  iconChoiceSelected: { backgroundColor: colors.tealSoft, borderColor: '#A3C4E0' },
  iconChoiceLabel: { color: colors.muted, fontSize: 9, fontWeight: '600', marginTop: 5 },
  iconChoiceLabelSelected: { color: colors.teal },
  textInput: { color: colors.ink, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  validationError: { color: colors.coral, fontSize: 13, marginTop: 12 },
  saveButton: { backgroundColor: colors.teal, borderRadius: 15, alignItems: 'center', justifyContent: 'center', minHeight: 52, marginTop: 22 },
  saveButtonDisabled: { opacity: 0.65 },
  saveButtonText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
