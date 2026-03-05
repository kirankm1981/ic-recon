import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { runReconciliation } from "./reconciliation-engine";
import multer from "multer";
import { parse } from "csv-parse/sync";
import type { InsertTransaction } from "@shared/schema";
import { randomUUID } from "crypto";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get("/api/transactions", async (req, res) => {
    try {
      const filters: any = {};
      if (req.query.company) filters.company = req.query.company as string;
      if (req.query.counterParty) filters.counterParty = req.query.counterParty as string;
      if (req.query.reconStatus) filters.reconStatus = req.query.reconStatus as string;
      if (req.query.uploadBatchId) filters.uploadBatchId = req.query.uploadBatchId as string;
      const txns = await storage.getTransactions(filters);
      res.json(txns);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/transactions/:id", async (req, res) => {
    try {
      const txn = await storage.getTransactionById(parseInt(req.params.id));
      if (!txn) return res.status(404).json({ message: "Transaction not found" });
      res.json(txn);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/upload/preview-headers", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const content = req.file.buffer.toString("utf-8");
      const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
        relax_quotes: true,
        to: 3,
      });
      const headers = records.length > 0 ? Object.keys(records[0]) : [];
      res.json({ headers, sampleRows: records.slice(0, 3) });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/upload", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });

      const batchId = randomUUID();
      const content = req.file.buffer.toString("utf-8");

      const columnMapping = req.body.columnMapping ? JSON.parse(req.body.columnMapping) : null;

      const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
        relax_quotes: true,
      });

      if (records.length === 0) {
        return res.status(400).json({ message: "CSV file contains no data rows" });
      }

      const headers = Object.keys(records[0]);
      console.log("CSV headers detected:", headers);

      function findCol(row: any, mapping: any, field: string, ...candidates: string[]): string {
        if (mapping && mapping[field]) {
          return row[mapping[field]] ?? "";
        }
        for (const c of candidates) {
          if (row[c] !== undefined && row[c] !== null) return row[c];
        }
        const lowerCandidates = candidates.map(c => c.toLowerCase());
        for (const key of Object.keys(row)) {
          const lk = key.toLowerCase().trim();
          if (lowerCandidates.includes(lk)) return row[key];
        }
        for (const key of Object.keys(row)) {
          const lk = key.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
          for (const c of candidates) {
            const lc = c.toLowerCase().replace(/[^a-z0-9]/g, "");
            if (lk === lc || lk.includes(lc) || lc.includes(lk)) return row[key];
          }
        }
        return "";
      }

      function findNumCol(row: any, mapping: any, field: string, ...candidates: string[]): number {
        const val = findCol(row, mapping, field, ...candidates);
        const cleaned = String(val).replace(/,/g, "").trim();
        return parseFloat(cleaned) || 0;
      }

      const txns: InsertTransaction[] = records.map((r: any) => {
        const debit = findNumCol(r, columnMapping, "debit", "Debit", "debit", "Dr", "Dr Amount", "Debit Amount");
        const credit = findNumCol(r, columnMapping, "credit", "Credit", "credit", "Cr", "Cr Amount", "Credit Amount");
        const netAmount = findNumCol(r, columnMapping, "netAmount", "Net Amount", "net_amount", "Net", "Amount", "Balance");

        return {
          uploadBatchId: batchId,
          company: findCol(r, columnMapping, "company", "Company", "company", "Company Name", "Entity", "Entity Name", "From Company", "From Entity", "Comp Name", "IC Company").trim(),
          counterParty: findCol(r, columnMapping, "counterParty", "Counter Party", "counter_party", "Counterparty", "Counter Party Name", "To Company", "To Entity", "IC Partner", "Partner Company", "Other Entity").trim(),
          businessUnit: findCol(r, columnMapping, "businessUnit", "Business Unit", "business_unit", "BU") || null,
          accountHead: findCol(r, columnMapping, "accountHead", "Account Head", "account_head", "Account", "GL Account", "GL Head") || null,
          subAccountHead: findCol(r, columnMapping, "subAccountHead", "Sub Account Head", "sub_account_head", "Sub Account") || null,
          debit,
          credit,
          netAmount: netAmount || (debit - credit),
          documentNo: findCol(r, columnMapping, "documentNo", "Document No", "document_no", "Doc No", "Document Number", "Invoice No", "Invoice Number", "Voucher No", "Reference No", "Ref No", "GL Doc No").trim() || null,
          docDate: findCol(r, columnMapping, "docDate", "Doc Date", "doc_date", "Document Date", "Date", "Transaction Date", "Txn Date", "Posting Date", "Invoice Date", "Voucher Date").trim() || null,
          narration: findCol(r, columnMapping, "narration", "Narration", "narration", "Description", "Remarks", "Particulars", "Details", "Memo", "Notes").trim() || null,
          reconStatus: "unmatched",
          reconId: null,
          reconRule: null,
        };
      });

      const emptyCompanyCount = txns.filter(t => !t.company).length;
      const emptyCounterPartyCount = txns.filter(t => !t.counterParty).length;

      if (emptyCompanyCount === txns.length) {
        console.warn("WARNING: All rows have empty Company. CSV headers:", headers);
        return res.status(400).json({
          message: "Could not detect the Company column in your CSV file.",
          detectedHeaders: headers,
          suggestion: "Please re-upload with column mapping. Expected a column like 'Company', 'Entity', or 'Company Name'.",
        });
      }

      const inserted = await storage.insertTransactions(txns);

      await storage.insertUploadBatch({
        batchId,
        fileName: req.file.originalname || "upload.csv",
        totalRecords: inserted.length,
      });

      const warnings: string[] = [];
      if (emptyCompanyCount > 0) warnings.push(`${emptyCompanyCount} rows had empty Company`);
      if (emptyCounterPartyCount > 0) warnings.push(`${emptyCounterPartyCount} rows had empty Counter Party`);

      res.json({
        batchId,
        totalRecords: inserted.length,
        fileName: req.file.originalname,
        detectedHeaders: headers,
        warnings,
      });
    } catch (error: any) {
      console.error("Upload error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/transactions/clear", async (_req, res) => {
    try {
      const { db } = await import("./db");
      const { transactions, uploadBatches, reconciliationGroups } = await import("@shared/schema");
      db.delete(transactions).run();
      db.delete(reconciliationGroups).run();
      db.delete(uploadBatches).run();
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/reconcile", async (_req, res) => {
    try {
      const result = await runReconciliation();
      res.json(result);
    } catch (error: any) {
      console.error("Reconciliation error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/manual-reconcile", async (req, res) => {
    try {
      const { transactionIds } = req.body;
      if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length < 2) {
        return res.status(400).json({ message: "At least 2 transaction IDs required" });
      }
      const txns = await storage.getTransactionsByIds(transactionIds);
      const alreadyMatched = txns.filter(t => t.reconStatus === "matched");
      if (alreadyMatched.length > 0) {
        return res.status(400).json({ message: `${alreadyMatched.length} transaction(s) are already matched` });
      }
      const groups = await storage.getReconGroups();
      let maxNum = 0;
      for (const g of groups) {
        const m = g.reconId.match(/^REC-(\d+)$/);
        if (m) {
          const n = parseInt(m[1], 10);
          if (n > maxNum) maxNum = n;
        }
      }
      const reconId = `REC-${String(maxNum + 1).padStart(4, "0")}`;
      let totalDebit = 0;
      let totalCredit = 0;
      for (const t of txns) {
        totalDebit += t.debit || 0;
        totalCredit += t.credit || 0;
      }
      await storage.updateTransactionRecon(transactionIds, reconId, "Manual Match", "matched");
      await storage.insertReconGroup({
        reconId,
        ruleName: "Manual Match",
        totalDebit,
        totalCredit,
        transactionCount: transactionIds.length,
        status: "matched",
      });
      res.json({ reconId, matched: transactionIds.length });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/rules", async (_req, res) => {
    try {
      const rules = await storage.getRules();
      res.json(rules);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/rules", async (req, res) => {
    try {
      const { name, ruleType, priority, threshold, active, description } = req.body;
      if (!name || !ruleType || priority === undefined) {
        return res.status(400).json({ message: "name, ruleType, and priority are required" });
      }
      const rule = await storage.insertRule({
        name,
        ruleType,
        priority: parseInt(priority),
        threshold: threshold !== null && threshold !== undefined ? parseFloat(threshold) : null,
        active: active ?? true,
        description: description || null,
      });
      res.json(rule);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/rules/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid rule ID" });
      const updates: any = {};
      if (req.body.name !== undefined) updates.name = req.body.name;
      if (req.body.ruleType !== undefined) updates.ruleType = req.body.ruleType;
      if (req.body.priority !== undefined) updates.priority = parseInt(req.body.priority);
      if (req.body.threshold !== undefined) updates.threshold = req.body.threshold !== null ? parseFloat(req.body.threshold) : null;
      if (req.body.active !== undefined) updates.active = req.body.active;
      if (req.body.description !== undefined) updates.description = req.body.description;
      const rule = await storage.updateRule(id, updates);
      if (!rule) return res.status(404).json({ message: "Rule not found" });
      res.json(rule);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/rules/:id", async (req, res) => {
    try {
      await storage.deleteRule(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/dashboard", async (_req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/companies", async (_req, res) => {
    try {
      const companies = await storage.getCompanies();
      res.json(companies);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/counterparties", async (_req, res) => {
    try {
      const counterParties = await storage.getCounterParties();
      res.json(counterParties);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/upload-batches", async (_req, res) => {
    try {
      const batches = await storage.getUploadBatches();
      res.json(batches);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/company-pairs", async (_req, res) => {
    try {
      const pairs = await storage.getCompanyPairs();
      res.json(pairs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/recon-groups", async (_req, res) => {
    try {
      const groups = await storage.getReconGroups();
      res.json(groups);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  return httpServer;
}
