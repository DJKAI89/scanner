import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { Spinner, ErrorBanner, MarketClosedBanner, LastUpdated, StatCard, EmptyState } from '../components/common.jsx';
import StockCard from '../components/StockCard.jsx';
import { fetchQ, fetchCandles } from '../services/api';
import {
  calcRSI, calcEMACrossover, calcATR, calcSupertrend, calcBBSqueeze,
  calcNR7, calcADX, detectPDHLBreakout, calc52WkBreakout, calcVolumeSurge,
  detectGap, calcWickRejection, calcRelativeStrength, calcMomentumConfluence,
  calcWeeklyMTF, boScore, boDirection, boSLTarget, getIntradayPhase,
  detectPatterns, calcRisk, calcPotential, calcConfidence,
} from '../services/technical';
import { fmt, fmtC, interpVIX, getChgPct } from '../utils/formatters';
import { getIST, getISTDate, sleep } from '../utils/marketTime';
import { useMarketFeed } from '../hooks/useMarketFeed';

const BO_FILTERS = [
  { id: 'all', label: 'All' },{ id: 'bull', label: '📈 Bullish' },{ id: 'bear', label: '📉 Bearish' },
  { id: 'ema', label: '⭐ EMA' },{ id: 'pdhl', label: '🚀 PDH/PDL' },{ id: 'st', label: '📈 ST' },
  { id: 'vol', label: '🔥 Volume' },{ id: '52wk', label: '🏆 52Wk' },{ id: 'gap', label: '⬆ Gap' },
  { id: 'squeeze', label: '🗜 Squeeze' },{ id: 'rs', label: '🚀 RS' },
];

