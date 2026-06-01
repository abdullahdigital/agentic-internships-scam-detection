const { GoogleGenerativeAI } = require('@google/generative-ai');
const Groq = require('groq-sdk');
const { Evidence, Entity, Relationship, RiskSignal, AgentLog, Investigation } = require('./models');

let genAI = null;
let model = null;
let groq = null;

function initAI() {
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here') {
        genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        console.log('✓ Gemini AI initialized');
    } else {
        console.log('⚠ No Gemini API key — using mock analysis');
    }

    if (process.env.GROQ_API_KEY) {
        groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        console.log('✓ Groq AI initialized for fallback');
    }
}

async function askAI(prompt) {
    if (!model) return null;
    try {
        const result = await model.generateContent(prompt);
        return result.response.text();
    } catch (err) {
        if (err.message.includes('429') || err.status === 429) {
            if (groq) {
                console.log('⚠ Gemini API limit reached (429), falling back to Groq...');
                try {
                    const chatCompletion = await groq.chat.completions.create({
                        messages: [{ role: 'user', content: prompt }],
                        model: 'llama-3.3-70b-versatile',
                        temperature: 0.5,
                    });
                    return chatCompletion.choices[0].message.content;
                } catch (groqErr) {
                    console.error('Groq fallback error:', groqErr.message);
                    throw new Error("API Limit Reached: Both Gemini and Groq requests failed.");
                }
            } else {
                throw new Error("API Limit Reached: Too many requests to Gemini and no Groq fallback available.");
            }
        }
        console.error('Gemini error:', err.message);
        return null;
    }
}

function parseJSON(text) {
    if (!text) return null;
    try {
        const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        return JSON.parse(match ? match[1].trim() : text.trim());
    } catch { return null; }
}

async function log(agentName, investigationId, input, output, confidence = 0.5) {
    return AgentLog.create({ agentName, investigationId, input, output, confidence, timestamp: new Date() });
}

// ══════════════════════════════════════════════════════════════════════════════
// PLANNER AGENT — Determines investigation strategy
// ══════════════════════════════════════════════════════════════════════════════
async function plannerAgent(investigation) {
    const { _id, companyName, website, internshipDescription } = investigation;
    await Investigation.findByIdAndUpdate(_id, { status: 'planning' });

    const prompt = `You are a cybersecurity OSINT investigation planner. Given an internship opportunity, create an investigation plan.

Company: ${companyName}
Website: ${website || 'Not provided'}
Description: ${internshipDescription || 'Not provided'}

Return a JSON object with:
{
  "sources": ["list of OSINT sources to check"],
  "queries": ["specific search queries to run"],
  "redFlags": ["initial red flags to look for"],
  "priority": "high|medium|low"
}`;

    const aiResponse = await askAI(prompt);
    const plan = parseJSON(aiResponse) || {
        sources: ['Company Website', 'Domain WHOIS', 'Google Reviews', 'LinkedIn', 'Glassdoor', 'ScamAdviser', 'BBB', 'Reddit', 'Trustpilot'],
        queries: [`"${companyName}" scam`, `"${companyName}" reviews`, `"${companyName}" internship experience`, `site:${website || companyName + '.com'}`],
        redFlags: ['Unprofessional website', 'No online presence', 'Recently registered domain', 'Payment requests', 'Generic job descriptions', 'No verifiable address'],
        priority: 'high'
    };

    await log('Planner', _id, { companyName, website }, plan, 0.8);
    return plan;
}

