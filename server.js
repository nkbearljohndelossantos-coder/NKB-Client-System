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
const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

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
    max: isTest ? 1000 : parseInt(process.env.AUTH_RATE_LIMIT_MAX || '20', 10),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: 'TOO_MANY_REQUESTS',
        message: 'Too many authentication attempts. Please try again in 15 minutes.'
    }
});

function mountApiRoutes() {
    app.use('/api/auth/login', authLimiter);
    app.use('/api/auth', require('./routes/auth'));
    app.use('/api/products', require('./routes/products'));
    app.use('/api/clients', require('./routes/clients'));
    app.use('/api/orders', require('./routes/orders'));
    app.use('/api/job-orders', require('./routes/jobOrders'));
    app.use('/api/production', require('./routes/production'));
    app.use('/api/deliveries', require('./routes/deliveries'));
    app.use('/api/invoices', require('./routes/invoices'));
    app.use('/api/payments', require('./routes/payments'));
    app.use('/api/buffer-stock', require('./routes/bufferStock'));
    app.use('/api/reports', require('./routes/reports'));
    app.use('/api/audit-logs', require('./routes/auditLogs'));
    app.use('/api/users', require('./routes/users'));
}

function loadDatabaseAndRoutes() {
    try {
        require('./database/db');
        mountApiRoutes();
        app.use(errorHandler);
        console.log('✅ Database and API routes loaded');
        return true;
    } catch (error) {
        console.error('❌ Database/API startup failed:', error.message);
        app.use('/api', (req, res, next) => {
            if (req.path === '/health' || req.originalUrl === '/api/health') {
                return next();
            }
            return res.status(503).json({
                success: false,
                error: 'SERVICE_UNAVAILABLE',
                message: 'Database connection failed. Check Hostinger environment variables and run npm run migrate:mysql.'
            });
        });
        app.use(errorHandler);
        return false;
    }
}

loadDatabaseAndRoutes();

if (isTest) {
    // Tests import the app without binding a port.
} else {
    const server = app.listen(PORT, () => {
        console.log(`=======================================================`);
        console.log(`🚀 NKB MANUFACTURING & TRADING SYSTEM IS RUNNING`);
        console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`🌐 Port: ${PORT}`);
        console.log(`🗄️  Database: ${process.env.DB_DRIVER || 'sqlite'}`);
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
