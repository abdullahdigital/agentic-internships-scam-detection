const mongoose = require('mongoose');
const { Investigation, Evidence, Entity, Relationship, RiskSignal, AgentLog } = require('./models');

// ══════════════════════════════════════════════════════════════════════════════
// AGGREGATION PIPELINE: Full Report (replaces 4 separate queries)
// Uses $lookup to join Investigation + Evidence + RiskSignal + AgentLog + Graph
// ══════════════════════════════════════════════════════════════════════════════
async function getFullReport(investigationId) {
  const id = new mongoose.Types.ObjectId(investigationId);

  const pipeline = [
    // Stage 1: Match the specific investigation
    { $match: { _id: id } },

    // Stage 2: Lookup evidence for this investigation
    {
      $lookup: {
        from: 'evidences',
        localField: '_id',
        foreignField: 'investigationId',
        as: 'evidence',
        pipeline: [
          { $sort: { timestamp: -1 } },
          { $project: { __v: 0 } }
        ]
      }
    },

    // Stage 3: Lookup risk signals
    {
      $lookup: {
        from: 'risksignals',
        localField: '_id',
        foreignField: 'investigationId',
        as: 'signals',
        pipeline: [
          { $sort: { weight: -1 } },
          { $project: { __v: 0 } }
        ]
      }
    },

    // Stage 4: Lookup agent logs
    {
      $lookup: {
        from: 'agentlogs',
        localField: '_id',
        foreignField: 'investigationId',
        as: 'agentLogs',
        pipeline: [
          { $sort: { timestamp: 1 } },
          { $project: { __v: 0 } }
        ]
      }
    },

    // Stage 5: Lookup entities (for knowledge graph)
    {
      $lookup: {
        from: 'entities',
        localField: '_id',
        foreignField: 'investigationId',
        as: 'entities',
        pipeline: [{ $project: { __v: 0 } }]
      }
    },

    // Stage 6: Lookup relationships (for knowledge graph)
    {
      $lookup: {
        from: 'relationships',
        localField: '_id',
        foreignField: 'investigationId',
        as: 'relationships',
        pipeline: [{ $project: { __v: 0 } }]
      }
    },

    // Stage 7: Add computed fields
    {
      $addFields: {
        evidenceCount: { $size: '$evidence' },
        signalCount: { $size: '$signals' },
        entityCount: { $size: '$entities' },
        relationshipCount: { $size: '$relationships' },
        // Compute average credibility from evidence
        avgCredibility: {
          $cond: {
            if: { $gt: [{ $size: '$evidence' }, 0] },
            then: { $avg: '$evidence.credibilityScore' },
            else: 0
          }
        },
        // Compute risk vs safe signal breakdown
        riskSignalBreakdown: {
          risky: {
            $size: {
              $filter: { input: '$signals', cond: { $gt: ['$$this.weight', 0] } }
            }
          },
          safe: {
            $size: {
              $filter: { input: '$signals', cond: { $lte: ['$$this.weight', 0] } }
            }
          }
        }
      }
    },

    // Stage 8: Remove internal fields
    { $project: { __v: 0 } }
  ];

  const results = await Investigation.aggregate(pipeline);
  return results[0] || null;
}

