import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { Spinner, ErrorBanner, EmptyState, StatCard } from '../components/common.jsx';
import { ghReadMultipleDays } from '../services/github';
import { fmt } from '../utils/formatters';

function BarChart({ data, color = '#16a34a', height = 80 }) {
  if (!data?.length) return null;
  const max = Math.max(...data.map((d) => d.v), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: height + 30, paddingBottom: 20, position: 'relative' }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <div style={{ fontSize: 8, color: '#64748b', fontWeight: 700 }}>{d.v || 0}</div>
          <div style={{ width: '100%', height: (d.v / max) * height, background: d.color || color, borderRadius: '3px 3px 0 0', minHeight: d.v > 0 ? 4 : 0 }} />
          <div style={{ fontSize: 7, color: '#94a3b8', textAlign: 'center', position: 'absolute', bottom: 0 }}>{d.l}</div>
        </div>
      ))}
    </div>
  );
}

export default function AnalysisPane() {
  const { gh, updateBadge, lg } = useApp();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [data, setData]       = useState(null);
  const [days, setDays]       = useState(30);

  const load = useCallback(async () => {
    if (!gh.token || !gh.user || !gh.repo) { setError('GitHub not configured — go to Settings to enable signal analysis.'); return; }
    setLoading(true); setError('');
    try {
      const signals = await ghReadMultipleDays(gh, days);
      if (!signals.length) { setData({ empty: true }); return; }

      // Win rate breakdown
      const stocks  = signals.filter((s) => s.type === 'STOCK');
      const options = signals.filter((s) => s.type === 'OPTION');
      const closed  = signals.filter((s) => s.status === 'TARGET_HIT' || s.status === 'SL_HIT');
      const hits    = closed.filter((s) => s.status === 'TARGET_HIT').length;
      const winRate = closed.length > 0 ? (hits / closed.length * 100).toFixed(1) : null;

      // Confidence distribution
      const confBuckets = [
        { l: '0–40', v: 0 }, { l: '40–55', v: 0 }, { l: '55–70', v: 0 },
        { l: '70–85', v: 0 }, { l: '85+', v: 0 },
      ];
      signals.forEach((s) => {
        const c = s.confidence || 0;
        if (c < 40) confBuckets[0].v++;
        else if (c < 55) confBuckets[1].v++;
        else if (c < 70) confBuckets[2].v++;
        else if (c < 85) confBuckets[3].v++;
        else confBuckets[4].v++;
      });

      // Signal type breakdown
      const recMap = {};
      signals.forEach((s) => { recMap[s.signal] = (recMap[s.signal] || 0) + 1; });
      const recData = Object.entries(recMap).map(([l, v]) => ({
        l, v, color: l.includes('BUY') || l === 'CE' ? '#16a34a' : l.includes('SELL') || l === 'PE' ? '#dc2626' : '#3b82f6',
      }));

      // Daily volume last 7 days
      const dayMap = {};
      signals.forEach((s) => { dayMap[s.date] = (dayMap[s.date] || 0) + 1; });
      const sortedDays = Object.entries(dayMap).sort((a, b) => a[0].localeCompare(b[0])).slice(-7);
      const dailyData = sortedDays.map(([date, v]) => ({ l: date.slice(5), v }));

      // Avg R:R
      const withRR = signals.filter((s) => s.rr > 0);
      const avgRR  = withRR.length > 0 ? (withRR.reduce((s, x) => s + x.rr, 0) / withRR.length).toFixed(2) : '—';

      // Win rate by signal type
      const byType = {};
      closed.forEach((s) => {
        if (!byType[s.signal]) byType[s.signal] = { hits: 0, total: 0 };
        byType[s.signal].total++;
        if (s.status === 'TARGET_HIT') byType[s.signal].hits++;
      });

      setData({ signals, stocks, options, closed, hits, winRate, confBuckets, recData, dailyData, avgRR, byType });
      updateBadge('analysis', String(signals.length));
      lg(`Analysis: ${signals.length} signals processed`, 'o');
    } catch (e) { setError(e.message); lg('Analysis error: ' + e.message, 'e'); }
    finally { setLoading(false); }
  }, [gh, days, updateBadge, lg]);

  useEffect(() => { if (gh.token) load(); }, [gh.token, days]); // eslint-disable-line

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={days} onChange={(e) => setDays(+e.target.value)} className="log-filter-select" style={{ maxWidth: 160 }}>
          {[7, 14, 30, 60, 90].map((d) => <option key={d} value={d}>Last {d} days</option>)}
        </select>
        <button className="btn btn-g" onClick={load} disabled={loading} style={{ padding: '7px 14px', fontSize: 11 }}>
          {loading ? '⏳' : '🔄 Refresh'}
        </button>
      </div>

      {error   && <ErrorBanner title="⚠ Analysis Error" message={error} onRetry={load} />}
      {loading && <Spinner label="Running analysis..." sub="Reading signal log from GitHub..." />}

      {!loading && data && !data.empty && (
        <div>
          {/* Summary stats */}
          <div className="stats-g">
            <StatCard label="TOTAL SIGNALS" value={data.signals.length} sub={`${days}d period`} valClass="bl" />
            <StatCard label="WIN RATE"  value={data.winRate != null ? data.winRate + '%' : '—'} sub={`${data.hits}W / ${data.closed.length - data.hits}L`} valClass={parseFloat(data.winRate) >= 50 ? 'up' : 'dn'} />
            <StatCard label="STOCK SIGNALS"  value={data.stocks.length}  sub="equity picks"   valClass="up" />
            <StatCard label="OPTION SIGNALS" value={data.options.length} sub="F&O picks"       valClass="pu" />
            <StatCard label="AVG R:R"    value={data.avgRR} sub="risk/reward ratio"  valClass="am" />
            <StatCard label="CLOSED"     value={data.closed.length} sub="resolved signals" valClass="bl" />
          </div>

          {/* Charts */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%,280px),1fr))', gap: 12, marginBottom: 16 }}>
            {/* Confidence distribution */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 10, color: '#0f172a' }}>📊 Confidence Distribution</div>
              <BarChart data={data.confBuckets.map((b, i) => ({ ...b, color: ['#dc2626','#d97706','#3b82f6','#16a34a','#7c3aed'][i] }))} />
            </div>

            {/* Signal types */}
            {data.recData.length > 0 && (
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 10 }}>📋 Signal Types</div>
                <BarChart data={data.recData} />
              </div>
            )}

            {/* Daily volume */}
            {data.dailyData.length > 0 && (
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 10 }}>📅 Daily Signal Volume (7d)</div>
                <BarChart data={data.dailyData} color="#3b82f6" />
              </div>
            )}
          </div>

          {/* Win rate by signal type */}
          {Object.keys(data.byType).length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 10 }}>🎯 Win Rate by Signal Type</div>
              {Object.entries(data.byType).map(([sig, d]) => {
                const wr = d.total > 0 ? Math.round(d.hits / d.total * 100) : 0;
                return (
                  <div key={sig} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <div style={{ width: 80, fontSize: 10, fontWeight: 700 }}>{sig}</div>
                    <div style={{ flex: 1, height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: wr >= 50 ? '#16a34a' : '#dc2626', width: wr + '%', borderRadius: 4 }} />
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: wr >= 50 ? '#16a34a' : '#dc2626', width: 45, textAlign: 'right' }}>{wr}%</div>
                    <div style={{ fontSize: 9, color: '#94a3b8', width: 50 }}>{d.hits}W/{d.total - d.hits}L</div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="disc">⚠ Analysis based on your signal log data only. Past win rate does not guarantee future performance.</div>
        </div>
      )}

      {!loading && data?.empty && (
        <EmptyState>📊 No signals found in the last {days} days · Run scans to populate the signal log</EmptyState>
      )}
      {!loading && !data && !error && (
        <EmptyState>{gh.token ? '🔄 Click Refresh to load analysis' : '⚙ Configure GitHub in Settings to enable signal analysis'}</EmptyState>
      )}
    </div>
  );
}
