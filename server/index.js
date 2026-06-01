require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');

const { Investigation, Evidence, RiskSignal, AgentLog } = require('./models');
const { apiLimiter, investigationLimiter, validateInvestigation } = require('./middleware');
const { initAI, runInvestigation } = require('./agents');
const { getGraphData } = require('./graphEngine');

const app = express();
const PORT = 5002;

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || '*' }));
app.use(express.json({ limit: '10kb' }));
app.use('/api/', apiLimiter);

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
        res.status(500).json({ error: 'Failed to create investigation.' });
    }
});

// List all investigations
app.get('/api/investigations', async (req, res) => {
    try {
        const investigations = await Investigation.find()
            .select('-report').sort({ createdAt: -1 }).limit(50).lean();
        res.json(investigations);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch investigations.' });
    }
});

// Get single investigation
app.get('/api/investigations/:id', async (req, res) => {
    try {
        const inv = await Investigation.findById(req.params.id).lean();
        if (!inv) return res.status(404).json({ error: 'Investigation not found.' });
        res.json(inv);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch investigation.' });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// EVIDENCE ROUTES
// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/evidence/:investigationId', async (req, res) => {
    try {
        const evidence = await Evidence.find({ investigationId: req.params.investigationId }).sort({ timestamp: -1 }).lean();
        res.json(evidence);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch evidence.' });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// KNOWLEDGE GRAPH ROUTES
// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/graph/:investigationId', async (req, res) => {
    try {
        const graphData = await getGraphData(req.params.investigationId);
        res.json(graphData);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch knowledge graph.' });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// REPORT ROUTES
// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/report/:investigationId', async (req, res) => {
    try {
        const inv = await Investigation.findById(req.params.investigationId).lean();
        if (!inv) return res.status(404).json({ error: 'Investigation not found.' });
        if (!inv.report) return res.status(202).json({ status: inv.status, message: 'Report not ready yet.' });

        const evidence = await Evidence.find({ investigationId: inv._id }).lean();
        const graphData = await getGraphData(inv._id);
        const signals = await RiskSignal.find({ investigationId: inv._id }).lean();
        const agentLogs = await AgentLog.find({ investigationId: inv._id }).sort({ timestamp: 1 }).lean();

        res.json({ ...inv.report, evidence, graph: graphData, signals, agentLogs });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch report.' });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// AGENT LOGS
// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/logs/:investigationId', async (req, res) => {
    try {
        const logs = await AgentLog.find({ investigationId: req.params.investigationId }).sort({ timestamp: 1 }).lean();
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch agent logs.' });
    }
});

// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ── Connect & Start ───────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log('✓ MongoDB connected');
        initAI();
        app.listen(PORT, () => console.log(`✓ InternShield API running on port ${PORT}`));
    })
    .catch(err => { console.error('✗ MongoDB connection failed:', err.message); process.exit(1); });