// ══════════════════════════════════════════════════════════════════════════════
// AGGREGATION PIPELINE: Dashboard Statistics
// Uses $facet for multi-result aggregation in a single query
// ══════════════════════════════════════════════════════════════════════════════
async function getDashboardStats() {
  const pipeline = [
    {
      $facet: {
        // Facet 1: Overall counts and averages
        overview: [
          {
            $group: {
              _id: null,
              totalInvestigations: { $sum: 1 },
              completedInvestigations: {
                $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
              },
              failedInvestigations: {
                $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
              },
              pendingInvestigations: {
                $sum: {
                  $cond: [
                    { $in: ['$status', ['pending', 'planning', 'collecting', 'analyzing', 'correlating', 'deciding']] },
                    1, 0
                  ]
                }
              },
              avgRiskScore: {
                $avg: {
                  $cond: [{ $ne: ['$riskScore', null] }, '$riskScore', '$$REMOVE']
                }
              },
              maxRiskScore: { $max: '$riskScore' },
              minRiskScore: {
                $min: {
                  $cond: [{ $ne: ['$riskScore', null] }, '$riskScore', '$$REMOVE']
                }
              }
            }
          },
          {
            $project: {
              _id: 0,
              totalInvestigations: 1,
              completedInvestigations: 1,
              failedInvestigations: 1,
              pendingInvestigations: 1,
              avgRiskScore: { $round: ['$avgRiskScore', 1] },
              maxRiskScore: 1,
              minRiskScore: 1
            }
          }
        ],

        // Facet 2: Verdict distribution (for pie chart)
        verdictDistribution: [
          { $match: { verdict: { $ne: null } } },
          {
            $group: {
              _id: '$verdict',
              count: { $sum: 1 }
            }
          },
          { $sort: { count: -1 } }
        ],

        // Facet 3: Risk score distribution (buckets for histogram)
        riskDistribution: [
          { $match: { riskScore: { $ne: null } } },
          {
            $bucket: {
              groupBy: '$riskScore',
              boundaries: [0, 20, 40, 60, 80, 101],
              default: 'Unknown',
              output: {
                count: { $sum: 1 },
                companies: { $push: '$companyName' }
              }
            }
          }
        ],

        // Facet 4: Recent investigations (last 5)
        recentInvestigations: [
          { $sort: { createdAt: -1 } },
          { $limit: 5 },
          {
            $project: {
              companyName: 1,
              website: 1,
              status: 1,
              riskScore: 1,
              verdict: 1,
              createdAt: 1
            }
          }
        ],

        // Facet 5: Daily investigation trends (last 30 days)
        dailyTrends: [
          {
            $match: {
              createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
            }
          },
          {
            $group: {
              _id: {
                $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
              },
              count: { $sum: 1 },
              avgRisk: { $avg: '$riskScore' }
            }
          },
          { $sort: { _id: 1 } }
        ],

        // Facet 6: Status distribution
        statusDistribution: [
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 }
            }
          }
        ]
      }
    },

    // Flatten the facet results
    {
      $project: {
        overview: { $arrayElemAt: ['$overview', 0] },
        verdictDistribution: 1,
        riskDistribution: 1,
        recentInvestigations: 1,
        dailyTrends: 1,
        statusDistribution: 1
      }
    }
  ];

  const results = await Investigation.aggregate(pipeline);
  return results[0] || {
    overview: { totalInvestigations: 0, completedInvestigations: 0, avgRiskScore: 0 },
    verdictDistribution: [],
    riskDistribution: [],
    recentInvestigations: [],
    dailyTrends: [],
    statusDistribution: []
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// AGGREGATION PIPELINE: Search Investigations with Pagination
// Uses $facet for count + results in a single query
// ══════════════════════════════════════════════════════════════════════════════
async function searchInvestigations(query = '', filters = {}, page = 1, limit = 20) {
  const matchStage = {};

  // Text search
  if (query && query.trim()) {
    matchStage.$text = { $search: query.trim() };
  }

  // Status filter
  if (filters.status) {
    matchStage.status = filters.status;
  }

  // Verdict filter
  if (filters.verdict) {
    matchStage.verdict = filters.verdict;
  }

  // Risk score range filter
  if (filters.minRisk !== undefined || filters.maxRisk !== undefined) {
    matchStage.riskScore = {};
    if (filters.minRisk !== undefined) matchStage.riskScore.$gte = Number(filters.minRisk);
    if (filters.maxRisk !== undefined) matchStage.riskScore.$lte = Number(filters.maxRisk);
    if (Object.keys(matchStage.riskScore).length === 0) delete matchStage.riskScore;
  }

  // Date range filter
  if (filters.startDate || filters.endDate) {
    matchStage.createdAt = {};
    if (filters.startDate) matchStage.createdAt.$gte = new Date(filters.startDate);
    if (filters.endDate) matchStage.createdAt.$lte = new Date(filters.endDate);
    if (Object.keys(matchStage.createdAt).length === 0) delete matchStage.createdAt;
  }

  const skip = (page - 1) * limit;

  const pipeline = [
    ...(Object.keys(matchStage).length > 0 ? [{ $match: matchStage }] : []),
    {
      $facet: {
        // Results with pagination
        results: [
          { $sort: { createdAt: -1 } },
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              report: 0,
              __v: 0
            }
          }
        ],
        // Total count for pagination
        totalCount: [
          { $count: 'count' }
        ]
      }
    },
    {
      $project: {
        results: 1,
        total: { $ifNull: [{ $arrayElemAt: ['$totalCount.count', 0] }, 0] },
        page: { $literal: page },
        limit: { $literal: limit },
        totalPages: {
          $ceil: {
            $divide: [
              { $ifNull: [{ $arrayElemAt: ['$totalCount.count', 0] }, 0] },
              limit
            ]
          }
        }
      }
    }
  ];

  const results = await Investigation.aggregate(pipeline);
  return results[0] || { results: [], total: 0, page, limit, totalPages: 0 };
}

