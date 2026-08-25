/**
 * Production-Safe Centralized Error Handler Middleware
 */
function errorHandler(err, req, res, next) {
    const isProduction = process.env.NODE_ENV === 'production';
    
    // Log technical error on server side only (without logging sensitive inputs)
    console.error(`[${new Date().toISOString()}] [ERROR] ${req.method} ${req.originalUrl}:`, err.message || err);
    if (!isProduction && err.stack) {
        console.error(err.stack);
    }

    const statusCode = err.statusCode || (
        err.code === 'UNAUTHORIZED' || err.code === 'INVALID_TOKEN' || err.code === 'USER_INACTIVE' ? 401 :
        err.code === 'FORBIDDEN' || err.code === 'CLIENT_PROFILE_MISSING' ? 403 :
        err.code === 'NOT_FOUND' || err.code === 'DR_NOT_FOUND' ? 404 :
        400
    );

    // Production-safe response payload
    const responsePayload = {
        success: false,
        error: err.code || 'REQUEST_FAILED',
        message: isProduction && statusCode === 500 ? 'An unexpected error occurred. Please contact system administrator.' : (err.message || 'An unexpected error occurred.')
    };

    if (!isProduction && err.details) {
        responsePayload.details = err.details;
    }

    res.status(statusCode).json(responsePayload);
}

module.exports = errorHandler;
