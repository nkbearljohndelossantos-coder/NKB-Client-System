# Production Readiness Checklist & Deployment Verification

This document is the official release gate for deploying **NKB Manufacturing & Trading Webapp** to GitHub and hosting platforms like Hostinger.

---

## 🔒 1. Security & Environment Configuration

- [x] **Repository Isolation:** `.gitignore` configured to prevent committing `.env`, `node_modules/`, `*.sqlite`, `*.db`, `logs/`, `backups/`, or private keys.
- [x] **No Hardcoded Secrets:** No API keys, database credentials, or real production secrets in source code or `README.md`.
- [x] **Clean Configuration Template:** `.env.example` contains only placeholder configurations.
- [x] **Password Hashing:** Passwords encrypted using `bcryptjs` with high salt rounds (12).
- [x] **Authentication Security:** JWT with configurable expiration and secure HTTP-only cookies.
- [x] **Brute Force Protection:** Rate limiting enabled on `/api/auth/login`.
- [x] **Security Headers:** `helmet` enabled with Content Security Policy, XSS protection, and frameguard.
- [x] **CORS Hardening:** Configurable allowed origins via `CORS_ORIGIN` / `APP_URL`.
- [x] **Safe Error Responses:** Production errors sanitized (no stack traces, database queries, or file paths returned to clients).
- [x] **Password Change Capability:** Authenticated users can update passwords via `/api/auth/change-password`.

---

## 🗄️ 2. Database, Migrations & Backup

- [x] **Separation of Schema & Seed Data:**
  - `npm run migrate` creates production tables and indexes cleanly without inserting fake demo data.
  - `npm run seed` is strictly reserved for local development and testing.
- [x] **Foreign Keys & Transactions:** `PRAGMA foreign_keys = ON` enforced and all critical workflows (DR acceptance, Invoicing, Payments, Buffer reservation) run in transactions.
- [x] **Non-destructive Online Backup:** `npm run backup` creates point-in-time snapshots using SQLite safe online vacuum.
- [x] **Database Restore Procedure:** `database/restore.js` with automatic emergency snapshots.
- [x] **Standalone Admin Initialization:** `database/init-admin.js` allows configuring production Super Admin without default passwords.

---

## 💼 3. Core Business Rule & Financial Integrity

- [x] **Delivery-Based Invoicing:** Invoices are strictly generated from accepted Delivery Receipts (DR), NOT merely Purchase Orders (PO).
  - *Verification:* PO 1,000 pcs @ ₱120 $\rightarrow$ Actual Yield 1,100 pcs $\rightarrow$ Accepted DR 1,100 pcs $\rightarrow$ **Invoice: 1,100 × ₱120 = ₱132,000**.
- [x] **Manufacturing Tolerance (±10%):** Enforced and stored per PO.
- [x] **Over-Tolerance Exception:** Batches exceeding agreed tolerance (e.g. 1,250 pcs) set to `EXCEPTION_REQUIRES_APPROVAL` and require managerial override.
- [x] **Buffer Stock Isolation:** Option B routing extra output into tracked client buffer inventory.
- [x] **Partial & Return Deliveries:** Rejections recorded in `returns` table and deducted from billable count.
- [x] **Duplicate Invoice Prevention:** System rejects generating multiple invoices for the same DR.
- [x] **Document Immutability:** Invoices cannot be modified post-issuance without audited void/correction workflows.

---

## ☁️ 4. Hostinger & Cloud Deployment

- [x] **Dynamic Port & Host Binding:** Uses `process.env.PORT || 3000`.
- [x] **No Hardcoded Domains:** Uses `APP_URL` and relative client-side API requests.
- [x] **Health Check Endpoint:** `GET /api/health` returns `{ "status": "ok", "environment": "production" }`.
- [x] **Printable Documents:** A4 print CSS for Delivery Receipts and Sales Invoices.

---

## 🧪 5. Automated Test Pass Verification

```
▶ NKB Manufacturing & Invoicing Workflow Tests
  ✔ 1. Core Business Rule: 1,000 PO -> 1,100 Actual Yield -> 1,100 DR Accepted -> ₱132,000 Invoiced
  ✔ 2. Under-run: 1,000 PO -> 950 Actual Yield -> 950 DR Accepted -> ₱114,000 Invoiced
  ✔ 3. Over-Tolerance Exception: 1,000 PO with ±10% -> 1,250 Yield requires approval
  ✔ 4. Duplicate Invoice Prevention & Unaccepted DR invoice block
  ✔ 5. Option B: Fixed PO Billing + Client Buffer Stock Reservation
  ✔ 6. Return & Rejection: Delivered 1,000 -> Accepted 980, Rejected 20 -> Invoice ₱117,600
  ✔ 7. Client Isolation: Client A cannot access Client B data
✔ Status: 7/7 Passing (100%)
```

---

**Approval:** All checklist criteria verified. Application is prepared for GitHub repository push and Hostinger Node.js deployment.
