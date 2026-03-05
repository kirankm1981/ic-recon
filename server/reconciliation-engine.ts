import { storage } from "./storage";
import type { Transaction, Rule } from "@shared/schema";

const STOP_WORDS = new Set([
  "being", "amount", "paid", "received", "transferred", "payment", "towards",
  "against", "invoice", "bills", "bill", "vide", "per", "mail", "attachment",
  "the", "and", "for", "from", "with", "pvt", "ltd", "private", "limited",
  "party", "inv", "no", "dt", "dated", "cgst", "sgst", "igst", "tds",
  "project", "services", "creditors", "sundry", "other", "related", "parties",
  "infrastructure", "habitat", "community", "development", "management",
  "property", "assetz", "apg", "rp", "pr",
]);

function extractReferences(narration: string): string[] {
  if (!narration) return [];
  const patterns = [
    /(?:inv(?:oice)?\.?\s*(?:no\.?|#)\s*[-:]?\s*)([A-Z0-9][A-Z0-9/\-]{3,})/gi,
    /(?:party\s+inv\.?\s*no\.?\s*[-:]?\s*)([A-Z0-9][A-Z0-9/\-]{3,})/gi,
    /([A-Z]{2,}\d{2,}\/\d{4,}\/\d{2}-\d{2})/g,
    /([A-Z]{3,}\/\d{4,}\/\d{2}-\d{2})/g,
  ];
  const refs = new Set<string>();
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(narration)) !== null) {
      const ref = match[1].toUpperCase().trim();
      if (ref.length >= 4) {
        refs.add(ref);
      }
    }
  }
  return Array.from(refs);
}

function extractDocumentRef(docNo: string | null): string | null {
  if (!docNo || docNo.trim().length < 4) return null;
  return docNo.trim().toUpperCase();
}

function parseSerialDate(dateVal: string | null): Date | null {
  if (!dateVal) return null;
  const num = parseFloat(dateVal);
  if (!isNaN(num) && num > 40000 && num < 60000) {
    const epoch = new Date(1899, 11, 30);
    epoch.setDate(epoch.getDate() + num);
    return epoch;
  }
  const parsed = new Date(dateVal);
  if (!isNaN(parsed.getTime())) return parsed;
  return null;
}

function dateDiffDays(d1: Date, d2: Date): number {
  return Math.abs(Math.floor((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24)));
}

function fuzzyMatch(s1: string, s2: string): number {
  if (!s1 || !s2) return 0;
  const a = s1.toLowerCase().replace(/[^a-z0-9 ]/g, "");
  const b = s2.toLowerCase().replace(/[^a-z0-9 ]/g, "");
  if (a === b) return 100;

  const wordsA = new Set(
    a.split(/\s+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w))
  );
  const wordsB = new Set(
    b.split(/\s+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w))
  );
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let commonCount = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) commonCount++;
  }

  const totalUnique = new Set([...wordsA, ...wordsB]).size;
  return Math.round((commonCount / totalUnique) * 100);
}

let reconCounter = 0;

async function initReconCounter(): Promise<void> {
  const groups = await storage.getReconGroups();
  let maxNum = 0;
  for (const g of groups) {
    const match = g.reconId.match(/^REC-(\d+)$/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > maxNum) maxNum = n;
    }
  }
  reconCounter = maxNum;
}

function generateReconId(): string {
  reconCounter++;
  return `REC-${String(reconCounter).padStart(4, "0")}`;
}

interface MatchCandidate {
  debitTxn: Transaction;
  creditTxn: Transaction;
}

export async function runReconciliation(): Promise<{
  totalMatched: number;
  ruleResults: { rule: string; matched: number }[];
}> {
  await storage.resetReconciliation();
  reconCounter = 0;

  const rules = await storage.getActiveRules();
  const allTxns = await storage.getTransactions();

  const unmatchedIds = new Set(allTxns.map((t) => t.id));
  const ruleResults: { rule: string; matched: number }[] = [];
  let totalMatched = 0;

  const txnMap = new Map<number, Transaction>();
  for (const t of allTxns) txnMap.set(t.id, t);

  for (const rule of rules) {
    const matchedInRule = await applyRule(rule, txnMap, unmatchedIds);
    ruleResults.push({ rule: rule.name, matched: matchedInRule });
    totalMatched += matchedInRule;
  }

  return { totalMatched, ruleResults };
}

