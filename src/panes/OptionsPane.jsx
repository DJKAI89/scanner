import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Spinner, ErrorBanner, MarketClosedBanner, LastUpdated, StatCard, EmptyState } from '../components/common.jsx';
import { fetchQ, fetchOptions, withRetry } from '../services/api';
import { fmt, fmtC, interpVIX, getChgPct } from '../utils/formatters';
import { getIST } from '../utils/marketTime';
import { INDEX_OPTS } from '../constants/config';

const OPT_FILTERS = [
  { id: 'all',       label: 'All' },
  { id: 'nifty',     label: 'Nifty' },
  { id: 'banknifty', label: 'Bank Nifty' },
  { id: 'sensex',    label: 'Sensex' },
  { id: 'finnifty',  label: 'FinNifty' },
  { id: 'buy',       label: '📈 BUY' },
  { id: 'sell',      label: '📉 SELL' },
];

function OptionCard({ pick, underlying }) {
  const isBuy  = pick.action === 'BUY' || pick.type === 'CE';
  const cardBg  = isBuy ? '#f0fdf4' : '#fef2f2';
  const cardBdr = isBuy ? '#16a34a' : '#dc2626';
  const recBg   = isBuy ? '#16a34a' : '#dc2626';
  return (
    <div style={{ background: cardBg, border: `1.5px solid ${cardBdr}55`, borderRadius: 11, padding: 14, position: 'relative', boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
      <div style={{ position: 'absolute', top: 11, right: 11, background: recBg, color: '#fff', fontSize: 8, fontWeight: 800, padding: '3px 8px', borderRadius: 20 }}>
        {pick.action} {pick.type}
      </div>
      <div style={{ marginBottom: 9, paddingRight: 80 }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>{underlying} {pick.strike} {pick.type}</div>
        <div style={{ fontSize: 10, color: '#64748b' }}>Exp: {pick.expiry} · Lot: {pick.lot}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4, marginBottom: 8 }}>
        {[
          { l: 'LTP',   v: `₹${fmt(pick.entry||0)}` },
          { l: 'DELTA', v: (pick.delta||0).toFixed(2) },
          { l: 'IV %',  v: `${(pick.iv||0).toFixed(1)}%` },
          { l: 'CONF',  v: `${(pick.confidence||0).toFixed(0)}%` },
        ].map((m) => (
          <div key={m.l} style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:6, padding:'5px 7px' }}>
            <div style={{ fontSize:8, color:'#94a3b8', marginBottom:2 }}>{m.l}</div>
            <div style={{ fontSize:13, fontWeight:700 }}>{m.v}</div>
          </div>
        ))}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:4, background:'#e2e8f0', borderRadius:8, padding:1, marginBottom:8 }}>
        {[
          { l:'ENTRY',  v:`₹${fmt(pick.entry||0)}`,  c:'#1d4ed8' },
          { l:'SL',     v:`₹${fmt(pick.sl||0)}`,     c:'#dc2626' },
          { l:'TARGET', v:`₹${fmt(pick.tgt||0)}`,    c:'#16a34a' },
        ].map((b) => (
          <div key={b.l} style={{ background:'#f8fafc', padding:'7px 8px', textAlign:'center' }}>
            <div style={{ fontSize:7, color:'#64748b' }}>{b.l}</div>
            <div style={{ fontSize:13, fontWeight:800, color:b.c }}>{b.v}</div>
          </div>
        ))}
      </div>
      <div style={{ display:'flex', gap:8, fontSize:9, color:'#64748b', flexWrap:'wrap' }}>
        {pick.amtRequired>0 && <span>💰 ₹{fmt(pick.amtRequired,0)}</span>}
        {pick.rr>0          && <span>⚖ R:R {pick.rr.toFixed(1)}</span>}
        {pick.trendAligned  && <span style={{ color:'#16a34a', fontWeight:700 }}>✅ Trend Aligned</span>}
      </div>
    </div>
  );
}

