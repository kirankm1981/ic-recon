import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { runReconciliation } from "./reconciliation-engine";
import { runMlAnalysis, learnFromManualMatch, learnFromUnmatch, enhancedNarrationSimilarity } from "./ml-engine";
import multer from "multer";
import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";
import type { InsertTransaction, InsertSummarizedLine } from "@shared/schema";
import { randomUUID } from "crypto";
import path from "path";
import { existsSync } from "fs";

function parseFileToRecords(buffer: Buffer, filename: string, selectedSheet?: string): Record<string, string>[] {
  const ext = (filename || "").toLowerCase().split(".").pop();
  if (ext === "xlsx" || ext === "xls") {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = selectedSheet && workbook.SheetNames.includes(selectedSheet)
      ? selectedSheet
      : workbook.SheetNames[0];
    if (!sheetName) throw new Error("Excel file has no sheets");
    const sheet = workbook.Sheets[sheetName];
    const jsonRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
    return jsonRows.map(row => {
      const stringRow: Record<string, string> = {};
      for (const [key, val] of Object.entries(row)) {
        stringRow[key] = val != null ? String(val) : "";
      }
      return stringRow;
    });
  }
  const content = buffer.toString("utf-8");
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    relax_quotes: true,
  });
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get("/api/download-package", (_req, res) => {
    const filePath = path.resolve("ic-recon-full.tar.gz");
    if (existsSync(filePath)) {
      res.download(filePath, "ic-recon-full.tar.gz");
    } else {
      res.status(404).json({ message: "Package not found. Generate it first." });
    }
  });

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

  app.post("/api/upload/sheet-names", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const ext = (req.file.originalname || "").toLowerCase().split(".").pop();
      if (ext !== "xlsx" && ext !== "xls") {
        return res.json({ sheetNames: [] });
      }
      const workbook = XLSX.read(req.file.buffer, { type: "buffer", bookSheets: true });
      res.json({ sheetNames: workbook.SheetNames || [] });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/upload/preview-headers", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const ext = (req.file.originalname || "").toLowerCase().split(".").pop();
      const selectedSheet = req.body?.sheetName || null;
      let records: Record<string, string>[];
      if (ext === "xlsx" || ext === "xls") {
        const workbook = XLSX.read(req.file.buffer, { type: "buffer", sheetRows: 5 });
        const sheetName = selectedSheet && workbook.SheetNames.includes(selectedSheet)
          ? selectedSheet
          : workbook.SheetNames[0];
        if (!sheetName) throw new Error("Excel file has no sheets");
        const sheet = workbook.Sheets[sheetName];
        const jsonRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
        records = jsonRows.map(row => {
          const stringRow: Record<string, string> = {};
          for (const [key, val] of Object.entries(row)) {
            stringRow[key] = val != null ? String(val) : "";
          }
          return stringRow;
        });
      } else {
        const content = req.file.buffer.toString("utf-8");
        records = parse(content, {
          columns: true, skip_empty_lines: true, trim: true,
          relax_column_count: true, relax_quotes: true, to: 5,
        });
      }
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

      const columnMapping = req.body.columnMapping ? JSON.parse(req.body.columnMapping) : null;
      const selectedSheet = req.body.sheetName || undefined;

      const records = parseFileToRecords(req.file.buffer, req.file.originalname, selectedSheet);

      if (records.length === 0) {
        return res.status(400).json({ message: "File contains no data rows" });
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
        let cleaned = String(val).replace(/,/g, "").trim();
        const isNegative = cleaned.startsWith("(") && cleaned.endsWith(")");
        if (isNegative) {
          cleaned = cleaned.slice(1, -1);
        }
        const num = parseFloat(cleaned) || 0;
        return isNegative ? -num : num;
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
          icGl: findCol(r, columnMapping, "icGl", "IC GL", "ic_gl", "IC Account", "IC Ledger", "Intercompany GL").trim() || null,
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

      const groupMap = new Map<string, {
        company: string;
        counterParty: string;
        documentNo: string | null;
        docDate: string | null;
        narration: string | null;
        icGl: string | null;
        netAmount: number;
        transactionCount: number;
      }>();

      for (const t of inserted) {
        const key = `${(t.company || "").trim().toUpperCase()}||${(t.documentNo || "").trim().toUpperCase()}||${(t.counterParty || "").trim().toUpperCase()}`;
        if (!groupMap.has(key)) {
          groupMap.set(key, {
            company: t.company,
            counterParty: t.counterParty,
            documentNo: t.documentNo,
            docDate: t.docDate,
            narration: t.narration,
            icGl: t.icGl || null,
            netAmount: 0,
            transactionCount: 0,
          });
        }
        const group = groupMap.get(key)!;
        group.netAmount += t.netAmount || 0;
        group.transactionCount++;
        if (!group.docDate && t.docDate) group.docDate = t.docDate;
        if (!group.narration && t.narration) group.narration = t.narration;
        if (!group.icGl && t.icGl) group.icGl = t.icGl;
      }

      const summarizedLineEntries: InsertSummarizedLine[] = Array.from(groupMap.values())
        .filter(g => Math.abs(Math.round(g.netAmount * 100) / 100) >= 0.01)
        .map(g => ({
          uploadBatchId: batchId,
          company: g.company,
          counterParty: g.counterParty,
          documentNo: g.documentNo,
          docDate: g.docDate,
          narration: g.narration,
          icGl: g.icGl,
          netAmount: Math.round(g.netAmount * 100) / 100,
          transactionCount: g.transactionCount,
          reconStatus: "unmatched",
          reconId: null,
          reconRule: null,
        }));

      const insertedLines = await storage.insertSummarizedLines(summarizedLineEntries);

      const warnings: string[] = [];
      if (emptyCompanyCount > 0) warnings.push(`${emptyCompanyCount} rows had empty Company`);
      if (emptyCounterPartyCount > 0) warnings.push(`${emptyCounterPartyCount} rows had empty Counter Party`);

      res.json({
        batchId,
        totalRecords: inserted.length,
        summarizedLines: insertedLines.length,
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
      const { transactions, summarizedLines, uploadBatches, reconciliationGroups } = await import("@shared/schema");
      db.delete(transactions).run();
      db.delete(summarizedLines).run();
      db.delete(reconciliationGroups).run();
      db.delete(uploadBatches).run();
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/rules/reset", async (_req, res) => {
    try {
      const { db } = await import("./db");
      const { reconciliationRules } = await import("@shared/schema");
      db.delete(reconciliationRules).run();
      const { seedDefaultRules } = await import("./seed");
      await seedDefaultRules();
      const rules = await storage.getActiveRules();
      res.json(rules);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/summarized-lines", async (req, res) => {
    try {
      const filters: any = {};
      if (req.query.company) filters.company = req.query.company as string;
      if (req.query.counterParty) {
        const cp = req.query.counterParty as string;
        if (cp.includes(",")) {
          filters.counterParties = cp.split(",").map((s: string) => s.trim()).filter(Boolean);
        } else {
          filters.counterParty = cp;
        }
      }
      if (req.query.reconStatus) filters.reconStatus = req.query.reconStatus as string;
      if (req.query.reconId) filters.reconId = req.query.reconId as string;
      const lines = await storage.getSummarizedLines(filters);
      res.json(lines);
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
        return res.status(400).json({ message: "At least 2 line IDs required" });
      }
      const lines = await storage.getSummarizedLinesByIds(transactionIds);
      const alreadyMatched = lines.filter(t => t.reconStatus === "matched");
      if (alreadyMatched.length > 0) {
        return res.status(400).json({ message: `${alreadyMatched.length} line(s) are already matched` });
      }
      const totalPos = lines.reduce((s, t) => s + Math.max(t.netAmount || 0, 0), 0);
      const totalNeg = Math.abs(lines.reduce((s, t) => s + Math.min(t.netAmount || 0, 0), 0));
      if (totalPos <= 0 || totalNeg <= 0 || Math.abs(totalPos - totalNeg) >= 0.01) {
        return res.status(400).json({ message: `Amounts do not balance: debits (${totalPos.toFixed(2)}) must equal credits (${totalNeg.toFixed(2)})` });
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
      for (const t of lines) {
        const amt = t.netAmount || 0;
        if (amt > 0) totalDebit += amt;
        else totalCredit += Math.abs(amt);
      }
      await storage.updateSummarizedLineRecon(transactionIds, reconId, "Manual Match", "matched");
      await storage.insertReconGroup({
        reconId,
        ruleName: "Manual Match",
        totalDebit,
        totalCredit,
        transactionCount: transactionIds.length,
        status: "matched",
      });
      learnFromManualMatch(transactionIds).catch(err => console.error("[ML] Learn error:", err));
      res.json({ reconId, matched: transactionIds.length });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/unmatch", async (req, res) => {
    try {
      const { reconId } = req.body;
      if (!reconId) {
        return res.status(400).json({ message: "reconId is required" });
      }
      const lines = await storage.getSummarizedLines({ reconId });
      const lineIds = lines.map(l => l.id);
      const count = await storage.unmatchReconGroup(reconId);
      if (count === 0) {
        return res.status(404).json({ message: `No transactions found for ${reconId}` });
      }
      learnFromUnmatch(reconId, lineIds).catch(err => console.error("[ML] Unlearn error:", err));
      res.json({ reconId, unmatched: count });
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
      const { name, ruleType, priority, active, description, ruleId, matchType, dateTolerance, amountTolerance, amountTolerancePct, confidence, classification, params } = req.body;
      if (!name || !ruleType || priority === undefined) {
        return res.status(400).json({ message: "name, ruleType, and priority are required" });
      }
      const rule = await storage.insertRule({
        ruleId: ruleId || `IC-R${priority}`,
        name,
        ruleType,
        matchType: matchType || "1:1",
        priority: parseInt(priority),
        dateTolerance: dateTolerance !== null && dateTolerance !== undefined ? parseFloat(dateTolerance) : null,
        amountTolerance: amountTolerance !== null && amountTolerance !== undefined ? parseFloat(amountTolerance) : 5,
        amountTolerancePct: amountTolerancePct !== null && amountTolerancePct !== undefined ? parseFloat(amountTolerancePct) : 0,
        confidence: confidence || "real_match",
        classification: classification || "AUTO_MATCH",
        active: active ?? true,
        description: description || null,
        params: params || null,
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
      if (req.body.active !== undefined) updates.active = req.body.active;
      if (req.body.description !== undefined) updates.description = req.body.description;
      if (req.body.ruleId !== undefined) updates.ruleId = req.body.ruleId;
      if (req.body.matchType !== undefined) updates.matchType = req.body.matchType;
      if (req.body.dateTolerance !== undefined) updates.dateTolerance = req.body.dateTolerance !== null ? parseFloat(req.body.dateTolerance) : null;
      if (req.body.amountTolerance !== undefined) updates.amountTolerance = req.body.amountTolerance !== null ? parseFloat(req.body.amountTolerance) : 0;
      if (req.body.amountTolerancePct !== undefined) updates.amountTolerancePct = req.body.amountTolerancePct !== null ? parseFloat(req.body.amountTolerancePct) : 0;
      if (req.body.confidence !== undefined) updates.confidence = req.body.confidence;
      if (req.body.classification !== undefined) updates.classification = req.body.classification;
      if (req.body.params !== undefined) updates.params = req.body.params;
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

  app.get("/api/export/excel", async (req, res) => {
    try {
      const filters: any = {};
      if (req.query.company) filters.company = req.query.company as string;
      if (req.query.counterParty) filters.counterParty = req.query.counterParty as string;
      if (req.query.reconStatus) filters.reconStatus = req.query.reconStatus as string;

      const lines = await storage.getSummarizedLines(filters);

      const rows = lines.map(l => ({
        "Company": l.company,
        "Counter Party": l.counterParty,
        "Document No": l.documentNo || "",
        "Doc Date": l.docDate || "",
        "Net Amount": l.netAmount || 0,
        "Txn Count": l.transactionCount || 1,
        "IC GL": l.icGl || "",
        "Narration": l.narration || "",
        "Status": l.reconStatus,
        "Recon ID": l.reconId || "",
        "Rule": l.reconRule || "",
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Reconciliation");

      const colWidths = [
        { wch: 25 }, { wch: 25 }, { wch: 18 }, { wch: 12 },
        { wch: 16 }, { wch: 8 }, { wch: 20 }, { wch: 40 },
        { wch: 12 }, { wch: 12 }, { wch: 20 },
      ];
      ws["!cols"] = colWidths;

      const xlsxBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

      const company = (req.query.company as string) || "all";
      const counterParty = (req.query.counterParty as string) || "all";
      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = `recon_${company}_${counterParty}_${dateStr}.xlsx`;

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(Buffer.from(xlsxBuffer));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/export/reconciliation-template", async (req, res) => {
    try {
      const filters: any = {};
      if (req.query.company) filters.company = req.query.company as string;
      if (req.query.counterParty) filters.counterParty = req.query.counterParty as string;
      if (req.query.reconStatus) filters.reconStatus = req.query.reconStatus as string;

      const lines = await storage.getSummarizedLines(filters);

      const rows = lines.map(l => ({
        "Line ID": l.id,
        "Company": l.company,
        "Counter Party": l.counterParty,
        "Document No": l.documentNo || "",
        "Doc Date": l.docDate || "",
        "Net Amount": l.netAmount || 0,
        "Narration": l.narration || "",
        "Status": l.reconStatus,
        "Current Rec ID": l.reconId || "",
        "User Rec ID": "",
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Reconciliation Template");

      ws["!cols"] = [
        { wch: 8 }, { wch: 25 }, { wch: 25 }, { wch: 18 }, { wch: 12 },
        { wch: 16 }, { wch: 40 }, { wch: 14 }, { wch: 14 }, { wch: 16 },
      ];

      const xlsxBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = `recon_template_${dateStr}.xlsx`;

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(Buffer.from(xlsxBuffer));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/upload/reconciliation", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const wb = XLSX.read(req.file.buffer, { type: "buffer" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws);

      const groupedByRecId = new Map<string, number[]>();
      for (const row of rows) {
        const userRecId = (row["User Rec ID"] || "").toString().trim();
        const lineId = parseInt(row["Line ID"]);
        if (!userRecId || isNaN(lineId)) continue;
        if (!groupedByRecId.has(userRecId)) groupedByRecId.set(userRecId, []);
        groupedByRecId.get(userRecId)!.push(lineId);
      }

      if (groupedByRecId.size === 0) {
        return res.status(400).json({ message: "No valid User Rec ID entries found in the uploaded file. Please fill in the 'User Rec ID' column." });
      }

      const allLineIds = new Set<number>();
      const duplicateLineIds: number[] = [];
      for (const [, ids] of groupedByRecId) {
        for (const id of ids) {
          if (allLineIds.has(id)) duplicateLineIds.push(id);
          allLineIds.add(id);
        }
      }
      if (duplicateLineIds.length > 0) {
        return res.status(400).json({ message: `Line IDs appear in multiple groups: ${duplicateLineIds.join(", ")}. Each line can only belong to one User Rec ID.` });
      }

      const allLines = await storage.getSummarizedLines({});
      const lineMap = new Map(allLines.map(l => [l.id, l]));

      let totalMatched = 0;
      let groupsCreated = 0;
      const errors: string[] = [];

      const existingGroups = await storage.getReconGroups();
      let maxNum = 0;
      for (const g of existingGroups) {
        const m = g.reconId.match(/^REC-(\d+)$/);
        if (m) {
          const n = parseInt(m[1], 10);
          if (n > maxNum) maxNum = n;
        }
      }

      for (const [userRecId, lineIds] of groupedByRecId) {
        if (lineIds.length < 2) {
          errors.push(`${userRecId}: needs at least 2 transactions`);
          continue;
        }

        const lines = lineIds.map(id => lineMap.get(id)).filter(Boolean) as any[];
        if (lines.length !== lineIds.length) {
          errors.push(`${userRecId}: some Line IDs not found`);
          continue;
        }

        let totalDebit = 0;
        let totalCredit = 0;
        for (const t of lines) {
          const amt = t.netAmount || 0;
          if (amt > 0) totalDebit += amt;
          else totalCredit += Math.abs(amt);
        }

        maxNum++;
        const reconId = `REC-${String(maxNum).padStart(4, "0")}`;

        await storage.updateSummarizedLineRecon(lineIds, reconId, `Manual Upload (${userRecId})`, "matched");
        await storage.insertReconGroup({
          reconId,
          ruleName: `Manual Upload (${userRecId})`,
          totalDebit,
          totalCredit,
          transactionCount: lineIds.length,
          status: "matched",
        });

        totalMatched += lineIds.length;
        groupsCreated++;
      }

      res.json({
        message: `Uploaded successfully: ${groupsCreated} groups created, ${totalMatched} transactions matched`,
        groupsCreated,
        totalMatched,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/ml/analyze", async (_req, res) => {
    try {
      const result = await runMlAnalysis();
      res.json(result);
    } catch (error: any) {
      console.error("ML analysis error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/ml/suggestions", async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const suggestions = await storage.getMlSuggestions(status || "pending");
      const lineIds = new Set<number>();
      for (const s of suggestions) {
        lineIds.add(s.lineIdA);
        lineIds.add(s.lineIdB);
      }
      const lines = await storage.getSummarizedLinesByIds(Array.from(lineIds));
      const lineMap = new Map(lines.map(l => [l.id, l]));
      const enriched = suggestions.map(s => ({
        ...s,
        lineA: lineMap.get(s.lineIdA) || null,
        lineB: lineMap.get(s.lineIdB) || null,
      }));
      res.json(enriched);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/ml/suggestions/:id/accept", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const suggestions = await storage.getMlSuggestions("pending");
      const suggestion = suggestions.find(s => s.id === id);
      if (!suggestion) return res.status(404).json({ message: "Suggestion not found" });

      const lines = await storage.getSummarizedLinesByIds([suggestion.lineIdA, suggestion.lineIdB]);
      if (lines.length !== 2) return res.status(400).json({ message: "Lines not found" });

      const nonUnmatched = lines.filter(l => l.reconStatus !== "unmatched");
      if (nonUnmatched.length > 0) {
        await storage.updateMlSuggestionStatus(id, "rejected");
        return res.status(400).json({ message: "One or both lines are no longer unmatched. Suggestion auto-rejected." });
      }

      const groups = await storage.getReconGroups();
      let maxNum = 0;
      for (const g of groups) {
        const m = g.reconId.match(/^REC-(\d+)$/);
        if (m) { const n = parseInt(m[1], 10); if (n > maxNum) maxNum = n; }
      }
      const reconId = `REC-${String(maxNum + 1).padStart(4, "0")}`;

      let totalDebit = 0, totalCredit = 0;
      for (const t of lines) {
        const amt = t.netAmount || 0;
        if (amt > 0) totalDebit += amt;
        else totalCredit += Math.abs(amt);
      }

      await storage.updateSummarizedLineRecon([suggestion.lineIdA, suggestion.lineIdB], reconId, "ML Suggestion", "matched");
      await storage.insertReconGroup({
        reconId,
        ruleName: "ML Suggestion",
        totalDebit,
        totalCredit,
        transactionCount: 2,
        status: "matched",
      });
      await storage.updateMlSuggestionStatus(id, "accepted");
      learnFromManualMatch([suggestion.lineIdA, suggestion.lineIdB]).catch(() => {});

      res.json({ reconId, matched: 2 });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/ml/suggestions/:id/reject", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.updateMlSuggestionStatus(id, "rejected");
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/ml/anomalies", async (req, res) => {
    try {
      const resolved = req.query.resolved === "true" ? true : req.query.resolved === "false" ? false : undefined;
      const anomalies = await storage.getAnomalyFlags(resolved);
      const lineIds = [...new Set(anomalies.map(a => a.summarizedLineId))];
      const lines = await storage.getSummarizedLinesByIds(lineIds);
      const lineMap = new Map(lines.map(l => [l.id, l]));
      const enriched = anomalies.map(a => ({
        ...a,
        line: lineMap.get(a.summarizedLineId) || null,
      }));
      res.json(enriched);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/ml/anomalies/:id/resolve", async (req, res) => {
    try {
      await storage.resolveAnomalyFlag(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/ml/classifications", async (_req, res) => {
    try {
      const classifications = await storage.getUnmatchedClassifications();
      const lineIds = [...new Set(classifications.map(c => c.summarizedLineId))];
      const lines = await storage.getSummarizedLinesByIds(lineIds);
      const lineMap = new Map(lines.map(l => [l.id, l]));
      const enriched = classifications.map(c => ({
        ...c,
        line: lineMap.get(c.summarizedLineId) || null,
      }));
      res.json(enriched);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/ml/confidence", async (req, res) => {
    try {
      const reconId = req.query.reconId as string | undefined;
      const scores = await storage.getMatchConfidenceScores(reconId);
      res.json(scores);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/ml/confidence/distribution", async (_req, res) => {
    try {
      const scores = await storage.getMatchConfidenceScores();
      const buckets = [
        { range: "90-100%", min: 90, max: 100, count: 0 },
        { range: "75-89%", min: 75, max: 89, count: 0 },
        { range: "50-74%", min: 50, max: 74, count: 0 },
        { range: "25-49%", min: 25, max: 49, count: 0 },
        { range: "0-24%", min: 0, max: 24, count: 0 },
      ];
      for (const s of scores) {
        const score = s.overallScore || 0;
        for (const b of buckets) {
          if (score >= b.min && score <= b.max) { b.count++; break; }
        }
      }
      const avgScore = scores.length > 0
        ? Math.round(scores.reduce((sum, s) => sum + (s.overallScore || 0), 0) / scores.length)
        : 0;
      res.json({ buckets, avgScore, total: scores.length });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/ml/patterns", async (_req, res) => {
    try {
      const patterns = await storage.getMlMatchPatterns();
      res.json(patterns);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/ml/summary", async (_req, res) => {
    try {
      const [suggestions, anomalies, classifications, scores, patterns] = await Promise.all([
        storage.getMlSuggestions("pending"),
        storage.getAnomalyFlags(false),
        storage.getUnmatchedClassifications(),
        storage.getMatchConfidenceScores(),
        storage.getMlMatchPatterns(),
      ]);

      const classBreakdown = new Map<string, number>();
      for (const c of classifications) {
        classBreakdown.set(c.classification, (classBreakdown.get(c.classification) || 0) + 1);
      }

      const anomalyBreakdown = new Map<string, number>();
      for (const a of anomalies) {
        anomalyBreakdown.set(a.anomalyType, (anomalyBreakdown.get(a.anomalyType) || 0) + 1);
      }

      const avgConfidence = scores.length > 0
        ? Math.round(scores.reduce((s, c) => s + (c.overallScore || 0), 0) / scores.length)
        : 0;

      res.json({
        pendingSuggestions: suggestions.length,
        unresolvedAnomalies: anomalies.length,
        classifiedUnmatched: classifications.length,
        scoredMatches: scores.length,
        learnedPatterns: patterns.length,
        avgConfidence,
        classificationBreakdown: Object.fromEntries(classBreakdown),
        anomalyBreakdown: Object.fromEntries(anomalyBreakdown),
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/reports/entity-counterparty", async (_req, res) => {
    try {
      const lines = await storage.getSummarizedLines({});
      const pairMap = new Map<string, {
        entity: string; counterParty: string; total: number;
        matched: number; reversal: number; review: number; suggested: number; unmatched: number;
      }>();

      for (const line of lines) {
        const key = `${line.company}||${line.counterParty}`;
        if (!pairMap.has(key)) {
          pairMap.set(key, {
            entity: line.company,
            counterParty: line.counterParty,
            total: 0, matched: 0, reversal: 0, review: 0, suggested: 0, unmatched: 0,
          });
        }
        const entry = pairMap.get(key)!;
        entry.total++;
        const s = line.reconStatus || "unmatched";
        if (s === "matched" || s === "manual") entry.matched++;
        else if (s === "reversal") entry.reversal++;
        else if (s === "review_match") entry.review++;
        else if (s === "suggested_match") entry.suggested++;
        else entry.unmatched++;
      }

      const result = Array.from(pairMap.values())
        .map(p => ({
          ...p,
          rate: p.total > 0 ? Math.round(((p.matched + p.reversal) / p.total) * 10000) / 100 : 0,
        }))
        .sort((a, b) => a.entity.localeCompare(b.entity) || a.counterParty.localeCompare(b.counterParty));

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  return httpServer;
}
