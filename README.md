# NKB Manufacturing & Trading - B2B Cosmetics Portal & Invoicing System

A full-stack Node.js enterprise web application engineered specifically for cosmetics and personal care manufacturing businesses to solve the **Manufacturing Over-run / Yield Variance Billing Problem**.

---

## 🎯 The Core Problem & Solution

### ❌ The Old Problem:
In cosmetics compounding and bottling, batch yield varies due to tank minimums and filling tolerances. When a client orders **1,000 pcs of Lotion**, but the production run produces and delivers **1,100 pcs**, traditional accounting systems wrongly generate an invoice based solely on the original Purchase Order (1,000 pcs @ ₱120 = ₱120,000), leaving 100 finished units unbilled.

###  The NKB Delivery-Based Invoicing Solution:
1. **Enforces Delivery-Based Invoicing:** Invoices are generated strictly from the actual **accepted Delivery Receipt (DR)** count (1,100 pcs × ₱120 = **₱132,000**).
2. **Manufacturing Tolerance Agreements:** Every Purchase Order stores an agreed tolerance (default ±10%). Over-runs within tolerance (up to 1,100 pcs) are automatically billable.
3. **Over-Tolerance Protection:** Batches exceeding the tolerance limit (e.g. 1,250 pcs) trigger an `EXCEPTION_REQUIRES_APPROVAL` status requiring authorized managerial review before dispatch.
4. **Buffer Stock Option (Option B):** Clients who opt for fixed PO billing have their extra units automatically routed into a tracked **Client Reserved Buffer Stock** in the warehouse for future drawdowns.
5. **Digital E-Signature DR Acceptance:** Real-time physical inspection, damage/rejection logging, and digital canvas signature before invoicing.

---

## 🚀 Key Features

* **Complete Manufacturing Lifecycle:**
  $$\text{Purchase Order (PO)} \rightarrow \text{Job Order (JO)} \rightarrow \text{Batch Yield Logging} \rightarrow \text{Dispatch / DR} \rightarrow \text{Client Digital Acceptance} \rightarrow \text{Sales Invoice} \rightarrow \text{Payment \& AR}$$
* **Role-Based Access Control (RBAC):**
  * `SUPER_ADMIN` / `ADMIN`: Complete operations, client management, over-run approvals, and financial reporting.
  * `PRODUCTION`: Job orders, batch compounding, and yield logging.
  * `WAREHOUSE`: Finished goods stock, dispatching, and DR issuance.
  * `ACCOUNTING`: Automated DR-to-Invoice generation, payment recording, and AR aging buckets.
  * `CLIENT`: Isolated portal for placing orders, live batch tracking, digital DR acceptance, and statement of accounts.
* **A4 Printable Documents:**
  * Professional A4 Delivery Receipts (`/print-dr.html?id=...`)
  * Professional A4 Sales Invoices with over-run variance line items (`/print-invoice.html?id=...`)
* **Real-time Analytics:** Production yield charts, overrun/underrun summaries, and Accounts Receivable aging buckets.

---

## 💻 Architecture & Tech Stack

* **Backend:** Node.js, Express.js
* **Database:** SQLite with foreign keys and WAL mode (`node:sqlite`)
* **Security:** `helmet` security headers, `express-rate-limit` brute-force protection, HTTP-only cookies, `bcryptjs` password hashing
* **Frontend:** Responsive HTML5, Tailwind CSS, Vanilla JS, Chart.js, HTML5 Canvas E-Signature Pad
* **Testing:** Node.js native test runner + `supertest`

---

## 🛠️ Local Development Quickstart

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Seed demo data (for development testing only):**
   ```bash
   npm run seed
   ```

3. **Run automated tests:**
   ```bash
   npm test
   ```

4. **Start local development server:**
   ```bash
   npm run dev
   ```
   Open in your browser: `http://localhost:3000`

---

## 🔒 Production Setup & Database Migrations

For production environments (e.g. Hostinger, VPS, Cloud):

1. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and set your production values:
   ```env
   NODE_ENV=production
   PORT=3000
   APP_URL=https://your-domain.com
   CORS_ORIGIN=https://your-domain.com
   DATABASE_PATH=./database/nkb.sqlite
   JWT_SECRET=YOUR_SECURE_RANDOM_SECRET_KEY
   COOKIE_SECURE=true
   ```

