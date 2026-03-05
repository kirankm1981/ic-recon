# IC Recon - Intercompany Reconciliation Platform

## Overview
Enterprise-grade intercompany reconciliation platform that automates matching of transactions between legal entities using rule-based matching, narration analysis, and configurable reconciliation rules.

## Architecture
- **Frontend**: React + Vite + TanStack Query + Wouter + Recharts + shadcn/ui
- **Backend**: Express.js with REST API
- **Database**: SQLite (via better-sqlite3) with Drizzle ORM — stored at `data/reconciliation.db`
- **File Processing**: multer + csv-parse

## Key Features
- CSV file upload for intercompany transactions
- Configurable rule-based reconciliation engine (7 rule types)
- Dashboard with KPIs and charts
- Reconciliation workspace with filters
- Exception management
- Manual reconciliation
- Rule configuration UI
- Audit trail
- CSV export

## Database Schema
- `transactions` - Intercompany transaction records
- `reconciliation_rules` - Configurable matching rules
- `reconciliation_groups` - Matched transaction groups
- `upload_batches` - File upload history
- `users` - User accounts

## Reconciliation Rules
1. Exact Match (amount + date)
2. Date Tolerance (amount + date within N days)
3. Reference Token Match (invoice numbers from narrations)
4. Narration Fuzzy Match (word similarity above threshold)
5. One-to-Many Aggregation
6. Many-to-One Aggregation
7. Amount Tolerance (percentage difference)

## Pages
- `/` - Dashboard with KPIs and charts
- `/upload` - CSV file upload
- `/workspace` - Reconciliation workspace with filters
- `/exceptions` - Unmatched transaction review
- `/manual` - Manual reconciliation
- `/rules` - Rule configuration
- `/audit` - Audit trail

## Windows Deployment (Offline)
- `windows/install.bat` — One-click installer: installs deps, builds, sets auto-start
- `windows/start-hidden.vbs` — Launches server silently (no console popup)
- `windows/stop-server.vbs` — Stops the background server
- `windows/uninstall.bat` — Removes auto-start entry
- `windows/package-for-windows.bat` — Bundles built app into distributable folder
- Server runs at `http://localhost:5000` in background on Windows boot
- Logs written to `logs/server.log`, database at `data/reconciliation.db`

## API Endpoints
- `GET /api/transactions` - List transactions with filters
- `POST /api/upload` - Upload CSV file
- `POST /api/reconcile` - Run reconciliation engine
- `POST /api/manual-reconcile` - Manual match
- `GET/POST/PATCH/DELETE /api/rules` - Rule CRUD
- `GET /api/dashboard` - Dashboard statistics
- `GET /api/companies` - Distinct companies
- `GET /api/counterparties` - Distinct counter parties
- `GET /api/upload-batches` - Upload history
- `GET /api/recon-groups` - Reconciliation groups
