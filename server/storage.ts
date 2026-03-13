import { eq, and, desc, asc, inArray } from "drizzle-orm";
import { db } from "./db";
import {
  transactions,
  summarizedLines,
  reconciliationRules,
  reconciliationGroups,
  uploadBatches,
  mlMatchPatterns,
  matchConfidenceScores,
  anomalyFlags,
  unmatchedClassifications,
  mlSuggestions,
  type InsertTransaction,
  type InsertSummarizedLine,
  type InsertRule,
  type InsertReconGroup,
  type InsertUploadBatch,
  type InsertMlMatchPattern,
  type InsertMatchConfidence,
  type InsertAnomalyFlag,
  type InsertUnmatchedClassification,
  type InsertMlSuggestion,
  type Transaction,
  type SummarizedLine,
  type Rule,
  type ReconGroup,
  type UploadBatch,
  type MlMatchPattern,
  type MatchConfidence,
  type AnomalyFlag,
  type UnmatchedClassification,
  type MlSuggestion,
} from "@shared/schema";

export interface IStorage {
  getTransactions(filters?: {
    company?: string;
    counterParty?: string;
    reconStatus?: string;
    uploadBatchId?: string;
  }): Promise<Transaction[]>;
  getTransactionById(id: number): Promise<Transaction | undefined>;
  getTransactionsByIds(ids: number[]): Promise<Transaction[]>;
  insertTransactions(txns: InsertTransaction[]): Promise<Transaction[]>;
  updateTransactionRecon(
    ids: number[],
    reconId: string,
    reconRule: string,
    status: string
  ): Promise<void>;
  resetReconciliation(): Promise<void>;

  getRules(): Promise<Rule[]>;
  getActiveRules(): Promise<Rule[]>;
  getRuleById(id: number): Promise<Rule | undefined>;
  insertRule(rule: InsertRule): Promise<Rule>;
  updateRule(id: number, rule: Partial<InsertRule>): Promise<Rule | undefined>;
  deleteRule(id: number): Promise<void>;

  getReconGroups(): Promise<ReconGroup[]>;
  insertReconGroup(group: InsertReconGroup): Promise<ReconGroup>;
  unmatchReconGroup(reconId: string): Promise<number>;

  getUploadBatches(): Promise<UploadBatch[]>;
  insertUploadBatch(batch: InsertUploadBatch): Promise<UploadBatch>;

  getDashboardStats(): Promise<{
    totalTransactions: number;
    matchedTransactions: number;
    unmatchedTransactions: number;
    matchRate: number;
    totalDebit: number;
    totalCredit: number;
    companySummary: { company: string; total: number; matched: number; reversal: number; review: number; suggested: number; unmatched: number }[];
    ruleBreakdown: { rule: string; count: number; matchType: string }[];
    statusBreakdown: { status: string; count: number }[];
  }>;

  getSummarizedLines(filters?: {
    company?: string;
    counterParty?: string;
    counterParties?: string[];
    reconStatus?: string;
    reconId?: string;
  }): Promise<SummarizedLine[]>;
  getSummarizedLinesByIds(ids: number[]): Promise<SummarizedLine[]>;
  insertSummarizedLines(lines: InsertSummarizedLine[]): Promise<SummarizedLine[]>;
  updateSummarizedLineRecon(
    ids: number[],
    reconId: string,
    reconRule: string,
    status: string
  ): Promise<void>;
  updateSummarizedLineCounterParty(id: number, counterParty: string): Promise<void>;
  resetSummarizedLines(): Promise<void>;

  getCompanies(): Promise<string[]>;
  getCounterParties(): Promise<string[]>;
  getCompanyPairs(): Promise<{
    company: string;
    counterParty: string;
    total: number;
    matched: number;
    unmatched: number;
    totalDebit: number;
    totalCredit: number;
  }[]>;

  getMlMatchPatterns(): Promise<MlMatchPattern[]>;
  findMlMatchPattern(companyA: string, companyB: string): Promise<MlMatchPattern | undefined>;
  insertMlMatchPattern(pattern: InsertMlMatchPattern): Promise<MlMatchPattern>;
  updateMlMatchPattern(id: number, updates: Partial<InsertMlMatchPattern>): Promise<void>;
  deleteMlMatchPattern(id: number): Promise<void>;

