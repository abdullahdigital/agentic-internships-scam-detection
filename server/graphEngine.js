const { Entity, Relationship } = require('./models');

// ── Build graph data for frontend visualization ───────────────────────────────
async function getGraphData(investigationId) {
    const entities = await Entity.find({ investigationId }).lean();
    const relationships = await Relationship.find({ investigationId }).lean();

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

    const nodes = entities.map(e => ({
        id: e._id.toString(),
        label: e.entityName,
        type: e.entityType,
        color: typeColors[e.entityType] || '#6b7280',
        icon: typeIcons[e.entityType] || '📌',
        confidence: e.confidenceScore,
        size: e.entityType === 'company' ? 40 : 25
    }));

    const edges = relationships.map(r => ({
        id: r._id.toString(),
        source: r.sourceEntityId.toString(),
        target: r.targetEntityId.toString(),
        type: r.relationshipType,
        label: r.relationshipType.replace(/_/g, ' '),
        weight: r.weight
    }));

    return { nodes, edges };
}

module.exports = { getGraphData };
