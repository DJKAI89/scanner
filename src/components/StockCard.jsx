import React from 'react';
import { fmt, fmtC, fmtVol } from '../utils/formatters';

function recCls(rec) {
  const r = (rec || '').toLowerCase().replace(/\s+/g, '-');
  if (r.includes('strong')) return 'strong-buy';
  if (r === 'buy')          return 'buy';
  if (r === 'moderate')     return 'moderate';
  if (r === 'watch')        return 'watch';
  if (r === 'sell' || r === 'avoid') return 'sell';
  return 'watch';
}

function IndicatorPill({ label, val }) {
  const cls = val > 0 ? 'ok' : val < 0 ? 'no' : 'na';
  return <span className={`ind ${cls}`}>{label}</span>;
}

function MetricBox({ label, value, sub, cls = 'neutral' }) {
  return (
    <div className={`cbox ${cls}`}>
      <div className="cb-l">{label}</div>
      <div className="cb-v">{value}</div>
      {sub && <div className="cb-s">{sub}</div>}
    </div>
  );
}

export default function StockCard({ pick, rank }) {
  const rec = pick.rec || pick.signal || 'WATCH';
  const cls = recCls(rec);
  const ltp = pick.ltp || pick.entry || 0;

  return (
    <div className={`card ${cls}`}>
      {/* Rank badge */}
      <div className="c-rank">{rank}</div>

      {/* Recommendation badge */}
      <div className={`c-rec ${cls}`}>{rec.toUpperCase()}</div>

      {/* Header */}
      <div className="c-head">
        <div className="c-sym">{pick.s || pick.symbol}</div>
        <div className="c-name">{pick.n || pick.name || ''}</div>
      </div>

      {/* Key metrics 3-col */}
      <div className="c-metrics cm3" style={{ marginBottom: 8 }}>
        <MetricBox
          label="LTP"
          value={`₹${fmt(ltp)}`}
          sub={pick.chgPct != null ? fmtC(pick.chgPct) : ''}
          cls={pick.chgPct >= 0 ? 'buy' : 'sell'}
        />
        <MetricBox
          label="RSI"
          value={pick.rsi != null ? pick.rsi.toFixed(1) : '—'}
          cls={pick.rsi < 40 ? 'buy' : pick.rsi > 70 ? 'sell' : 'moderate'}
        />
        <MetricBox
          label="CONF"
          value={`${(pick.conf || pick.confidence || 0).toFixed(0)}%`}
          cls={
            (pick.conf || 0) >= 75 ? 'buy' :
            (pick.conf || 0) >= 55 ? 'moderate' : 'watch'
          }
        />
      </div>

      {/* Trade setup */}
      <div className="trade-setup">
        <div className="ts-box">
          <div className="ts-l">ENTRY</div>
          <div className="ts-v" style={{ color: '#1d4ed8' }}>₹{fmt(pick.entryTrigger?.trigger || ltp)}</div>
        </div>
        <div className="ts-box">
          <div className="ts-l">STOP LOSS</div>
          <div className="ts-v" style={{ color: '#dc2626' }}>₹{fmt(pick.sl || 0)}</div>
          <div className="ts-s" style={{ color: '#94a3b8' }}>
            {pick.sl && ltp ? `-${Math.abs(((pick.sl - ltp) / ltp) * 100).toFixed(1)}%` : ''}
          </div>
        </div>
        <div className="ts-box">
          <div className="ts-l">TARGET</div>
          <div className="ts-v" style={{ color: '#16a34a' }}>₹{fmt(pick.target || (pick.pot?.mod) || 0)}</div>
          <div className="ts-s" style={{ color: '#16a34a' }}>
            {pick.pot?.rr != null ? `R:R ${pick.pot.rr.toFixed(1)}` : ''}
          </div>
        </div>
      </div>

      {/* Indicator pills */}
      {pick.inds && (
        <div className="c-inds">
          {Object.entries(pick.inds).map(([k, v]) => (
            <IndicatorPill key={k} label={k} val={v} />
          ))}
        </div>
      )}

      {/* Score bars */}
      {pick.bars && (
        <div className="c-bars">
          {pick.bars.map((b) => (
            <div key={b.label} className="bar-row">
              <span className="bar-lbl">{b.label}</span>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: b.pct + '%', background: b.color }} />
              </div>
              <span className="bar-val" style={{ color: b.color }}>{b.val}</span>
            </div>
          ))}
        </div>
      )}

      {/* Conservative / Moderate / Aggressive targets */}
      {pick.pot && (
        <div className="c-targets">
          <div className="tgt cons">
            <div className="tgt-l">CONSERVATIVE</div>
            <div className="tgt-v">₹{fmt(pick.pot.cons || 0)}</div>
          </div>
          <div className="tgt mod">
            <div className="tgt-l">MODERATE</div>
            <div className="tgt-v">₹{fmt(pick.pot.mod || 0)}</div>
          </div>
          <div className="tgt agg">
            <div className="tgt-l">AGGRESSIVE</div>
            <div className="tgt-v">₹{fmt(pick.pot.agg || 0)}</div>
          </div>
        </div>
      )}

      {/* Why text */}
      {pick.why && (
        <div className={`c-why ${cls}`}>{pick.why}</div>
      )}
    </div>
  );
}
