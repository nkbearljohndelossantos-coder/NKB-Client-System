-- =====================================================================
-- NKB MANUFACTURING & TRADING - MYSQL / PHPMYADMIN PRODUCTION SCHEMA
-- Database: u335953510_client_db
-- Target: MySQL 8.0+ / MariaDB 10.4+ / Hostinger phpMyAdmin
-- =====================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Document Sequence Counters
CREATE TABLE IF NOT EXISTS document_sequences (
    doc_type VARCHAR(10) NOT NULL PRIMARY KEY,
    current_year INT NOT NULL,
    last_sequence INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Clients Table
CREATE TABLE IF NOT EXISTS clients (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    company_name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(50) NOT NULL,
    address TEXT NOT NULL,
    tin VARCHAR(50) NULL,
    default_billing_policy ENUM('ACTUAL_DELIVERY', 'FIXED_PO_BUFFER') NOT NULL DEFAULT 'ACTUAL_DELIVERY',
    default_tolerance_percent DECIMAL(5,2) NOT NULL DEFAULT 10.00,
    credit_limit DECIMAL(14,2) NOT NULL DEFAULT 500000.00,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Users Table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('SUPER_ADMIN', 'ADMIN', 'PRODUCTION', 'WAREHOUSE', 'ACCOUNTING', 'CLIENT') NOT NULL,
    client_id VARCHAR(36) NULL,
    phone VARCHAR(50) NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_users_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Products Table
CREATE TABLE IF NOT EXISTS products (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    sku VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL DEFAULT 'Cosmetics',
    description TEXT NULL,
    unit VARCHAR(20) NOT NULL DEFAULT 'pcs',
    default_price DECIMAL(12,2) NOT NULL,
    formula_code VARCHAR(100) NULL,
    shelf_life_months INT NOT NULL DEFAULT 24,
    current_stock INT NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Client-Specific Product Catalog & Pricing
CREATE TABLE IF NOT EXISTS client_product_prices (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    client_id VARCHAR(36) NOT NULL,
    product_id VARCHAR(36) NOT NULL,
    custom_name VARCHAR(255) NULL,
    custom_price DECIMAL(12,2) NOT NULL,
    custom_sku VARCHAR(50) NULL,
    custom_formula_code VARCHAR(100) NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_client_product (client_id, product_id),
    CONSTRAINT fk_cpp_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    CONSTRAINT fk_cpp_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Purchase Orders (PO)
CREATE TABLE IF NOT EXISTS purchase_orders (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    po_number VARCHAR(50) NOT NULL UNIQUE,
    client_id VARCHAR(36) NOT NULL,
    po_date DATE NOT NULL,
    expected_delivery_date DATE NULL,
    tolerance_percent DECIMAL(5,2) NOT NULL DEFAULT 10.00,
    billing_policy ENUM('ACTUAL_DELIVERY', 'FIXED_PO_BUFFER') NOT NULL DEFAULT 'ACTUAL_DELIVERY',
    status ENUM('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'IN_PRODUCTION', 'PARTIALLY_DELIVERED', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PENDING_APPROVAL',
    notes TEXT NULL,
    subtotal DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    tax_percent DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    grand_total DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    created_by VARCHAR(36) NOT NULL,
    approved_by VARCHAR(36) NULL,
    approved_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_po_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT,
    CONSTRAINT fk_po_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Purchase Order Items
CREATE TABLE IF NOT EXISTS purchase_order_items (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    po_id VARCHAR(36) NOT NULL,
    product_id VARCHAR(36) NOT NULL,
    target_quantity INT NOT NULL,
    min_allowed_quantity INT NOT NULL,
    max_allowed_quantity INT NOT NULL,
    unit_price DECIMAL(12,2) NOT NULL,
    subtotal DECIMAL(14,2) NOT NULL,
    delivered_quantity INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_poi_po FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_poi_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Job Orders (JO)
CREATE TABLE IF NOT EXISTS job_orders (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    jo_number VARCHAR(50) NOT NULL UNIQUE,
    po_id VARCHAR(36) NOT NULL,
    product_id VARCHAR(36) NOT NULL,
    target_quantity INT NOT NULL,
    scheduled_start_date DATE NULL,
    scheduled_end_date DATE NULL,
    assigned_team VARCHAR(100) DEFAULT 'Formulation & Bottling Team Alpha',
    status ENUM('PENDING', 'IN_PRODUCTION', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    notes TEXT NULL,
    created_by VARCHAR(36) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_jo_po FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE RESTRICT,
    CONSTRAINT fk_jo_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
    CONSTRAINT fk_jo_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Production Batches
CREATE TABLE IF NOT EXISTS production_batches (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    batch_number VARCHAR(50) NOT NULL UNIQUE,
    jo_id VARCHAR(36) NOT NULL,
    product_id VARCHAR(36) NOT NULL,
    formula_code VARCHAR(100) NULL,
    production_date DATE NOT NULL,
    expiry_date DATE NOT NULL,
    target_quantity INT NOT NULL,
    actual_yield INT NOT NULL DEFAULT 0,
    variance_quantity INT NOT NULL DEFAULT 0,
    variance_percent DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    status ENUM('PLANNED', 'MIXING', 'BOTTLING', 'QC_PASSED', 'EXCEPTION_REQUIRES_APPROVAL', 'APPROVED_FOR_DISPATCH', 'COMPLETED', 'REJECTED') NOT NULL DEFAULT 'PLANNED',
    qc_notes TEXT NULL,
    qc_passed_by VARCHAR(36) NULL,
    qc_passed_at DATETIME NULL,
    created_by VARCHAR(36) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_batch_jo FOREIGN KEY (jo_id) REFERENCES job_orders(id) ON DELETE RESTRICT,
    CONSTRAINT fk_batch_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
    CONSTRAINT fk_batch_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. Batch Yield Logs
CREATE TABLE IF NOT EXISTS batch_yields (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    batch_id VARCHAR(36) NOT NULL,
    recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    target_quantity INT NOT NULL,
    actual_yield INT NOT NULL,
    variance_quantity INT NOT NULL,
    variance_percent DECIMAL(5,2) NOT NULL,
    logged_by VARCHAR(36) NOT NULL,
    notes TEXT NULL,
    CONSTRAINT fk_by_batch FOREIGN KEY (batch_id) REFERENCES production_batches(id) ON DELETE CASCADE,
    CONSTRAINT fk_by_logged_by FOREIGN KEY (logged_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. Overrun Approvals
CREATE TABLE IF NOT EXISTS overrun_approvals (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    batch_id VARCHAR(36) NOT NULL,
    po_id VARCHAR(36) NOT NULL,
    target_quantity INT NOT NULL,
    actual_yield INT NOT NULL,
    max_tolerance_quantity INT NOT NULL,
    excess_quantity INT NOT NULL,
    approved_quantity INT NOT NULL,
    reason TEXT NOT NULL,
    notes TEXT NULL,
    status ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'APPROVED',
    approved_by VARCHAR(36) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_oa_batch FOREIGN KEY (batch_id) REFERENCES production_batches(id) ON DELETE CASCADE,
    CONSTRAINT fk_oa_po FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_oa_approved_by FOREIGN KEY (approved_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. Delivery Receipts (DR)
CREATE TABLE IF NOT EXISTS delivery_receipts (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    dr_number VARCHAR(50) NOT NULL UNIQUE,
    client_id VARCHAR(36) NOT NULL,
    po_id VARCHAR(36) NOT NULL,
    jo_id VARCHAR(36) NULL,
    delivery_date DATE NOT NULL,
    driver_name VARCHAR(100) NULL,
    vehicle_plate VARCHAR(50) NULL,
    status ENUM('DRAFT', 'DISPATCHED', 'PENDING_CLIENT_ACCEPTANCE', 'ACCEPTED', 'INVOICED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    notes TEXT NULL,
    dispatched_by VARCHAR(36) NULL,
    dispatched_at DATETIME NULL,
    created_by VARCHAR(36) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_dr_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT,
    CONSTRAINT fk_dr_po FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE RESTRICT,
    CONSTRAINT fk_dr_jo FOREIGN KEY (jo_id) REFERENCES job_orders(id) ON DELETE SET NULL,
    CONSTRAINT fk_dr_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 13. Delivery Items
CREATE TABLE IF NOT EXISTS delivery_items (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    dr_id VARCHAR(36) NOT NULL,
    product_id VARCHAR(36) NOT NULL,
    batch_id VARCHAR(36) NOT NULL,
    delivered_quantity INT NOT NULL,
    accepted_quantity INT NOT NULL DEFAULT 0,
    rejected_quantity INT NOT NULL DEFAULT 0,
    unit_price DECIMAL(12,2) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_di_dr FOREIGN KEY (dr_id) REFERENCES delivery_receipts(id) ON DELETE CASCADE,
    CONSTRAINT fk_di_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
    CONSTRAINT fk_di_batch FOREIGN KEY (batch_id) REFERENCES production_batches(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 14. DR Acceptances (Digital Signatures)
CREATE TABLE IF NOT EXISTS dr_acceptances (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    dr_id VARCHAR(36) NOT NULL UNIQUE,
    client_user_id VARCHAR(36) NOT NULL,
    signer_name VARCHAR(255) NOT NULL,
    signer_title VARCHAR(100) NULL,
    signature_data LONGTEXT NULL,
    signature_type ENUM('DRAWN', 'TYPED') NOT NULL DEFAULT 'DRAWN',
    total_delivered_quantity INT NOT NULL,
    total_accepted_quantity INT NOT NULL,
    total_rejected_quantity INT NOT NULL DEFAULT 0,
    acceptance_notes TEXT NULL,
    ip_address VARCHAR(100) NULL,
    user_agent TEXT NULL,
    accepted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_dra_dr FOREIGN KEY (dr_id) REFERENCES delivery_receipts(id) ON DELETE CASCADE,
    CONSTRAINT fk_dra_user FOREIGN KEY (client_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 15. Returns / Rejections Table
CREATE TABLE IF NOT EXISTS returns (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    dr_id VARCHAR(36) NOT NULL,
    product_id VARCHAR(36) NOT NULL,
    batch_id VARCHAR(36) NOT NULL,
    rejected_quantity INT NOT NULL,
    reason TEXT NOT NULL,
    notes TEXT NULL,
    status ENUM('LOGGED', 'REPLACED', 'CREDITED', 'DISPOSED') NOT NULL DEFAULT 'LOGGED',
    created_by VARCHAR(36) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ret_dr FOREIGN KEY (dr_id) REFERENCES delivery_receipts(id) ON DELETE CASCADE,
    CONSTRAINT fk_ret_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
    CONSTRAINT fk_ret_batch FOREIGN KEY (batch_id) REFERENCES production_batches(id) ON DELETE RESTRICT,
    CONSTRAINT fk_ret_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 16. Sales Invoices (SI)
CREATE TABLE IF NOT EXISTS sales_invoices (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    invoice_number VARCHAR(50) NOT NULL UNIQUE,
    client_id VARCHAR(36) NOT NULL,
    dr_id VARCHAR(36) NOT NULL UNIQUE,
    po_id VARCHAR(36) NOT NULL,
    invoice_date DATE NOT NULL,
    due_date DATE NOT NULL,
    billing_policy ENUM('ACTUAL_DELIVERY', 'FIXED_PO_BUFFER') NOT NULL DEFAULT 'ACTUAL_DELIVERY',
    subtotal DECIMAL(14,2) NOT NULL,
    tax_percent DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    total_amount DECIMAL(14,2) NOT NULL,
    paid_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    balance_due DECIMAL(14,2) NOT NULL,
    status ENUM('UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID') NOT NULL DEFAULT 'UNPAID',
    notes TEXT NULL,
    created_by VARCHAR(36) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_si_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT,
    CONSTRAINT fk_si_dr FOREIGN KEY (dr_id) REFERENCES delivery_receipts(id) ON DELETE RESTRICT,
    CONSTRAINT fk_si_po FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE RESTRICT,
    CONSTRAINT fk_si_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 17. Invoice Items
CREATE TABLE IF NOT EXISTS invoice_items (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    invoice_id VARCHAR(36) NOT NULL,
    product_id VARCHAR(36) NOT NULL,
    batch_id VARCHAR(36) NULL,
    po_quantity INT NOT NULL,
    delivered_quantity INT NOT NULL,
    accepted_quantity INT NOT NULL,
    billable_quantity INT NOT NULL,
    unit_price DECIMAL(12,2) NOT NULL,
    line_total DECIMAL(14,2) NOT NULL,
    is_overrun TINYINT(1) NOT NULL DEFAULT 0,
    overrun_quantity INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ii_invoice FOREIGN KEY (invoice_id) REFERENCES sales_invoices(id) ON DELETE CASCADE,
    CONSTRAINT fk_ii_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
    CONSTRAINT fk_ii_batch FOREIGN KEY (batch_id) REFERENCES production_batches(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 18. Payments
CREATE TABLE IF NOT EXISTS payments (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    payment_number VARCHAR(50) NOT NULL UNIQUE,
    invoice_id VARCHAR(36) NOT NULL,
    client_id VARCHAR(36) NOT NULL,
    payment_date DATE NOT NULL,
    amount DECIMAL(14,2) NOT NULL,
    payment_method ENUM('BANK_TRANSFER', 'CHECK', 'CASH', 'GCASH', 'ONLINE_BANKING') NOT NULL,
    reference_number VARCHAR(100) NOT NULL,
    notes TEXT NULL,
    recorded_by VARCHAR(36) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_pay_invoice FOREIGN KEY (invoice_id) REFERENCES sales_invoices(id) ON DELETE RESTRICT,
    CONSTRAINT fk_pay_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT,
    CONSTRAINT fk_pay_recorded_by FOREIGN KEY (recorded_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 19. Client Reserved Buffer Stock
CREATE TABLE IF NOT EXISTS client_buffer_stock (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    client_id VARCHAR(36) NOT NULL,
    product_id VARCHAR(36) NOT NULL,
    source_batch_id VARCHAR(36) NOT NULL,
    source_po_id VARCHAR(36) NOT NULL,
    source_dr_id VARCHAR(36) NULL,
    initial_quantity INT NOT NULL,
    quantity_released INT NOT NULL DEFAULT 0,
    quantity_remaining INT NOT NULL,
    date_reserved DATE NOT NULL,
    expiry_date DATE NULL,
    status ENUM('AVAILABLE', 'RESERVED', 'PARTIALLY_RELEASED', 'RELEASED', 'CONSUMED', 'EXPIRED') NOT NULL DEFAULT 'AVAILABLE',
    notes TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_cbs_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT,
    CONSTRAINT fk_cbs_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
    CONSTRAINT fk_cbs_batch FOREIGN KEY (source_batch_id) REFERENCES production_batches(id) ON DELETE RESTRICT,
    CONSTRAINT fk_cbs_po FOREIGN KEY (source_po_id) REFERENCES purchase_orders(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 20. Inventory Movements
CREATE TABLE IF NOT EXISTS inventory_movements (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    product_id VARCHAR(36) NOT NULL,
    batch_id VARCHAR(36) NULL,
    movement_type ENUM('PRODUCTION_OUTPUT', 'DELIVERY', 'RETURN', 'BUFFER_RESERVATION', 'BUFFER_RELEASE', 'ADJUSTMENT') NOT NULL,
    quantity INT NOT NULL,
    balance_after INT NOT NULL,
    reference_type VARCHAR(50) NOT NULL,
    reference_id VARCHAR(36) NOT NULL,
    notes TEXT NULL,
    created_by VARCHAR(36) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_im_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
    CONSTRAINT fk_im_batch FOREIGN KEY (batch_id) REFERENCES production_batches(id) ON DELETE SET NULL,
    CONSTRAINT fk_im_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 21. Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    user_id VARCHAR(36) NULL,
    user_name VARCHAR(255) NULL,
    user_role VARCHAR(50) NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(36) NOT NULL,
    details TEXT NULL,
    ip_address VARCHAR(100) NULL,
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 22. Insert Document Sequences
INSERT INTO document_sequences (doc_type, current_year, last_sequence) VALUES 
('PO', YEAR(CURRENT_DATE), 0),
('JO', YEAR(CURRENT_DATE), 0),
('BAT', YEAR(CURRENT_DATE), 0),
('DR', YEAR(CURRENT_DATE), 0),
('SI', YEAR(CURRENT_DATE), 0),
('PAY', YEAR(CURRENT_DATE), 0)
ON DUPLICATE KEY UPDATE current_year = VALUES(current_year);

-- 23. Insert Initial Root Super Admin Account (Password: Admin123!)
INSERT INTO users (id, name, email, password_hash, role, is_active) VALUES
('a0000000-0000-0000-0000-000000000001', 'Executive Admin', 'admin@nkbmanufacturing.com', '$2b$10$jny3GQXy8GwL8vkYVtV4EeTH2QDo8tfg6hJO/vbpG3Xrwakfqgx2G', 'SUPER_ADMIN', 1)
ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), updated_at = CURRENT_TIMESTAMP;

SET FOREIGN_KEY_CHECKS = 1;
