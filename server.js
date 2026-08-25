require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const isProduction = process.env.NODE_ENV === 'production';

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

const allowedOrigin = process.env.CORS_ORIGIN || process.env.APP_URL;
if (isProduction && allowedOrigin) {
    app.use(cors({
        origin: allowedOrigin.split(',').map(o => o.trim()),
        credentials: true
    }));
} else {
    app.use(cors({ origin: true, credentials: true }));
}

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

app.use(express.static(path.join(__dirname, 'public')));

app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'favicon.svg'));
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        environment: process.env.NODE_ENV || 'development',
        database: process.env.DB_DRIVER || 'sqlite'
    });
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'test' ? 1000 : parseInt(process.env.AUTH_RATE_LIMIT_MAX || '20'),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: 'TOO_MANY_REQUESTS',
        message: 'Too many authentication attempts. Please try again in 15 minutes.'
    }
});

function mountApiRoutes() {
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
}

try {
    require('./database/db');
    mountApiRoutes();
    console.log('✅ Database and API routes loaded');
} catch (error) {
    console.error('❌ Database/API startup failed:', error.message);
    app.get('/api/*', (req, res) => {
        res.status(503).json({
            success: false,
            error: 'SERVICE_UNAVAILABLE',
            message: 'Database connection failed. Check Hostinger environment variables and run npm run migrate:mysql.'
        });
    });
}

app.use(errorHandler);

const shouldStartServer = require.main === module || process.env.PASSENGER_APP_ENV;

if (shouldStartServer && process.env.NODE_ENV !== 'test') {
    const server = app.listen(PORT, HOST, () => {
        console.log(`=======================================================`);
        console.log(`🚀 NKB MANUFACTURING & TRADING SYSTEM IS RUNNING`);
        console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`🌐 Listening on: ${HOST}:${PORT}`);
        console.log(`🗄️  Database: ${process.env.DB_DRIVER || 'sqlite'}`);
        console.log(`🔐 Admin Portal: /admin.html`);
        console.log(`📦 Client Portal: /client.html`);
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