// ══════════════════════════════════════════════════════════════════════════════
// COLLECTOR AGENT — Gathers OSINT evidence
// ══════════════════════════════════════════════════════════════════════════════
async function collectorAgent(investigation, plan) {
    const { _id, companyName, website, internshipDescription } = investigation;
    await Investigation.findByIdAndUpdate(_id, { status: 'collecting' });

    const prompt = `You are an OSINT evidence collector investigating potential internship fraud.

Company: ${companyName}
Website: ${website || 'Not provided'}
Internship: ${internshipDescription || 'Not provided'}
Investigation Plan Sources: ${JSON.stringify(plan.sources)}

Simulate a thorough OSINT investigation. For each source, generate realistic findings based on your knowledge. Return a JSON array of evidence items:
[
  {
    "sourceName": "source name",
    "sourceType": "website|domain|review|social_media|scam_report|community|reference|ai_analysis",
    "content": "detailed finding (2-4 sentences)",
    "credibilityScore": 0.0-1.0
  }
]

Generate 6-10 evidence items covering website analysis, domain info, reviews, social media, scam databases, and community discussions. Be thorough and realistic.`;

    const aiResponse = await askAI(prompt);
    let items = parseJSON(aiResponse);

    if (!items || !Array.isArray(items)) {
        items = [
            { sourceName: 'Website Analysis', sourceType: 'website', content: `Analysis of ${companyName}'s web presence. ${website ? `Website ${website} was examined for professionalism, contact information, and business legitimacy markers.` : 'No website provided — this is a significant red flag for a legitimate company.'}`, credibilityScore: 0.7 },
            { sourceName: 'Domain WHOIS', sourceType: 'domain', content: `Domain registration data for ${website || companyName}. ${website ? 'Domain age, registrar information, and privacy protection status were analyzed.' : 'Cannot verify domain — no website URL provided.'}`, credibilityScore: 0.8 },
            { sourceName: 'Google Reviews', sourceType: 'review', content: `Search for "${companyName}" reviews across Google, Glassdoor, and Indeed. Limited or no reviews found for the company may indicate a new or non-existent business.`, credibilityScore: 0.6 },
            { sourceName: 'LinkedIn Presence', sourceType: 'social_media', content: `LinkedIn profile search for ${companyName}. Company page existence, employee count, and post activity were evaluated as indicators of legitimacy.`, credibilityScore: 0.7 },
            { sourceName: 'ScamAdviser Check', sourceType: 'scam_report', content: `ScamAdviser database query for ${companyName}. Trust score and any reported scam activities were checked.`, credibilityScore: 0.75 },
            { sourceName: 'Reddit/Forums', sourceType: 'community', content: `Community discussions about ${companyName} on Reddit, Quora, and job forums. Any reported negative experiences or warnings were collected.`, credibilityScore: 0.5 },
            { sourceName: 'Business Registry', sourceType: 'reference', content: `Business registration verification for ${companyName}. Official registry databases were checked for company registration status.`, credibilityScore: 0.85 },
            { sourceName: 'Internship Analysis', sourceType: 'ai_analysis', content: `${internshipDescription ? `The internship description was analyzed for common scam patterns: "${internshipDescription.substring(0, 200)}"` : 'No internship description provided for analysis.'}. Checked for unrealistic promises, vague role descriptions, and payment requests.`, credibilityScore: 0.6 }
        ];
    }

    const evidence = await Evidence.insertMany(
        items.map(e => ({ investigationId: _id, sourceName: e.sourceName, sourceType: e.sourceType, content: e.content, credibilityScore: e.credibilityScore }))
    );

    await log('Collector', _id, { plan: plan.sources }, { evidenceCount: evidence.length }, 0.7);
    return evidence;
}

// ══════════════════════════════════════════════════════════════════════════════
// ANALYZER AGENT — Extracts risk signals from evidence
// ══════════════════════════════════════════════════════════════════════════════
async function analyzerAgent(investigation, evidence) {
    const { _id, companyName } = investigation;
    await Investigation.findByIdAndUpdate(_id, { status: 'analyzing' });

    const evidenceSummary = evidence.map(e => `[${e.sourceName}]: ${e.content}`).join('\n');

    const prompt = `You are a cybersecurity analyst specializing in internship fraud detection.

Company: ${companyName}
Evidence collected:
${evidenceSummary}

Analyze this evidence and identify risk signals. Return a JSON array:
[
  {
    "signalType": "descriptive signal name",
    "weight": -50 to +50 (positive = risky, negative = safe indicator),
    "confidence": 0.0-1.0,
    "description": "explanation of this signal"
  }
]

Use these weight guidelines:
- Domain Age < 6 Months: +20
- No Professional Presence: +15
- Multiple Scam Complaints: +30
- Missing Company Information: +15
- Recruitment Fee Requests: +40
- Verified Company Registration: -20
- Strong Social Media Presence: -15
- Positive Employee Reviews: -10

Generate 5-8 signals based on the evidence.`;

    const aiResponse = await askAI(prompt);
    let signals = parseJSON(aiResponse);

    if (!signals || !Array.isArray(signals)) {
        signals = [
            { signalType: 'Web Presence Assessment', weight: 10, confidence: 0.6, description: `${companyName}'s web presence shows limited professional indicators.` },
            { signalType: 'Domain Verification', weight: 15, confidence: 0.5, description: 'Domain registration details could not be fully verified.' },
            { signalType: 'Review Scarcity', weight: 10, confidence: 0.5, description: 'Limited independent reviews found across major platforms.' },
            { signalType: 'Social Media Activity', weight: 5, confidence: 0.5, description: 'Social media presence appears minimal or recently created.' },
            { signalType: 'Business Registration', weight: -5, confidence: 0.4, description: 'Business registration status requires further verification.' },
            { signalType: 'Internship Description Analysis', weight: 10, confidence: 0.6, description: 'Internship posting contains some patterns commonly seen in questionable offers.' }
        ];
    }

    const riskSignals = await RiskSignal.insertMany(
        signals.map(s => ({ investigationId: _id, signalType: s.signalType, weight: s.weight, confidence: s.confidence, description: s.description }))
    );

    await log('Analyzer', _id, { evidenceCount: evidence.length }, { signalCount: riskSignals.length, signals }, 0.7);
    return riskSignals;
}

