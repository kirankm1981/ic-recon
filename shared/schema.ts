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

export const reconciliationRules = sqliteTable("reconciliation_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  ruleType: text("rule_type").notNull(),
  priority: integer("priority").notNull(),
  threshold: real("threshold"),
  active: integer("active", { mode: "boolean" }).default(true),
  description: text("description"),
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
