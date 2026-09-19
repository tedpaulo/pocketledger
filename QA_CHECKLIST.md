# Pocket Ledger — QA Runbook

Run `npm run typecheck` before and after testing. Then work through the checklist.
Reset data anytime by exporting a JSON backup first, deleting the app, and re-importing.

## 1 · Accounts (Assets)

- [ ] Add accounts: BDO (₱20,000), Maya (₱5,000), MariBank (₱10,000), Cash (₱2,000) — balances show immediately
- [ ] Add an account with a **negative** opening balance (allowed)
- [ ] Edit an account name/type/icon only — balance must NOT change
- [ ] Edit the **OPENING BALANCE** — current balance shifts by the same delta and stays equal to opening + transactions
- [ ] Delete an account with NO transactions — allowed
- [ ] Delete an account WITH transactions — blocked with a clear message
- [ ] Delete the only account that is the **destination** of a transfer — blocked
- [ ] Home cards show account name + current balance

## 2 · Budgets

- [ ] Add a budget per category (Needs / Wants / Savings) with a monthly limit
- [ ] Edit a budget (name / category / limit)
- [ ] Delete a budget with NO transactions — allowed
- [ ] Delete a budget WITH transactions — blocked with a clear message
- [ ] Home shows `spent` and remaining = limit − spent

## 3 · Expenses (add / edit / delete)

- [ ] Add expense → asset decreases, budget remaining decreases, appears in Activity
- [ ] Edit expense **amount only** → budget + asset recalculated correctly
- [ ] Edit expense to a **different account** → old account restored, new account debited
- [ ] Edit expense to a **different budget** → old budget released, new budget charged
- [ ] Edit expense date to a different month → month history updates; budget cleared if no matching monthly budget
- [ ] Delete expense → asset top-up + budget remaining increase
- [ ] Expense larger than remaining budget → **allowed**, remaining goes negative
- [ ] Expense large enough to make the account balance negative → **allowed**

## 4 · Income

- [ ] Add income → asset increases, no budget affected
- [ ] Edit income (amount / account / date) → reverses correctly
- [ ] Delete income → asset decreases back

## 5 · Transfers

- [ ] Transfer with **Other** → from decreases, to increases, budgets untouched
- [ ] Transfer with **Future you** → from decreases, to increases, **Savings budget decreases**
- [ ] From/To cannot be the same account (validation)
- [ ] Edit transfer: change amount, accounts, or purpose Future-you ↔ Other → both balances AND budget effects reverse/applied correctly
- [ ] Delete transfer → both accounts restored, no budget residue

## 6 · Savings contributions

- [ ] Savings contribution moves from BDO → MariBank and reduces the Savings budget
- [ ] Edit / delete a savings contribution reverses the money movement AND the budget effect

## 7 · History & months

- [ ] Activity tab shows the selected month only; previous/next month navigation works
- [ ] Backdated transactions land in the right month
- [ ] Account detail month picker filters its transactions
- [ ] Home recent activity matches the selected month

## 8 · Empty states & reload

- [ ] Fresh install shows empty states with working "Add" actions
- [ ] Kill the app and reopen → all data is still there; balances match opening + transactions (self-healing recompute)
- [ ] Manually corrupt one balance via a SQLite tool → reopening the app corrects it

## 9 · Export / Import (new)

- [ ] **{this month} CSV** exports only that month, one row per transfer, has `type`, `month`, and `related_account` columns
- [ ] **All months CSV** exports everything (no duplicate `-destination` rows)
- [ ] **Full JSON backup** shares a readable file
- [ ] **Restore JSON backup**: pick the file → confirm dialog shows counts → safety backup written → data replaced → balances recomputed
- [ ] Restore a file made **before this update** (no initial balance) → current balances preserved
- [ ] Restore: tap Cancel on the picker → nothing changes
- [ ] Restore: pick a non-JSON file / invalid JSON → clear error, database untouched
- [ ] Restore: backup missing an account the transactions refer to → rejected with a clear message
- [ ] After restore, exit and reopen the app → sample seed data does NOT come back

## 10 · Misc

- [ ] Add button (lower-left FAB) opens the transaction picker for all four types
- [ ] No authentication anywhere; single user
- [ ] `npm run typecheck` passes