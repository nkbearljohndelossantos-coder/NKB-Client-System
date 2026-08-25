/**
 * Enterprise Role-Based Access Control (RBAC) Module
 * Defines granular permissions, role hierarchies, and enforcement middleware.
 */

const ROLES = {
    SUPER_ADMIN: 'SUPER_ADMIN',
    ADMIN: 'ADMIN',
    PRODUCTION: 'PRODUCTION',
    WAREHOUSE: 'WAREHOUSE',
    ACCOUNTING: 'ACCOUNTING',
    CLIENT: 'CLIENT'
};

// Map descriptive aliases to standard role codes
const ROLE_ALIASES = {
    'PRODUCTION_SUPERVISOR': ROLES.PRODUCTION,
    'WAREHOUSE_OFFICER': ROLES.WAREHOUSE,
    'ACCOUNTING_OFFICER': ROLES.ACCOUNTING,
    'CLIENT_USER': ROLES.CLIENT,
    'OWNER': ROLES.SUPER_ADMIN
};

function normalizeRole(role) {
    if (!role) return null;
    const clean = role.toUpperCase().trim();
    return ROLE_ALIASES[clean] || clean;
}

/**
 * Enterprise Permissions Matrix
 */
const PERMISSIONS = {
    // Client Management
    'clients:view': [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.ACCOUNTING],
    'clients:create': [ROLES.SUPER_ADMIN, ROLES.ADMIN],
    'clients:update': [ROLES.SUPER_ADMIN, ROLES.ADMIN],
    'clients:delete': [ROLES.SUPER_ADMIN],

    // User & Staff Management
    'users:view': [ROLES.SUPER_ADMIN, ROLES.ADMIN],
    'users:create': [ROLES.SUPER_ADMIN, ROLES.ADMIN],
    'users:update': [ROLES.SUPER_ADMIN, ROLES.ADMIN],
    'users:delete': [ROLES.SUPER_ADMIN],

    // Product Master Data
    'products:view': [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.PRODUCTION, ROLES.WAREHOUSE, ROLES.ACCOUNTING, ROLES.CLIENT],
    'products:create': [ROLES.SUPER_ADMIN, ROLES.ADMIN],
    'products:update': [ROLES.SUPER_ADMIN, ROLES.ADMIN],
    'products:delete': [ROLES.SUPER_ADMIN],

    // Purchase Orders (PO)
    'orders:view': [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.PRODUCTION, ROLES.WAREHOUSE, ROLES.ACCOUNTING, ROLES.CLIENT],
    'orders:create': [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.CLIENT],
    'orders:approve': [ROLES.SUPER_ADMIN, ROLES.ADMIN],
    'orders:cancel': [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.CLIENT],

    // Job Orders (JO)
    'job_orders:view': [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.PRODUCTION, ROLES.WAREHOUSE, ROLES.CLIENT],
    'job_orders:create': [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.PRODUCTION],
    'job_orders:update': [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.PRODUCTION],

    // Production Batches & Yields
    'production:view': [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.PRODUCTION, ROLES.WAREHOUSE, ROLES.CLIENT],
    'production:create_batch': [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.PRODUCTION],
    'production:log_yield': [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.PRODUCTION],
    'production:approve_overrun': [ROLES.SUPER_ADMIN, ROLES.ADMIN],

    // Deliveries & DRs
    'deliveries:view': [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.PRODUCTION, ROLES.WAREHOUSE, ROLES.ACCOUNTING, ROLES.CLIENT],
    'deliveries:create': [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.WAREHOUSE],
    'deliveries:dispatch': [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.WAREHOUSE],
    'deliveries:accept': [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.CLIENT],

    // Invoices & Billing
    'invoices:view': [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.ACCOUNTING, ROLES.CLIENT],
    'invoices:create': [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.ACCOUNTING],
    'invoices:void': [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.ACCOUNTING],

    // Payments & Receivables
    'payments:view': [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.ACCOUNTING, ROLES.CLIENT],
    'payments:create': [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.ACCOUNTING],

    // Buffer Stock Management
    'buffer_stock:view': [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.WAREHOUSE, ROLES.ACCOUNTING, ROLES.CLIENT],
    'buffer_stock:release': [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.WAREHOUSE, ROLES.ACCOUNTING],

    // Reports & Analytics
    'reports:view': [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.ACCOUNTING, ROLES.CLIENT],
    'reports:financial': [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.ACCOUNTING],
    'reports:production': [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.PRODUCTION],

    // Audit Logs
    'audit_logs:view': [ROLES.SUPER_ADMIN, ROLES.ADMIN]
};

/**
 * Check if a role possesses a specific permission
 */
function roleHasPermission(role, permissionName) {
    const norm = normalizeRole(role);
    if (!norm) return false;
    if (norm === ROLES.SUPER_ADMIN) return true; // Super Admin has universal access
    const allowed = PERMISSIONS[permissionName];
    return Array.isArray(allowed) && allowed.includes(norm);
}

/**
 * Middleware: Enforce a specific permission
 */
function requirePermission(permissionName) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'UNAUTHORIZED',
                message: 'Authentication required.'
            });
        }

        const userRole = normalizeRole(req.user.role);
        if (userRole === ROLES.SUPER_ADMIN || roleHasPermission(userRole, permissionName)) {
            return next();
        }

        return res.status(403).json({
            success: false,
            error: 'FORBIDDEN',
            message: `Access denied. Your role (${req.user.role}) lacks permission: ${permissionName}`,
            requiredPermission: permissionName
        });
    };
}

/**
 * Middleware: Enforce one of the allowed roles
 */
function requireRoles(...allowedRoles) {
    const normalizedAllowed = allowedRoles.map(normalizeRole);
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'UNAUTHORIZED',
                message: 'Authentication required.'
            });
        }

        const userRole = normalizeRole(req.user.role);
        if (userRole === ROLES.SUPER_ADMIN || normalizedAllowed.includes(userRole) || allowedRoles.includes(req.user.role)) {
            return next();
        }

        return res.status(403).json({
            success: false,
            error: 'FORBIDDEN',
            message: `Access denied. This action requires one of the following roles: ${allowedRoles.join(', ')}`,
            userRole: req.user.role
        });
    };
}

module.exports = {
    ROLES,
    PERMISSIONS,
    normalizeRole,
    roleHasPermission,
    requirePermission,
    requireRoles
};