2. **Initialize clean database schema (without fake demo data):**
   ```bash
   npm run migrate
   ```

3. **Create your Production Super Administrator:**
   ```bash
   npm run init-admin <admin-email> <secure-password> "Admin Name"
   ```
   *Example:*
   ```bash
   npm run init-admin admin@yourcompany.com StrongPassword2026! "Operations Director"
   ```

4. **Start production server:**
   ```bash
   npm start
   ```

---

## ☁️ Deploying to Hostinger (Node.js Hosting)

1. **Prepare Git Repository:**
   Ensure `.env`, `node_modules/`, `*.sqlite`, and logs are in `.gitignore` (already configured). Push your repository to your private GitHub account.

2. **Create Node.js Application in Hostinger hPanel:**
   * Go to **Websites** $\rightarrow$ **Manage** $\rightarrow$ **Node.js**.
   * Set **Node.js version** to `20.x` or `22.x` (LTS).
   * Set **Application Root** to your repository directory.
   * Set **Application Startup File** to `server.js`.
   * Set **Environment** to `Production`.

3. **Configure Environment Variables in Hostinger:**
   Add the following in your Hostinger Node.js environment settings:
   * `NODE_ENV`: `production`
   * `APP_URL`: `https://yourdomain.com`
   * `CORS_ORIGIN`: `https://yourdomain.com`
   * `JWT_SECRET`: *(A strong 32+ character random string)*
   * `COOKIE_SECURE`: `true`

4. **Install Dependencies & Migrate Database:**
   In Hostinger Terminal or SSH:
   ```bash
   npm install --omit=dev
   npm run migrate
   npm run init-admin your-admin@yourdomain.com YourSecurePassword123!
   ```

5. **Enable SSL / HTTPS:**
   * Enable Free SSL in Hostinger hPanel for your domain.

6. **Start & Verify Application:**
   * Click **Restart Application** in Hostinger.
   * Visit `https://yourdomain.com/api/health` $\rightarrow$ should return `{"status":"ok","environment":"production"}`.
   * Log in to `https://yourdomain.com/admin.html`.

---

## 📦 Database Backup & Recovery Procedures

### 1. Performing an Online Point-in-Time Backup:
Run the safe online backup utility (creates a clean snapshot without stopping the server):
```bash
npm run backup
```
Snapshots are timestamped and stored in `database/backups/nkb-backup-YYYY-MM-DD....sqlite`.

### 2. Restoring from Backup:
To restore from a backup file:
```bash
node database/restore.js database/backups/nkb-backup-YYYY-MM-DD....sqlite
```
*(The restore utility automatically creates an emergency snapshot of your existing database before overwriting)*.

---

## 🔑 Development Demo Accounts

*(For local testing only. Never deploy demo accounts to production)*:

| Role | Email | Password | Access |
|---|---|---|---|
| **Admin** | `admin@nkbmanufacturing.com` | `Admin123!` | `/admin.html` |
| **Client** | `client@example.com` | `Client123!` | `/client.html` |
| **Production** | `production@nkbmanufacturing.com` | `Staff123!` | `/admin.html` (JO/Batch) |
| **Warehouse** | `warehouse@nkbmanufacturing.com` | `Staff123!` | `/admin.html` (Dispatch) |
| **Accounting** | `accounting@nkbmanufacturing.com` | `Staff123!` | `/admin.html` (Invoices/AR) |

---

## 🧪 Automated Test Suite

Run the full automated test suite:
```bash
npm test
```

### Verified Business Rule Test Cases:
*  **Core Rule:** 1,000 PO $\rightarrow$ 1,100 Yield $\rightarrow$ 1,100 DR Accepted $\rightarrow$ ₱132,000 Invoiced (NOT ₱120,000)
*  **Under-run:** 1,000 PO $\rightarrow$ 950 Actual $\rightarrow$ ₱114,000 Invoiced
*  **Over-Tolerance (+25%):** 1,000 PO $\rightarrow$ 1,250 Yield requires approval
*  **Duplicate Invoicing Prevention:** Rejects invoicing an already invoiced DR
*  **Option B (Fixed PO + Buffer):** Invoices 1,000 pcs and reserves 100 pcs in buffer
*  **Damaged Returns:** 1,000 delivered $\rightarrow$ 980 accepted, 20 rejected $\rightarrow$ Invoices ₱117,600
*  **Client Security Isolation:** Prohibits Client A from viewing Client B records
