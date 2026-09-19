export type Asset = {
  id: string;
  name: string;
  type: string;
  /** Balance the account started with. Balance always equals initial + all its transactions. */
  initialBalanceCents: number;
  balanceCents: number;
  icon: string;
  createdAt: string;
};

export type Budget = {
  id: string;
  name: string;
  category: string;
  limitCents: number;
  color: string;
  month: string;
  spentCents: number;
};

export type Transaction = {
  id: string;
  assetId: string;
  budgetId: string | null;
  description: string;
  amountCents: number;
  category: string;
  occurredAt: string;
  icon: string;
};
