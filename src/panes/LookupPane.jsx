import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Spinner, ErrorBanner, StatCard, EmptyState } from '../components/common.jsx';
import { fetchQ, fetchCandles, fetchIntraday } from '../services/api';
import { calcRSI, calcEMACrossover, calcATR, calcBBSqueeze, calcSR, calcVWAP, detectPatterns, calcRisk, calcPotential } from '../services/technical';
import { fmt, fmtC, fmtVol, getChgPct } from '../utils/formatters';
import { getIST, getISTDate, localIsOpen } from '../utils/marketTime';
import { QUICK_STOCKS } from '../constants/config';

function tryKey(sym) {
  return ['NSE_EQ|' + sym, 'BSE_EQ|' + sym];
}

export default function LookupPane() {
  const { token, onTokenExpired, lg, stocks } = useApp();
  const [sym, setSym]         = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [result, setResult]   = useState(null);
  const [progress, setProgress] = useState('');
  const [ddOpen, setDdOpen]   = useState(false);
  const [ddItems, setDdItems] = useState([]);
  const inputRef = useRef(null);

  // ── Dropdown search ──
  useEffect(() => {
    if (!sym || sym.length < 1) { setDdItems([]); setDdOpen(false); return; }
    const q = sym.toUpperCase();
    const matches = (stocks || []).filter((s) => s.s.startsWith(q) || s.n?.toUpperCase().includes(q)).slice(0, 10);
    setDdItems(matches);
    setDdOpen(matches.length > 0);
  }, [sym, stocks]);

  async function lookup(symbol) {
    const s = (symbol || sym).trim().toUpperCase();
    if (!s) return;
    setSym(s); setDdOpen(false);
    setLoading(true); setError(''); setResult(null); setProgress('Looking up ' + s + '...');
    try {
      // Resolve instrument key
      let inst = (stocks || []).find((i) => i.s === s);
      let q = null;
      if (inst) {
        const d = await fetchQ(inst.key, token, onTokenExpired);
        q = d[inst.key] || Object.values(d)[0];
      }
      if (!q?.last_price) {
        setProgress('Trying alternate keys...');
        for (const tk of tryKey(s)) {
          try {
            const d = await fetchQ(tk, token, onTokenExpired);
            const v = Object.values(d)[0];
            if (v?.last_price) { q = v; inst = inst || { key: tk, s, n: s, sec: 'NSE', fo: false }; break; }
          } catch (e) { /* try next */ }
        }
      }
      if (!q?.last_price) throw new Error(s + ' not found. Verify symbol and token validity.');

      const ltp = q.last_price, chgPct = getChgPct(q);
      const today  = getISTDate();
      const from90 = new Date(Date.now() - 95 * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      const from7  = new Date(Date.now() - 10 * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

      // Daily candles
      setProgress('Loading 90-day candles...');
      let candles = [], tech = {};
      try {
        candles = await fetchCandles(inst.key, from90, today, 'day', token, onTokenExpired);
        if (candles.length >= 5) {
          const closes = candles.map((c) => +c[4]).reverse();
          tech = {
            rsi: calcRSI(closes),
            ema: calcEMACrossover(closes),
            atr: calcATR(candles),
            patterns: detectPatterns(candles),
            sr:  calcSR(candles),
            vwap: calcVWAP(candles),
            avgVol20: candles.slice(0, 20).reduce((s, c) => s + +c[5], 0) / Math.min(20, candles.length),
          };
        }
      } catch (e) { lg('Daily candles: ' + e.message, 'w'); }

      // 30-min candles
      setProgress('Loading 30-min candles...');
      let tf30 = {};
      try {
        const c30 = await fetchCandles(inst.key, from7, today, '30minute', token, onTokenExpired);
        if (c30.length >= 4) {
          const cl30 = c30.map((c) => +c[4]).reverse();
          tf30 = { rsi: calcRSI(cl30), trend: cl30.at(-1) > cl30[0] ? 'UP' : 'DOWN', candles: c30 };
        }
      } catch (e) { /* skip */ }

      // Intraday
      let tf1 = {};
      if (localIsOpen()) {
        setProgress('Loading intraday candles...');
        try {
          const c1 = await fetchIntraday(inst.key, '1minute', token, onTokenExpired);
          if (c1.length >= 5) {
            const cl1 = c1.map((c) => +c[4]).reverse();
            let sumPV = 0, sumV = 0;
            c1.forEach((c) => { const tp = (+c[2] + +c[3] + +c[4]) / 3; sumPV += tp * +c[5]; sumV += +c[5]; });
            tf1 = { rsi: calcRSI(cl1), vwap: sumV > 0 ? +(sumPV / sumV).toFixed(2) : 0, trend: cl1.at(-1) > cl1[0] ? 'UP' : 'DOWN' };
          }
        } catch (e) { /* skip */ }
      }

      // Analysis
      const rsi     = tech.rsi || 50;
      const atr     = tech.atr || ltp * 0.02;
      const sl      = +(ltp - atr * 2).toFixed(2);
      const target  = +(ltp + atr * 3).toFixed(2);
      const pot     = calcPotential(ltp, target, sl, tech.patterns?.length || 0, rsi < 40 ? 'BUY' : 'MODERATE');
      const rec     = rsi < 35 ? 'STRONG BUY' : rsi < 45 ? 'BUY' : rsi > 70 ? 'SELL' : tech.ema?.uptrend ? 'MODERATE' : 'WATCH';

      setResult({ inst, q, ltp, chgPct, tech, tf30, tf1, sl, target, pot, rec, time: getIST() });
      setProgress('');
    } catch (e) {
      setError(e.message);
      lg('Lookup error: ' + e.message, 'e');
    } finally {
      setLoading(false);
    }
  }

  const r = result;
  return (
    <div>
      {/* Search bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <div className="lkp-wrap">
          <input
            ref={inputRef}
            type="text"
            value={sym}
            onChange={(e) => setSym(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === 'Enter') lookup(); if (e.key === 'Escape') setDdOpen(false); }}
            placeholder="Symbol e.g. RELIANCE, HDFCBANK..."
            style={{ width: '100%', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none' }}
            onFocus={(e) => { e.target.style.borderColor = '#16a34a'; }}
            onBlur={(e)  => { e.target.style.borderColor = '#e2e8f0'; setTimeout(() => setDdOpen(false), 200); }}
          />
          {ddOpen && ddItems.length > 0 && (
            <div className="lkp-dd open">
              {ddItems.map((item) => (
                <div key={item.s} className="lkp-dd-item" onMouseDown={() => lookup(item.s)}>
                  <span className="lkp-dd-sym">{item.s}</span>
                  <span className="lkp-dd-name">{item.n}</span>
                  <span className="lkp-dd-sec">{item.sec}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <button className="btn btn-g" onClick={() => lookup()} disabled={loading} style={{ padding: '9px 18px', fontSize: 13 }}>
          {loading ? '⏳' : '🔍 Analyse'}
        </button>
      </div>

      {/* Quick picks */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {QUICK_STOCKS.map((s) => (
          <button key={s} className="lkp-q" onClick={() => lookup(s)}>{s}</button>
        ))}
      </div>

      {error   && <ErrorBanner title="⚠ Lookup Error" message={error} onRetry={() => lookup()} />}
      {loading && <Spinner label={'Analysing ' + sym + '...'} progress={progress} sub="Quote · Daily · 30-min · Intraday · RSI · EMA · ATR" />}

      {r && !loading && (
        <div>
          {/* Header */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 11, padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{r.inst?.s}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{r.inst?.n} · {r.inst?.sec}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: r.chgPct >= 0 ? '#16a34a' : '#dc2626' }}>₹{fmt(r.ltp)}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: r.chgPct >= 0 ? '#16a34a' : '#dc2626' }}>{fmtC(r.chgPct)}</div>
              </div>
            </div>
            <div style={{ marginTop: 10, fontSize: 10, color: '#94a3b8' }}>Updated: {r.time}</div>
          </div>

          {/* Stats */}
          <div className="stats-g">
            <StatCard label="RSI (14)"  value={r.tech.rsi?.toFixed(1) || '—'} sub={r.tech.rsi < 35 ? 'Oversold' : r.tech.rsi > 70 ? 'Overbought' : 'Neutral'} valClass={r.tech.rsi < 35 ? 'up' : r.tech.rsi > 70 ? 'dn' : 'bl'} />
            <StatCard label="ATR"       value={`₹${fmt(r.tech.atr || 0)}`} sub="14-day volatility" valClass="am" />
            <StatCard label="MA50"      value={r.tech.ema?.e50 ? `₹${fmt(r.tech.ema.e50)}` : '—'} sub={r.tech.ema?.e50 ? (r.ltp > r.tech.ema.e50 ? 'Above ✅' : 'Below ❌') : 'N/A'} valClass={r.ltp > (r.tech.ema?.e50 || 0) ? 'up' : 'dn'} />
            <StatCard label="MA200"     value={r.tech.ema?.e200 ? `₹${fmt(r.tech.ema.e200)}` : '—'} sub={r.tech.ema?.e200 ? (r.ltp > r.tech.ema.e200 ? 'Above ✅' : 'Below ❌') : 'Need 200d'} valClass={r.ltp > (r.tech.ema?.e200 || 0) ? 'up' : 'dn'} />
            <StatCard label="SUPPORT"   value={r.tech.sr?.support ? `₹${fmt(r.tech.sr.support)}` : '—'} valClass="up" />
            <StatCard label="RESIST."   value={r.tech.sr?.resistance ? `₹${fmt(r.tech.sr.resistance)}` : '—'} valClass="dn" />
          </div>

          {/* Trade setup */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 10, color: '#0f172a' }}>📐 Trade Setup</div>
            <div className="trade-setup">
              <div className="ts-box"><div className="ts-l">ENTRY</div><div className="ts-v" style={{ color: '#1d4ed8' }}>₹{fmt(r.ltp)}</div></div>
              <div className="ts-box"><div className="ts-l">STOP LOSS</div><div className="ts-v" style={{ color: '#dc2626' }}>₹{fmt(r.sl)}</div><div className="ts-s" style={{ color: '#dc2626' }}>{r.ltp > 0 ? `-${((r.ltp - r.sl) / r.ltp * 100).toFixed(1)}%` : ''}</div></div>
              <div className="ts-box"><div className="ts-l">TARGET (MOD)</div><div className="ts-v" style={{ color: '#16a34a' }}>₹{fmt(r.pot.mod)}</div><div className="ts-s" style={{ color: '#16a34a' }}>R:R {r.pot.rr.toFixed(1)}</div></div>
            </div>
            <div className="c-targets" style={{ marginTop: 8 }}>
              <div className="tgt cons"><div className="tgt-l">CONSERVATIVE</div><div className="tgt-v">₹{fmt(r.pot.cons)}</div></div>
              <div className="tgt mod"><div className="tgt-l">MODERATE</div><div className="tgt-v">₹{fmt(r.pot.mod)}</div></div>
              <div className="tgt agg"><div className="tgt-l">AGGRESSIVE</div><div className="tgt-v">₹{fmt(r.pot.agg)}</div></div>
            </div>
          </div>

          {/* Multi-timeframe */}
          {(r.tf30?.rsi || r.tf1?.rsi) && (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 10 }}>📊 Multi-Timeframe</div>
              <div className="stats-g">
                <StatCard label="DAILY RSI"  value={r.tech.rsi?.toFixed(1) || '—'} sub="Daily"  valClass={r.tech.rsi < 40 ? 'up' : r.tech.rsi > 65 ? 'dn' : 'bl'} />
                {r.tf30?.rsi && <StatCard label="30-MIN RSI" value={r.tf30.rsi.toFixed(1)} sub={`30-min · ${r.tf30.trend}`} valClass={r.tf30.trend === 'UP' ? 'up' : 'dn'} />}
                {r.tf1?.rsi  && <StatCard label="1-MIN RSI"  value={r.tf1.rsi.toFixed(1)}  sub={`1-min · ${r.tf1.trend}`}  valClass={r.tf1.trend  === 'UP' ? 'up' : 'dn'} />}
                {r.tf1?.vwap && <StatCard label="INTRA VWAP" value={`₹${fmt(r.tf1.vwap)}`} sub={r.ltp >= r.tf1.vwap ? 'Above VWAP' : 'Below VWAP'} valClass={r.ltp >= r.tf1.vwap ? 'up' : 'dn'} />}
              </div>
            </div>
          )}

          {/* Recommendation */}
          <div style={{ background: r.rec.includes('BUY') ? '#f0fdf4' : r.rec === 'SELL' ? '#fef2f2' : '#fffbeb', border: `1.5px solid ${r.rec.includes('BUY') ? '#16a34a' : r.rec === 'SELL' ? '#dc2626' : '#d97706'}`, borderRadius: 10, padding: 14 }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: r.rec.includes('BUY') ? '#16a34a' : r.rec === 'SELL' ? '#dc2626' : '#d97706', marginBottom: 8 }}>
              {r.rec.includes('BUY') ? '📈' : r.rec === 'SELL' ? '📉' : '👁'} {r.rec}
            </div>
            <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.6 }}>
              RSI {r.tech.rsi?.toFixed(1)} · {r.tech.ema?.uptrend ? 'Uptrend (above MA50)' : 'Downtrend (below MA50)'}
              {r.tech.ema?.goldenCross ? ' · ⭐ Golden Cross' : r.tech.ema?.deathCross ? ' · 💀 Death Cross' : ''}
              {r.tech.patterns?.length ? ' · Patterns: ' + r.tech.patterns.join(', ') : ' · No candle patterns'}
            </div>
          </div>

          <div className="disc">⚠ Analysis for educational purposes only. Not SEBI-registered advice. Always DYODD.</div>
        </div>
      )}

      {!r && !loading && !error && (
        <EmptyState>🔍 Enter a stock symbol above to get a full professional analysis</EmptyState>
      )}
    </div>
  );
}
