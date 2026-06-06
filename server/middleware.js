const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');

// ── ObjectId Validation Middleware ────────────────────────────────────────────
function validateObjectId(paramName = 'id') {
    return (req, res, next) => {
        const id = req.params[paramName];
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: `Invalid ${paramName} format. Must be a valid ObjectId.` });
        }
        next();
    };
}

// ── Input Validation ──────────────────────────────────────────────────────────
function validateInvestigation(req, res, next) {
    const { companyName, website, internshipDescription } = req.body;

    // Company name: required, 2-200 chars
    if (!companyName || typeof companyName !== 'string' || companyName.trim().length < 2) {
        return res.status(400).json({ error: 'Company name is required (min 2 characters).' });
    }
    if (companyName.trim().length > 200) {
        return res.status(400).json({ error: 'Company name must be under 200 characters.' });
    }

    // Website: optional, validate format
    if (website && typeof website === 'string' && website.trim().length > 0) {
        if (website.trim().length > 500) {
            return res.status(400).json({ error: 'Website URL must be under 500 characters.' });
        }
    }

    // Description: optional, max 5000 chars
    if (internshipDescription && typeof internshipDescription === 'string') {
        if (internshipDescription.trim().length > 5000) {
            return res.status(400).json({ error: 'Internship description must be under 5000 characters.' });
        }
    }

    // Sanitize all string fields — prevent NoSQL injection
    for (const key of Object.keys(req.body)) {
        if (typeof req.body[key] === 'string') {
            // Remove MongoDB operators and special chars
            req.body[key] = req.body[key]
                .replace(/[${}]/g, '')
                .replace(/\.\./g, '.');
        }
        // Reject non-string, non-expected fields
        if (!['companyName', 'website', 'internshipDescription'].includes(key)) {
            delete req.body[key];
        }
    }

    next();
}

// ── Query Parameter Validation ────────────────────────────────────────────────
function validatePagination(req, res, next) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    req.pagination = {
        page: Math.max(1, Math.min(page, 1000)),
        limit: Math.max(1, Math.min(limit, 100))
    };

    next();
}

// ── Rate Limiter ──────────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200,
    message: { error: 'Too many requests. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false
});

const investigationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20,
    message: { error: 'Investigation limit reached. Try again in an hour.' },
    standardHeaders: true,
    legacyHeaders: false
});

module.exports = {
    validateInvestigation,
    validateObjectId,
    validatePagination,
    apiLimiter,
    investigationLimiter
};
