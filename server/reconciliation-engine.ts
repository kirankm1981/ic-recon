import { storage } from "./storage";
import type { SummarizedLine, Rule } from "@shared/schema";

function extractReferences(narration: string): string[] {
  if (!narration) return [];
  const patterns = [
    /(?:inv(?:oice)?\.?\s*(?:no\.?|#)\s*[-:]?\s*)([A-Z0-9][A-Z0-9/\-]{3,})/gi,
    /(?:party\s+inv\.?\s*no\.?\s*[-:]?\s*)([A-Z0-9][A-Z0-9/\-]{3,})/gi,
    /(?:no\.?\s*)([A-Z]{2,}[/\-]?\d{3,}[/\-]\d{2,}(?:-\d{2})?)/gi,
    /([A-Z]{2,}\d{2,}\/\d{3,}\/\d{2}-\d{2})/g,
    /([A-Z]{2,}\/\d{3,}\/\d{2}-\d{2})/g,
    /\b([A-Z]{2,}\d{2,}\/\d{3,}\/\d{2,})\b/g,
  ];
  const refs = new Set<string>();
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(narration)) !== null) {
      const ref = (match[1] || match[0]).toUpperCase().trim();
      if (ref.length >= 4) refs.add(ref);
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
  const ddMmmYy = dateVal.match(/^(\d{2})-([A-Za-z]{3})-(\d{2})$/);
  if (ddMmmYy) {
    const parsed2 = new Date(`${ddMmmYy[1]} ${ddMmmYy[2]} 20${ddMmmYy[3]}`);
    if (!isNaN(parsed2.getTime())) return parsed2;
  }
  return null;
}

function dateDiffDays(d1: Date, d2: Date): number {
  return Math.abs(Math.floor((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24)));
}

function normalizeCompanyName(name: string): string {
  return (name || "").trim().toUpperCase().replace(/\s+/g, " ");
}

function amountsMatch(a: number, b: number, tolerance: number, tolerancePct: number): boolean {
  const diff = Math.abs(a - b);
  if (diff < 0.01) return true;
  if (tolerance > 0 && diff <= tolerance) return true;
  if (tolerancePct > 0 && diff <= Math.max(a, b) * tolerancePct) return true;
  return false;
}

function levenshteinSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  a = a.toLowerCase().replace(/\s+/g, " ").trim();
  b = b.toLowerCase().replace(/\s+/g, " ").trim();
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const matrix: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
    for (let j = 1; j <= b.length; j++) {
      if (i === 0) { matrix[i][j] = j; continue; }
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return 1 - matrix[a.length][b.length] / maxLen;
}

let reconCounter = 0;

function generateReconId(): string {
  reconCounter++;
  return `REC-${String(reconCounter).padStart(4, "0")}`;
}

interface PairGroup {
  companyA: string;
  companyB: string;
  positiveSide: SummarizedLine[];
  negativeSide: SummarizedLine[];
}

function extractCounterPartyFromNarration(narration: string | null, ownCompany: string, entityNames: string[]): string | null {
  if (!narration || narration.trim().length < 10) return null;
  const narrLower = narration.toLowerCase();

  for (const entity of entityNames) {
    if (normalizeCompanyName(entity) === normalizeCompanyName(ownCompany)) continue;
    const entityLower = entity.toLowerCase();
    const significantWords = entityLower.split(/[\s,.()\-\/]+/).filter(w => w.length > 3);
    const skipWords = new Set(["private", "limited", "formerly", "known", "services", "pvt", "ltd", "the",
      "being", "amount", "paid", "received", "transferred", "towards", "from", "against", "entry", "passed"]);
    const meaningful = significantWords.filter(w => !skipWords.has(w));
    if (meaningful.length === 0) continue;

    const matchedWords = meaningful.filter(w => narrLower.includes(w));
    if (matchedWords.length >= Math.max(1, Math.ceil(meaningful.length * 0.5))) {
      return entity;
    }
  }

  const knownAbbreviations: Record<string, string> = {};
  for (const entity of entityNames) {
    const upper = entity.toUpperCase();
    if (upper.includes("ASSETZ") && !upper.includes("INFRASTRUCTURE") && !upper.includes("PROPERTY") && !upper.includes("MANAGEMENT")) {
      knownAbbreviations["apl"] = entity;
      knownAbbreviations["assetz private"] = entity;
    }
    if (upper.includes("PROPERTY") && upper.includes("MANAGEMENT")) {
      knownAbbreviations["apms"] = entity;
      knownAbbreviations["apm"] = entity;
    }
    if (upper.includes("HABITAT")) {
      knownAbbreviations["ahpl"] = entity;
    }
    if (upper.includes("INFRASTRUCTURE")) {
      knownAbbreviations["aipl"] = entity;
    }
    if (upper.includes("COMMUNITY") && upper.includes("DEVELOPMENT")) {
      knownAbbreviations["acdpl"] = entity;
    }
  }

  for (const [abbr, entity] of Object.entries(knownAbbreviations)) {
    if (normalizeCompanyName(entity) === normalizeCompanyName(ownCompany)) continue;
    if (abbr.length <= 4) {
      const pattern = new RegExp(`\\b(?:to|from|of)\\s+${abbr}\\b`, "i");
      if (pattern.test(narrLower)) return entity;
    } else {
      if (narrLower.includes(abbr)) return entity;
    }
  }

  const invoicePrefixes = narrLower.match(/\b([a-z]{2,5})\/\d{3,}/g) || [];
  for (const match of invoicePrefixes) {
    const prefix = match.split("/")[0].toLowerCase();
    if (knownAbbreviations[prefix]) {
      const entity = knownAbbreviations[prefix];
      if (normalizeCompanyName(entity) !== normalizeCompanyName(ownCompany)) {
        return entity;
      }
    }
  }

  return null;
}

async function fixSameEntityLines(allLines: SummarizedLine[]): Promise<number> {
  const entityNames = [...new Set(allLines.map(l => l.company).concat(allLines.map(l => l.counterParty)))];
  let fixed = 0;

  for (const line of allLines) {
    if (normalizeCompanyName(line.company) !== normalizeCompanyName(line.counterParty)) continue;

    const newCP = extractCounterPartyFromNarration(line.narration, line.company, entityNames);
    if (newCP) {
      await storage.updateSummarizedLineCounterParty(line.id, newCP);
      line.counterParty = newCP;
      fixed++;
    }
  }

  return fixed;
}

export async function runReconciliation(): Promise<{
  totalMatched: number;
  ruleResults: { rule: string; matched: number }[];
}> {
  await storage.resetSummarizedLines();
  reconCounter = 0;

  const rules = await storage.getActiveRules();
  const allLines = await storage.getSummarizedLines();

  const sameEntityFixed = await fixSameEntityLines(allLines);
  if (sameEntityFixed > 0) {
    console.log(`[Reconciliation] Fixed ${sameEntityFixed} same-entity lines by extracting counter-party from narration`);
  }

  const unmatchedIds = new Set(allLines.map((t) => t.id));
  const ruleResults: { rule: string; matched: number }[] = [];
  let totalMatched = 0;

  const lineMap = new Map<number, SummarizedLine>();
  for (const t of allLines) lineMap.set(t.id, t);

  console.log(`[Reconciliation] Starting with ${allLines.length} summarized lines`);
  console.log(`[Reconciliation] Active rules: ${rules.map(r => `${r.priority}:${r.ruleId}(${r.ruleType})`).join(', ')}`);

  for (const rule of rules) {
    const before = unmatchedIds.size;
    const matchedInRule = await applyRule(rule, lineMap, unmatchedIds);
    ruleResults.push({ rule: rule.name, matched: matchedInRule });
    totalMatched += matchedInRule;
    console.log(`[Reconciliation] ${rule.ruleId} "${rule.name}" (${rule.ruleType}): matched ${matchedInRule} lines (${before} -> ${unmatchedIds.size} unmatched)`);
  }

  console.log(`[Reconciliation] Complete: ${totalMatched} matched, ${unmatchedIds.size} remaining unmatched`);
  return { totalMatched, ruleResults };
}

async function applyRule(
  rule: Rule,
  lineMap: Map<number, SummarizedLine>,
  unmatchedIds: Set<number>
): Promise<number> {
  let matched = 0;
  const amtTol = rule.amountTolerance || 0;
  const amtTolPct = rule.amountTolerancePct || 0;
  const dateTol = rule.dateTolerance;
  const classification = rule.classification || "AUTO_MATCH";
  const status = classificationToStatus(classification);

  if (rule.ruleType === "reversal_match") {
    const unmatched = Array.from(unmatchedIds)
      .map((id) => lineMap.get(id)!)
      .filter(Boolean);
    matched += await reversalMatch(unmatched, unmatchedIds, rule.name, dateTol ?? 5, amtTol, amtTolPct, lineMap, status);
    return matched;
  }

  const unmatched = Array.from(unmatchedIds)
    .map((id) => lineMap.get(id)!)
    .filter(Boolean);
  const pairs = buildCounterpartyPairs(unmatched);

  for (const { positiveSide, negativeSide } of pairs) {
    switch (rule.ruleType) {
      case "invoice_match":
        matched += await invoiceNarrationMatch(positiveSide, negativeSide, unmatchedIds, rule.name, amtTol, amtTolPct, lineMap, status);
        break;
      case "exact_match":
        matched += await dateAmountMatch(positiveSide, negativeSide, unmatchedIds, rule.name, 0, amtTol, amtTolPct, lineMap, status);
        break;
      case "date_range_match":
        matched += await dateAmountMatch(positiveSide, negativeSide, unmatchedIds, rule.name, dateTol ?? 5, amtTol, amtTolPct, lineMap, status);
        break;
      case "exact_aggregation":
        matched += await dateAmountAggregation(positiveSide, negativeSide, unmatchedIds, rule.name, 0, amtTol, amtTolPct, lineMap, status);
        matched += await manyToManyAggregation(positiveSide, negativeSide, unmatchedIds, rule.name, 0, amtTol, amtTolPct, lineMap, status);
        break;
      case "date_range_aggregation":
        matched += await dateAmountAggregation(positiveSide, negativeSide, unmatchedIds, rule.name, dateTol ?? 5, amtTol, amtTolPct, lineMap, status);
        matched += await manyToManyAggregation(positiveSide, negativeSide, unmatchedIds, rule.name, dateTol ?? 5, amtTol, amtTolPct, lineMap, status);
        break;
      case "amount_only_match":
        matched += await dateAmountMatch(positiveSide, negativeSide, unmatchedIds, rule.name, null, amtTol, amtTolPct, lineMap, status);
        break;
      case "fuzzy_narration_match": {
        let params: any = {};
        try { if (rule.params) params = JSON.parse(rule.params); } catch {}
        matched += await fuzzyNarrationMatch(positiveSide, negativeSide, unmatchedIds, rule.name, amtTol, amtTolPct, lineMap, status, params.fuzzyThreshold || 0.8, params.minNarrationLength || 20);
        break;
      }
      case "amount_only_aggregation":
        matched += await dateAmountAggregation(positiveSide, negativeSide, unmatchedIds, rule.name, null, amtTol, amtTolPct, lineMap, status);
        matched += await manyToManyAggregation(positiveSide, negativeSide, unmatchedIds, rule.name, null, amtTol, amtTolPct, lineMap, status);
        break;
      case "combined_scoring": {
        let params: any = {};
        try { if (rule.params) params = JSON.parse(rule.params); } catch {}
        matched += await combinedScoringMatch(positiveSide, negativeSide, unmatchedIds, rule.name, lineMap, status, params);
        break;
      }
    }
  }

  if (["exact_aggregation", "date_range_aggregation", "amount_only_aggregation"].includes(rule.ruleType)) {
    const currentUnmatched = Array.from(unmatchedIds)
      .map((id) => lineMap.get(id)!)
      .filter(Boolean);
    const netOffPairs = buildNetOffPairs(currentUnmatched);
    const netOffDateTol = rule.ruleType === "exact_aggregation" ? 0 : rule.ruleType === "date_range_aggregation" ? (dateTol ?? 5) : null;
    for (const { sameDirectionLines, reverseTargetLines } of netOffPairs) {
      matched += await netOffAggregationMatch(sameDirectionLines, reverseTargetLines, unmatchedIds, rule.name, netOffDateTol, amtTol, amtTolPct, lineMap, status);
    }
  }

  return matched;
}

function classificationToStatus(classification: string): string {
  switch (classification) {
    case "AUTO_MATCH": return "matched";
    case "REVERSAL": return "reversal";
    case "REVIEW_MATCH": return "review_match";
    case "SUGGESTED_MATCH": return "suggested_match";
    default: return "matched";
  }
}

interface NetOffPairGroup {
  companyA: string;
  companyB: string;
  sameDirectionLines: SummarizedLine[];
  reverseTargetLines: SummarizedLine[];
}

function buildNetOffPairs(lines: SummarizedLine[]): NetOffPairGroup[] {
  const directionMap = new Map<string, SummarizedLine[]>();
  for (const t of lines) {
    const normCompany = normalizeCompanyName(t.company);
    const normCounter = normalizeCompanyName(t.counterParty);
    if (!normCompany || !normCounter || normCompany === normCounter) continue;
    const dirKey = `${normCompany}||${normCounter}`;
    if (!directionMap.has(dirKey)) directionMap.set(dirKey, []);
    directionMap.get(dirKey)!.push(t);
  }

  const results: NetOffPairGroup[] = [];
  const processed = new Set<string>();

  for (const [dirKey, dirLines] of directionMap) {
    const [normA, normB] = dirKey.split("||");
    const reverseKey = `${normB}||${normA}`;
    const crossKey = [dirKey, reverseKey].sort().join("@@");
    if (processed.has(crossKey)) continue;
    if (!directionMap.has(reverseKey)) continue;
    processed.add(crossKey);

    const reverseLines = directionMap.get(reverseKey)!;

    const dirPos = dirLines.filter(t => (t.netAmount || 0) > 0);
    const dirNeg = dirLines.filter(t => (t.netAmount || 0) < 0);
    if (dirPos.length > 0 && dirNeg.length > 0) {
      results.push({
        companyA: normA,
        companyB: normB,
        sameDirectionLines: dirLines,
        reverseTargetLines: reverseLines,
      });
    }

    const revPos = reverseLines.filter(t => (t.netAmount || 0) > 0);
    const revNeg = reverseLines.filter(t => (t.netAmount || 0) < 0);
    if (revPos.length > 0 && revNeg.length > 0) {
      results.push({
        companyA: normB,
        companyB: normA,
        sameDirectionLines: reverseLines,
        reverseTargetLines: dirLines,
      });
    }
  }

  return results;
}

async function netOffAggregationMatch(
  sameDir: SummarizedLine[],
  reverseTargets: SummarizedLine[],
  unmatchedIds: Set<number>,
  ruleName: string,
  dateTolerance: number | null,
  amtTol: number,
  amtTolPct: number,
  lineMap: Map<number, SummarizedLine>,
  status: string
): Promise<number> {
  let matched = 0;

  const availSameDir = sameDir.filter(t => unmatchedIds.has(t.id) && (t.netAmount || 0) !== 0);
  const availReverse = reverseTargets.filter(t => unmatchedIds.has(t.id) && (t.netAmount || 0) !== 0);

  if (availSameDir.length < 2 || availReverse.length === 0) return 0;

  const sameDirPos = availSameDir.filter(t => (t.netAmount || 0) > 0);
  const sameDirNeg = availSameDir.filter(t => (t.netAmount || 0) < 0);
  if (sameDirPos.length === 0 || sameDirNeg.length === 0) return 0;

  for (const target of availReverse) {
    if (!unmatchedIds.has(target.id)) continue;
    const targetAmt = Math.abs(target.netAmount || 0);
    if (targetAmt === 0) continue;
    const targetDate = parseSerialDate(target.docDate);
    let targetMatched = false;

    for (const pos of sameDirPos) {
      if (!unmatchedIds.has(pos.id)) continue;
      for (const neg of sameDirNeg) {
        if (!unmatchedIds.has(neg.id)) continue;
        const netAmt = Math.abs(pos.netAmount + neg.netAmount);
        if (!amountsMatch(netAmt, targetAmt, amtTol, amtTolPct)) continue;

        if (dateTolerance !== null && targetDate) {
          const posDate = parseSerialDate(pos.docDate);
          const negDate = parseSerialDate(neg.docDate);
          if (posDate && dateDiffDays(posDate, targetDate) > dateTolerance) continue;
          if (negDate && dateDiffDays(negDate, targetDate) > dateTolerance) continue;
        }

        await matchLines([pos.id, neg.id, target.id], unmatchedIds, ruleName, lineMap, status);
        matched += 3;
        targetMatched = true;
        break;
      }
      if (targetMatched) break;
    }
  }

  return matched;
}

function buildDirectionMap(lines: SummarizedLine[]): Map<string, SummarizedLine[]> {
  const directionMap = new Map<string, SummarizedLine[]>();
  for (const t of lines) {
    const normCompany = normalizeCompanyName(t.company);
    const normCounter = normalizeCompanyName(t.counterParty);
    if (!normCompany || !normCounter || normCompany === normCounter) continue;
    const dirKey = `${normCompany}||${normCounter}`;
    if (!directionMap.has(dirKey)) directionMap.set(dirKey, []);
    directionMap.get(dirKey)!.push(t);
  }
  return directionMap;
}

function buildCounterpartyPairs(lines: SummarizedLine[]): PairGroup[] {
  const directionMap = buildDirectionMap(lines);
  const results: PairGroup[] = [];
  const processedCrossPairs = new Set<string>();

  for (const [dirKey, dirLines] of directionMap) {
    const [normA, normB] = dirKey.split("||");

    const reverseKey = `${normB}||${normA}`;
    const crossKey = [dirKey, reverseKey].sort().join("@@");
    if (!processedCrossPairs.has(crossKey) && directionMap.has(reverseKey)) {
      processedCrossPairs.add(crossKey);
      const reverseLines = directionMap.get(reverseKey)!;

      const aPosForCross = dirLines.filter(t => (t.netAmount || 0) > 0);
      const bNegForCross = reverseLines.filter(t => (t.netAmount || 0) < 0);
      if (aPosForCross.length > 0 && bNegForCross.length > 0) {
        results.push({
          companyA: normA,
          companyB: normB,
          positiveSide: aPosForCross,
          negativeSide: bNegForCross,
        });
      }

      const bPosForCross = reverseLines.filter(t => (t.netAmount || 0) > 0);
      const aNegForCross = dirLines.filter(t => (t.netAmount || 0) < 0);
      if (bPosForCross.length > 0 && aNegForCross.length > 0) {
        results.push({
          companyA: normB,
          companyB: normA,
          positiveSide: bPosForCross,
          negativeSide: aNegForCross,
        });
      }
    }
  }

  return results;
}


async function matchLines(
  lineIds: number[],
  unmatchedIds: Set<number>,
  ruleName: string,
  lineMap: Map<number, SummarizedLine>,
  status: string = "matched"
): Promise<void> {
  const reconId = generateReconId();

  let totalDebit = 0;
  let totalCredit = 0;

  for (const id of lineIds) {
    const line = lineMap.get(id);
    if (line) {
      const amt = line.netAmount || 0;
      if (amt > 0) totalDebit += amt;
      else totalCredit += Math.abs(amt);
    }
  }

  await storage.updateSummarizedLineRecon(lineIds, reconId, ruleName, status);

  for (const id of lineIds) {
    unmatchedIds.delete(id);
  }

  await storage.insertReconGroup({
    reconId,
    ruleName,
    totalDebit,
    totalCredit,
    transactionCount: lineIds.length,
    status,
  });
}

function isInDateRange(line: SummarizedLine, anchorDate: Date | null, dateTolerance: number | null): boolean {
  if (dateTolerance === null) return true;
  if (!anchorDate) return false;
  const lineDate = parseSerialDate(line.docDate);
  if (!lineDate) return false;
  return dateDiffDays(anchorDate, lineDate) <= dateTolerance;
}

async function dateAmountMatch(
  positiveSide: SummarizedLine[],
  negativeSide: SummarizedLine[],
  unmatchedIds: Set<number>,
  ruleName: string,
  dateTolerance: number | null,
  amtTol: number,
  amtTolPct: number,
  lineMap: Map<number, SummarizedLine>,
  status: string
): Promise<number> {
  let matched = 0;
  const usedNegatives = new Set<number>();

  for (const pos of positiveSide) {
    if (!unmatchedIds.has(pos.id)) continue;
    const amount = Math.abs(pos.netAmount || 0);
    if (amount === 0) continue;

    const posDate = parseSerialDate(pos.docDate);

    for (const neg of negativeSide) {
      if (!unmatchedIds.has(neg.id) || usedNegatives.has(neg.id)) continue;
      const negAmt = Math.abs(neg.netAmount || 0);

      if (!amountsMatch(amount, negAmt, amtTol, amtTolPct)) continue;

      if (dateTolerance === null || isInDateRange(neg, posDate, dateTolerance)) {
        await matchLines([pos.id, neg.id], unmatchedIds, ruleName, lineMap, status);
        usedNegatives.add(neg.id);
        matched += 2;
        break;
      }
    }
  }
  return matched;
}

async function dateAmountAggregation(
  positiveSide: SummarizedLine[],
  negativeSide: SummarizedLine[],
  unmatchedIds: Set<number>,
  ruleName: string,
  dateTolerance: number | null,
  amtTol: number,
  amtTolPct: number,
  lineMap: Map<number, SummarizedLine>,
  status: string
): Promise<number> {
  let matched = 0;

  for (const pos of positiveSide) {
    if (!unmatchedIds.has(pos.id)) continue;
    const targetAmount = Math.abs(pos.netAmount || 0);
    if (targetAmount === 0) continue;
    const posDate = parseSerialDate(pos.docDate);

    const availableNegatives = negativeSide.filter((n) => {
      if (!unmatchedIds.has(n.id)) return false;
      return isInDateRange(n, posDate, dateTolerance);
    });

    const combination = findSubsetSum(availableNegatives, targetAmount, amtTol, amtTolPct);
    if (combination.length >= 2) {
      const ids = [pos.id, ...combination.map((c) => c.id)];
      await matchLines(ids, unmatchedIds, ruleName, lineMap, status);
      matched += ids.length;
    }
  }

  for (const neg of negativeSide) {
    if (!unmatchedIds.has(neg.id)) continue;
    const targetAmount = Math.abs(neg.netAmount || 0);
    if (targetAmount === 0) continue;
    const negDate = parseSerialDate(neg.docDate);

    const availablePositives = positiveSide.filter((p) => {
      if (!unmatchedIds.has(p.id)) return false;
      return isInDateRange(p, negDate, dateTolerance);
    });

    const combination = findSubsetSum(availablePositives, targetAmount, amtTol, amtTolPct);
    if (combination.length >= 2) {
      const ids = [neg.id, ...combination.map((d) => d.id)];
      await matchLines(ids, unmatchedIds, ruleName, lineMap, status);
      matched += ids.length;
    }
  }

  return matched;
}

async function manyToManyAggregation(
  positiveSide: SummarizedLine[],
  negativeSide: SummarizedLine[],
  unmatchedIds: Set<number>,
  ruleName: string,
  dateTolerance: number | null,
  amtTol: number,
  amtTolPct: number,
  lineMap: Map<number, SummarizedLine>,
  status: string
): Promise<number> {
  let matched = 0;

  const availPos = positiveSide.filter(p => unmatchedIds.has(p.id) && Math.abs(p.netAmount || 0) > 0);
  const availNeg = negativeSide.filter(n => unmatchedIds.has(n.id) && Math.abs(n.netAmount || 0) > 0);

  if (availPos.length < 2 || availNeg.length < 2) return 0;
  if (availPos.length > 30 || availNeg.length > 30) return 0;

  const posGroups = groupByDateWindow(availPos, dateTolerance);
  const negGroups = groupByDateWindow(availNeg, dateTolerance);

  for (const posGroup of posGroups) {
    if (posGroup.length < 2) continue;
    const posSum = posGroup.reduce((s, p) => s + Math.abs(p.netAmount || 0), 0);

    for (const negGroup of negGroups) {
      if (negGroup.length < 2) continue;
      if (!negGroup.every(n => unmatchedIds.has(n.id))) continue;
      if (!posGroup.every(p => unmatchedIds.has(p.id))) continue;

      const negSum = negGroup.reduce((s, n) => s + Math.abs(n.netAmount || 0), 0);

      if (amountsMatch(posSum, negSum, amtTol, amtTolPct)) {
        const ids = [...posGroup.map(p => p.id), ...negGroup.map(n => n.id)];
        await matchLines(ids, unmatchedIds, ruleName, lineMap, status);
        matched += ids.length;
        break;
      }

      const negSubset = findSubsetSum(negGroup, posSum, amtTol, amtTolPct);
      if (negSubset.length >= 2) {
        const ids = [...posGroup.map(p => p.id), ...negSubset.map(n => n.id)];
        await matchLines(ids, unmatchedIds, ruleName, lineMap, status);
        matched += ids.length;
        break;
      }
    }
  }

  return matched;
}

function groupByDateWindow(lines: SummarizedLine[], dateTolerance: number | null): SummarizedLine[][] {
  if (dateTolerance === null) {
    if (lines.length <= 15) return [lines];
    return [];
  }

  const withDates = lines
    .map(l => ({ line: l, date: parseSerialDate(l.docDate) }))
    .filter(x => x.date !== null)
    .sort((a, b) => a.date!.getTime() - b.date!.getTime());

  const groups: SummarizedLine[][] = [];
  const maxGroupSize = 10;

  for (let i = 0; i < withDates.length; i++) {
    const group: SummarizedLine[] = [withDates[i].line];
    for (let j = i + 1; j < withDates.length && group.length < maxGroupSize; j++) {
      if (dateDiffDays(withDates[i].date!, withDates[j].date!) <= dateTolerance) {
        group.push(withDates[j].line);
      }
    }
    if (group.length >= 2) {
      groups.push(group);
    }
  }

  return groups;
}

async function invoiceNarrationMatch(
  positiveSide: SummarizedLine[],
  negativeSide: SummarizedLine[],
  unmatchedIds: Set<number>,
  ruleName: string,
  amtTol: number,
  amtTolPct: number,
  lineMap: Map<number, SummarizedLine>,
  status: string
): Promise<number> {
  let matched = 0;
  const usedNegatives = new Set<number>();

  for (const pos of positiveSide) {
    if (!unmatchedIds.has(pos.id)) continue;

    const posNarrationRefs = extractReferences(pos.narration || "");
    const posDocRef = extractDocumentRef(pos.documentNo);
    const posAllRefs = new Set<string>([...posNarrationRefs]);
    if (posDocRef) posAllRefs.add(posDocRef);

    if (posAllRefs.size === 0) continue;

    for (const neg of negativeSide) {
      if (!unmatchedIds.has(neg.id) || usedNegatives.has(neg.id)) continue;

      const negNarrationRefs = extractReferences(neg.narration || "");
      const negDocRef = extractDocumentRef(neg.documentNo);
      const negAllRefs = new Set<string>([...negNarrationRefs]);
      if (negDocRef) negAllRefs.add(negDocRef);

      let hasStrongRef = false;
      for (const ref of posAllRefs) {
        if (negAllRefs.has(ref) && ref.length >= 4) {
          hasStrongRef = true;
          break;
        }
      }

      if (!hasStrongRef && posDocRef && negDocRef) {
        const posInNegNarration = (neg.narration || "").toUpperCase().includes(posDocRef);
        const negInPosNarration = (pos.narration || "").toUpperCase().includes(negDocRef);
        if (posInNegNarration || negInPosNarration) {
          hasStrongRef = true;
        }
      }

      if (hasStrongRef) {
        const posAmt = Math.abs(pos.netAmount || 0);
        const negAmt = Math.abs(neg.netAmount || 0);
        if (posAmt > 0 && negAmt > 0 && amountsMatch(posAmt, negAmt, amtTol, amtTolPct)) {
          await matchLines([pos.id, neg.id], unmatchedIds, ruleName, lineMap, status);
          usedNegatives.add(neg.id);
          matched += 2;
          break;
        }
      }
    }
  }
  return matched;
}

async function fuzzyNarrationMatch(
  positiveSide: SummarizedLine[],
  negativeSide: SummarizedLine[],
  unmatchedIds: Set<number>,
  ruleName: string,
  amtTol: number,
  amtTolPct: number,
  lineMap: Map<number, SummarizedLine>,
  status: string,
  fuzzyThreshold: number,
  minNarrationLength: number
): Promise<number> {
  let matched = 0;
  const usedNegatives = new Set<number>();

  for (const pos of positiveSide) {
    if (!unmatchedIds.has(pos.id)) continue;
    const pNar = (pos.narration || "").trim();
    if (pNar.length <= minNarrationLength) continue;
    const amt = Math.abs(pos.netAmount || 0);
    if (amt === 0) continue;

    for (const neg of negativeSide) {
      if (!unmatchedIds.has(neg.id) || usedNegatives.has(neg.id)) continue;
      const nNar = (neg.narration || "").trim();
      if (nNar.length <= minNarrationLength) continue;
      const negAmt = Math.abs(neg.netAmount || 0);
      if (!amountsMatch(amt, negAmt, amtTol, amtTolPct)) continue;

      const sim = levenshteinSimilarity(pNar, nNar);
      if (sim >= fuzzyThreshold) {
        await matchLines([pos.id, neg.id], unmatchedIds, ruleName, lineMap, status);
        usedNegatives.add(neg.id);
        matched += 2;
        break;
      }
    }
  }
  return matched;
}

async function combinedScoringMatch(
  positiveSide: SummarizedLine[],
  negativeSide: SummarizedLine[],
  unmatchedIds: Set<number>,
  ruleName: string,
  lineMap: Map<number, SummarizedLine>,
  status: string,
  params: any
): Promise<number> {
  let matched = 0;
  const scoreThreshold = params.scoreThreshold || 50;
  const usedNeg = new Set<number>();

  for (const pos of positiveSide) {
    if (!unmatchedIds.has(pos.id)) continue;
    const amt = Math.abs(pos.netAmount || 0);
    if (amt === 0) continue;
    const pDate = parseSerialDate(pos.docDate);
    const pNar = (pos.narration || "").trim();

    let bestNeg: SummarizedLine | null = null;
    let bestScore = 0;

    for (const neg of negativeSide) {
      if (!unmatchedIds.has(neg.id) || usedNeg.has(neg.id)) continue;
      const nAmt = Math.abs(neg.netAmount || 0);
      let score = 0;

      const amtDiffPct = nAmt > 0 ? Math.abs(amt - nAmt) / Math.max(amt, nAmt) : 1;
      if (amtDiffPct < 0.001) score += 50;
      else if (amtDiffPct < 0.01) score += 40;
      else if (amtDiffPct < 0.05) score += 20;
      else continue;

      const nDate = parseSerialDate(neg.docDate);
      if (pDate && nDate) {
        const dd = dateDiffDays(pDate, nDate);
        if (dd === 0) score += 30;
        else if (dd <= 5) score += 25;
        else if (dd <= 30) score += 15;
        else if (dd <= 90) score += 5;
      }

      const nNar = (neg.narration || "").trim();
      if (pNar.length > 20 && nNar.length > 20) {
        const sim = levenshteinSimilarity(pNar, nNar);
        if (sim >= 0.8) score += 20;
        else if (sim >= 0.6) score += 10;
      }

      if (score > bestScore) {
        bestScore = score;
        bestNeg = neg;
      }
    }

    if (bestNeg && bestScore >= scoreThreshold) {
      await matchLines([pos.id, bestNeg.id], unmatchedIds, ruleName, lineMap, status);
      usedNeg.add(bestNeg.id);
      matched += 2;
    }
  }

  return matched;
}

function buildEntityKeywords(allLines: SummarizedLine[]): string[] {
  const entityNames = new Set<string>();
  for (const t of allLines) {
    if (t.company) entityNames.add(t.company.trim());
    if (t.counterParty) entityNames.add(t.counterParty.trim());
  }

  const keywords: string[] = [];
  for (const name of entityNames) {
    const lower = name.toLowerCase();
    const words = lower.split(/[\s,.()\-\/]+/).filter(w => w.length > 3);
    const skipWords = new Set(["private", "limited", "formerly", "known", "services", "pvt", "ltd", "the"]);
    for (const w of words) {
      if (!skipWords.has(w) && !keywords.includes(w)) {
        keywords.push(w);
      }
    }
  }
  return keywords;
}

function narrationReferencesEntity(narration: string | null | undefined, ownCompany: string, entityKeywords: string[]): boolean {
  if (!narration || narration.trim().length < 10) return false;
  const narrLower = narration.toLowerCase();
  const ownLower = ownCompany.toLowerCase();
  const ownSignificantWords = ownLower.split(/[\s,.()\-\/]+/).filter(w => w.length > 3);
  const skipWords = new Set(["private", "limited", "formerly", "known", "services", "pvt", "ltd", "the",
    "being", "amount", "paid", "received", "transferred", "towards", "from", "against", "entry", "passed"]);

  for (const kw of entityKeywords) {
    if (skipWords.has(kw)) continue;
    if (ownSignificantWords.includes(kw)) continue;
    if (narrLower.includes(kw)) return true;
  }
  return false;
}

async function reversalMatch(
  allUnmatched: SummarizedLine[],
  unmatchedIds: Set<number>,
  ruleName: string,
  dayThreshold: number,
  amtTol: number,
  amtTolPct: number,
  lineMap: Map<number, SummarizedLine>,
  status: string
): Promise<number> {
  let matched = 0;

  const entityKeywords = buildEntityKeywords(Array.from(lineMap.values()));

  const byCompanyCP = new Map<string, SummarizedLine[]>();
  for (const t of allUnmatched) {
    if (!unmatchedIds.has(t.id)) continue;
    const key = `${normalizeCompanyName(t.company)}||${normalizeCompanyName(t.counterParty)}`;
    if (!byCompanyCP.has(key)) byCompanyCP.set(key, []);
    byCompanyCP.get(key)!.push(t);
  }

  for (const [, lines] of byCompanyCP) {
    const positive = lines.filter(t => (t.netAmount || 0) > 0 && unmatchedIds.has(t.id));
    const negative = lines.filter(t => (t.netAmount || 0) < 0 && unmatchedIds.has(t.id));
    const usedNeg = new Set<number>();
    const usedPos = new Set<number>();

    for (const pos of positive) {
      if (!unmatchedIds.has(pos.id) || usedPos.has(pos.id)) continue;
      const posAmt = Math.abs(pos.netAmount || 0);
      if (posAmt === 0) continue;
      const posDate = parseSerialDate(pos.docDate);
      if (!posDate) continue;

      for (const neg of negative) {
        if (!unmatchedIds.has(neg.id) || usedNeg.has(neg.id)) continue;
        const negAmt = Math.abs(neg.netAmount || 0);
        if (!amountsMatch(posAmt, negAmt, amtTol, amtTolPct)) continue;

        const negDate = parseSerialDate(neg.docDate);
        if (!negDate) continue;

        if (dateDiffDays(posDate, negDate) <= dayThreshold) {
          const posRefEntity = narrationReferencesEntity(pos.narration, pos.company, entityKeywords);
          const negRefEntity = narrationReferencesEntity(neg.narration, neg.company, entityKeywords);
          if (posRefEntity || negRefEntity) continue;

          await matchLines([pos.id, neg.id], unmatchedIds, ruleName, lineMap, status);
          usedNeg.add(neg.id);
          usedPos.add(pos.id);
          matched += 2;
          break;
        }
      }
    }

    for (const neg of negative) {
      if (!unmatchedIds.has(neg.id) || usedNeg.has(neg.id)) continue;
      const targetAmt = Math.abs(neg.netAmount || 0);
      if (targetAmt === 0) continue;
      const negDate = parseSerialDate(neg.docDate);
      if (!negDate) continue;

      const candidates = positive.filter(p =>
        unmatchedIds.has(p.id) && !usedPos.has(p.id) && (() => {
          const pDate = parseSerialDate(p.docDate);
          if (!pDate || dateDiffDays(negDate, pDate) > dayThreshold) return false;
          const pRef = narrationReferencesEntity(p.narration, p.company, entityKeywords);
          return !pRef;
        })()
      );
      if (narrationReferencesEntity(neg.narration, neg.company, entityKeywords)) continue;

      const combo = findSubsetSum(candidates, targetAmt, amtTol, amtTolPct);
      if (combo.length >= 2) {
        const ids = [neg.id, ...combo.map(c => c.id)];
        await matchLines(ids, unmatchedIds, ruleName, lineMap, status);
        combo.forEach(c => usedPos.add(c.id));
        usedNeg.add(neg.id);
        matched += ids.length;
      }
    }

    for (const pos of positive) {
      if (!unmatchedIds.has(pos.id) || usedPos.has(pos.id)) continue;
      const targetAmt = Math.abs(pos.netAmount || 0);
      if (targetAmt === 0) continue;
      const posDate = parseSerialDate(pos.docDate);
      if (!posDate) continue;

      const candidates = negative.filter(n =>
        unmatchedIds.has(n.id) && !usedNeg.has(n.id) && (() => {
          const nDate = parseSerialDate(n.docDate);
          if (!nDate || dateDiffDays(posDate, nDate) > dayThreshold) return false;
          const nRef = narrationReferencesEntity(n.narration, n.company, entityKeywords);
          return !nRef;
        })()
      );
      if (narrationReferencesEntity(pos.narration, pos.company, entityKeywords)) continue;

      const combo = findSubsetSum(candidates, targetAmt, amtTol, amtTolPct);
      if (combo.length >= 2) {
        const ids = [pos.id, ...combo.map(c => c.id)];
        await matchLines(ids, unmatchedIds, ruleName, lineMap, status);
        combo.forEach(c => usedNeg.add(c.id));
        usedPos.add(pos.id);
        matched += ids.length;
      }
    }
  }

  return matched;
}

function findSubsetSum(
  lines: SummarizedLine[],
  target: number,
  amtTol: number = 0,
  amtTolPct: number = 0
): SummarizedLine[] {
  const sorted = lines
    .map((t) => ({
      line: t,
      amount: Math.abs(t.netAmount || 0),
    }))
    .filter((x) => x.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  if (sorted.length > 20) return [];

  for (let size = 2; size <= Math.min(sorted.length, 10); size++) {
    const result = findCombination(sorted, target, size, amtTol, amtTolPct);
    if (result) return result.map((x) => x.line);
  }
  return [];
}

function findCombination(
  items: { line: SummarizedLine; amount: number }[],
  target: number,
  size: number,
  amtTol: number = 0,
  amtTolPct: number = 0,
  start = 0,
  current: { line: SummarizedLine; amount: number }[] = []
): { line: SummarizedLine; amount: number }[] | null {
  if (current.length === size) {
    const sum = current.reduce((s, x) => s + x.amount, 0);
    if (amountsMatch(sum, target, amtTol, amtTolPct)) return [...current];
    return null;
  }

  for (let i = start; i < items.length; i++) {
    current.push(items[i]);
    const result = findCombination(items, target, size, amtTol, amtTolPct, i + 1, current);
    if (result) return result;
    current.pop();
  }
  return null;
}