  getMatchConfidenceScores(reconId?: string): Promise<MatchConfidence[]>;
  insertMatchConfidenceScores(scores: InsertMatchConfidence[]): Promise<void>;
  clearMatchConfidenceScores(): Promise<void>;

  getAnomalyFlags(resolved?: boolean): Promise<AnomalyFlag[]>;
  insertAnomalyFlags(flags: InsertAnomalyFlag[]): Promise<void>;
  resolveAnomalyFlag(id: number): Promise<void>;
  clearAnomalyFlags(): Promise<void>;

  getUnmatchedClassifications(): Promise<UnmatchedClassification[]>;
  insertUnmatchedClassifications(classifications: InsertUnmatchedClassification[]): Promise<void>;
  clearUnmatchedClassifications(): Promise<void>;

  getMlSuggestions(status?: string): Promise<MlSuggestion[]>;
  insertMlSuggestions(suggestions: InsertMlSuggestion[]): Promise<void>;
  updateMlSuggestionStatus(id: number, status: string): Promise<void>;
  clearMlSuggestions(): Promise<void>;
}

const MATCHED_STATUSES = ["matched", "probable", "reversal", "review_match", "suggested_match"];

function isMatchedStatus(status: string): boolean {
  return MATCHED_STATUSES.includes(status);
}

export class DatabaseStorage implements IStorage {
  async getTransactions(filters?: {
    company?: string;
    counterParty?: string;
    reconStatus?: string;
    uploadBatchId?: string;
  }): Promise<Transaction[]> {
    const conditions = [];
    if (filters?.company) conditions.push(eq(transactions.company, filters.company));
    if (filters?.counterParty) conditions.push(eq(transactions.counterParty, filters.counterParty));
    if (filters?.reconStatus) conditions.push(eq(transactions.reconStatus, filters.reconStatus));
    if (filters?.uploadBatchId) conditions.push(eq(transactions.uploadBatchId, filters.uploadBatchId));

    if (conditions.length > 0) {
      return db.select().from(transactions).where(and(...conditions)).orderBy(desc(transactions.id)).all();
    }
    return db.select().from(transactions).orderBy(desc(transactions.id)).all();
  }

  async getTransactionById(id: number): Promise<Transaction | undefined> {
    return db.select().from(transactions).where(eq(transactions.id, id)).get();
  }

  async getTransactionsByIds(ids: number[]): Promise<Transaction[]> {
    if (ids.length === 0) return [];
    return db.select().from(transactions).where(inArray(transactions.id, ids)).all();
  }

  async insertTransactions(txns: InsertTransaction[]): Promise<Transaction[]> {
    if (txns.length === 0) return [];
    const results: Transaction[] = [];
    const batchSize = 100;
    for (let i = 0; i < txns.length; i += batchSize) {
      const batch = txns.slice(i, i + batchSize);
      const inserted = db.insert(transactions).values(batch).returning().all();
      results.push(...inserted);
    }
    return results;
  }

  async updateTransactionRecon(
    ids: number[],
    reconId: string,
    reconRule: string,
    status: string
  ): Promise<void> {
    if (ids.length === 0) return;
    db.update(transactions)
      .set({ reconId, reconRule, reconStatus: status })
      .where(inArray(transactions.id, ids))
      .run();
  }

  async resetReconciliation(): Promise<void> {
    db.update(transactions)
      .set({ reconId: null, reconRule: null, reconStatus: "unmatched" })
      .run();
    db.delete(reconciliationGroups).run();
  }

  async getRules(): Promise<Rule[]> {
    return db.select().from(reconciliationRules).orderBy(asc(reconciliationRules.priority)).all();
  }

  async getActiveRules(): Promise<Rule[]> {
    return db
      .select()
      .from(reconciliationRules)
      .where(eq(reconciliationRules.active, true))
      .orderBy(asc(reconciliationRules.priority))
      .all();
  }

  async getRuleById(id: number): Promise<Rule | undefined> {
    return db.select().from(reconciliationRules).where(eq(reconciliationRules.id, id)).get();
  }

  async insertRule(rule: InsertRule): Promise<Rule> {
    const [inserted] = db.insert(reconciliationRules).values(rule).returning().all();
    return inserted;
  }

  async updateRule(id: number, rule: Partial<InsertRule>): Promise<Rule | undefined> {
    const [updated] = db
      .update(reconciliationRules)
      .set(rule)
      .where(eq(reconciliationRules.id, id))
      .returning()
      .all();
    return updated;
  }

