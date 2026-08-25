require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Initialize database
const db = require('./database/db');
const errorHandler = require('./middleware/errorHandler');

// Route modules
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const clientRoutes = require('./routes/clients');
const orderRoutes = require('./routes/orders');
const jobOrderRoutes = require('./routes/jobOrders');
const productionRoutes = require('./routes/production');
const deliveryRoutes = require('./routes/deliveries');
const invoiceRoutes = require('./routes/invoices');
const paymentRoutes = require('./routes/payments');
const bufferStockRoutes = require('./routes/bufferStock');
const reportRoutes = require('./routes/reports');
const auditLogRoutes = require('./routes/auditLogs');
const userRoutes = require('./routes/users');

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Security Headers with Helmet
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.tailwindcss.com", "https://cdn.jsdelivr.net"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            styleSrcAttr: ["'unsafe-inline'"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'", "https://cdn.jsdelivr.net"]
        }
    },
    crossOriginEmbedderPolicy: false
}));

// CORS Configuration
const allowedOrigin = process.env.CORS_ORIGIN || process.env.APP_URL;
if (isProduction && allowedOrigin) {
    app.use(cors({
        origin: allowedOrigin.split(',').map(o => o.trim()),
        credentials: true
    }));
} else {
    app.use(cors({ origin: true, credentials: true }));
}

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Rate Limiting for Authentication (Brute Force Protection)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'test' ? 1000 : parseInt(process.env.AUTH_RATE_LIMIT_MAX || '20'),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: 'TOO_MANY_REQUESTS',
        message: 'Too many authentication attempts. Please try again in 15 minutes.'
    }
});

// Static Files
app.use(express.static(path.join(__dirname, 'public')));

// Favicon handler
app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'favicon.svg'));
});

// Health check endpoint (production-safe, no sensitive system internals leaked)
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        environment: process.env.NODE_ENV || 'development'
    });
});

// API Routes
app.use('/api/auth/login', authLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/job-orders', jobOrderRoutes);
app.use('/api/production', productionRoutes);
app.use('/api/deliveries', deliveryRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/buffer-stock', bufferStockRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/users', userRoutes);

// Centralized error handler
app.use(errorHandler);

// Start server if executed directly
if (require.main === module) {
    const server = app.listen(PORT, () => {
        console.log(`=======================================================`);
        console.log(`🚀 NKB MANUFACTURING & TRADING SYSTEM IS RUNNING`);
        console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`🌐 Server Port: ${PORT}`);
        console.log(`🔐 Admin Portal: http://localhost:${PORT}/admin.html`);
        console.log(`📦 Client Portal: http://localhost:${PORT}/client.html`);
        console.log(`=======================================================`);
    });

    process.on('uncaughtException', (err) => {
        console.error('Unhandled Exception:', err);
    });
    process.on('unhandledRejection', (reason, promise) => {
        console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    process.on('SIGINT', () => {
        server.close(() => process.exit(0));
    });
    process.on('SIGTERM', () => {
        server.close(() => process.exit(0));
    });
}

module.exports = app;