export default function StocksPane() {
  const { token, cfg, marketStatus, lg, onTokenExpired, updateBadge, setScanning, setStatusDot, setStatusTxt, setScanSecs, stocks } = useApp();
  const [mode, setMode] = useState('picks');
  const [picksLoading, setPicksLoading] = useState(false);
  const [picksError, setPicksError]     = useState('');
  const [picks, setPicks]               = useState([]);
  const [pickStats, setPickStats]       = useState(null);
  const [picksTime, setPicksTime]       = useState('');
  const [pickProgress, setPickProgress] = useState('');
  const [boLoading, setBoLoading]   = useState(false);
  const [boError, setBoError]       = useState('');
  const [boCards, setBoCards]       = useState([]);
  const [boStats, setBoStats]       = useState(null);
  const [boTime, setBoTime]         = useState('');
  const [boProgress, setBoProgress] = useState('');
  const [boFilter, setBoFilter]     = useState('all');
  const scanInProgress = useRef(false);

  // WebSocket live prices
  const topKeys = picks.slice(0, 20).map((p) => p.key).filter(Boolean);
  const { connected: wsConnected, lastPrices } = useMarketFeed(token, topKeys, marketStatus.open && picks.length > 0);

  useEffect(() => {
    const onScan = () => { mode === 'breakout' ? runBreakoutScan() : runPicksScan(); };
    document.addEventListener('friday:scan', onScan);
    return () => document.removeEventListener('friday:scan', onScan);
  }, [mode]); // eslint-disable-line

  useEffect(() => {
    if (token && marketStatus.open) runPicksScan();
    else if (token) loadClosedStats();
  }, [token]); // eslint-disable-line

  async function loadClosedStats() {
    try {
      const d = await fetchQ('NSE_INDEX|Nifty 50,NSE_INDEX|Nifty Bank,NSE_INDEX|India VIX', token, onTokenExpired);
      const nQ = d['NSE_INDEX|Nifty 50'], bQ = d['NSE_INDEX|Nifty Bank'], vQ = d['NSE_INDEX|India VIX'];
      const vix = vQ?.last_price || 0;
      setPickStats({ nifty:{ ltp:nQ?.last_price||0, chgPct:getChgPct(nQ) }, banknifty:{ ltp:bQ?.last_price||0, chgPct:getChgPct(bQ) }, vix, vixTxt:interpVIX(vix).txt });
    } catch(e) { /* silent */ }
  }

  async function runPicksScan() {
    if (scanInProgress.current) return;
    scanInProgress.current = true;
    setScanning(true); setStatusDot('scan'); setStatusTxt('Scanning...');
    setPicksLoading(true); setPicksError(''); setPicks([]);
    setPickProgress('Fetching index data...');
    try {
      const idxData = await fetchQ('NSE_INDEX|Nifty 50,NSE_INDEX|Nifty Bank,NSE_INDEX|India VIX', token, onTokenExpired);
      const nQ = idxData['NSE_INDEX|Nifty 50'], bQ = idxData['NSE_INDEX|Nifty Bank'], vQ = idxData['NSE_INDEX|India VIX'];
      const vix = vQ?.last_price || 0, niftyChgPct = getChgPct(nQ);
      setPickStats({ nifty:{ ltp:nQ?.last_price||0, chgPct:niftyChgPct }, banknifty:{ ltp:bQ?.last_price||0, chgPct:getChgPct(bQ) }, vix, vixTxt:interpVIX(vix).txt });

      const scanList = (stocks||[]).filter(s=>s.scan).slice(0, cfg.scanStocks||50);
      if (!scanList.length) { setPicks([]); setPicksTime('Updated: '+getIST()); return; }

      const results = [];
      const today = getISTDate();
      const from90 = new Date(Date.now()-95*86400000).toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});
      const BATCH = 5;
      for (let b = 0; b < scanList.length; b += BATCH) {
        const batch = scanList.slice(b, b+BATCH);
        setPickProgress(`Scanning ${b+1}–${Math.min(b+BATCH,scanList.length)} / ${scanList.length}...`);
        const quotes = await fetchQ(batch.map(s=>s.key).join(','), token, onTokenExpired).catch(()=>({}));
        await Promise.allSettled(batch.map(async(inst,idx) => {
          await sleep(idx*150);
          const q = quotes[inst.key]; if (!q?.last_price) return;
          const ltp = q.last_price, chgPct = getChgPct(q);
          let candles = [];
          try { candles = await fetchCandles(inst.key,from90,today,'day',token,onTokenExpired); } catch(e){}
          if (candles.length < 5) return;
          const closes = candles.map(c=>+c[4]).reverse();
          const rsi = calcRSI(closes), ema = calcEMACrossover(closes), atr = calcATR(candles);
          const volObj = calcVolumeSurge(candles), pats = detectPatterns(candles);
          const aboveMa50  = closes.length>=50  ? closes.at(-1)>(ema?.e50||0)  : null;
          const aboveMa200 = closes.length>=200 ? closes.at(-1)>(ema?.e200||0) : null;
          const macdBull   = closes.length>=35  ? (ema?.e50||0)>(ema?.e200||0) : null;
          const conf = calcConfidence(rsi,macdBull,aboveMa50,aboveMa200,volObj?.ratio||1,pats,vix,true,niftyChgPct);
          if (conf < cfg.minStockConf) return;
          const atrVal = atr||ltp*0.02, sl = +(ltp-atrVal*2).toFixed(2), target = +(ltp+atrVal*3).toFixed(2);
          const risk = calcRisk(ltp,sl,target,atr,vix); if (risk>cfg.risk) return;
          const pot = calcPotential(ltp,target,sl,pats.length,rsi<40?'BUY':rsi>70?'SELL':'MODERATE');
          if (pot.base<cfg.pot || pot.rr<cfg.rr) return;
          const rec = rsi<35?'STRONG BUY':rsi<45?'BUY':rsi>70?'SELL':aboveMa50?'MODERATE':'WATCH';
          results.push({ s:inst.s, n:inst.n, key:inst.key, sec:inst.sec, ltp, chgPct, rsi, conf, rec, sl, target:pot.mod, pot, risk, atr,
            why:`RSI ${rsi.toFixed(1)} · ${aboveMa50?'Above':'Below'} MA50 · ${pats.length?pats.join(', '):'No pattern'}`,
            inds:{ RSI:rsi<45?1:rsi>65?-1:0, MA50:aboveMa50?1:-1, MA200:aboveMa200!==null?(aboveMa200?1:-1):0 },
          });
        }));
        if (b+BATCH < scanList.length) await sleep(300);
      }
      results.sort((a,b)=>b.conf-a.conf);
      setPicks(results); updateBadge('stocks',String(results.length));
      setPicksTime('Updated: '+getIST()); setScanSecs(cfg.scanStocks*60);
      setStatusDot('live'); setStatusTxt('Live');
      lg(`✅ Picks: ${results.length} signals from ${scanList.length} stocks`,'o');
    } catch(e) { setPicksError(e.message); setStatusDot('err'); setStatusTxt('Error'); lg('Scan error: '+e.message,'e'); }
    finally { setPicksLoading(false); setScanning(false); scanInProgress.current=false; }
  }

  async function runBreakoutScan() {
    if (boLoading) return;
    setBoLoading(true); setBoError(''); setBoProgress('Step 1/3: Fetching quotes...');
    try {
      const scanList = (stocks||[]).filter(s=>s.scan).slice(0,80);
      if (!scanList.length) { setBoCards([]); return; }
      const quotesAll = await fetchQ([scanList.map(s=>s.key).join(','),'NSE_INDEX|Nifty 50'].join(','), token, onTokenExpired);
      const today = getISTDate();
      const from52w = new Date(Date.now()-375*86400000).toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});
      let niftyCloses = [];
      try { niftyCloses=(await fetchCandles('NSE_INDEX|Nifty 50',from52w,today,'day',token,onTokenExpired)).map(c=>+c[4]).reverse(); } catch(e){}
      const byVol = scanList.map(i=>({...i,_q:quotesAll[i.key]})).filter(i=>i._q?.last_price)
        .sort((a,b)=>(b._q.volume||0)-(a._q.volume||0)).slice(0,60);
      const techB = {};
      for (let b=0;b<byVol.length;b+=3) {
        setBoProgress(`Step 2/3: Candles ${b+1}–${Math.min(b+3,byVol.length)} / ${byVol.length}`);
        await Promise.allSettled(byVol.slice(b,b+3).map(async(inst,idx)=>{
          await sleep(idx*250);
          try {
            const [daily,weekly] = await Promise.all([
              fetchCandles(inst.key,from52w,today,'day',token,onTokenExpired),
              fetchCandles(inst.key,from52w,today,'week',token,onTokenExpired).catch(()=>[]),
            ]);
            if (daily.length>=10) { const closes=daily.map(c=>+c[4]).reverse(); techB[inst.s]={closes,candles:daily,weekly,atr:calcATR(daily),ema:calcEMACrossover(closes),st:calcSupertrend(daily)}; }
          } catch(e){}
        }));
        if (b+3<byVol.length) await sleep(400);
      }
      setBoProgress('Step 3/3: Computing signals...');
      const phase = getIntradayPhase(), results = [];
      for (const item of byVol) {
        const q=item._q, ltp=q.last_price, t=techB[item.s]; if (!t) continue;
        const ema=t.ema, st=t.st, pdhl=detectPDHLBreakout(ltp,t.candles), vol=calcVolumeSurge(t.candles);
        const wk52=calc52WkBreakout(ltp,t.candles), nr7=calcNR7(t.candles), bb=calcBBSqueeze(t.closes);
        const gap=detectGap(t.candles), adx=calcADX(t.candles), rs=calcRelativeStrength(t.closes,niftyCloses);
        const wick=calcWickRejection(t.candles), dir=boDirection(ema,pdhl,st), isBull=dir==='BULL';
        const mom=calcMomentumConfluence(t.closes,isBull), weeklyMTF=calcWeeklyMTF(t.weekly,ltp,isBull);
        const {score}=boScore(ema,pdhl,st,vol,wk52,mom,nr7,bb,weeklyMTF,gap,adx,rs,wick,0,phase);
        const minScore=(phase==='holiday'||phase==='closed'||phase==='pre')?1:2; if(score<minScore) continue;
        const trade=boSLTarget(ltp,t.atr,isBull,pdhl?.pdh||0,pdhl?.pdl||0,ema?.ema200||0);
        results.push({ ...item, ltp, chgPct:getChgPct(q), ema, pdhl, st, score, dir, vol, wk52, mom, nr7, bb, gap, adx, rs, weeklyMTF, wick, trade, atr:t.atr, isBull, phase,
          rec:isBull?(score>=7?'STRONG BUY':'BUY'):(score>=7?'SELL':'WATCH'), conf:Math.min(95,score*10),
          sl:trade.sl, target:trade.target, pot:{cons:trade.sl,mod:trade.target,agg:trade.target,rr:trade.rr},
          why:`Score ${score}/10 · ${dir} · ${ema?.goldenCross?'Golden Cross':ema?.deathCross?'Death Cross':ema?.uptrend?'EMA Up':'EMA Down'} · ${vol?.ratio||1}× Vol`,
        });
      }
      results.sort((a,b)=>{
        const ap=(a.wk52?.breakHigh||a.wk52?.breakLow?2:0)+(a.ema?.goldenCross||a.ema?.deathCross?2:0);
        const bp=(b.wk52?.breakHigh||b.wk52?.breakLow?2:0)+(b.ema?.goldenCross||b.ema?.deathCross?2:0);
        return bp-ap||b.score-a.score;
      });
      setBoCards(results);
      setBoStats({ total:results.length, bullCount:results.filter(r=>r.dir==='BULL').length, bearCount:results.filter(r=>r.dir==='BEAR').length, goldCross:results.filter(r=>r.ema?.goldenCross).length, volSurge:results.filter(r=>r.vol?.confirmed).length });
      setBoTime('Scanned: '+getIST()); updateBadge('stocks',results.length+' 🚀');
      lg(`✅ Breakout: ${results.length} signals`,'o');
    } catch(e) { setBoError(e.message); lg('Breakout error: '+e.message,'e'); }
    finally { setBoLoading(false); }
  }

  const filteredCards = boCards.filter((r) => {
    if (boFilter==='all')     return true; if (boFilter==='bull')    return r.dir==='BULL'; if (boFilter==='bear')    return r.dir==='BEAR';
    if (boFilter==='ema')     return r.ema?.goldenCross||r.ema?.deathCross; if (boFilter==='pdhl') return r.pdhl?.bullBreakout||r.pdhl?.bearBreakout;
    if (boFilter==='st')      return r.st?.crossed; if (boFilter==='vol') return r.vol?.confirmed||r.vol?.strong;
    if (boFilter==='52wk')    return r.wk52?.breakHigh||r.wk52?.atHigh; if (boFilter==='gap') return r.gap?.gapUp||r.gap?.gapDown;
    if (boFilter==='squeeze') return (r.nr7?.isNR7||r.nr7?.isNR4)||r.bb?.squeeze; if (boFilter==='rs') return r.rs?.outperforming||r.rs?.underperforming;
    return true;
  });

  return (
    <div>
      <div style={{ display:'flex',gap:0,marginBottom:14,background:'#f1f5f9',borderRadius:10,padding:3 }}>
        {[{id:'picks',label:'📊 Picks',color:'#1d4ed8'},{id:'breakout',label:'🚀 Breakout',color:'#7c3aed'}].map(m=>(
          <button key={m.id} onClick={()=>{setMode(m.id);if(m.id==='breakout'&&!boTime)runBreakoutScan();}}
            style={{ flex:1,padding:'8px 0',borderRadius:8,border:'none',fontSize:12,fontWeight:700,cursor:'pointer',transition:'all .2s',
              background:mode===m.id?'#fff':'transparent',color:mode===m.id?m.color:'#64748b',boxShadow:mode===m.id?'0 1px 4px rgba(0,0,0,.1)':'none'}}>
            {m.label}
          </button>
        ))}
      </div>

      {mode==='picks' && (
        <div>
          {!marketStatus.open && <MarketClosedBanner msg={marketStatus.msg||'🔔 NSE Market Closed'} />}
          {picksError && <ErrorBanner title="⚠ Scan Error" message={picksError} onRetry={runPicksScan} />}
          {picksLoading ? (
            <Spinner label="Professional analysis..." progress={pickProgress} sub="RSI · EMA · ATR · Patterns · Confidence · Risk · R:R" />
          ) : (
            <div>
              {pickStats && (
                <div className="stats-g">
                  <StatCard label="NIFTY 50"   value={`₹${fmt(pickStats.nifty.ltp)}`}     sub={fmtC(pickStats.nifty.chgPct)}     valClass={pickStats.nifty.chgPct>=0?'up':'dn'} />
                  <StatCard label="BANK NIFTY" value={`₹${fmt(pickStats.banknifty.ltp)}`} sub={fmtC(pickStats.banknifty.chgPct)} valClass={pickStats.banknifty.chgPct>=0?'up':'dn'} />
                  <StatCard label="INDIA VIX"  value={(pickStats.vix||0).toFixed(2)}       sub={pickStats.vixTxt}                 valClass={pickStats.vix<16?'up':pickStats.vix>22?'dn':'am'} />
                  {wsConnected && <StatCard label="LIVE FEED" value="⚡ WS" sub="WebSocket active" valClass="up" />}
                </div>
              )}
              {picksTime && <LastUpdated time={picksTime} />}
              <div className="sec-hdr"><h3>Professional Picks</h3><span>Conf≥{cfg.minStockConf}% · Pot≥{cfg.pot}% · Risk&lt;{cfg.risk}%</span></div>
              {picks.length===0
                ? <EmptyState>{marketStatus.open?'🔄 Click ▶ Scan to fetch picks':'📅 NSE Market Closed\nScan auto-starts Mon–Fri at 9:15 AM IST'}</EmptyState>
                : (
                  <div className="cards-g">
                    {picks.map((p,i)=>{
                      const live=lastPrices[p.key];
                      return (
                        <div key={p.s} style={{position:'relative'}}>
                          {live && (
                            <div style={{position:'absolute',top:35,right:11,background:live.chgPct>=0?'#dcfce7':'#fee2e2',color:live.chgPct>=0?'#16a34a':'#dc2626',fontSize:9,fontWeight:800,padding:'2px 6px',borderRadius:8,border:`1px solid ${live.chgPct>=0?'#86efac':'#fca5a5'}`,zIndex:10}}>
                              ₹{fmt(live.ltp)} ({fmtC(live.chgPct)}) ⚡
                            </div>
                          )}
                          <StockCard pick={live?{...p,ltp:live.ltp,chgPct:live.chgPct}:p} rank={i+1} />
                        </div>
                      );
                    })}
                  </div>
                )
              }
              <div className="disc">⚠ AI-assisted analysis. Not SEBI-registered advice. Always DYODD.</div>
            </div>
          )}
        </div>
      )}

      {mode==='breakout' && (
        <div>
          {boError && <ErrorBanner title="⚠ Breakout Error" message={boError} onRetry={runBreakoutScan} />}
          {boLoading ? (
            <Spinner label="Running Breakout Scanner..." progress={boProgress} sub="EMA 50/200 · PDH/PDL · Supertrend · Vol · 52Wk · Gap · NR7 · BB · RS · Wick" />
          ) : (
            <div>
              <div className="last-upd">
                <div className="upd-dot" style={{background:'#7c3aed'}} />
                <span>{boTime||'Not scanned yet'}</span>
                <button onClick={runBreakoutScan} className="btn btn-s" style={{marginLeft:'auto',fontSize:10,padding:'4px 10px'}}>🔄 Re-scan</button>
              </div>
              {boStats && (
                <div className="stats-g">
                  <StatCard label="TOTAL"      value={boStats.total}     sub="signals" valClass="bl" />
                  <StatCard label="BULLISH 📈" value={boStats.bullCount} sub={`${boStats.goldCross}GC`} valClass="up" />
                  <StatCard label="BEARISH 📉" value={boStats.bearCount} valClass="dn" />
                  <StatCard label="VOL SURGE 🔥" value={boStats.volSurge} valClass="am" />
                </div>
              )}
              <div style={{display:'flex',gap:6,marginBottom:12,overflowX:'auto',paddingBottom:4}}>
                {BO_FILTERS.map(f=>(
                  <button key={f.id} onClick={()=>setBoFilter(f.id)} style={{
                    whiteSpace:'nowrap',padding:'6px 12px',borderRadius:20,
                    border:boFilter===f.id?'none':'1px solid #e2e8f0',
                    fontSize:11,fontWeight:700,cursor:'pointer',
                    background:boFilter===f.id?'#7c3aed':'#fff',
                    color:boFilter===f.id?'#fff':'#374151',
                  }}>{f.label}</button>
                ))}
              </div>
              {filteredCards.length===0
                ? <EmptyState>🔄 Click Re-scan to run the breakout scanner</EmptyState>
                : <div className="cards-g">{filteredCards.map((c,i)=><StockCard key={c.s||i} pick={c} rank={i+1}/>)}</div>
              }
              <div className="disc">⚠ Breakout: EMA 50/200, PDH/PDL, Supertrend(7,3), Vol, 52-Wk, Gap, NR7, BB Squeeze, RS vs Nifty. Not SEBI advice.</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