  async deleteRule(id: number): Promise<void> {
    db.delete(reconciliationRules).where(eq(reconciliationRules.id, id)).run();
  }

  async getReconGroups(): Promise<ReconGroup[]> {
    return db.select().from(reconciliationGroups).orderBy(desc(reconciliationGroups.createdAt)).all();
  }

  async insertReconGroup(group: InsertReconGroup): Promise<ReconGroup> {
    const [inserted] = db.insert(reconciliationGroups).values(group).returning().all();
    return inserted;
  }

  async unmatchReconGroup(reconId: string): Promise<number> {
    return db.transaction((tx) => {
      const affected = tx.update(summarizedLines)
        .set({ reconId: null, reconRule: null, reconStatus: "unmatched" })
        .where(eq(summarizedLines.reconId, reconId))
        .returning()
        .all();
      tx.delete(reconciliationGroups)
        .where(eq(reconciliationGroups.reconId, reconId))
        .run();
      return affected.length;
    });
  }

  async getUploadBatches(): Promise<UploadBatch[]> {
    return db.select().from(uploadBatches).orderBy(desc(uploadBatches.uploadedAt)).all();
  }

  async insertUploadBatch(batch: InsertUploadBatch): Promise<UploadBatch> {
    const [inserted] = db.insert(uploadBatches).values(batch).returning().all();
    return inserted;
  }

  async getDashboardStats() {
    const allLines = db.select().from(summarizedLines).all();
    const totalTransactions = allLines.length;
    const matchedTransactions = allLines.filter((t) => isMatchedStatus(t.reconStatus || "")).length;
    const unmatchedTransactions = totalTransactions - matchedTransactions;
    const matchRate = totalTransactions > 0 ? (matchedTransactions / totalTransactions) * 100 : 0;
    const totalDebit = allLines.reduce((sum, t) => sum + Math.max(t.netAmount || 0, 0), 0);
    const totalCredit = allLines.reduce((sum, t) => sum + Math.abs(Math.min(t.netAmount || 0, 0)), 0);

    const companyMap = new Map<string, { total: number; matched: number; reversal: number; review: number; suggested: number; unmatched: number }>();
    for (const t of allLines) {
      const key = t.company;
      if (!companyMap.has(key)) companyMap.set(key, { total: 0, matched: 0, reversal: 0, review: 0, suggested: 0, unmatched: 0 });
      const entry = companyMap.get(key)!;
      entry.total++;
      const s = t.reconStatus || "unmatched";
      if (s === "matched" || s === "manual") entry.matched++;
      else if (s === "reversal") entry.reversal++;
      else if (s === "review_match") entry.review++;
      else if (s === "suggested_match") entry.suggested++;
      else entry.unmatched++;
    }
    const companySummary = Array.from(companyMap.entries()).map(([company, stats]) => ({
      company,
      ...stats,
    }));

    const ruleMap = new Map<string, number>();
    for (const t of allLines) {
      if (t.reconRule) {
        ruleMap.set(t.reconRule, (ruleMap.get(t.reconRule) || 0) + 1);
      }
    }

    const allRules = db.select().from(reconciliationRules).orderBy(asc(reconciliationRules.priority)).all();
    const ruleBreakdown = allRules.map((r) => ({
      rule: r.name,
      count: ruleMap.get(r.name) || 0,
      matchType: r.classification || "AUTO_MATCH",
    }));

    const statusMap = new Map<string, number>();
    for (const t of allLines) {
      const s = t.reconStatus || "unmatched";
      statusMap.set(s, (statusMap.get(s) || 0) + 1);
    }
    const statusBreakdown = Array.from(statusMap.entries()).map(([status, count]) => ({ status, count }));

    return {
      totalTransactions,
      matchedTransactions,
      unmatchedTransactions,
      matchRate,
      totalDebit,
      totalCredit,
      companySummary,
      ruleBreakdown,
      statusBreakdown,
    };
  }

