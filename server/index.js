require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');

const { Investigation, Evidence, RiskSignal, AgentLog } = require('./models');
const { apiLimiter, investigationLimiter, validateInvestigation, validateObjectId, validatePagination } = require('./middleware');
const { initAI, runInvestigation } = require('./agents');
const { getGraphData } = require('./graphEngine');
const { getFullReport, getDashboardStats, searchInvestigations, getInvestigationTimeline, cascadeDeleteInvestigation, getEvidenceAnalysis } = require('./dbPipelines');

const app = express();
const PORT = process.env.PORT || 5002;

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || '*' }));
app.use(express.json({ limit: '10kb' }));
app.use('/api/', apiLimiter);

// ══════════════════════════════════════════════════════════════════════════════
// DASHBOARD & STATISTICS (Aggregation Pipeline showcase)
// ══════════════════════════════════════════════════════════════════════════════

// Get dashboard statistics — uses $facet aggregation
app.get('/api/stats', async (req, res) => {
    try {
        const stats = await getDashboardStats();
        res.json(stats);
    } catch (err) {
        console.error('Stats error:', err.message);
        res.status(500).json({ error: 'Failed to fetch dashboard statistics.' });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// INVESTIGATION ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// Create & run investigation
app.post('/api/investigations', investigationLimiter, validateInvestigation, async (req, res) => {
    try {
        const { companyName, website, internshipDescription } = req.body;
        const investigation = await Investigation.create({
            companyName: companyName.trim(),
            website: website?.trim() || '',
            internshipDescription: internshipDescription?.trim() || ''
        });

        res.status(201).json({ investigationId: investigation._id, status: 'pending', message: 'Investigation started.' });

        // Run asynchronously
        runInvestigation(investigation._id).catch(err => console.error('Investigation pipeline error:', err));
    } catch (err) {
        if (err.name === 'ValidationError') {
            const messages = Object.values(err.errors).map(e => e.message);
            return res.status(400).json({ error: messages.join('; ') });
        }
        res.status(500).json({ error: 'Failed to create investigation.' });
    }
});

// List all investigations — with pagination
app.get('/api/investigations', validatePagination, async (req, res) => {
    try {
        const { page, limit } = req.pagination;
        const skip = (page - 1) * limit;

        const [investigations, total] = await Promise.all([
            Investigation.find()
                .select('-report')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Investigation.countDocuments()
        ]);

        res.json({
            results: investigations,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch investigations.' });
    }
});

// Search investigations — uses aggregation with $facet
app.get('/api/investigations/search', validatePagination, async (req, res) => {
    try {
        const { q, status, verdict, minRisk, maxRisk, startDate, endDate } = req.query;
        const { page, limit } = req.pagination;

        const results = await searchInvestigations(
            q || '',
            { status, verdict, minRisk, maxRisk, startDate, endDate },
            page,
            limit
        );

        res.json(results);
    } catch (err) {
        console.error('Search error:', err.message);
        res.status(500).json({ error: 'Failed to search investigations.' });
    }
});

// Get single investigation
app.get('/api/investigations/:id', validateObjectId('id'), async (req, res) => {
    try {
        const inv = await Investigation.findById(req.params.id).lean();
        if (!inv) return res.status(404).json({ error: 'Investigation not found.' });
        res.json(inv);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch investigation.' });
    }
});

// Delete investigation — cascade deletes all related data using transaction
app.delete('/api/investigations/:id', validateObjectId('id'), async (req, res) => {
    try {
        const result = await cascadeDeleteInvestigation(req.params.id);
        if (!result.investigation) {
            return res.status(404).json({ error: 'Investigation not found.' });
        }
        res.json({
            message: 'Investigation and all related data deleted.',
            deleted: result
        });
    } catch (err) {
        console.error('Delete error:', err.message);
        res.status(500).json({ error: 'Failed to delete investigation.' });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// EVIDENCE ROUTES
// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/evidence/:investigationId', validateObjectId('investigationId'), async (req, res) => {
    try {
        const evidence = await Evidence.find({ investigationId: req.params.investigationId })
            .sort({ timestamp: -1 }).lean();
        res.json(evidence);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch evidence.' });
    }
});

// Evidence analysis — aggregation by source type
app.get('/api/evidence/:investigationId/analysis', validateObjectId('investigationId'), async (req, res) => {
    try {
        const analysis = await getEvidenceAnalysis(req.params.investigationId);
        res.json(analysis);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch evidence analysis.' });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// KNOWLEDGE GRAPH ROUTES
// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/graph/:investigationId', validateObjectId('investigationId'), async (req, res) => {
    try {
        const graphData = await getGraphData(req.params.investigationId);
        res.json(graphData);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch knowledge graph.' });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// REPORT ROUTES — Now uses aggregation pipeline (single DB call)
// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/report/:investigationId', validateObjectId('investigationId'), async (req, res) => {
    try {
        // Use aggregation pipeline — single query replaces 4 separate ones
        const fullReport = await getFullReport(req.params.investigationId);

        if (!fullReport) {
            return res.status(404).json({ error: 'Investigation not found.' });
        }

        if (!fullReport.report) {
            return res.status(202).json({ status: fullReport.status, message: 'Report not ready yet.' });
        }

        // Build graph visualization data from aggregated entities
        const graphData = await getGraphData(req.params.investigationId);

        res.json({
            ...fullReport.report,
            evidence: fullReport.evidence,
            graph: graphData,
            signals: fullReport.signals,
            agentLogs: fullReport.agentLogs,
            // Additional analytics from aggregation
            analytics: {
                evidenceCount: fullReport.evidenceCount,
                signalCount: fullReport.signalCount,
                entityCount: fullReport.entityCount,
                relationshipCount: fullReport.relationshipCount,
                avgCredibility: fullReport.avgCredibility,
                riskSignalBreakdown: fullReport.riskSignalBreakdown
            }
        });
    } catch (err) {
        console.error('Report error:', err.message);
        res.status(500).json({ error: 'Failed to fetch report.' });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// AGENT LOGS & TIMELINE
// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/logs/:investigationId', validateObjectId('investigationId'), async (req, res) => {
    try {
        const logs = await AgentLog.find({ investigationId: req.params.investigationId })
            .sort({ timestamp: 1 }).lean();
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch agent logs.' });
    }
});

// Investigation timeline — aggregation of agent activity
app.get('/api/timeline/:investigationId', validateObjectId('investigationId'), async (req, res) => {
    try {
        const timeline = await getInvestigationTimeline(req.params.investigationId);
        res.json(timeline);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch investigation timeline.' });
    }
});

// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/api/health', async (_, res) => {
    const dbState = mongoose.connection.readyState;
    const dbStates = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
    res.json({
        status: dbState === 1 ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        database: dbStates[dbState] || 'unknown',
        uptime: Math.round(process.uptime()) + 's'
    });
});

// ── 404 Handler ───────────────────────────────────────────────────────────────
app.use('/api/*', (req, res) => {
    res.status(404).json({ error: `Route ${req.method} ${req.originalUrl} not found.` });
});

// ── Connect & Start ───────────────────────────────────────────────────────────
const MONGODB_OPTIONS = {
    maxPoolSize: 10,           // Connection pool size
    minPoolSize: 2,            // Minimum connections kept open
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    heartbeatFrequencyMS: 10000,
    retryWrites: true,
    retryReads: true
};

let server;

mongoose.connect(process.env.MONGODB_URI, MONGODB_OPTIONS)
    .then(() => {
        console.log('✓ MongoDB connected (pool: 2-10 connections)');
        initAI();
        server = app.listen(PORT, () => console.log(`✓ InternShield API running on port ${PORT}`));
    })
    .catch(err => { console.error('✗ MongoDB connection failed:', err.message); process.exit(1); });

// ── Graceful Shutdown ─────────────────────────────────────────────────────────
async function gracefulShutdown(signal) {
    console.log(`\n⚡ Received ${signal}. Shutting down gracefully...`);
    try {
        if (server) {
            await new Promise((resolve) => server.close(resolve));
            console.log('✓ HTTP server closed');
        }
        await mongoose.connection.close();
        console.log('✓ MongoDB connection closed');
        process.exit(0);
    } catch (err) {
        console.error('✗ Error during shutdown:', err.message);
        process.exit(1);
    }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