// ══════════════════════════════════════════════════════════════════════════════
// AGGREGATION PIPELINE: Investigation Timeline
// Joins agent logs with investigation status for full timeline
// ══════════════════════════════════════════════════════════════════════════════
async function getInvestigationTimeline(investigationId) {
  const id = new mongoose.Types.ObjectId(investigationId);

  const pipeline = [
    { $match: { investigationId: id } },
    { $sort: { timestamp: 1 } },
    {
      $group: {
        _id: '$agentName',
        firstLog: { $first: '$$ROOT' },
        lastLog: { $last: '$$ROOT' },
        avgConfidence: { $avg: '$confidence' },
        logCount: { $sum: 1 },
        totalDurationMs: { $sum: { $ifNull: ['$durationMs', 0] } }
      }
    },
    {
      $project: {
        agentName: '$_id',
        startTime: '$firstLog.timestamp',
        endTime: '$lastLog.timestamp',
        avgConfidence: { $round: ['$avgConfidence', 2] },
        logCount: 1,
        totalDurationMs: 1,
        _id: 0
      }
    },
    { $sort: { startTime: 1 } }
  ];

  return AgentLog.aggregate(pipeline);
}

// ══════════════════════════════════════════════════════════════════════════════
// AGGREGATION PIPELINE: Knowledge Graph with $graphLookup
// Traverses entity relationships for deep graph analysis
// ══════════════════════════════════════════════════════════════════════════════
async function getGraphWithTraversal(investigationId) {
  const id = new mongoose.Types.ObjectId(investigationId);

  // Build graph nodes with relationship data in one query
  const pipeline = [
    { $match: { investigationId: id } },
    // Lookup all relationships where this entity is the source
    {
      $lookup: {
        from: 'relationships',
        localField: '_id',
        foreignField: 'sourceEntityId',
        as: 'outgoingRelations',
        pipeline: [
          {
            $lookup: {
              from: 'entities',
              localField: 'targetEntityId',
              foreignField: '_id',
              as: 'target',
              pipeline: [{ $project: { entityName: 1, entityType: 1 } }]
            }
          },
          { $unwind: { path: '$target', preserveNullAndEmptyArrays: true } }
        ]
      }
    },
    // Lookup relationships where this entity is the target
    {
      $lookup: {
        from: 'relationships',
        localField: '_id',
        foreignField: 'targetEntityId',
        as: 'incomingRelations',
        pipeline: [
          {
            $lookup: {
              from: 'entities',
              localField: 'sourceEntityId',
              foreignField: '_id',
              as: 'source',
              pipeline: [{ $project: { entityName: 1, entityType: 1 } }]
            }
          },
          { $unwind: { path: '$source', preserveNullAndEmptyArrays: true } }
        ]
      }
    },
    {
      $addFields: {
        connectionCount: {
          $add: [{ $size: '$outgoingRelations' }, { $size: '$incomingRelations' }]
        }
      }
    },
    { $project: { __v: 0 } }
  ];

  return Entity.aggregate(pipeline);
}

// ══════════════════════════════════════════════════════════════════════════════
// CASCADE DELETE: Remove investigation and ALL related data
// Uses bulkWrite for efficiency
// ══════════════════════════════════════════════════════════════════════════════
async function cascadeDeleteInvestigation(investigationId) {
  const id = new mongoose.Types.ObjectId(investigationId);

  try {
    const results = await Promise.all([
      Evidence.deleteMany({ investigationId: id }),
      RiskSignal.deleteMany({ investigationId: id }),
      Entity.deleteMany({ investigationId: id }),
      Relationship.deleteMany({ investigationId: id }),
      AgentLog.deleteMany({ investigationId: id }),
      Investigation.findByIdAndDelete(id)
    ]);

    return {
      investigation: results[5] ? 1 : 0,
      evidence: results[0].deletedCount,
      riskSignals: results[1].deletedCount,
      entities: results[2].deletedCount,
      relationships: results[3].deletedCount,
      agentLogs: results[4].deletedCount
    };
  } catch (err) {
    throw err;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// AGGREGATION: Evidence Analysis per Investigation
// Groups evidence by source type with credibility stats
// ══════════════════════════════════════════════════════════════════════════════
async function getEvidenceAnalysis(investigationId) {
  const id = new mongoose.Types.ObjectId(investigationId);

  const pipeline = [
    { $match: { investigationId: id } },
    {
      $group: {
        _id: '$sourceType',
        count: { $sum: 1 },
        avgCredibility: { $avg: '$credibilityScore' },
        maxCredibility: { $max: '$credibilityScore' },
        minCredibility: { $min: '$credibilityScore' },
        sources: { $push: '$sourceName' }
      }
    },
    {
      $project: {
        sourceType: '$_id',
        _id: 0,
        count: 1,
        avgCredibility: { $round: ['$avgCredibility', 2] },
        maxCredibility: 1,
        minCredibility: 1,
        sources: 1
      }
    },
    { $sort: { avgCredibility: -1 } }
  ];

  return Evidence.aggregate(pipeline);
}

module.exports = {
  getFullReport,
  getDashboardStats,
  searchInvestigations,
  getInvestigationTimeline,
  getGraphWithTraversal,
  cascadeDeleteInvestigation,
  getEvidenceAnalysis
};