  async getSummarizedLines(filters?: {
    company?: string;
    counterParty?: string;
    counterParties?: string[];
    reconStatus?: string;
    reconId?: string;
  }): Promise<SummarizedLine[]> {
    const conditions = [];
    if (filters?.company) conditions.push(eq(summarizedLines.company, filters.company));
    if (filters?.counterParties && filters.counterParties.length > 0) {
      conditions.push(inArray(summarizedLines.counterParty, filters.counterParties));
    } else if (filters?.counterParty) {
      conditions.push(eq(summarizedLines.counterParty, filters.counterParty));
    }
    if (filters?.reconStatus) conditions.push(eq(summarizedLines.reconStatus, filters.reconStatus));
    if (filters?.reconId) conditions.push(eq(summarizedLines.reconId, filters.reconId));

    if (conditions.length > 0) {
      return db.select().from(summarizedLines).where(and(...conditions)).orderBy(desc(summarizedLines.id)).all();
    }
    return db.select().from(summarizedLines).orderBy(desc(summarizedLines.id)).all();
  }

  async getSummarizedLinesByIds(ids: number[]): Promise<SummarizedLine[]> {
    if (ids.length === 0) return [];
    return db.select().from(summarizedLines).where(inArray(summarizedLines.id, ids)).all();
  }

  async insertSummarizedLines(lines: InsertSummarizedLine[]): Promise<SummarizedLine[]> {
    if (lines.length === 0) return [];
    const results: SummarizedLine[] = [];
    const batchSize = 100;
    for (let i = 0; i < lines.length; i += batchSize) {
      const batch = lines.slice(i, i + batchSize);
      const inserted = db.insert(summarizedLines).values(batch).returning().all();
      results.push(...inserted);
    }
    return results;
  }

  async updateSummarizedLineCounterParty(id: number, counterParty: string): Promise<void> {
    db.update(summarizedLines)
      .set({ counterParty })
      .where(eq(summarizedLines.id, id))
      .run();
  }

  async updateSummarizedLineRecon(
    ids: number[],
    reconId: string,
    reconRule: string,
    status: string
  ): Promise<void> {
    if (ids.length === 0) return;
    db.update(summarizedLines)
      .set({ reconId, reconRule, reconStatus: status })
      .where(inArray(summarizedLines.id, ids))
      .run();
  }

  async resetSummarizedLines(): Promise<void> {
    db.delete(summarizedLines)
      .where(eq(summarizedLines.netAmount, 0))
      .run();
    db.update(summarizedLines)
      .set({ reconId: null, reconRule: null, reconStatus: "unmatched" })
      .run();
    db.delete(reconciliationGroups).run();
  }

  async getCompanies(): Promise<string[]> {
    const result = db
      .selectDistinct({ company: summarizedLines.company })
      .from(summarizedLines)
      .all();
    return result.map((r) => r.company);
  }

  async getCounterParties(): Promise<string[]> {
    const result = db
      .selectDistinct({ counterParty: summarizedLines.counterParty })
      .from(summarizedLines)
      .all();
    return result.map((r) => r.counterParty);
  }

  async getCompanyPairs() {
    const allLines = db.select().from(summarizedLines).all();
    const pairMap = new Map<string, {
      company: string;
      counterParty: string;
      total: number;
      matched: number;
      unmatched: number;
      totalDebit: number;
      totalCredit: number;
    }>();

    for (const t of allLines) {
      const sorted = [t.company, t.counterParty].sort();
      const key = `${sorted[0]}||${sorted[1]}`;
      if (!pairMap.has(key)) {
        pairMap.set(key, {
          company: sorted[0],
          counterParty: sorted[1],
          total: 0,
          matched: 0,
          unmatched: 0,
          totalDebit: 0,
          totalCredit: 0,
        });
      }
      const entry = pairMap.get(key)!;
      entry.total++;
      if (isMatchedStatus(t.reconStatus || "")) entry.matched++;
      else entry.unmatched++;
      entry.totalDebit += Math.max(t.netAmount || 0, 0);
      entry.totalCredit += Math.abs(Math.min(t.netAmount || 0, 0));
    }

    return Array.from(pairMap.values()).sort((a, b) => b.total - a.total);
  }

  async getMlMatchPatterns(): Promise<MlMatchPattern[]> {
    return db.select().from(mlMatchPatterns).orderBy(desc(mlMatchPatterns.occurrences)).all();
  }

  async findMlMatchPattern(companyA: string, companyB: string): Promise<MlMatchPattern | undefined> {
    const a = companyA.trim().toUpperCase();
    const b = companyB.trim().toUpperCase();
    const all = db.select().from(mlMatchPatterns).all();
    return all.find(p => {
      const pA = (p.companyA || "").trim().toUpperCase();
      const pB = (p.companyB || "").trim().toUpperCase();
      return (pA === a && pB === b) || (pA === b && pB === a);
    });
  }

