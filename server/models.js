const mongoose = require('mongoose');

// ── Investigation ─────────────────────────────────────────────────────────────
const investigationSchema = new mongoose.Schema({
  companyName: { type: String, required: true, trim: true },
  website: { type: String, trim: true, default: '' },
  internshipDescription: { type: String, trim: true, default: '' },
  status: { type: String, enum: ['pending', 'planning', 'collecting', 'analyzing', 'correlating', 'deciding', 'completed', 'failed'], default: 'pending' },
  riskScore: { type: Number, default: null, min: 0, max: 100 },
  verdict: { type: String, enum: ['Likely Legitimate', 'Suspicious', 'High Risk', 'Likely Scam', null], default: null },
  report: { type: mongoose.Schema.Types.Mixed, default: null },
  createdAt: { type: Date, default: Date.now }
});
investigationSchema.index({ status: 1 });
investigationSchema.index({ riskScore: 1 });
investigationSchema.index({ companyName: 'text' });

// ── Evidence ──────────────────────────────────────────────────────────────────
const evidenceSchema = new mongoose.Schema({
  investigationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Investigation', required: true },
  sourceName: { type: String, required: true },
  sourceType: { type: String, enum: ['website', 'domain', 'review', 'social_media', 'scam_report', 'community', 'reference', 'ai_analysis'], required: true },
  content: { type: String, required: true },
  credibilityScore: { type: Number, min: 0, max: 1, default: 0.5 },
  timestamp: { type: Date, default: Date.now }
});
evidenceSchema.index({ investigationId: 1, timestamp: -1 });
evidenceSchema.index({ content: 'text' });

// ── Entity ────────────────────────────────────────────────────────────────────
const entitySchema = new mongoose.Schema({
  investigationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Investigation', required: true },
  entityType: { type: String, required: true },
  entityName: { type: String, required: true },
  attributes: { type: mongoose.Schema.Types.Mixed, default: {} },
  confidenceScore: { type: Number, min: 0, max: 1, default: 0.5 }
});
entitySchema.index({ investigationId: 1 });
entitySchema.index({ entityType: 1, entityName: 1 });

// ── Relationship ──────────────────────────────────────────────────────────────
const relationshipSchema = new mongoose.Schema({
  investigationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Investigation', required: true },
  sourceEntityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true },
  relationshipType: { type: String, required: true },
  targetEntityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true },
  weight: { type: Number, min: 0, max: 1, default: 0.5 }
});
relationshipSchema.index({ investigationId: 1 });
relationshipSchema.index({ sourceEntityId: 1, targetEntityId: 1 });

// ── Risk Signal ───────────────────────────────────────────────────────────────
const riskSignalSchema = new mongoose.Schema({
  investigationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Investigation', required: true },
  signalType: { type: String, required: true },
  weight: { type: Number, required: true, min: -50, max: 50 },
  confidence: { type: Number, min: 0, max: 1, default: 0.5 },
  description: { type: String, required: true }
});
riskSignalSchema.index({ investigationId: 1 });

// ── Agent Log ─────────────────────────────────────────────────────────────────
const agentLogSchema = new mongoose.Schema({
  agentName: { type: String, required: true, enum: ['Planner', 'Collector', 'Analyzer', 'Correlation', 'Decision'] },
  investigationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Investigation', required: true },
  input: { type: mongoose.Schema.Types.Mixed },
  output: { type: mongoose.Schema.Types.Mixed },
  confidence: { type: Number, min: 0, max: 1, default: 0.5 },
  timestamp: { type: Date, default: Date.now }
});
agentLogSchema.index({ investigationId: 1, timestamp: -1 });

// ── Export ─────────────────────────────────────────────────────────────────────
module.exports = {
  Investigation: mongoose.model('Investigation', investigationSchema),
  Evidence: mongoose.model('Evidence', evidenceSchema),
  Entity: mongoose.model('Entity', entitySchema),
  Relationship: mongoose.model('Relationship', relationshipSchema),
  RiskSignal: mongoose.model('RiskSignal', riskSignalSchema),
  AgentLog: mongoose.model('AgentLog', agentLogSchema)
};
