-- NKB Manufacturing & Trading Database Schema
-- SQLite3 with Foreign Keys Enabled

PRAGMA foreign_keys = ON;

-- Document Sequence Counters for Transaction-Safe Numbering
CREATE TABLE IF NOT EXISTS document_sequences (
    doc_type TEXT PRIMARY KEY,
    current_year INTEGER NOT NULL,
    last_sequence INTEGER NOT NULL DEFAULT 0
);

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'PRODUCTION', 'WAREHOUSE', 'ACCOUNTING', 'CLIENT')),
    client_id TEXT,
    phone TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
);

-- Clients Table
CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    company_name TEXT NOT NULL,
    contact_person TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT NOT NULL,
    address TEXT NOT NULL,
    tin TEXT,
    default_billing_policy TEXT NOT NULL DEFAULT 'ACTUAL_DELIVERY' CHECK (default_billing_policy IN ('ACTUAL_DELIVERY', 'FIXED_PO_BUFFER')),
    default_tolerance_percent REAL NOT NULL DEFAULT 10.0,
    credit_limit REAL NOT NULL DEFAULT 500000.0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Products Table
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    sku TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Cosmetics',
    description TEXT,
    unit TEXT NOT NULL DEFAULT 'pcs',
    default_price REAL NOT NULL,
    formula_code TEXT,
    shelf_life_months INTEGER NOT NULL DEFAULT 24,
    current_stock INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Client-Specific Product Catalog & Custom Pricing Table
CREATE TABLE IF NOT EXISTS client_product_prices (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    custom_name TEXT,
    custom_price REAL NOT NULL CHECK (custom_price >= 0),
    custom_sku TEXT,
    custom_formula_code TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    UNIQUE(client_id, product_id)
);

-- Purchase Orders (PO)
CREATE TABLE IF NOT EXISTS purchase_orders (
    id TEXT PRIMARY KEY,
    po_number TEXT UNIQUE NOT NULL,
    client_id TEXT NOT NULL,
    po_date TEXT NOT NULL DEFAULT (date('now')),
    expected_delivery_date TEXT,
    tolerance_percent REAL NOT NULL DEFAULT 10.0,
    billing_policy TEXT NOT NULL DEFAULT 'ACTUAL_DELIVERY' CHECK (billing_policy IN ('ACTUAL_DELIVERY', 'FIXED_PO_BUFFER')),
    status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'IN_PRODUCTION', 'PARTIALLY_DELIVERED', 'COMPLETED', 'CANCELLED')),
    notes TEXT,
    subtotal REAL NOT NULL DEFAULT 0.0,
    tax_percent REAL NOT NULL DEFAULT 0.0,
    tax_amount REAL NOT NULL DEFAULT 0.0,
    grand_total REAL NOT NULL DEFAULT 0.0,
    created_by TEXT NOT NULL,
    approved_by TEXT,
    approved_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Purchase Order Items
CREATE TABLE IF NOT EXISTS purchase_order_items (
    id TEXT PRIMARY KEY,
    po_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    target_quantity INTEGER NOT NULL CHECK (target_quantity > 0),
    min_allowed_quantity INTEGER NOT NULL,
    max_allowed_quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL CHECK (unit_price >= 0),
    subtotal REAL NOT NULL,
    delivered_quantity INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
);