async function applyRule(
  rule: Rule,
  txnMap: Map<number, Transaction>,
  unmatchedIds: Set<number>
): Promise<number> {
  let matched = 0;

  const unmatched = Array.from(unmatchedIds)
    .map((id) => txnMap.get(id)!)
    .filter(Boolean);

  const pairs = buildCounterpartyPairs(unmatched);

  for (const { company, counterParty, debitTxns, creditTxns } of pairs) {
    switch (rule.ruleType) {
      case "exact_match":
        matched += await exactMatch(debitTxns, creditTxns, unmatchedIds, rule.name, txnMap);
        break;
      case "date_tolerance":
        matched += await dateToleranceMatch(
          debitTxns, creditTxns, unmatchedIds, rule.name, rule.threshold || 1, txnMap
        );
        break;
      case "reference_match":
        matched += await referenceMatch(debitTxns, creditTxns, unmatchedIds, rule.name, txnMap);
        break;
      case "narration_match":
        matched += await narrationMatch(
          debitTxns, creditTxns, unmatchedIds, rule.name, rule.threshold || 80, txnMap
        );
        break;
      case "one_to_many":
        matched += await oneToManyMatch(debitTxns, creditTxns, unmatchedIds, rule.name, txnMap);
        break;
      case "many_to_one":
        matched += await manyToOneMatch(debitTxns, creditTxns, unmatchedIds, rule.name, txnMap);
        break;
      case "amount_tolerance":
        matched += await amountToleranceMatch(
          debitTxns, creditTxns, unmatchedIds, rule.name, rule.threshold || 1, txnMap
        );
        break;
    }
  }

  return matched;
}

interface PairGroup {
  company: string;
  counterParty: string;
  debitTxns: Transaction[];
  creditTxns: Transaction[];
}

function buildCounterpartyPairs(txns: Transaction[]): PairGroup[] {
  const pairMap = new Map<string, { debitTxns: Transaction[]; creditTxns: Transaction[] }>();

  for (const t of txns) {
    const key1 = `${t.company}||${t.counterParty}`;
    const key2 = `${t.counterParty}||${t.company}`;

    const normalizedKey = key1 < key2 ? key1 : key2;

    if (!pairMap.has(normalizedKey)) {
      pairMap.set(normalizedKey, { debitTxns: [], creditTxns: [] });
    }

    const group = pairMap.get(normalizedKey)!;
    if ((t.debit || 0) > 0) {
      group.debitTxns.push(t);
    } else if ((t.credit || 0) > 0) {
      group.creditTxns.push(t);
    }
  }

  return Array.from(pairMap.entries()).map(([key, group]) => {
    const [company, counterParty] = key.split("||");
    return { company, counterParty, ...group };
  });
}

async function matchTransactions(
  txnIds: number[],
  unmatchedIds: Set<number>,
  ruleName: string,
  txnMap: Map<number, Transaction>
): Promise<void> {
  const reconId = generateReconId();

  let totalDebit = 0;
  let totalCredit = 0;

  for (const id of txnIds) {
    const txn = txnMap.get(id);
    if (txn) {
      totalDebit += txn.debit || 0;
      totalCredit += txn.credit || 0;
    }
  }

  await storage.updateTransactionRecon(txnIds, reconId, ruleName, "matched");

  for (const id of txnIds) {
    unmatchedIds.delete(id);
  }

  await storage.insertReconGroup({
    reconId,
    ruleName,
    totalDebit,
    totalCredit,
    transactionCount: txnIds.length,
    status: "matched",
  });
}

async function exactMatch(
  debitTxns: Transaction[],
  creditTxns: Transaction[],
  unmatchedIds: Set<number>,
  ruleName: string,
  txnMap: Map<number, Transaction>
): Promise<number> {
  let matched = 0;
  const usedCredits = new Set<number>();

  for (const dt of debitTxns) {
    if (!unmatchedIds.has(dt.id)) continue;
    const amount = dt.debit || dt.netAmount || 0;
    if (amount === 0) continue;

    for (const ct of creditTxns) {
      if (!unmatchedIds.has(ct.id) || usedCredits.has(ct.id)) continue;
      const creditAmt = ct.credit || Math.abs(ct.netAmount || 0);

      const dtDate = parseSerialDate(dt.docDate);
      const ctDate = parseSerialDate(ct.docDate);

      if (
        Math.abs(amount - creditAmt) < 0.01 &&
        dtDate &&
        ctDate &&
        dateDiffDays(dtDate, ctDate) === 0
      ) {
        await matchTransactions([dt.id, ct.id], unmatchedIds, ruleName, txnMap);
        usedCredits.add(ct.id);
        matched += 2;
        break;
      }
    }
  }
  return matched;
}

