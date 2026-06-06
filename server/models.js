const mongoose = require('mongoose');

// ── Investigation ─────────────────────────────────────────────────────────────
const investigationSchema = new mongoose.Schema({
  companyName: {
    type: String,
    required: [true, 'Company name is required'],
    trim: true,
    minlength: [2, 'Company name must be at least 2 characters'],
    maxlength: [200, 'Company name must be under 200 characters']
  },
  website: {
    type: String,
    trim: true,
    default: '',
    maxlength: [500, 'Website URL must be under 500 characters'],
    validate: {
      validator: function (v) {
        return !v || /^[a-zA-Z0-9][\w\-\.]*\.[a-zA-Z]{2,}/.test(v) || /^https?:\/\//.test(v);
      },
      message: 'Invalid website format'
    }
  },
  internshipDescription: {
    type: String,
    trim: true,
    default: '',
    maxlength: [5000, 'Description must be under 5000 characters']
  },
  status: {
    type: String,
    enum: {
      values: ['pending', 'planning', 'collecting', 'analyzing', 'correlating', 'deciding', 'completed', 'failed'],
      message: '{VALUE} is not a valid status'
    },
    default: 'pending'
  },
  riskScore: {
    type: Number,
    default: null,
    min: [0, 'Risk score cannot be negative'],
    max: [100, 'Risk score cannot exceed 100']
  },
  verdict: {
    type: String,
    enum: ['Likely Legitimate', 'Suspicious', 'High Risk', 'Likely Scam', null],
    default: null
  },
  report: { type: mongoose.Schema.Types.Mixed, default: null },
  // Track processing duration for performance analytics
  processingStartedAt: { type: Date, default: null },
  processingCompletedAt: { type: Date, default: null }
}, {
  timestamps: true // adds createdAt + updatedAt automatically
});

// Compound index for common query: list by status sorted by date
investigationSchema.index({ status: 1, createdAt: -1 });
// For filtering completed investigations by risk
investigationSchema.index({ verdict: 1, riskScore: -1 });
// Text search on company name
investigationSchema.index({ companyName: 'text', internshipDescription: 'text' });

// Virtual: risk category computed from score
investigationSchema.virtual('riskCategory').get(function () {
  if (this.riskScore === null) return null;
  if (this.riskScore <= 30) return 'Low Risk';
  if (this.riskScore <= 60) return 'Medium Risk';
  if (this.riskScore <= 80) return 'High Risk';
  return 'Critical Risk';
});

// Virtual: processing duration in seconds
investigationSchema.virtual('processingDuration').get(function () {
  if (!this.processingStartedAt || !this.processingCompletedAt) return null;
  return Math.round((this.processingCompletedAt - this.processingStartedAt) / 1000);
});

investigationSchema.set('toJSON', { virtuals: true });
investigationSchema.set('toObject', { virtuals: true });

// ── Evidence ──────────────────────────────────────────────────────────────────
const evidenceSchema = new mongoose.Schema({
  investigationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Investigation',
    required: [true, 'Investigation ID is required']
  },
  sourceName: {
    type: String,
    required: [true, 'Source name is required'],
    trim: true,
    maxlength: 200
  },
  sourceType: {
    type: String,
    enum: {
      values: ['website', 'domain', 'review', 'social_media', 'scam_report', 'community', 'reference', 'ai_analysis'],
      message: '{VALUE} is not a valid source type'
    },
    required: true
  },
  content: {
    type: String,
    required: [true, 'Content is required'],
    maxlength: 5000
  },
  credibilityScore: {
    type: Number,
    min: 0,
    max: 1,
    default: 0.5,
    validate: {
      validator: Number.isFinite,
      message: 'Credibility score must be a valid number'
    }
  },
  timestamp: { type: Date, default: Date.now }
});

// Compound index for fetching evidence by investigation sorted by time
evidenceSchema.index({ investigationId: 1, timestamp: -1 });
// Index by source type for analytics
evidenceSchema.index({ investigationId: 1, sourceType: 1 });

// ── Entity ────────────────────────────────────────────────────────────────────
const entitySchema = new mongoose.Schema({
  investigationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Investigation',
    required: true
  },
  entityType: {
    type: String,
    required: true,
    enum: ['company', 'domain', 'email', 'review', 'complaint', 'social_profile', 'person', 'phone'],
    trim: true
  },
  entityName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 300
  },
  attributes: { type: mongoose.Schema.Types.Mixed, default: {} },
  confidenceScore: {
    type: Number,
    min: 0,
    max: 1,
    default: 0.5
  }
});

// Compound index for graph queries
entitySchema.index({ investigationId: 1, entityType: 1 });
// Unique entity per investigation
entitySchema.index({ investigationId: 1, entityType: 1, entityName: 1 });

// ── Relationship ──────────────────────────────────────────────────────────────
const relationshipSchema = new mongoose.Schema({
  investigationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Investigation',
    required: true
  },
  sourceEntityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: true
  },
  relationshipType: {
    type: String,
    required: true,
    enum: ['HAS_DOMAIN', 'HAS_EMAIL', 'MENTIONED_IN', 'LINKED_TO', 'REPORTED_BY', 'OWNED_BY', 'ASSOCIATED_WITH', 'REVIEWED_ON'],
    trim: true
  },
  targetEntityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: true
  },
  weight: {
    type: Number,
    min: 0,
    max: 1,
    default: 0.5
  }
});

// Compound index for graph traversal
relationshipSchema.index({ investigationId: 1, sourceEntityId: 1, targetEntityId: 1 });
// For reverse lookups
relationshipSchema.index({ targetEntityId: 1 });

// ── Risk Signal ───────────────────────────────────────────────────────────────
const riskSignalSchema = new mongoose.Schema({
  investigationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Investigation',
    required: true,
    index: true
  },
  signalType: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  weight: {
    type: Number,
    required: true,
    min: -50,
    max: 50,
    validate: {
      validator: Number.isFinite,
      message: 'Weight must be a valid number'
    }
  },
  confidence: {
    type: Number,
    min: 0,
    max: 1,
    default: 0.5
  },
  description: {
    type: String,
    required: true,
    maxlength: 1000
  }
});

// For analytics: group by signal type
riskSignalSchema.index({ signalType: 1 });

// ── Agent Log ─────────────────────────────────────────────────────────────────
const agentLogSchema = new mongoose.Schema({
  agentName: {
    type: String,
    required: true,
    enum: {
      values: ['Planner', 'Collector', 'Analyzer', 'Correlation', 'Decision'],
      message: '{VALUE} is not a valid agent name'
    }
  },
  investigationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Investigation',
    required: true
  },
  input: { type: mongoose.Schema.Types.Mixed },
  output: { type: mongoose.Schema.Types.Mixed },
  confidence: { type: Number, min: 0, max: 1, default: 0.5 },
  durationMs: { type: Number, default: null }, // Track agent execution time
  timestamp: { type: Date, default: Date.now }
});

// Compound index for fetching logs by investigation in order
agentLogSchema.index({ investigationId: 1, timestamp: -1 });
// TTL: auto-delete logs older than 90 days to keep DB clean
agentLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

// ── Export ─────────────────────────────────────────────────────────────────────
module.exports = {
  Investigation: mongoose.model('Investigation', investigationSchema),
  Evidence: mongoose.model('Evidence', evidenceSchema),
  Entity: mongoose.model('Entity', entitySchema),
  Relationship: mongoose.model('Relationship', relationshipSchema),
  RiskSignal: mongoose.model('RiskSignal', riskSignalSchema),
  AgentLog: mongoose.model('AgentLog', agentLogSchema)
};
