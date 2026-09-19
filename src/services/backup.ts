import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { getDatabase } from '../db/database';
import { backupToJson, transactionsToCsv } from '../db/exports';
import { getExportData } from '../db/repositories';

export type ExportFormat = 'csv' | 'json';

function downloadFileWeb(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function exportFinanceData(format: ExportFormat, scope?: { month?: string }): Promise<void> {
  const data = await getExportData(await getDatabase());
  const extension = format === 'csv' ? 'csv' : 'json';
  const filename = format === 'csv' && scope?.month
    ? `pocket-ledger-${scope.month}.csv`
    : `pocket-ledger-${new Date().toISOString().slice(0, 10)}.${extension}`;
  const content = format === 'csv' ? transactionsToCsv(data, scope) : backupToJson(data);

  if (Platform.OS === 'web') {
    // Browser: download the file directly (share sheet isn't available on web).
    downloadFileWeb(filename, content, format === 'csv' ? 'text/csv' : 'application/json');
    return;
  }

  const directory = FileSystem.cacheDirectory;
  if (!directory) throw new Error('File storage is unavailable on this device.');
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is unavailable on this device.');
  const uri = `${directory}${filename}`;
  await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });
  await Sharing.shareAsync(uri, {
    mimeType: format === 'csv' ? 'text/csv' : 'application/json',
    dialogTitle: format === 'csv' ? 'Export transactions' : 'Back up Pocket Ledger',
    UTI: format === 'csv' ? 'public.comma-separated-values-text' : 'public.json',
  });
}