async function dateToleranceMatch(
  debitTxns: Transaction[],
  creditTxns: Transaction[],
  unmatchedIds: Set<number>,
  ruleName: string,
  tolerance: number,
  txnMap: Map<number, Transaction>
): Promise<number> {
  let matched = 0;
  const usedCredits = new Set<number>();

  for (const dt of debitTxns) {
    if (!unmatchedIds.has(dt.id)) continue;
    const amount = dt.debit || dt.netAmount || 0;
    if (amount === 0) continue;

    for (const ct of creditTxns) {
      if (!unmatchedIds.has(ct.id) || usedCredits.has(ct.id)) continue;
      const creditAmt = ct.credit || Math.abs(ct.netAmount || 0);

      const dtDate = parseSerialDate(dt.docDate);
      const ctDate = parseSerialDate(ct.docDate);

      if (
        Math.abs(amount - creditAmt) < 0.01 &&
        dtDate &&
        ctDate &&
        dateDiffDays(dtDate, ctDate) <= tolerance
      ) {
        await matchTransactions([dt.id, ct.id], unmatchedIds, ruleName, txnMap);
        usedCredits.add(ct.id);
        matched += 2;
        break;
      }
    }
  }
  return matched;
}

async function referenceMatch(
  debitTxns: Transaction[],
  creditTxns: Transaction[],
  unmatchedIds: Set<number>,
  ruleName: string,
  txnMap: Map<number, Transaction>
): Promise<number> {
  let matched = 0;
  const usedCredits = new Set<number>();

  for (const dt of debitTxns) {
    if (!unmatchedIds.has(dt.id)) continue;

    const dtNarrationRefs = extractReferences(dt.narration || "");
    const dtDocRef = extractDocumentRef(dt.documentNo);
    const dtAllRefs = new Set<string>([...dtNarrationRefs]);
    if (dtDocRef) dtAllRefs.add(dtDocRef);

    if (dtAllRefs.size === 0) continue;

    for (const ct of creditTxns) {
      if (!unmatchedIds.has(ct.id) || usedCredits.has(ct.id)) continue;

      const ctNarrationRefs = extractReferences(ct.narration || "");
      const ctDocRef = extractDocumentRef(ct.documentNo);
      const ctAllRefs = new Set<string>([...ctNarrationRefs]);
      if (ctDocRef) ctAllRefs.add(ctDocRef);

      let hasStrongRef = false;
      for (const ref of dtAllRefs) {
        if (ctAllRefs.has(ref) && ref.length >= 4) {
          hasStrongRef = true;
          break;
        }
      }

      if (!hasStrongRef && dtDocRef && ctDocRef) {
        const dtInCtNarration = (ct.narration || "").toUpperCase().includes(dtDocRef);
        const ctInDtNarration = (dt.narration || "").toUpperCase().includes(ctDocRef);
        if (dtInCtNarration || ctInDtNarration) {
          hasStrongRef = true;
        }
      }

      if (hasStrongRef) {
        await matchTransactions([dt.id, ct.id], unmatchedIds, ruleName, txnMap);
        usedCredits.add(ct.id);
        matched += 2;
        break;
      }
    }
  }
  return matched;
}

async function narrationMatch(
  debitTxns: Transaction[],
  creditTxns: Transaction[],
  unmatchedIds: Set<number>,
  ruleName: string,
  threshold: number,
  txnMap: Map<number, Transaction>
): Promise<number> {
  let matched = 0;
  const usedCredits = new Set<number>();

  for (const dt of debitTxns) {
    if (!unmatchedIds.has(dt.id)) continue;
    const amount = dt.debit || dt.netAmount || 0;
    if (amount === 0) continue;

    let bestMatch: Transaction | null = null;
    let bestScore = 0;

    for (const ct of creditTxns) {
      if (!unmatchedIds.has(ct.id) || usedCredits.has(ct.id)) continue;
      const creditAmt = ct.credit || Math.abs(ct.netAmount || 0);

      if (Math.abs(amount - creditAmt) < 0.01) {
        const score = fuzzyMatch(dt.narration || "", ct.narration || "");
        if (score >= threshold && score > bestScore) {
          bestScore = score;
          bestMatch = ct;
        }
      }
    }

    if (bestMatch) {
      await matchTransactions([dt.id, bestMatch.id], unmatchedIds, ruleName, txnMap);
      usedCredits.add(bestMatch.id);
      matched += 2;
    }
  }
  return matched;
}

