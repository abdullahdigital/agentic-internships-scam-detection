const rateLimit = require('express-rate-limit');

// ── Input Validation ──────────────────────────────────────────────────────────
function validateInvestigation(req, res, next) {
    const { companyName } = req.body;
    if (!companyName || typeof companyName !== 'string' || companyName.trim().length < 2) {
        return res.status(400).json({ error: 'Company name is required (min 2 characters).' });
    }
    for (const key of Object.keys(req.body)) {
        if (typeof req.body[key] === 'string') {
            req.body[key] = req.body[key].replace(/[${}]/g, '');
        }
    }
    next();
}

// ── Rate Limiter ──────────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, max: 200,
    message: { error: 'Too many requests. Please try again later.' }
});

const investigationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, max: 20,
    message: { error: 'Investigation limit reached. Try again in an hour.' }
});

module.exports = { validateInvestigation, apiLimiter, investigationLimiter };
