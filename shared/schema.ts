import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = sqliteTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  uploadBatchId: text("upload_batch_id").notNull(),
  company: text("company").notNull(),
  counterParty: text("counter_party").notNull(),
  businessUnit: text("business_unit"),
  accountHead: text("account_head"),
  subAccountHead: text("sub_account_head"),
  debit: real("debit").default(0),
  credit: real("credit").default(0),
  netAmount: real("net_amount").default(0),
  documentNo: text("document_no"),
  docDate: text("doc_date"),
  narration: text("narration"),
  icGl: text("ic_gl"),
  reconStatus: text("recon_status").default("unmatched"),
  reconId: text("recon_id"),
  reconRule: text("recon_rule"),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

export const insertTransactionSchema = createInsertSchema(transactions).omit({
  id: true,
  createdAt: true,
});

export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactions.$inferSelect;

export const summarizedLines = sqliteTable("summarized_lines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  uploadBatchId: text("upload_batch_id").notNull(),
  company: text("company").notNull(),
  counterParty: text("counter_party").notNull(),
  documentNo: text("document_no"),
  docDate: text("doc_date"),
  narration: text("narration"),
  icGl: text("ic_gl"),
  netAmount: real("net_amount").default(0),
  transactionCount: integer("transaction_count").default(1),
  reconStatus: text("recon_status").default("unmatched"),
  reconId: text("recon_id"),
  reconRule: text("recon_rule"),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

export const insertSummarizedLineSchema = createInsertSchema(summarizedLines).omit({
  id: true,
  createdAt: true,
});

export type InsertSummarizedLine = z.infer<typeof insertSummarizedLineSchema>;
export type SummarizedLine = typeof summarizedLines.$inferSelect;

export const reconciliationRules = sqliteTable("reconciliation_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ruleId: text("rule_id").notNull(),
  name: text("name").notNull(),
  ruleType: text("rule_type").notNull(),
  matchType: text("match_type").default("1:1"),
  priority: integer("priority").notNull(),
  dateTolerance: real("date_tolerance"),
  amountTolerance: real("amount_tolerance").default(0),
  amountTolerancePct: real("amount_tolerance_pct").default(0),
  confidence: text("confidence").default("real_match"),
  classification: text("classification").default("AUTO_MATCH"),
  active: integer("active", { mode: "boolean" }).default(true),
  description: text("description"),
  params: text("params"),
});

export const insertRuleSchema = createInsertSchema(reconciliationRules).omit({
  id: true,
});

export type InsertRule = z.infer<typeof insertRuleSchema>;
export type Rule = typeof reconciliationRules.$inferSelect;

export const reconciliationGroups = sqliteTable("reconciliation_groups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reconId: text("recon_id").notNull().unique(),
  ruleName: text("rule_name").notNull(),
  totalDebit: real("total_debit").default(0),
  totalCredit: real("total_credit").default(0),
  transactionCount: integer("transaction_count").default(0),
  status: text("status").default("matched"),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

export const insertReconGroupSchema = createInsertSchema(reconciliationGroups).omit({
  id: true,
  createdAt: true,
});

export type InsertReconGroup = z.infer<typeof insertReconGroupSchema>;
export type ReconGroup = typeof reconciliationGroups.$inferSelect;

export const mlMatchPatterns = sqliteTable("ml_match_patterns", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  patternType: text("pattern_type").notNull(),
  companyA: text("company_a").notNull(),
  companyB: text("company_b").notNull(),
  amountRange: text("amount_range"),
  dateRange: text("date_range"),
  narrationPattern: text("narration_pattern"),
  documentPattern: text("document_pattern"),
  weight: real("weight").default(1.0),
  occurrences: integer("occurrences").default(1),
  lastUsed: text("last_used").$defaultFn(() => new Date().toISOString()),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

export const insertMlMatchPatternSchema = createInsertSchema(mlMatchPatterns).omit({
  id: true,
  createdAt: true,
});

export type InsertMlMatchPattern = z.infer<typeof insertMlMatchPatternSchema>;
export type MlMatchPattern = typeof mlMatchPatterns.$inferSelect;

export const matchConfidenceScores = sqliteTable("match_confidence_scores", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  summarizedLineId: integer("summarized_line_id").notNull(),
  reconId: text("recon_id"),
  overallScore: real("overall_score").default(0),
  amountScore: real("amount_score").default(0),
  dateScore: real("date_score").default(0),
  narrationScore: real("narration_score").default(0),
  referenceScore: real("reference_score").default(0),
  patternScore: real("pattern_score").default(0),
  factors: text("factors"),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

export const insertMatchConfidenceSchema = createInsertSchema(matchConfidenceScores).omit({
  id: true,
  createdAt: true,
});

export type InsertMatchConfidence = z.infer<typeof insertMatchConfidenceSchema>;
export type MatchConfidence = typeof matchConfidenceScores.$inferSelect;

export const anomalyFlags = sqliteTable("anomaly_flags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  summarizedLineId: integer("summarized_line_id").notNull(),
  anomalyType: text("anomaly_type").notNull(),
  severity: text("severity").default("medium"),
  description: text("description").notNull(),
  details: text("details"),
  resolved: integer("resolved", { mode: "boolean" }).default(false),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

export const insertAnomalyFlagSchema = createInsertSchema(anomalyFlags).omit({
  id: true,
  createdAt: true,
});

export type InsertAnomalyFlag = z.infer<typeof insertAnomalyFlagSchema>;
export type AnomalyFlag = typeof anomalyFlags.$inferSelect;

export const unmatchedClassifications = sqliteTable("unmatched_classifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  summarizedLineId: integer("summarized_line_id").notNull(),
  classification: text("classification").notNull(),
  confidence: real("confidence").default(0),
  reasoning: text("reasoning"),
  suggestedAction: text("suggested_action"),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

export const insertUnmatchedClassificationSchema = createInsertSchema(unmatchedClassifications).omit({
  id: true,
  createdAt: true,
});

export type InsertUnmatchedClassification = z.infer<typeof insertUnmatchedClassificationSchema>;
export type UnmatchedClassification = typeof unmatchedClassifications.$inferSelect;

export const mlSuggestions = sqliteTable("ml_suggestions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  lineIdA: integer("line_id_a").notNull(),
  lineIdB: integer("line_id_b").notNull(),
  confidenceScore: real("confidence_score").default(0),
  amountScore: real("amount_score").default(0),
  dateScore: real("date_score").default(0),
  narrationScore: real("narration_score").default(0),
  referenceScore: real("reference_score").default(0),
  patternScore: real("pattern_score").default(0),
  reasoning: text("reasoning"),
  status: text("status").default("pending"),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

export const insertMlSuggestionSchema = createInsertSchema(mlSuggestions).omit({
  id: true,
  createdAt: true,
});

export type InsertMlSuggestion = z.infer<typeof insertMlSuggestionSchema>;
export type MlSuggestion = typeof mlSuggestions.$inferSelect;

export const uploadBatches = sqliteTable("upload_batches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  batchId: text("batch_id").notNull().unique(),
  fileName: text("file_name").notNull(),
  totalRecords: integer("total_records").default(0),
  uploadedAt: text("uploaded_at").$defaultFn(() => new Date().toISOString()),
});

export const insertUploadBatchSchema = createInsertSchema(uploadBatches).omit({
  id: true,
  uploadedAt: true,
});

export type InsertUploadBatch = z.infer<typeof insertUploadBatchSchema>;
export type UploadBatch = typeof uploadBatches.$inferSelect;