async function oneToManyMatch(
  debitTxns: Transaction[],
  creditTxns: Transaction[],
  unmatchedIds: Set<number>,
  ruleName: string,
  txnMap: Map<number, Transaction>
): Promise<number> {
  let matched = 0;

  for (const dt of debitTxns) {
    if (!unmatchedIds.has(dt.id)) continue;
    const targetAmount = dt.debit || dt.netAmount || 0;
    if (targetAmount === 0) continue;

    const availableCredits = creditTxns.filter((ct) => unmatchedIds.has(ct.id));
    const combination = findSubsetSum(availableCredits, targetAmount, "credit");

    if (combination.length >= 2) {
      const ids = [dt.id, ...combination.map((c) => c.id)];
      await matchTransactions(ids, unmatchedIds, ruleName, txnMap);
      matched += ids.length;
    }
  }
  return matched;
}

async function manyToOneMatch(
  debitTxns: Transaction[],
  creditTxns: Transaction[],
  unmatchedIds: Set<number>,
  ruleName: string,
  txnMap: Map<number, Transaction>
): Promise<number> {
  let matched = 0;

  for (const ct of creditTxns) {
    if (!unmatchedIds.has(ct.id)) continue;
    const targetAmount = ct.credit || Math.abs(ct.netAmount || 0);
    if (targetAmount === 0) continue;

    const availableDebits = debitTxns.filter((dt) => unmatchedIds.has(dt.id));
    const combination = findSubsetSum(availableDebits, targetAmount, "debit");

    if (combination.length >= 2) {
      const ids = [ct.id, ...combination.map((d) => d.id)];
      await matchTransactions(ids, unmatchedIds, ruleName, txnMap);
      matched += ids.length;
    }
  }
  return matched;
}

async function amountToleranceMatch(
  debitTxns: Transaction[],
  creditTxns: Transaction[],
  unmatchedIds: Set<number>,
  ruleName: string,
  tolerancePct: number,
  txnMap: Map<number, Transaction>
): Promise<number> {
  let matched = 0;
  const usedCredits = new Set<number>();

  for (const dt of debitTxns) {
    if (!unmatchedIds.has(dt.id)) continue;
    const amount = dt.debit || dt.netAmount || 0;
    if (amount === 0) continue;

    for (const ct of creditTxns) {
      if (!unmatchedIds.has(ct.id) || usedCredits.has(ct.id)) continue;
      const creditAmt = ct.credit || Math.abs(ct.netAmount || 0);
      const diff = Math.abs(amount - creditAmt);
      const pctDiff = (diff / amount) * 100;

      if (pctDiff <= tolerancePct) {
        await matchTransactions([dt.id, ct.id], unmatchedIds, ruleName, txnMap);
        usedCredits.add(ct.id);
        matched += 2;
        break;
      }
    }
  }
  return matched;
}

function findSubsetSum(
  txns: Transaction[],
  target: number,
  field: "debit" | "credit"
): Transaction[] {
  const sorted = txns
    .map((t) => ({
      txn: t,
      amount: field === "debit" ? t.debit || t.netAmount || 0 : t.credit || Math.abs(t.netAmount || 0),
    }))
    .filter((x) => x.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  if (sorted.length > 20) return [];

  for (let size = 2; size <= Math.min(sorted.length, 5); size++) {
    const result = findCombination(sorted, target, size);
    if (result) return result.map((x) => x.txn);
  }
  return [];
}

function findCombination(
  items: { txn: Transaction; amount: number }[],
  target: number,
  size: number,
  start = 0,
  current: { txn: Transaction; amount: number }[] = []
): { txn: Transaction; amount: number }[] | null {
  if (current.length === size) {
    const sum = current.reduce((s, x) => s + x.amount, 0);
    if (Math.abs(sum - target) < 0.01) return [...current];
    return null;
  }

  for (let i = start; i < items.length; i++) {
    current.push(items[i]);
    const result = findCombination(items, target, size, i + 1, current);
    if (result) return result;
    current.pop();
  }
  return null;
}
