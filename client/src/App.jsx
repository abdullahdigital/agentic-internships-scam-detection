import { createSignal, createEffect, Show, For, onCleanup, onMount } from 'solid-js';

const API = '/api';
const api = (path, opts = {}) =>
    fetch(`${API}${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...opts.headers }, body: opts.body ? JSON.stringify(opts.body) : undefined })
        .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Request failed'); return d; });

// ══════════════════════════════════════════════════════════════════════════════
// APP — Dashboard | Form → Live → Report | History with Search
// ══════════════════════════════════════════════════════════════════════════════
export default function App() {
    const [view, setView] = createSignal('form');
    const [investigations, setInvestigations] = createSignal([]);
    const [currentInv, setCurrentInv] = createSignal(null);
    const [reportData, setReportData] = createSignal(null);
    const [graphData, setGraphData] = createSignal(null);
    const [dashStats, setDashStats] = createSignal(null);
    const [error, setError] = createSignal('');
    const [pagination, setPagination] = createSignal({ page: 1, totalPages: 1, total: 0 });

    const props = { view, setView, investigations, setInvestigations, currentInv, setCurrentInv, reportData, setReportData, graphData, setGraphData, dashStats, setDashStats, error, setError, pagination, setPagination };

    return (
        <div class="min-h-screen w-full flex flex-col overflow-x-hidden" style="background: radial-gradient(ellipse at top left, rgba(99,102,241,0.05), transparent 50%), radial-gradient(ellipse at bottom right, rgba(6,182,212,0.04), transparent 50%)">
            {/* ── Nav ──────────────────────────────────────────────────────────── */}
            <nav class="sticky top-0 z-50 glass-sm w-full" style="border-radius:0; border-left:0; border-right:0; border-top:0">
                <div class="max-w-6xl w-full mx-auto px-4 py-3 flex items-center justify-between">
                    <div class="flex items-center gap-3 cursor-pointer" onClick={() => setView('form')}>
                        <div class="w-9 h-9 rounded-xl flex items-center justify-center text-base" style="background: linear-gradient(135deg, #6366f1, #06b6d4)">🛡️</div>
                        <span class="text-lg font-bold logo-text">InternShield</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <button class="btn btn-ghost btn-sm" classList={{ '!border-[--color-primary] !bg-[rgba(99,102,241,0.1)]': view() === 'dashboard' }}
                            onClick={() => { setView('dashboard'); api('/stats').then(d => setDashStats(d)).catch(e => setError(e.message)); }}>
                            📊 Dashboard
                        </button>
                        <button class="btn btn-ghost btn-sm" classList={{ '!border-[--color-primary] !bg-[rgba(99,102,241,0.1)]': view() === 'form' }} onClick={() => setView('form')}>🔍 Investigate</button>
                        <button class="btn btn-ghost btn-sm" classList={{ '!border-[--color-primary] !bg-[rgba(99,102,241,0.1)]': view() === 'history' }}
                            onClick={() => { setView('history'); api('/investigations').then(d => { setInvestigations(d.results || d); setPagination({ page: d.page || 1, totalPages: d.totalPages || 1, total: d.total || 0 }); }).catch(e => setError(e.message)); }}>
                            📋 History
                        </button>
                    </div>
                </div>
            </nav>

            {/* ── Content ──────────────────────────────────────────────────────── */}
            <main class="flex-1 w-full max-w-6xl mx-auto px-4 py-8">
                <Show when={error()}>
                    <div class="mb-6 p-4 rounded-xl animate-in" style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2); color: #f87171">
                        {error()} <button class="ml-3 text-xs underline" onClick={() => setError('')}>dismiss</button>
                    </div>
                </Show>
                <Show when={view() === 'dashboard'}><DashboardView {...props} /></Show>
                <Show when={view() === 'form'}><InvestigationForm {...props} /></Show>
                <Show when={view() === 'live'}><LiveInvestigation {...props} /></Show>
                <Show when={view() === 'report'}><ReportView {...props} /></Show>
                <Show when={view() === 'history'}><HistoryView {...props} /></Show>
            </main>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// DASHBOARD — Showcases MongoDB Aggregation Analytics
// ══════════════════════════════════════════════════════════════════════════════
function DashboardView(props) {
    const [loading, setLoading] = createSignal(false);

    onMount(() => {
        if (!props.dashStats()) {
            setLoading(true);
            api('/stats').then(d => { props.setDashStats(d); setLoading(false); }).catch(e => { props.setError(e.message); setLoading(false); });
        }
    });

    const stats = () => props.dashStats();
    const overview = () => stats()?.overview || {};

    const verdictColors = { 'Likely Legitimate': '#10b981', 'Suspicious': '#f59e0b', 'High Risk': '#f97316', 'Likely Scam': '#ef4444' };

    return (
        <div class="animate-up">
            <div class="flex items-center justify-between mb-8">
                <div>
                    <h2 class="text-2xl font-bold">📊 <span class="logo-text">Analytics Dashboard</span></h2>
                    <p class="text-[--color-text-dim] text-sm mt-1">MongoDB Aggregation Pipeline Statistics</p>
                </div>
                <button class="btn btn-ghost btn-sm" onClick={() => { setLoading(true); api('/stats').then(d => { props.setDashStats(d); setLoading(false); }).catch(e => { props.setError(e.message); setLoading(false); }); }}>
                    {loading() ? '⏳' : '🔄'} Refresh
                </button>
            </div>

            <Show when={loading() && !stats()}>
                <div class="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
                    {[1,2,3,4].map(() => <div class="glass p-6 h-24 skeleton" />)}
                </div>
            </Show>

            <Show when={stats()}>
                {/* Overview Cards */}
                <div class="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6 stagger">
                    <div class="glass p-6">
                        <div class="text-xs text-[--color-text-muted] uppercase tracking-wider mb-1">Total Investigations</div>
                        <div class="text-3xl font-bold logo-text">{overview().totalInvestigations || 0}</div>
                        <div class="text-xs text-[--color-text-muted] mt-1">
                            <span style="color:#10b981">{overview().completedInvestigations || 0} completed</span> • <span style="color:#f59e0b">{overview().pendingInvestigations || 0} pending</span>
                        </div>
                    </div>
                    <div class="glass p-6">
                        <div class="text-xs text-[--color-text-muted] uppercase tracking-wider mb-1">Avg Risk Score</div>
                        <div class="text-3xl font-bold" style={{ color: (overview().avgRiskScore || 0) > 60 ? '#ef4444' : (overview().avgRiskScore || 0) > 30 ? '#f59e0b' : '#10b981' }}>
                            {overview().avgRiskScore || 0}
                        </div>
                        <div class="text-xs text-[--color-text-muted] mt-1">Range: {overview().minRiskScore ?? '—'} – {overview().maxRiskScore ?? '—'}</div>
                    </div>
                    <div class="glass p-6">
                        <div class="text-xs text-[--color-text-muted] uppercase tracking-wider mb-1">Completed</div>
                        <div class="text-3xl font-bold" style="color:#10b981">{overview().completedInvestigations || 0}</div>
                        <div class="text-xs text-[--color-text-muted] mt-1">{overview().failedInvestigations || 0} failed</div>
                    </div>
                    <div class="glass p-6">
                        <div class="text-xs text-[--color-text-muted] uppercase tracking-wider mb-1">DB Pipeline</div>
                        <div class="text-xl font-bold text-[--color-accent]">$facet</div>
                        <div class="text-xs text-[--color-text-muted] mt-1">6 facets in 1 query</div>
                    </div>
                </div>

                {/* Verdict Distribution */}
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
                    <div class="glass p-6">
                        <h3 class="text-sm font-semibold text-[--color-text-dim] mb-4">📊 VERDICT DISTRIBUTION</h3>
                        <Show when={stats().verdictDistribution?.length > 0} fallback={<p class="text-sm text-[--color-text-muted]">No completed investigations yet.</p>}>
                            <div class="space-y-3 stagger">
                                <For each={stats().verdictDistribution}>{item => {
                                    const total = stats().verdictDistribution.reduce((s, i) => s + i.count, 0);
                                    const pct = total ? Math.round((item.count / total) * 100) : 0;
                                    return (
                                        <div>
                                            <div class="flex justify-between mb-1">
                                                <span class="text-sm font-medium" style={{ color: verdictColors[item._id] || '#6b7280' }}>{item._id}</span>
                                                <span class="text-xs text-[--color-text-muted]">{item.count} ({pct}%)</span>
                                            </div>
                                            <div class="progress-bar">
                                                <div class="progress-fill" style={{ width: `${pct}%`, background: verdictColors[item._id] || '#6b7280' }} />
                                            </div>
                                        </div>
                                    );
                                }}</For>
                            </div>
                        </Show>
                    </div>

                    <div class="glass p-6">
                        <h3 class="text-sm font-semibold text-[--color-text-dim] mb-4">📈 RISK DISTRIBUTION</h3>
                        <Show when={stats().riskDistribution?.length > 0} fallback={<p class="text-sm text-[--color-text-muted]">No risk data yet.</p>}>
                            <div class="flex items-end gap-2 h-32">
                                <For each={stats().riskDistribution}>{(bucket) => {
                                    const maxCount = Math.max(...stats().riskDistribution.map(b => b.count));
                                    const h = maxCount ? (bucket.count / maxCount) * 100 : 0;
                                    const labels = { 0: '0-19', 20: '20-39', 40: '40-59', 60: '60-79', 80: '80-100' };
                                    const colors = { 0: '#10b981', 20: '#22d3ee', 40: '#f59e0b', 60: '#f97316', 80: '#ef4444' };
                                    return (
                                        <div class="flex-1 flex flex-col items-center gap-1">
                                            <span class="text-xs font-semibold">{bucket.count}</span>
                                            <div class="w-full rounded-t-lg transition-all duration-500" style={{ height: `${Math.max(h, 8)}%`, background: colors[bucket._id] || '#6b7280', 'min-height': '4px' }} />
                                            <span class="text-[10px] text-[--color-text-muted]">{labels[bucket._id] || bucket._id}</span>
                                        </div>
                                    );
                                }}</For>
                            </div>
                        </Show>
                    </div>
                </div>

                {/* Recent & Status */}
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div class="glass p-6">
                        <h3 class="text-sm font-semibold text-[--color-text-dim] mb-4">🕐 RECENT INVESTIGATIONS</h3>
                        <Show when={stats().recentInvestigations?.length > 0} fallback={<p class="text-sm text-[--color-text-muted]">No investigations yet. <button class="text-[--color-primary-light] underline" onClick={() => props.setView('form')}>Start one →</button></p>}>
                            <div class="space-y-2 stagger">
                                <For each={stats().recentInvestigations}>{inv => (
                                    <div class="glass-sm p-3 flex items-center gap-3">
                                        <span class="text-lg">🏢</span>
                                        <div class="flex-1 min-w-0">
                                            <div class="font-medium text-sm truncate">{inv.companyName}</div>
                                            <div class="text-xs text-[--color-text-muted]">{new Date(inv.createdAt).toLocaleDateString()}</div>
                                        </div>
                                        <Show when={inv.riskScore != null}>
                                            <span class="text-sm font-bold" style={{ color: inv.riskScore > 60 ? '#ef4444' : inv.riskScore > 30 ? '#f59e0b' : '#10b981' }}>{inv.riskScore}</span>
                                        </Show>
                                        <Show when={!inv.riskScore && inv.riskScore !== 0}>
                                            <span class="badge badge-pending" style="padding:2px 6px;font-size:10px">{inv.status}</span>
                                        </Show>
                                    </div>
                                )}</For>
                            </div>
                        </Show>
                    </div>

                    <div class="glass p-6">
                        <h3 class="text-sm font-semibold text-[--color-text-dim] mb-4">⚙️ STATUS BREAKDOWN</h3>
                        <Show when={stats().statusDistribution?.length > 0} fallback={<p class="text-sm text-[--color-text-muted]">No data yet.</p>}>
                            <div class="space-y-2 stagger">
                                <For each={stats().statusDistribution}>{item => {
                                    const statusColors = { pending: '#64748b', planning: '#818cf8', collecting: '#22d3ee', analyzing: '#f59e0b', correlating: '#a78bfa', deciding: '#f97316', completed: '#10b981', failed: '#ef4444' };
                                    return (
                                        <div class="flex items-center gap-3 glass-sm p-3">
                                            <div class="w-3 h-3 rounded-full" style={{ background: statusColors[item._id] || '#6b7280' }} />
                                            <span class="text-sm flex-1 capitalize">{item._id}</span>
                                            <span class="text-sm font-bold">{item.count}</span>
                                        </div>
                                    );
                                }}</For>
                            </div>
                        </Show>
                    </div>
                </div>
            </Show>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// INVESTIGATION FORM
// ══════════════════════════════════════════════════════════════════════════════
function InvestigationForm(props) {
    const [form, setForm] = createSignal({ companyName: '', website: '', internshipDescription: '' });
    const [loading, setLoading] = createSignal(false);

    async function handleSubmit(e) {
        e.preventDefault(); setLoading(true); props.setError('');
        try {
            const data = await api('/investigations', { method: 'POST', body: form() });
            props.setCurrentInv({ _id: data.investigationId, ...form(), status: 'pending' });
            props.setView('live');
            setForm({ companyName: '', website: '', internshipDescription: '' });
        } catch (err) { props.setError(err.message); }
        setLoading(false);
    }

    return (
        <div class="animate-up max-w-2xl mx-auto">
            <div class="text-center mb-10">
                <div class="inline-flex items-center gap-2 mb-4 px-4 py-1.5 rounded-full text-xs font-medium" style="background: rgba(99,102,241,0.1); color: #818cf8; border: 1px solid rgba(99,102,241,0.2)">
                    🤖 Powered by Agentic AI &amp; OSINT Intelligence
                </div>
                <h1 class="text-4xl font-bold mb-3"><span class="logo-text">Investigate</span> Internship Opportunities</h1>
                <p class="text-[--color-text-dim] max-w-lg mx-auto">Enter company details below. Our AI agents will autonomously investigate using OSINT sources and provide a transparent fraud assessment.</p>
            </div>
            <div class="glass p-8 pulse-glow">
                <form onSubmit={handleSubmit} class="space-y-5">
                    <div>
                        <label class="block text-sm font-medium text-[--color-text-dim] mb-1.5">Company Name *</label>
                        <input id="input-company-name" class="input" placeholder="e.g. TechVision Solutions" value={form().companyName} onInput={e => setForm({ ...form(), companyName: e.target.value })} required />
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-[--color-text-dim] mb-1.5">Website URL</label>
                        <input id="input-website" class="input" placeholder="e.g. techvision.com" value={form().website} onInput={e => setForm({ ...form(), website: e.target.value })} />
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-[--color-text-dim] mb-1.5">Internship Description</label>
                        <textarea id="input-description" class="input" placeholder="Paste the internship posting or describe the opportunity…" value={form().internshipDescription} onInput={e => setForm({ ...form(), internshipDescription: e.target.value })} />
                    </div>
                    <button id="btn-submit-investigation" class="btn btn-primary w-full text-base py-3.5" type="submit" disabled={loading()}>
                        {loading() ? <><span class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />{' '}Initiating…</> : '🔍 Start Investigation'}
                    </button>
                </form>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8 stagger">
                {[
                    ['🕵️', '5 AI Agents', 'Autonomous investigation with planning, collection & analysis'],
                    ['🌐', 'OSINT Sources', 'Evidence from domains, reviews, social media & scam reports'],
                    ['🧠', 'Knowledge Graph', 'Entity relationships for transparent explainable intelligence']
                ].map(([icon, title, desc]) => (
                    <div class="glass-sm p-5 text-center">
                        <div class="text-2xl mb-2">{icon}</div>
                        <h3 class="font-semibold text-sm mb-1">{title}</h3>
                        <p class="text-xs text-[--color-text-muted]">{desc}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// LIVE INVESTIGATION — polls status, shows agent timeline
// ══════════════════════════════════════════════════════════════════════════════
function LiveInvestigation(props) {
    const [status, setStatus] = createSignal('pending');
    const [logs, setLogs] = createSignal([]);
    let pollTimer = null;
    let isCleanedUp = false;

    const stages = [
        { key: 'planning', icon: '📋', label: 'Planning Investigation Strategy', desc: 'Identifying OSINT sources and creating investigation plan' },
        { key: 'collecting', icon: '🔎', label: 'Collecting Evidence', desc: 'Gathering data from web, domain, reviews, social media' },
        { key: 'analyzing', icon: '🧪', label: 'Analyzing Evidence', desc: 'Extracting risk signals and suspicious indicators' },
        { key: 'correlating', icon: '🔗', label: 'Building Knowledge Graph', desc: 'Mapping entities, relationships and evidence chains' },
        { key: 'deciding', icon: '⚖️', label: 'Computing Risk Assessment', desc: 'Calculating fraud risk score and generating verdict' }
    ];
    const order = ['pending', 'planning', 'collecting', 'analyzing', 'correlating', 'deciding', 'completed'];
    const idx = () => order.indexOf(status());

    async function poll() {
        if (isCleanedUp) return;
        const id = props.currentInv()?._id;
        if (!id) return;
        try {
            const inv = await api(`/investigations/${id}`);
            if (isCleanedUp) return;
            setStatus(inv.status);
            try { setLogs(await api(`/logs/${id}`)); } catch { }
            if (inv.status === 'completed' || inv.status === 'failed') {
                if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
                if (inv.status === 'completed') {
                    const [report, graph] = await Promise.all([api(`/report/${id}`), api(`/graph/${id}`)]);
                    if (!isCleanedUp) {
                        props.setReportData(report);
                        props.setGraphData(graph);
                        setTimeout(() => { if (!isCleanedUp) props.setView('report'); }, 1200);
                    }
                }
            }
        } catch { }
    }

    createEffect(() => {
        isCleanedUp = false;
        poll();
        pollTimer = setInterval(poll, 3000);
        onCleanup(() => {
            isCleanedUp = true;
            if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        });
    });

    return (
        <div class="animate-up max-w-2xl mx-auto">
            <div class="text-center mb-8">
                <div class="animate-float inline-block text-4xl mb-3">🔍</div>
                <h2 class="text-2xl font-bold mb-2">Investigating <span class="logo-text">{props.currentInv()?.companyName}</span></h2>
                <p class="text-[--color-text-dim] text-sm">AI agents are autonomously investigating this opportunity…</p>
            </div>

            {/* Progress */}
            <div class="glass p-6 mb-6">
                <div class="flex justify-between mb-3">
                    <span class="text-sm font-medium">Investigation Progress</span>
                    <span class="text-xs text-[--color-text-muted]">{Math.min(100, Math.round((idx() / 6) * 100))}%</span>
                </div>
                <div class="progress-bar"><div class="progress-fill" style={{ width: `${Math.min(100, Math.round((idx() / 6) * 100))}%` }} /></div>
            </div>

            {/* Timeline */}
            <div class="glass p-6">
                <h3 class="text-sm font-semibold mb-5 text-[--color-text-dim]">AGENT ACTIVITY</h3>
                <div class="space-y-1">
                    <For each={stages}>{(stage, i) => {
                        const si = () => order.indexOf(stage.key);
                        const done = () => idx() > si();
                        const active = () => status() === stage.key;
                        const pending = () => idx() < si();
                        return (
                            <div class="flex items-start gap-4 p-3 rounded-xl transition-all duration-300" classList={{ 'bg-[rgba(99,102,241,0.08)]': active() }} style={{ opacity: pending() ? 0.4 : 1 }}>
                                <div class="flex flex-col items-center">
                                    <div class="w-10 h-10 rounded-xl flex items-center justify-center text-lg transition-all" style={{
                                        background: done() ? 'rgba(16,185,129,0.15)' : active() ? 'rgba(99,102,241,0.15)' : 'rgba(100,116,139,0.1)',
                                        border: `1px solid ${done() ? '#10b981' : active() ? '#6366f1' : '#334155'}`
                                    }}>
                                        {done() ? '✅' : active() ? <span class="animate-spin text-sm">⚙️</span> : stage.icon}
                                    </div>
                                    <Show when={i() < stages.length - 1}><div class="w-0.5 h-6 mt-1" style={{ background: done() ? '#10b981' : '#334155' }} /></Show>
                                </div>
                                <div class="flex-1 pt-1">
                                    <div class="flex items-center gap-2">
                                        <span class="font-medium text-sm">{stage.label}</span>
                                        <Show when={done()}><span class="badge badge-low" style="padding:2px 6px;font-size:10px">Done</span></Show>
                                        <Show when={active()}><span class="badge badge-pending" style="padding:2px 6px;font-size:10px">Running</span></Show>
                                    </div>
                                    <p class="text-xs text-[--color-text-muted] mt-0.5">{stage.desc}</p>
                                    <Show when={active()}>
                                        <div class="mt-2 h-1 rounded overflow-hidden" style="background:rgba(99,102,241,0.1);max-width:200px">
                                            <div class="h-full rounded" style="width:40%;background:linear-gradient(90deg,#6366f1,#06b6d4);animation:scan 1.5s ease-in-out infinite" />
                                        </div>
                                    </Show>
                                </div>
                            </div>
                        );
                    }}</For>
                </div>
            </div>

            {/* Logs */}
            <Show when={logs().length > 0}>
                <div class="glass p-6 mt-6">
                    <h3 class="text-sm font-semibold mb-4 text-[--color-text-dim]">AGENT LOGS</h3>
                    <div class="space-y-2 max-h-48 overflow-auto stagger">
                        <For each={logs()}>{log => (
                            <div class="glass-sm p-3 text-xs flex items-center gap-2">
                                <span class="font-semibold text-[--color-primary-light]">{log.agentName}</span>
                                <span class="text-[--color-text-muted]">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                <Show when={log.durationMs}><span class="text-[--color-accent]">{(log.durationMs / 1000).toFixed(1)}s</span></Show>
                                <span class="ml-auto text-[--color-accent]">{Math.round((log.confidence || 0) * 100)}% confidence</span>
                            </div>
                        )}</For>
                    </div>
                </div>
            </Show>

            <Show when={status() === 'completed'}>
                <div class="text-center mt-6 animate-in"><div class="text-4xl mb-2">✅</div><p class="font-semibold text-[--color-success]">Investigation Complete! Loading report…</p></div>
            </Show>
            <Show when={status() === 'failed'}>
                <div class="text-center mt-6 animate-in"><div class="text-4xl mb-2">❌</div><p class="font-semibold text-[--color-danger]">Investigation failed.</p>
                    <button class="btn btn-primary mt-4" onClick={() => props.setView('form')}>← Try Again</button>
                </div>
            </Show>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// REPORT VIEW
// ══════════════════════════════════════════════════════════════════════════════
function ReportView(props) {
    const r = () => props.reportData();
    const g = () => props.graphData();
    if (!r()) return <div class="text-center py-20 text-[--color-text-muted]">No report data.</div>;

    const colors = { 'Likely Legitimate': '#10b981', 'Suspicious': '#f59e0b', 'High Risk': '#f97316', 'Likely Scam': '#ef4444' };
    const col = () => colors[r()?.verdict] || '#6b7280';
    const cat = () => { const s = r()?.riskScore || 0; return s <= 30 ? 'Low Risk' : s <= 60 ? 'Medium Risk' : s <= 80 ? 'High Risk' : 'Critical Risk'; };

    return (
        <div class="animate-up max-w-4xl mx-auto">
            {/* Header */}
            <div class="flex items-center justify-between mb-6">
                <div>
                    <button class="text-sm text-[--color-text-muted] hover:text-[--color-text] mb-2 flex items-center gap-1" onClick={() => props.setView('form')}>← New Investigation</button>
                    <h2 class="text-2xl font-bold">Investigation Report</h2>
                    <p class="text-[--color-text-dim] text-sm mt-1">{r()?.companyName} {r()?.website ? `• ${r().website}` : ''}</p>
                </div>
                <div class="text-right text-xs text-[--color-text-muted]">{new Date(r()?.investigatedAt).toLocaleDateString()}</div>
            </div>

            {/* Risk Score */}
            <div class="glass p-8 mb-6">
                <div class="flex flex-col sm:flex-row items-center gap-8">
                    <div class="risk-meter flex-shrink-0">
                        <svg width="160" height="160" viewBox="0 0 160 160">
                            <circle cx="80" cy="80" r="70" fill="none" stroke="rgba(100,116,139,0.15)" stroke-width="10" />
                            <circle cx="80" cy="80" r="70" fill="none" stroke={col()} stroke-width="10"
                                stroke-dasharray={`${(r()?.riskScore / 100) * 440} 440`} stroke-linecap="round" style="transition: stroke-dasharray 1.5s ease" />
                        </svg>
                        <div class="text-center z-10 relative">
                            <div class="text-4xl font-bold" style={{ color: col() }}>{r()?.riskScore}</div>
                            <div class="text-xs text-[--color-text-muted]">/ 100</div>
                        </div>
                    </div>
                    <div class="flex-1 text-center sm:text-left">
                        <div class="text-sm text-[--color-text-muted] mb-1">Verdict</div>
                        <div class="text-3xl font-bold mb-2" style={{ color: col() }}>{r()?.verdict}</div>
                        <span class="inline-flex px-3 py-1 rounded-full text-xs font-semibold" style={{ background: `${col()}20`, color: col() }}>{cat()}</span>
                    </div>
                </div>
            </div>

            {/* Analytics from Aggregation Pipeline */}
            <Show when={r()?.analytics}>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 stagger">
                    <div class="glass-sm p-4 text-center">
                        <div class="text-xl font-bold text-[--color-primary-light]">{r().analytics.evidenceCount}</div>
                        <div class="text-xs text-[--color-text-muted]">Evidence Items</div>
                    </div>
                    <div class="glass-sm p-4 text-center">
                        <div class="text-xl font-bold text-[--color-accent]">{r().analytics.signalCount}</div>
                        <div class="text-xs text-[--color-text-muted]">Risk Signals</div>
                    </div>
                    <div class="glass-sm p-4 text-center">
                        <div class="text-xl font-bold text-[--color-primary-light]">{r().analytics.entityCount}</div>
                        <div class="text-xs text-[--color-text-muted]">Graph Entities</div>
                    </div>
                    <div class="glass-sm p-4 text-center">
                        <div class="text-xl font-bold" style="color:#10b981">{Math.round((r().analytics.avgCredibility || 0) * 100)}%</div>
                        <div class="text-xs text-[--color-text-muted]">Avg Credibility</div>
                    </div>
                </div>
            </Show>

            {/* Executive Summary */}
            <div class="glass p-6 mb-6">
                <h3 class="text-sm font-semibold text-[--color-text-dim] mb-3">📄 EXECUTIVE SUMMARY</h3>
                <p class="text-sm leading-relaxed whitespace-pre-line">{r()?.executiveSummary}</p>
            </div>

            {/* Risk Signals */}
            <Show when={r()?.signals?.length}>
                <div class="glass p-6 mb-6">
                    <h3 class="text-sm font-semibold text-[--color-text-dim] mb-4">⚡ RISK SIGNALS
                        <Show when={r()?.analytics?.riskSignalBreakdown}>
                            <span class="font-normal text-[--color-text-muted] ml-2">
                                ({r().analytics.riskSignalBreakdown.risky} risk • {r().analytics.riskSignalBreakdown.safe} safe)
                            </span>
                        </Show>
                    </h3>
                    <div class="space-y-3 stagger">
                        <For each={r().signals}>{s => (
                            <div class="glass-sm p-4 flex items-start gap-3">
                                <div class="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0" style={{
                                    background: s.weight > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                                    color: s.weight > 0 ? '#f87171' : '#34d399',
                                    border: `1px solid ${s.weight > 0 ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'}`
                                }}>{s.weight > 0 ? '+' : ''}{s.weight}</div>
                                <div class="flex-1 min-w-0">
                                    <div class="font-medium text-sm">{s.signalType}</div>
                                    <div class="text-xs text-[--color-text-muted] mt-0.5">{s.description}</div>
                                </div>
                                <div class="text-xs text-[--color-text-muted]">{Math.round(s.confidence * 100)}%</div>
                            </div>
                        )}</For>
                    </div>
                </div>
            </Show>

            {/* Evidence */}
            <Show when={r()?.evidence?.length}>
                <div class="glass p-6 mb-6">
                    <h3 class="text-sm font-semibold text-[--color-text-dim] mb-4">🔎 EVIDENCE ({r().evidence.length})</h3>
                    <div class="space-y-3 stagger">
                        <For each={r().evidence}>{ev => (
                            <div class="glass-sm p-4">
                                <div class="flex items-center gap-2 mb-2">
                                    <span class="font-medium text-sm text-[--color-primary-light]">{ev.sourceName}</span>
                                    <span class="badge badge-pending" style="padding:2px 6px;font-size:10px">{ev.sourceType?.replace('_', ' ')}</span>
                                    <span class="ml-auto text-xs text-[--color-text-muted]">{Math.round(ev.credibilityScore * 100)}%</span>
                                </div>
                                <p class="text-xs text-[--color-text-dim] leading-relaxed">{ev.content}</p>
                            </div>
                        )}</For>
                    </div>
                </div>
            </Show>

            {/* Knowledge Graph */}
            <Show when={g()?.nodes?.length}>
                <div class="glass p-6 mb-6">
                    <h3 class="text-sm font-semibold text-[--color-text-dim] mb-4">🧠 KNOWLEDGE GRAPH</h3>
                    <KnowledgeGraph data={g()} />
                    <p class="mt-4 text-xs text-[--color-text-muted]">{g().nodes.length} entities • {g().edges.length} relationships</p>
                </div>
            </Show>

            {/* Graph Analysis */}
            <Show when={r()?.knowledgeGraphSummary}>
                <div class="glass p-6 mb-6">
                    <h3 class="text-sm font-semibold text-[--color-text-dim] mb-3">🔗 GRAPH ANALYSIS</h3>
                    <p class="text-sm leading-relaxed text-[--color-text-dim]">{r().knowledgeGraphSummary}</p>
                </div>
            </Show>

            {/* Recommendations */}
            <Show when={r()?.recommendations?.length}>
                <div class="glass p-6 mb-6">
                    <h3 class="text-sm font-semibold text-[--color-text-dim] mb-3">💡 RECOMMENDATIONS</h3>
                    <ul class="space-y-2"><For each={r().recommendations}>{rec => <li class="flex items-start gap-2 text-sm text-[--color-text-dim]"><span class="text-[--color-accent] mt-0.5">→</span>{rec}</li>}</For></ul>
                </div>
            </Show>

            {/* Agent Transparency */}
            <Show when={r()?.agentLogs?.length}>
                <div class="glass p-6 mb-6">
                    <h3 class="text-sm font-semibold text-[--color-text-dim] mb-4">🤖 AGENT TRANSPARENCY LOG</h3>
                    <div class="space-y-2">
                        <For each={r().agentLogs}>{l => (
                            <div class="flex items-center gap-3 glass-sm p-3 text-xs">
                                <span class="font-semibold text-[--color-primary-light] w-20">{l.agentName}</span>
                                <span class="text-[--color-text-muted]">{new Date(l.timestamp).toLocaleTimeString()}</span>
                                <Show when={l.durationMs}><span class="text-[--color-accent]">{(l.durationMs / 1000).toFixed(1)}s</span></Show>
                                <span class="text-[--color-accent] ml-auto">{Math.round((l.confidence || 0) * 100)}%</span>
                            </div>
                        )}</For>
                    </div>
                </div>
            </Show>

            {/* Disclaimer */}
            <div class="glass-sm p-4 mb-8" style="border-color: rgba(245,158,11,0.2)">
                <p class="text-xs text-[--color-text-muted] leading-relaxed">
                    <span class="text-[--color-warning] font-semibold">⚠️ Disclaimer:</span>{' '}
                    {r()?.disclaimer || 'This report is generated through automated analysis of publicly available information. Results are guidance only.'}
                </p>
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// KNOWLEDGE GRAPH — Canvas visualization
// ══════════════════════════════════════════════════════════════════════════════
function KnowledgeGraph(props) {
    let canvasRef;
    createEffect(() => {
        const data = props.data;
        if (!data || !canvasRef) return;
        const ctx = canvasRef.getContext('2d');
        const W = canvasRef.width = canvasRef.offsetWidth * 2;
        const H = canvasRef.height = 800;
        ctx.scale(2, 2);
        const w = W / 2, h = H / 2;

        const nodes = data.nodes.map((n, i) => {
            const angle = (i / data.nodes.length) * Math.PI * 2 - Math.PI / 2;
            const radius = i === 0 ? 0 : Math.min(w, h) * 0.32;
            return { ...n, x: w / 2 + Math.cos(angle) * radius, y: h / 2 + Math.sin(angle) * radius };
        });
        const nodeMap = {}; nodes.forEach(n => nodeMap[n.id] = n);

        let frame, t = 0;
        function draw() {
            t += 0.008;
            ctx.clearRect(0, 0, w, h);

            // edges
            data.edges.forEach(e => {
                const s = nodeMap[e.source], tg = nodeMap[e.target];
                if (!s || !tg) return;
                ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(tg.x, tg.y);
                ctx.strokeStyle = `rgba(99,102,241,${0.15 + Math.sin(t * 2) * 0.05})`;
                ctx.lineWidth = (e.weight || 0.5) * 2 + 0.5; ctx.stroke();
                const mx = (s.x + tg.x) / 2, my = (s.y + tg.y) / 2;
                ctx.font = '9px Inter'; ctx.fillStyle = 'rgba(148,163,184,0.5)'; ctx.textAlign = 'center'; ctx.fillText(e.label, mx, my - 4);
            });

            // nodes
            nodes.forEach((n, i) => {
                const dy = Math.sin(t + i * 0.5) * 2;
                ctx.shadowColor = n.color; ctx.shadowBlur = 12 + Math.sin(t * 3 + i) * 3;
                ctx.beginPath(); ctx.arc(n.x, n.y + dy, n.size / 2, 0, Math.PI * 2);
                ctx.fillStyle = n.color + '20'; ctx.fill(); ctx.shadowBlur = 0;
                ctx.strokeStyle = n.color; ctx.lineWidth = 2; ctx.stroke();
                ctx.font = `${n.size * 0.55}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(n.icon, n.x, n.y + dy);
                ctx.font = '11px Inter'; ctx.fillStyle = '#e2e8f0'; ctx.textBaseline = 'top';
                ctx.fillText(n.label.length > 22 ? n.label.slice(0, 20) + '…' : n.label, n.x, n.y + n.size / 2 + 8 + dy);
            });
            frame = requestAnimationFrame(draw);
        }
        draw();
        onCleanup(() => cancelAnimationFrame(frame));
    });
    return <div class="graph-container"><canvas ref={canvasRef} style="width:100%;height:400px" /></div>;
}

// ══════════════════════════════════════════════════════════════════════════════
// HISTORY VIEW — with Search, Filters, Pagination, and Delete
// ══════════════════════════════════════════════════════════════════════════════
function HistoryView(props) {
    const [searchQuery, setSearchQuery] = createSignal('');
    const [filterStatus, setFilterStatus] = createSignal('');
    const [deleting, setDeleting] = createSignal(null);

    const vb = v => ({ 'Likely Legitimate': 'badge-low', 'Suspicious': 'badge-medium', 'High Risk': 'badge-high', 'Likely Scam': 'badge-critical' }[v] || 'badge-pending');

    async function fetchInvestigations(page = 1) {
        try {
            const params = new URLSearchParams({ page, limit: 20 });
            if (searchQuery()) params.set('q', searchQuery());
            if (filterStatus()) params.set('status', filterStatus());

            const d = searchQuery() || filterStatus()
                ? await api(`/investigations/search?${params}`)
                : await api(`/investigations?${params}`);

            props.setInvestigations(d.results || d);
            props.setPagination({ page: d.page || 1, totalPages: d.totalPages || 1, total: d.total || 0 });
        } catch (err) { props.setError(err.message); }
    }

    async function open(id) {
        try {
            const [report, graph] = await Promise.all([api(`/report/${id}`), api(`/graph/${id}`)]);
            props.setReportData(report); props.setGraphData(graph); props.setView('report');
        } catch (err) {
            if (err.message.includes('not ready')) { props.setCurrentInv({ _id: id }); props.setView('live'); }
            else props.setError(err.message);
        }
    }

    async function deleteInv(e, id) {
        e.stopPropagation();
        if (!confirm('Delete this investigation and all its data?')) return;
        setDeleting(id);
        try {
            await api(`/investigations/${id}`, { method: 'DELETE' });
            props.setInvestigations(prev => prev.filter(i => i._id !== id));
        } catch (err) { props.setError(err.message); }
        setDeleting(null);
    }

    return (
        <div class="animate-up max-w-4xl mx-auto">
            <div class="flex items-center justify-between mb-6">
                <div>
                    <h2 class="text-2xl font-bold">Investigation History</h2>
                    <p class="text-sm text-[--color-text-muted] mt-1">{props.pagination().total} total investigations</p>
                </div>
                <button class="btn btn-primary btn-sm" onClick={() => props.setView('form')}>🔍 New</button>
            </div>

            {/* Search & Filter Bar */}
            <div class="glass-sm p-4 mb-6 flex flex-col sm:flex-row gap-3">
                <input class="input flex-1" placeholder="🔍 Search companies..." value={searchQuery()} onInput={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && fetchInvestigations(1)} />
                <select class="input" style="max-width:180px" value={filterStatus()} onChange={e => { setFilterStatus(e.target.value); setTimeout(() => fetchInvestigations(1), 100); }}>
                    <option value="">All Status</option>
                    <option value="completed">Completed</option>
                    <option value="pending">Pending</option>
                    <option value="failed">Failed</option>
                </select>
                <button class="btn btn-ghost btn-sm" onClick={() => fetchInvestigations(1)}>Search</button>
            </div>

            <Show when={!props.investigations().length}>
                <div class="glass p-12 text-center">
                    <div class="text-4xl mb-3">📋</div>
                    <p class="text-[--color-text-dim]">No investigations found.</p>
                    <button class="btn btn-primary mt-4" onClick={() => props.setView('form')}>🔍 New Investigation</button>
                </div>
            </Show>
            <div class="space-y-3 stagger">
                <For each={props.investigations()}>{inv => (
                    <div class="glass-sm p-5 flex items-center gap-4 cursor-pointer hover:border-[--color-primary] transition-colors" onClick={() => open(inv._id)}>
                        <div class="w-10 h-10 rounded-xl flex items-center justify-center text-lg" style="background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.2)">🏢</div>
                        <div class="flex-1 min-w-0">
                            <div class="font-semibold text-sm truncate">{inv.companyName}</div>
                            <div class="text-xs text-[--color-text-muted] mt-0.5">{inv.website || 'No website'} • {new Date(inv.createdAt).toLocaleDateString()}</div>
                        </div>
                        <Show when={inv.verdict}><span class={`badge ${vb(inv.verdict)}`}>{inv.verdict}</span></Show>
                        <Show when={!inv.verdict}><span class="badge badge-pending">{inv.status}</span></Show>
                        <Show when={inv.riskScore != null}>
                            <div class="text-right flex-shrink-0">
                                <div class="text-lg font-bold" style={{ color: inv.riskScore > 60 ? '#ef4444' : inv.riskScore > 30 ? '#f59e0b' : '#10b981' }}>{inv.riskScore}</div>
                                <div class="text-[10px] text-[--color-text-muted]">RISK</div>
                            </div>
                        </Show>
                        <button class="btn btn-ghost btn-sm" style="padding:6px 8px;font-size:12px;color:#ef4444;border-color:rgba(239,68,68,0.2)"
                            onClick={(e) => deleteInv(e, inv._id)} disabled={deleting() === inv._id}>
                            {deleting() === inv._id ? '⏳' : '🗑'}
                        </button>
                    </div>
                )}</For>
            </div>

            {/* Pagination */}
            <Show when={props.pagination().totalPages > 1}>
                <div class="flex items-center justify-center gap-3 mt-6">
                    <button class="btn btn-ghost btn-sm" disabled={props.pagination().page <= 1}
                        onClick={() => fetchInvestigations(props.pagination().page - 1)}>← Prev</button>
                    <span class="text-sm text-[--color-text-muted]">
                        Page {props.pagination().page} of {props.pagination().totalPages}
                    </span>
                    <button class="btn btn-ghost btn-sm" disabled={props.pagination().page >= props.pagination().totalPages}
                        onClick={() => fetchInvestigations(props.pagination().page + 1)}>Next →</button>
                </div>
            </Show>
        </div>
    );
}
