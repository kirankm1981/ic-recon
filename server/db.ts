import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@shared/schema";
import path from "path";

const dbPath = path.resolve("data", "reconciliation.db");

import fs from "fs";
const dataDir = path.resolve("data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    upload_batch_id TEXT NOT NULL,
    company TEXT NOT NULL,
    counter_party TEXT NOT NULL,
    business_unit TEXT,
    account_head TEXT,
    sub_account_head TEXT,
    debit REAL DEFAULT 0,
    credit REAL DEFAULT 0,
    net_amount REAL DEFAULT 0,
    document_no TEXT,
    doc_date TEXT,
    narration TEXT,
    ic_gl TEXT,
    recon_status TEXT DEFAULT 'unmatched',
    recon_id TEXT,
    recon_rule TEXT,
    created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS summarized_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    upload_batch_id TEXT NOT NULL,
    company TEXT NOT NULL,
    counter_party TEXT NOT NULL,
    document_no TEXT,
    doc_date TEXT,
    narration TEXT,
    ic_gl TEXT,
    net_amount REAL DEFAULT 0,
    transaction_count INTEGER DEFAULT 1,
    recon_status TEXT DEFAULT 'unmatched',
    recon_id TEXT,
    recon_rule TEXT,
    created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS reconciliation_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_id TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    rule_type TEXT NOT NULL,
    match_type TEXT DEFAULT '1:1',
    priority INTEGER NOT NULL,
    date_tolerance REAL,
    amount_tolerance REAL DEFAULT 0,
    amount_tolerance_pct REAL DEFAULT 0,
    confidence TEXT DEFAULT 'real_match',
    classification TEXT DEFAULT 'AUTO_MATCH',
    active INTEGER DEFAULT 1,
    description TEXT,
    params TEXT
  );
  CREATE TABLE IF NOT EXISTS reconciliation_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recon_id TEXT NOT NULL UNIQUE,
    rule_name TEXT NOT NULL,
    total_debit REAL DEFAULT 0,
    total_credit REAL DEFAULT 0,
    transaction_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'matched',
    created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS upload_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id TEXT NOT NULL UNIQUE,
    file_name TEXT NOT NULL,
    total_records INTEGER DEFAULT 0,
    uploaded_at TEXT
  );
  CREATE TABLE IF NOT EXISTS ml_match_patterns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern_type TEXT NOT NULL,
    company_a TEXT NOT NULL,
    company_b TEXT NOT NULL,
    amount_range TEXT,
    date_range TEXT,
    narration_pattern TEXT,
    document_pattern TEXT,
    weight REAL DEFAULT 1.0,
    occurrences INTEGER DEFAULT 1,
    last_used TEXT,
    created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS match_confidence_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    summarized_line_id INTEGER NOT NULL,
    recon_id TEXT,
    overall_score REAL DEFAULT 0,
    amount_score REAL DEFAULT 0,
    date_score REAL DEFAULT 0,
    narration_score REAL DEFAULT 0,
    reference_score REAL DEFAULT 0,
    pattern_score REAL DEFAULT 0,
    factors TEXT,
    created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS anomaly_flags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    summarized_line_id INTEGER NOT NULL,
    anomaly_type TEXT NOT NULL,
    severity TEXT DEFAULT 'medium',
    description TEXT NOT NULL,
    details TEXT,
    resolved INTEGER DEFAULT 0,
    created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS unmatched_classifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    summarized_line_id INTEGER NOT NULL,
    classification TEXT NOT NULL,
    confidence REAL DEFAULT 0,
    reasoning TEXT,
    suggested_action TEXT,
    created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS ml_suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    line_id_a INTEGER NOT NULL,
    line_id_b INTEGER NOT NULL,
    confidence_score REAL DEFAULT 0,
    amount_score REAL DEFAULT 0,
    date_score REAL DEFAULT 0,
    narration_score REAL DEFAULT 0,
    reference_score REAL DEFAULT 0,
    pattern_score REAL DEFAULT 0,
    reasoning TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT
  );
`);

function addColumnIfNotExists(table: string, column: string, definition: string) {
  try {
    const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as any[];
    if (!cols.find((c: any) => c.name === column)) {
      sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  } catch {}
}

addColumnIfNotExists("reconciliation_rules", "rule_id", "TEXT NOT NULL DEFAULT ''");
addColumnIfNotExists("reconciliation_rules", "match_type", "TEXT DEFAULT '1:1'");
addColumnIfNotExists("reconciliation_rules", "date_tolerance", "REAL");
addColumnIfNotExists("reconciliation_rules", "amount_tolerance", "REAL DEFAULT 0");
addColumnIfNotExists("reconciliation_rules", "amount_tolerance_pct", "REAL DEFAULT 0");
addColumnIfNotExists("reconciliation_rules", "confidence", "TEXT DEFAULT 'real_match'");
addColumnIfNotExists("reconciliation_rules", "classification", "TEXT DEFAULT 'AUTO_MATCH'");
addColumnIfNotExists("reconciliation_rules", "params", "TEXT");

export const db = drizzle(sqlite, { schema });