export default function OptionsPane() {
  const { token, cfg, marketStatus, lg, onTokenExpired, updateBadge } = useApp();
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [groups, setGroups]     = useState([]);
  const [vix, setVix]           = useState(0);
  const [filter, setFilter]     = useState('all');
  const [progress, setProgress] = useState('');
  const [updTime, setUpdTime]   = useState('');

  useEffect(() => { if (token && marketStatus.open) loadOptions(); }, [token]); // eslint-disable-line

  async function loadOptions(force = false) {
    if (loading && !force) return;
    setLoading(true); setError(''); setProgress('Fetching index prices...');
    try {
      const idxKeys = INDEX_OPTS.map((i) => i.key).join(',') + ',NSE_INDEX|India VIX';
      const quotes  = await fetchQ(idxKeys, token, onTokenExpired);
      const vixVal  = quotes['NSE_INDEX|India VIX']?.last_price || 0;
      setVix(vixVal);

      const builtGroups = [];
      for (const idx of INDEX_OPTS) {
        const q = quotes[idx.key];
        if (!q?.last_price) continue;
        setProgress(`Scanning ${idx.name} options chain...`);
        let expiry = '';
        try {
          const cd = await fetch(
            `https://api.upstox.com/v2/option/contract?instrument_key=${encodeURIComponent(idx.key)}`,
            { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } }
          ).then((r) => r.json());
          expiry = (cd?.data?.map((e) => e.expiry).sort() || [])[0] || '';
        } catch (e) { lg('Contract: ' + e.message, 'w'); }
        if (!expiry) continue;

        const chain = await fetchOptions(idx.key, expiry, token, onTokenExpired);
        const spot  = q.last_price;
        const picks = [];

        for (const row of chain.slice(0, 30)) {
          const strike = row.strike_price;
          if (Math.abs(strike - spot) / spot > 0.03) continue;
          for (const [type, optData] of [['CE', row.call_options], ['PE', row.put_options]]) {
            const ltp   = optData?.market_data?.ltp;
            if (!ltp) continue;
            const delta = Math.abs(optData?.option_greeks?.delta || 0);
            const iv    = optData?.option_greeks?.iv || 0;
            if (delta < cfg.delta || iv < cfg.iv) continue;
            const sl  = +(ltp * (1 - cfg.optSL  / 100)).toFixed(2);
            const tgt = +(ltp * (1 + cfg.optTgt / 100)).toFixed(2);
            const rr  = +((tgt - ltp) / (ltp - sl)).toFixed(1);
            const confidence = Math.min(95, 50 + (delta - 0.4) * 50 + (iv > cfg.iv * 1.5 ? 10 : 0));
            if (confidence < cfg.minOptConf) continue;
            const isBull = type === 'CE';
            picks.push({
              und: idx.name, strike, type, expiry, lot: idx.lot,
              entry: ltp, sl, tgt, rr, delta, iv, confidence,
              action: 'BUY',
              trendAligned: (isBull && getChgPct(q) > 0) || (!isBull && getChgPct(q) < 0),
              amtRequired: ltp * idx.lot,
            });
          }
        }
        builtGroups.push({ name: idx.name, spot, spotChg: getChgPct(q), picks, expiry, type: 'index' });
      }

      setGroups(builtGroups);
      updateBadge('options', String(builtGroups.reduce((s, g) => s + g.picks.length, 0)));
      setUpdTime('Updated: ' + getIST());
    } catch (e) {
      setError(e.message); lg('Options error: ' + e.message, 'e');
    } finally { setLoading(false); }
  }

  const { txt: vixTxt } = interpVIX(vix);
  const filteredGroups = groups.map((g) => ({
    ...g,
    picks: g.picks.filter((p) => {
      if (filter === 'all')       return true;
      if (filter === 'nifty')     return g.name === 'NIFTY';
      if (filter === 'banknifty') return g.name === 'BANKNIFTY';
      if (filter === 'sensex')    return g.name === 'SENSEX';
      if (filter === 'finnifty')  return g.name === 'FINNIFTY';
      if (filter === 'buy')       return p.action === 'BUY';
      if (filter === 'sell')      return p.action === 'SELL';
      return true;
    }),
  })).filter((g) => g.picks.length > 0);

  return (
    <div>
      {!marketStatus.open && <MarketClosedBanner msg={marketStatus.msg || '🔔 NSE Market Closed'} />}
      {error && <ErrorBanner title="⚠ Options Error" message={error} onRetry={() => loadOptions(true)} />}
      {loading ? (
        <Spinner label="Scanning F&O options..." progress={progress} sub="Nifty · BankNifty · Sensex · FinNifty · Greeks · IV · Delta" />
      ) : (
        <div>
          {updTime && <LastUpdated time={updTime} />}
          <div className="stats-g">
            {groups.map((g) => (
              <StatCard key={g.name} label={g.name} value={`₹${fmt(g.spot)}`} sub={fmtC(g.spotChg)} valClass={g.spotChg >= 0 ? 'up' : 'dn'} />
            ))}
            {vix > 0 && <StatCard label="INDIA VIX" value={vix.toFixed(2)} sub={vixTxt} valClass={vix < 16 ? 'up' : vix > 22 ? 'dn' : 'am'} />}
          </div>
          <div style={{ display:'flex', gap:6, marginBottom:12, overflowX:'auto', paddingBottom:4 }}>
            {OPT_FILTERS.map((f) => (
              <button key={f.id} onClick={() => setFilter(f.id)} style={{
                whiteSpace:'nowrap', padding:'6px 12px', borderRadius:20,
                border: filter===f.id ? 'none' : '1px solid #e2e8f0',
                fontSize:11, fontWeight:700, cursor:'pointer',
                background: filter===f.id ? '#16a34a' : '#fff',
                color:      filter===f.id ? '#fff' : '#374151',
              }}>{f.label}</button>
            ))}
          </div>
          {filteredGroups.length === 0
            ? <EmptyState>{marketStatus.open ? '🔄 No signals match filters · Click ▶ Scan' : '📅 NSE Market Closed · Available Mon–Fri 9:15–15:30 IST'}</EmptyState>
            : filteredGroups.map((g) => (
              <div key={g.name}>
                <div className="opt-group-hdr">{g.name} — ₹{fmt(g.spot)} ({fmtC(g.spotChg)}) · Exp: {g.expiry} · {g.picks.length} signals</div>
                <div className="cards-g" style={{ marginBottom:16 }}>
                  {g.picks.map((p, i) => <OptionCard key={i} pick={p} underlying={g.name} />)}
                </div>
              </div>
            ))
          }
          <div className="disc">⚠ Options carry significant risk. Entry/SL/Target calculated from Greeks. Always verify before trading.</div>
        </div>
      )}
    </div>
  );
}