-- Job Orders (JO)
CREATE TABLE IF NOT EXISTS job_orders (
    id TEXT PRIMARY KEY,
    jo_number TEXT UNIQUE NOT NULL,
    po_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    target_quantity INTEGER NOT NULL CHECK (target_quantity > 0),
    scheduled_start_date TEXT,
    scheduled_end_date TEXT,
    assigned_team TEXT DEFAULT 'Formulation & Bottling Team Alpha',
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PRODUCTION', 'COMPLETED', 'CANCELLED')),
    notes TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE RESTRICT,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Production Batches
CREATE TABLE IF NOT EXISTS production_batches (
    id TEXT PRIMARY KEY,
    batch_number TEXT UNIQUE NOT NULL,
    jo_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    formula_code TEXT,
    production_date TEXT NOT NULL DEFAULT (date('now')),
    expiry_date TEXT NOT NULL,
    target_quantity INTEGER NOT NULL CHECK (target_quantity > 0),
    actual_yield INTEGER NOT NULL DEFAULT 0,
    variance_quantity INTEGER NOT NULL DEFAULT 0,
    variance_percent REAL NOT NULL DEFAULT 0.0,
    status TEXT NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED', 'MIXING', 'BOTTLING', 'QC_PASSED', 'EXCEPTION_REQUIRES_APPROVAL', 'APPROVED_FOR_DISPATCH', 'COMPLETED', 'REJECTED')),
    qc_notes TEXT,
    qc_passed_by TEXT,
    qc_passed_at TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (jo_id) REFERENCES job_orders(id) ON DELETE RESTRICT,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Batch Yields / Logs
CREATE TABLE IF NOT EXISTS batch_yields (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
    target_quantity INTEGER NOT NULL,
    actual_yield INTEGER NOT NULL,
    variance_quantity INTEGER NOT NULL,
    variance_percent REAL NOT NULL,
    logged_by TEXT NOT NULL,
    notes TEXT,
    FOREIGN KEY (batch_id) REFERENCES production_batches(id) ON DELETE CASCADE,
    FOREIGN KEY (logged_by) REFERENCES users(id)
);

-- Overrun Approvals (For Yield Exceeding Tolerance Limit)
CREATE TABLE IF NOT EXISTS overrun_approvals (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    po_id TEXT NOT NULL,
    target_quantity INTEGER NOT NULL,
    actual_yield INTEGER NOT NULL,
    max_tolerance_quantity INTEGER NOT NULL,
    excess_quantity INTEGER NOT NULL,
    approved_quantity INTEGER NOT NULL,
    reason TEXT NOT NULL,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'APPROVED' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    approved_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (batch_id) REFERENCES production_batches(id) ON DELETE CASCADE,
    FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
    FOREIGN KEY (approved_by) REFERENCES users(id)
);

-- Delivery Receipts (DR)
CREATE TABLE IF NOT EXISTS delivery_receipts (
    id TEXT PRIMARY KEY,
    dr_number TEXT UNIQUE NOT NULL,
    client_id TEXT NOT NULL,
    po_id TEXT NOT NULL,
    jo_id TEXT,
    delivery_date TEXT NOT NULL DEFAULT (date('now')),
    driver_name TEXT,
    vehicle_plate TEXT,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'DISPATCHED', 'PENDING_CLIENT_ACCEPTANCE', 'ACCEPTED', 'INVOICED', 'REJECTED', 'CANCELLED')),
    notes TEXT,
    dispatched_by TEXT,
    dispatched_at TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT,
    FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE RESTRICT,
    FOREIGN KEY (jo_id) REFERENCES job_orders(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Delivery Items
CREATE TABLE IF NOT EXISTS delivery_items (
    id TEXT PRIMARY KEY,
    dr_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    batch_id TEXT NOT NULL,
    delivered_quantity INTEGER NOT NULL CHECK (delivered_quantity > 0),
    accepted_quantity INTEGER NOT NULL DEFAULT 0,
    rejected_quantity INTEGER NOT NULL DEFAULT 0,
    unit_price REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (dr_id) REFERENCES delivery_receipts(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
    FOREIGN KEY (batch_id) REFERENCES production_batches(id) ON DELETE RESTRICT
);

-- DR Acceptances (Digital Sign-off by Client)
CREATE TABLE IF NOT EXISTS dr_acceptances (
    id TEXT PRIMARY KEY,
    dr_id TEXT UNIQUE NOT NULL,
    client_user_id TEXT NOT NULL,
    signer_name TEXT NOT NULL,
    signer_title TEXT,
    signature_data TEXT, -- Base64 digital canvas or signature text
    signature_type TEXT NOT NULL DEFAULT 'DRAWN' CHECK (signature_type IN ('DRAWN', 'TYPED')),
    total_delivered_quantity INTEGER NOT NULL,
    total_accepted_quantity INTEGER NOT NULL,
    total_rejected_quantity INTEGER NOT NULL DEFAULT 0,
    acceptance_notes TEXT,
    ip_address TEXT,
    user_agent TEXT,
    accepted_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (dr_id) REFERENCES delivery_receipts(id) ON DELETE CASCADE,
    FOREIGN KEY (client_user_id) REFERENCES users(id)
);

-- Returns / Rejections Table
CREATE TABLE IF NOT EXISTS returns (
    id TEXT PRIMARY KEY,
    dr_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    batch_id TEXT NOT NULL,
    rejected_quantity INTEGER NOT NULL CHECK (rejected_quantity > 0),
    reason TEXT NOT NULL,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'LOGGED' CHECK (status IN ('LOGGED', 'REPLACED', 'CREDITED', 'DISPOSED')),
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (dr_id) REFERENCES delivery_receipts(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
    FOREIGN KEY (batch_id) REFERENCES production_batches(id) ON DELETE RESTRICT,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Sales Invoices (SI)
CREATE TABLE IF NOT EXISTS sales_invoices (
    id TEXT PRIMARY KEY,
    invoice_number TEXT UNIQUE NOT NULL,
    client_id TEXT NOT NULL,
    dr_id TEXT UNIQUE NOT NULL,
    po_id TEXT NOT NULL,
    invoice_date TEXT NOT NULL DEFAULT (date('now')),
    due_date TEXT NOT NULL,
    billing_policy TEXT NOT NULL DEFAULT 'ACTUAL_DELIVERY' CHECK (billing_policy IN ('ACTUAL_DELIVERY', 'FIXED_PO_BUFFER')),
    subtotal REAL NOT NULL,
    tax_percent REAL NOT NULL DEFAULT 0.0,
    tax_amount REAL NOT NULL DEFAULT 0.0,
    discount_amount REAL NOT NULL DEFAULT 0.0,
    total_amount REAL NOT NULL,
    paid_amount REAL NOT NULL DEFAULT 0.0,
    balance_due REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'UNPAID' CHECK (status IN ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID')),
    notes TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT,
    FOREIGN KEY (dr_id) REFERENCES delivery_receipts(id) ON DELETE RESTRICT,
    FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE RESTRICT,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Invoice Items
CREATE TABLE IF NOT EXISTS invoice_items (
    id TEXT PRIMARY KEY,
    invoice_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    batch_id TEXT,
    po_quantity INTEGER NOT NULL,
    delivered_quantity INTEGER NOT NULL,
    accepted_quantity INTEGER NOT NULL,
    billable_quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    line_total REAL NOT NULL,
    is_overrun INTEGER NOT NULL DEFAULT 0,
    overrun_quantity INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (invoice_id) REFERENCES sales_invoices(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
    FOREIGN KEY (batch_id) REFERENCES production_batches(id) ON DELETE SET NULL
);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    payment_number TEXT UNIQUE NOT NULL,
    invoice_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    payment_date TEXT NOT NULL DEFAULT (date('now')),
    amount REAL NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('BANK_TRANSFER', 'CHECK', 'CASH', 'GCASH', 'ONLINE_BANKING')),
    reference_number TEXT NOT NULL,
    notes TEXT,
    recorded_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (invoice_id) REFERENCES sales_invoices(id) ON DELETE RESTRICT,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT,
    FOREIGN KEY (recorded_by) REFERENCES users(id)
);

-- Client Reserved Buffer Stock (For Option B: FIXED_PO_BUFFER)
CREATE TABLE IF NOT EXISTS client_buffer_stock (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    source_batch_id TEXT NOT NULL,
    source_po_id TEXT NOT NULL,
    source_dr_id TEXT,
    initial_quantity INTEGER NOT NULL CHECK (initial_quantity > 0),
    quantity_released INTEGER NOT NULL DEFAULT 0,
    quantity_remaining INTEGER NOT NULL CHECK (quantity_remaining >= 0),
    date_reserved TEXT NOT NULL DEFAULT (date('now')),
    expiry_date TEXT,
    status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'RESERVED', 'PARTIALLY_RELEASED', 'RELEASED', 'CONSUMED', 'EXPIRED')),
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
    FOREIGN KEY (source_batch_id) REFERENCES production_batches(id) ON DELETE RESTRICT,
    FOREIGN KEY (source_po_id) REFERENCES purchase_orders(id) ON DELETE RESTRICT
);

-- Inventory Movements
CREATE TABLE IF NOT EXISTS inventory_movements (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    batch_id TEXT,
    movement_type TEXT NOT NULL CHECK (movement_type IN ('PRODUCTION_OUTPUT', 'DELIVERY', 'RETURN', 'BUFFER_RESERVATION', 'BUFFER_RELEASE', 'ADJUSTMENT')),
    quantity INTEGER NOT NULL, -- Positive for in, Negative for out
    balance_after INTEGER NOT NULL,
    reference_type TEXT NOT NULL, -- 'BATCH', 'DR', 'RETURN', 'BUFFER', 'MANUAL'
    reference_id TEXT NOT NULL,
    notes TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
    FOREIGN KEY (batch_id) REFERENCES production_batches(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    user_name TEXT,
    user_role TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    details TEXT,
    ip_address TEXT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Create Indexes for High Performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_client ON users(client_id);
CREATE INDEX IF NOT EXISTS idx_po_client ON purchase_orders(client_id);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_jo_po ON job_orders(po_id);
CREATE INDEX IF NOT EXISTS idx_batches_jo ON production_batches(jo_id);
CREATE INDEX IF NOT EXISTS idx_dr_client ON delivery_receipts(client_id);
CREATE INDEX IF NOT EXISTS idx_dr_status ON delivery_receipts(status);
CREATE INDEX IF NOT EXISTS idx_invoices_client ON sales_invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON sales_invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_dr ON sales_invoices(dr_id);
CREATE INDEX IF NOT EXISTS idx_buffer_client ON client_buffer_stock(client_id);
CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory_movements(product_id);

-- Initial Executive Super Admin Account (Email: admin@nkbmanufacturing.com | Password: Admin123!)
INSERT OR REPLACE INTO users (id, name, email, password_hash, role, is_active) VALUES
('a0000000-0000-0000-0000-000000000001', 'Executive Admin', 'admin@nkbmanufacturing.com', '$2b$10$jny3GQXy8GwL8vkYVtV4EeTH2QDo8tfg6hJO/vbpG3Xrwakfqgx2G', 'SUPER_ADMIN', 1);
