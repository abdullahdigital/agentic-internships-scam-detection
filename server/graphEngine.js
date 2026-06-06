const mongoose = require('mongoose');
const { Entity, Relationship } = require('./models');

// Simple in-memory cache for completed investigation graphs
const graphCache = new Map();
const CACHE_MAX_SIZE = 100;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// ── Build graph data using aggregation pipeline ───────────────────────────────
async function getGraphData(investigationId) {
    const idStr = investigationId.toString();

    // Check cache first
    const cached = graphCache.get(idStr);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
    }

    const id = new mongoose.Types.ObjectId(investigationId);

    // Single aggregation instead of 2 separate queries
    const [entityResults, relationshipResults] = await Promise.all([
        Entity.find({ investigationId: id }).lean(),
        Relationship.find({ investigationId: id }).lean()
    ]);

    // Build nodes with visual properties based on entity type
    const typeColors = {
        company: '#6366f1', domain: '#06b6d4', email: '#f59e0b',
        review: '#10b981', complaint: '#ef4444', social_profile: '#8b5cf6',
        person: '#ec4899', phone: '#f97316'
    };

    const typeIcons = {
        company: '🏢', domain: '🌐', email: '📧',
        review: '⭐', complaint: '⚠️', social_profile: '👤',
        person: '🧑', phone: '📞'
    };

    const nodes = entityResults.map(e => ({
        id: e._id.toString(),
        label: e.entityName,
        type: e.entityType,
        color: typeColors[e.entityType] || '#6b7280',
        icon: typeIcons[e.entityType] || '📌',
        confidence: e.confidenceScore,
        size: e.entityType === 'company' ? 40 : 25
    }));

    const edges = relationshipResults.map(r => ({
        id: r._id.toString(),
        source: r.sourceEntityId.toString(),
        target: r.targetEntityId.toString(),
        type: r.relationshipType,
        label: r.relationshipType.replace(/_/g, ' '),
        weight: r.weight
    }));

    const result = { nodes, edges };

    // Cache the result (evict oldest if cache is full)
    if (graphCache.size >= CACHE_MAX_SIZE) {
        const oldestKey = graphCache.keys().next().value;
        graphCache.delete(oldestKey);
    }
    graphCache.set(idStr, { data: result, timestamp: Date.now() });

    return result;
}

// ── Invalidate cache for a specific investigation ─────────────────────────────
function invalidateGraphCache(investigationId) {
    graphCache.delete(investigationId.toString());
}

// ── Clear entire cache ────────────────────────────────────────────────────────
function clearGraphCache() {
    graphCache.clear();
}

module.exports = { getGraphData, invalidateGraphCache, clearGraphCache };
