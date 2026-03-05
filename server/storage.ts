import { eq, and, desc, asc, inArray } from "drizzle-orm";
import { db } from "./db";
import {
  transactions,
  reconciliationRules,
  reconciliationGroups,
  uploadBatches,
  type InsertTransaction,
  type InsertRule,
  type InsertReconGroup,
  type InsertUploadBatch,
  type Transaction,
  type Rule,
  type ReconGroup,
  type UploadBatch,
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

  getUploadBatches(): Promise<UploadBatch[]>;
  insertUploadBatch(batch: InsertUploadBatch): Promise<UploadBatch>;

  getDashboardStats(): Promise<{
    totalTransactions: number;
    matchedTransactions: number;
    unmatchedTransactions: number;
    matchRate: number;
    totalDebit: number;
    totalCredit: number;
    companySummary: { company: string; total: number; matched: number; unmatched: number }[];
    ruleBreakdown: { rule: string; count: number }[];
  }>;

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

  async getUploadBatches(): Promise<UploadBatch[]> {
    return db.select().from(uploadBatches).orderBy(desc(uploadBatches.uploadedAt)).all();
  }

  async insertUploadBatch(batch: InsertUploadBatch): Promise<UploadBatch> {
    const [inserted] = db.insert(uploadBatches).values(batch).returning().all();
    return inserted;
  }

  async getDashboardStats() {
    const allTxns = db.select().from(transactions).all();
    const totalTransactions = allTxns.length;
    const matchedTransactions = allTxns.filter((t) => t.reconStatus === "matched").length;
    const unmatchedTransactions = totalTransactions - matchedTransactions;
    const matchRate = totalTransactions > 0 ? (matchedTransactions / totalTransactions) * 100 : 0;
    const totalDebit = allTxns.reduce((sum, t) => sum + (t.debit || 0), 0);
    const totalCredit = allTxns.reduce((sum, t) => sum + (t.credit || 0), 0);

    const companyMap = new Map<string, { total: number; matched: number; unmatched: number }>();
    for (const t of allTxns) {
      const key = t.company;
      if (!companyMap.has(key)) companyMap.set(key, { total: 0, matched: 0, unmatched: 0 });
      const entry = companyMap.get(key)!;
      entry.total++;
      if (t.reconStatus === "matched") entry.matched++;
      else entry.unmatched++;
    }
    const companySummary = Array.from(companyMap.entries()).map(([company, stats]) => ({
      company,
      ...stats,
    }));

    const ruleMap = new Map<string, number>();
    for (const t of allTxns) {
      if (t.reconRule) {
        ruleMap.set(t.reconRule, (ruleMap.get(t.reconRule) || 0) + 1);
      }
    }
    const ruleBreakdown = Array.from(ruleMap.entries()).map(([rule, count]) => ({
      rule,
      count,
    }));

    return {
      totalTransactions,
      matchedTransactions,
      unmatchedTransactions,
      matchRate,
      totalDebit,
      totalCredit,
      companySummary,
      ruleBreakdown,
    };
  }

  async getCompanies(): Promise<string[]> {
    const result = db
      .selectDistinct({ company: transactions.company })
      .from(transactions)
      .all();
    return result.map((r) => r.company);
  }

  async getCounterParties(): Promise<string[]> {
    const result = db
      .selectDistinct({ counterParty: transactions.counterParty })
      .from(transactions)
      .all();
    return result.map((r) => r.counterParty);
  }

  async getCompanyPairs() {
    const allTxns = db.select().from(transactions).all();
    const pairMap = new Map<string, {
      company: string;
      counterParty: string;
      total: number;
      matched: number;
      unmatched: number;
      totalDebit: number;
      totalCredit: number;
    }>();

    for (const t of allTxns) {
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
      if (t.reconStatus === "matched") entry.matched++;
      else entry.unmatched++;
      entry.totalDebit += t.debit || 0;
      entry.totalCredit += t.credit || 0;
    }

    return Array.from(pairMap.values()).sort((a, b) => b.total - a.total);
  }
}

export const storage = new DatabaseStorage();