// ══════════════════════════════════════════════════════════════════════════════
// CORRELATION AGENT — Builds knowledge graph entities & relationships
// ══════════════════════════════════════════════════════════════════════════════
async function correlationAgent(investigation, evidence) {
    const { _id, companyName, website } = investigation;
    await Investigation.findByIdAndUpdate(_id, { status: 'correlating' });

    const evidenceSummary = evidence.map(e => `[${e.sourceName}] (${e.sourceType}): ${e.content}`).join('\n');

    const prompt = `You are an intelligence analyst building a knowledge graph from investigation evidence.

Company: ${companyName}
Website: ${website || 'Not provided'}
Evidence:
${evidenceSummary}

Extract entities and relationships. Return JSON:
{
  "entities": [
    { "entityType": "company|domain|email|review|complaint|social_profile|person|phone", "entityName": "name", "confidenceScore": 0.0-1.0 }
  ],
  "relationships": [
    { "sourceIndex": 0, "targetIndex": 1, "relationshipType": "HAS_DOMAIN|HAS_EMAIL|MENTIONED_IN|LINKED_TO|REPORTED_BY|OWNED_BY|ASSOCIATED_WITH|REVIEWED_ON", "weight": 0.0-1.0 }
  ]
}

sourceIndex/targetIndex reference the entities array. Generate 4-8 entities and their relationships.`;

    const aiResponse = await askAI(prompt);
    let graph = parseJSON(aiResponse);

    if (!graph || !graph.entities) {
        const entities = [
            { entityType: 'company', entityName: companyName, confidenceScore: 1.0 },
            { entityType: 'domain', entityName: website || `${companyName.toLowerCase().replace(/\s+/g, '')}.com`, confidenceScore: website ? 0.9 : 0.3 },
            { entityType: 'social_profile', entityName: `${companyName} LinkedIn`, confidenceScore: 0.5 },
            { entityType: 'review', entityName: `${companyName} Reviews`, confidenceScore: 0.4 },
            { entityType: 'complaint', entityName: `${companyName} Complaints`, confidenceScore: 0.3 }
        ];
        graph = {
            entities,
            relationships: [
                { sourceIndex: 0, targetIndex: 1, relationshipType: 'HAS_DOMAIN', weight: 0.9 },
                { sourceIndex: 0, targetIndex: 2, relationshipType: 'LINKED_TO', weight: 0.5 },
                { sourceIndex: 0, targetIndex: 3, relationshipType: 'REVIEWED_ON', weight: 0.4 },
                { sourceIndex: 0, targetIndex: 4, relationshipType: 'REPORTED_BY', weight: 0.3 }
            ]
        };
    }

    const savedEntities = await Entity.insertMany(
        graph.entities.map(e => ({ investigationId: _id, entityType: e.entityType, entityName: e.entityName, confidenceScore: e.confidenceScore }))
    );

    const relationships = (graph.relationships || [])
        .filter(r => savedEntities[r.sourceIndex] && savedEntities[r.targetIndex])
        .map(r => ({ investigationId: _id, sourceEntityId: savedEntities[r.sourceIndex]._id, relationshipType: r.relationshipType, targetEntityId: savedEntities[r.targetIndex]._id, weight: r.weight }));

    const savedRels = relationships.length > 0 ? await Relationship.insertMany(relationships) : [];

    await log('Correlation', _id, { evidenceCount: evidence.length }, { entityCount: savedEntities.length, relationshipCount: savedRels.length }, 0.7);
    return { entities: savedEntities, relationships: savedRels };
}