  async insertMlMatchPattern(pattern: InsertMlMatchPattern): Promise<MlMatchPattern> {
    const [inserted] = db.insert(mlMatchPatterns).values(pattern).returning().all();
    return inserted;
  }

  async updateMlMatchPattern(id: number, updates: Partial<InsertMlMatchPattern>): Promise<void> {
    db.update(mlMatchPatterns).set(updates).where(eq(mlMatchPatterns.id, id)).run();
  }

  async deleteMlMatchPattern(id: number): Promise<void> {
    db.delete(mlMatchPatterns).where(eq(mlMatchPatterns.id, id)).run();
  }

  async getMatchConfidenceScores(reconId?: string): Promise<MatchConfidence[]> {
    if (reconId) {
      return db.select().from(matchConfidenceScores).where(eq(matchConfidenceScores.reconId, reconId)).all();
    }
    return db.select().from(matchConfidenceScores).orderBy(desc(matchConfidenceScores.overallScore)).all();
  }

  async insertMatchConfidenceScores(scores: InsertMatchConfidence[]): Promise<void> {
    if (scores.length === 0) return;
    const batchSize = 100;
    for (let i = 0; i < scores.length; i += batchSize) {
      db.insert(matchConfidenceScores).values(scores.slice(i, i + batchSize)).run();
    }
  }

  async clearMatchConfidenceScores(): Promise<void> {
    db.delete(matchConfidenceScores).run();
  }

  async getAnomalyFlags(resolved?: boolean): Promise<AnomalyFlag[]> {
    if (resolved !== undefined) {
      return db.select().from(anomalyFlags).where(eq(anomalyFlags.resolved, resolved)).orderBy(desc(anomalyFlags.id)).all();
    }
    return db.select().from(anomalyFlags).orderBy(desc(anomalyFlags.id)).all();
  }

  async insertAnomalyFlags(flags: InsertAnomalyFlag[]): Promise<void> {
    if (flags.length === 0) return;
    const batchSize = 100;
    for (let i = 0; i < flags.length; i += batchSize) {
      db.insert(anomalyFlags).values(flags.slice(i, i + batchSize)).run();
    }
  }

  async resolveAnomalyFlag(id: number): Promise<void> {
    db.update(anomalyFlags).set({ resolved: true }).where(eq(anomalyFlags.id, id)).run();
  }

  async clearAnomalyFlags(): Promise<void> {
    db.delete(anomalyFlags).run();
  }

  async getUnmatchedClassifications(): Promise<UnmatchedClassification[]> {
    return db.select().from(unmatchedClassifications).orderBy(desc(unmatchedClassifications.confidence)).all();
  }

  async insertUnmatchedClassifications(classifications: InsertUnmatchedClassification[]): Promise<void> {
    if (classifications.length === 0) return;
    const batchSize = 100;
    for (let i = 0; i < classifications.length; i += batchSize) {
      db.insert(unmatchedClassifications).values(classifications.slice(i, i + batchSize)).run();
    }
  }

  async clearUnmatchedClassifications(): Promise<void> {
    db.delete(unmatchedClassifications).run();
  }

  async getMlSuggestions(status?: string): Promise<MlSuggestion[]> {
    if (status) {
      return db.select().from(mlSuggestions).where(eq(mlSuggestions.status, status)).orderBy(desc(mlSuggestions.confidenceScore)).all();
    }
    return db.select().from(mlSuggestions).orderBy(desc(mlSuggestions.confidenceScore)).all();
  }

  async insertMlSuggestions(suggestions: InsertMlSuggestion[]): Promise<void> {
    if (suggestions.length === 0) return;
    const batchSize = 100;
    for (let i = 0; i < suggestions.length; i += batchSize) {
      db.insert(mlSuggestions).values(suggestions.slice(i, i + batchSize)).run();
    }
  }

  async updateMlSuggestionStatus(id: number, status: string): Promise<void> {
    db.update(mlSuggestions).set({ status }).where(eq(mlSuggestions.id, id)).run();
  }

  async clearMlSuggestions(): Promise<void> {
    db.delete(mlSuggestions).run();
  }
}

export const storage = new DatabaseStorage();