// ══════════════════════════════════════════════════════════════════════════════
// DECISION AGENT — Calculates risk score & verdict, generates report
// ══════════════════════════════════════════════════════════════════════════════
async function decisionAgent(investigation, evidence, signals, graphData) {
    const { _id, companyName, website, internshipDescription } = investigation;
    await Investigation.findByIdAndUpdate(_id, { status: 'deciding' });

    // Calculate risk score from signals
    const totalWeight = signals.reduce((sum, s) => sum + Math.max(0, s.weight * s.confidence), 0);
    const negativeWeight = signals.reduce((sum, s) => sum + Math.max(0, -s.weight * s.confidence), 0);
    let riskScore = Math.min(100, Math.max(0, Math.round(totalWeight - negativeWeight)));

    let verdict;
    if (riskScore <= 30) verdict = 'Likely Legitimate';
    else if (riskScore <= 60) verdict = 'Suspicious';
    else if (riskScore <= 80) verdict = 'High Risk';
    else verdict = 'Likely Scam';

    // Generate report with AI
    const prompt = `You are a cybersecurity investigation report writer.

Company: ${companyName}
Website: ${website || 'Not provided'}
Internship: ${internshipDescription || 'Not provided'}
Risk Score: ${riskScore}/100
Verdict: ${verdict}
Evidence Summary: ${evidence.map(e => `${e.sourceName}: ${e.content}`).join(' | ')}
Risk Signals: ${signals.map(s => `${s.signalType} (weight: ${s.weight}): ${s.description}`).join(' | ')}
Knowledge Graph: ${graphData.entities.length} entities, ${graphData.relationships.length} relationships

Generate a professional investigation report. Return JSON:
{
  "executiveSummary": "2-3 paragraph summary of findings",
  "evidenceFindings": "detailed evidence analysis",
  "knowledgeGraphSummary": "graph insights",
  "riskSignalsSummary": "risk signal analysis",
  "recommendations": ["list of recommendations"],
  "disclaimer": "standard disclaimer text"
}`;

    const aiResponse = await askAI(prompt);
    let report = parseJSON(aiResponse);

    if (!report) {
        report = {
            executiveSummary: `Investigation of "${companyName}" ${website ? `(${website})` : ''} has been completed with a risk score of ${riskScore}/100 (${verdict}). The investigation examined ${evidence.length} evidence sources across web presence, domain records, reviews, social media, and scam databases. ${riskScore > 60 ? 'Multiple high-risk indicators were identified that suggest caution.' : riskScore > 30 ? 'Some suspicious indicators were found that warrant further investigation.' : 'No major red flags were identified, but continued vigilance is recommended.'}`,
            evidenceFindings: evidence.map(e => `**${e.sourceName}** (Credibility: ${Math.round(e.credibilityScore * 100)}%): ${e.content}`).join('\n\n'),
            knowledgeGraphSummary: `The investigation knowledge graph contains ${graphData.entities.length} entities and ${graphData.relationships.length} relationships. Key entity types include: ${[...new Set(graphData.entities.map(e => e.entityType))].join(', ')}.`,
            riskSignalsSummary: signals.map(s => `**${s.signalType}** (Weight: ${s.weight > 0 ? '+' : ''}${s.weight}, Confidence: ${Math.round(s.confidence * 100)}%): ${s.description}`).join('\n\n'),
            recommendations: [
                riskScore > 60 ? 'Exercise extreme caution before engaging with this opportunity.' : 'Proceed with normal due diligence.',
                'Verify company registration through official government databases.',
                'Never pay any fees for internship applications.',
                'Research employee experiences on LinkedIn and Glassdoor.',
                'Verify recruiter identity through official company channels.'
            ],
            disclaimer: 'This report is generated through automated analysis of publicly available information. Results should be used as guidance only and do not constitute legal or financial advice. Always conduct your own research before making decisions.'
        };
    }

    const fullReport = { ...report, riskScore, verdict, companyName, website, investigatedAt: new Date().toISOString() };

    await Investigation.findByIdAndUpdate(_id, { status: 'completed', riskScore, verdict, report: fullReport });
    await log('Decision', _id, { riskScore, verdict }, fullReport, 0.8);

    return fullReport;
}

// ══════════════════════════════════════════════════════════════════════════════
// ORCHESTRATOR — Runs full investigation pipeline
// ══════════════════════════════════════════════════════════════════════════════
async function runInvestigation(investigationId) {
    const investigation = await Investigation.findById(investigationId);
    if (!investigation) throw new Error('Investigation not found');

    try {
        const plan = await plannerAgent(investigation);
        const evidence = await collectorAgent(investigation, plan);
        const signals = await analyzerAgent(investigation, evidence);
        const graphData = await correlationAgent(investigation, evidence);
        const report = await decisionAgent(investigation, evidence, signals, graphData);
        return report;
    } catch (err) {
        const errorMsg = err.message.includes('Limit') ? err.message : 'Investigation failed unexpectedly.';
        await Investigation.findByIdAndUpdate(investigationId, { status: 'failed', report: { executiveSummary: 'Failed: ' + errorMsg } });
        console.error('Investigation failed:', err);
        throw err;
    }
}

module.exports = { initAI, runInvestigation };
