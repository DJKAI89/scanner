import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { DEF } from '../constants/config';
import { pushSettingsToGH, pullSettingsFromGH } from '../services/github';
import { getIST } from '../utils/marketTime';

function SetRow({ label, sub, children }) {
  return (
    <div className="set-row">
      <div><div className="set-lbl">{label}</div>{sub && <div className="set-sub">{sub}</div>}</div>
      {children}
    </div>
  );
}

function NumInput({ id, value, onChange, min, max, step = 1, width = 80 }) {
  return (
    <input className="set-inp" id={id} type="number" value={value} min={min} max={max} step={step}
      style={{ width }} onChange={(e) => onChange(+e.target.value)} />
  );
}

export default function SettingsPane() {
  const { cfg, saveCfg, resetCfg, gh, saveGh, token, clearToken, onTokenExpired, showToast } = useApp();

  const [local, setLocal]         = useState({ ...cfg });
  const [ghLocal, setGhLocal]     = useState({ ...gh });
  const [saveStatus, setSaveStatus] = useState('');
  const [ghStatus, setGhStatus]   = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [tokenSavedDate] = useState(() => localStorage.getItem('friday_token_date') || '');
  const [notifStatus, setNotifStatus] = useState(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );
  const [confStockBar, setConfStockBar] = useState(cfg.minStockConf);
  const [confOptBar,   setConfOptBar]   = useState(cfg.minOptConf);

  useEffect(() => { setLocal({ ...cfg }); setGhLocal({ ...gh }); }, [cfg, gh]);

  function set(key, val) {
    setLocal((p) => ({ ...p, [key]: val }));
    if (key === 'minStockConf') setConfStockBar(val);
    if (key === 'minOptConf')   setConfOptBar(val);
  }

  function handleSave() {
    saveCfg(local);
    saveGh(ghLocal);
    setSaveStatus('✅ Settings saved · ' + getIST());
    showToast('✅ Settings saved!');
    setTimeout(() => setSaveStatus(''), 4000);
    if (ghLocal.token && ghLocal.user && ghLocal.repo)
      pushSettingsToGH(ghLocal, local).then((ok) => ok && setSaveStatus((s) => s + ' · ☁ Synced to GitHub')).catch(() => {});
  }

  function handleReset() {
    if (!window.confirm('Reset all settings to defaults?')) return;
    resetCfg();
    setLocal({ ...DEF });
    setSaveStatus('↺ Reset to defaults');
    setTimeout(() => setSaveStatus(''), 3000);
  }

  async function handleTestGH() {
    const { token: gt, user, repo } = ghLocal;
    setGhStatus('🔄 Testing connection...');
    if (!gt || !user || !repo) { setGhStatus('❌ Fill in token, username and repo first'); return; }
    try {
      const r = await fetch(`https://api.github.com/repos/${user}/${repo}`, {
        headers: { Authorization: 'token ' + gt, Accept: 'application/vnd.github.v3+json' },
      });
      if (r.ok) {
        setGhStatus(`✅ Connected! ${user}/${repo} — Pulling settings...`);
        saveGh(ghLocal);
        const pulled = await pullSettingsFromGH(ghLocal);
        if (pulled) { saveCfg({ ...cfg, ...pulled }); setLocal({ ...cfg, ...pulled }); setGhStatus((s) => s + ' ✅ Settings loaded!'); }
        else          setGhStatus((s) => s + ' · No remote settings yet');
      } else if (r.status === 401) setGhStatus('❌ Token invalid — regenerate with repo scope');
      else if (r.status === 404)  setGhStatus(`❌ Repo '${user}/${repo}' not found`);
      else                         setGhStatus('❌ GitHub error: HTTP ' + r.status);
    } catch (e) { setGhStatus('❌ Network error: ' + e.message); }
  }

  async function handleRequestNotifications() {
    if (typeof Notification === 'undefined') { setNotifStatus('unsupported'); return; }
    const perm = await Notification.requestPermission();
    setNotifStatus(perm);
    if (perm === 'granted') showToast('🔔 Notifications enabled!');
  }

  function confLabel(v) {
    return v >= 85 ? '🟣 Very high filter — very few signals' : v >= 70 ? '🟢 High filter — quality picks' :
           v >= 55 ? '🔵 Moderate filter — balanced results' : v >= 40 ? '🟡 Low filter — more signals' : '🔴 Very low — many signals';
  }

  return (
    <div>
      <div className="settings-g">

        {/* ── Confidence ───────────────────── */}
        <div className="setting-card" style={{ gridColumn: '1 / -1' }}>
          <h4>🎯 Confidence Filters</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { label: '📈 Stocks Min Confidence', key: 'minStockConf', bar: confStockBar, color: '#16a34a' },
              { label: '⚡ Options Min Confidence', key: 'minOptConf',  bar: confOptBar,  color: '#0ea5e9' },
            ].map(({ label, key, bar, color }) => (
              <div key={key}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 8 }}>{label}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input className="set-inp" type="number" value={local[key]} min={0} max={100}
                    style={{ width: 70 }} onChange={(e) => set(key, +e.target.value)} />
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>%</span>
                  <div style={{ flex: 1, height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: color, borderRadius: 3, width: bar + '%', transition: 'width .3s' }} />
                  </div>
                </div>
                <div style={{ fontSize: 10, marginTop: 5, color, fontWeight: 600 }}>{confLabel(bar)}</div>
              </div>
            ))}
          </div>
          {/* Confidence guide */}
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 4, fontSize: 9, textAlign: 'center' }}>
            {[['0–40%','#dc2626','#fee2e2','#fecaca','Weak'],['40–55%','#d97706','#fffbeb','#fde68a','Low'],
              ['55–70%','#2563eb','#eff6ff','#bfdbfe','Moderate'],['70–85%','#16a34a','#f0fdf4','#bbf7d0','High'],
              ['85–100%','#7c3aed','#faf5ff','#ddd6fe','Very High']].map(([range,c,bg,border,lbl])=>(
              <div key={range} style={{ background:bg, border:`1px solid ${border}`, borderRadius:5, padding:5 }}>
                <div style={{ fontWeight:800, color:c }}>{range}</div>
                <div style={{ color:'#6b7280' }}>{lbl}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Position Sizing ──────────────── */}
        <div className="setting-card">
          <h4>💰 Position Sizing</h4>
          <SetRow label="Portfolio Size (₹)" sub="Total trading capital">
            <NumInput id="s-port-size" value={local.portSize} onChange={(v) => set('portSize', v)} min={10000} step={10000} width={90} />
          </SetRow>
          <SetRow label="Max Risk per Trade (%)" sub="% of portfolio at risk per trade">
            <NumInput id="s-risk-pct" value={local.riskPct} onChange={(v) => set('riskPct', v)} min={0.5} max={10} step={0.5} width={70} />
          </SetRow>
          <div style={{ fontSize: 9, color: '#64748b', marginTop: 6, padding: '6px 8px', background: '#f8fafc', borderRadius: 6 }}>
            📐 Max loss = ₹{((local.portSize||500000)*(local.riskPct||2)/100).toLocaleString('en-IN',{maximumFractionDigits:0})} per trade
          </div>
        </div>

        {/* ── Technical ───────────────────── */}
        <div className="setting-card">
          <h4>📈 Technical Thresholds</h4>
          <SetRow label="RSI Oversold"     sub="Below = BUY signal"><NumInput value={local.rsiOS} onChange={(v)=>set('rsiOS',v)} min={10} max={45} /></SetRow>
          <SetRow label="RSI Overbought"   sub="Above = SELL signal"><NumInput value={local.rsiOB} onChange={(v)=>set('rsiOB',v)} min={55} max={90} /></SetRow>
          <SetRow label="Volume Spike (×)" sub="Min multiplier for signal"><NumInput value={local.vol} onChange={(v)=>set('vol',v)} min={1} step={0.1} /></SetRow>
          <SetRow label="Min Pot. Return %" sub="Min expected gain %"><NumInput value={local.pot} onChange={(v)=>set('pot',v)} min={1} max={20} /></SetRow>
          <SetRow label="Max Risk Score %"  sub="Reject signals above this risk"><NumInput value={local.risk} onChange={(v)=>set('risk',v)} min={20} max={100} /></SetRow>
          <SetRow label="Min R:R Ratio"     sub="Risk:Reward filter"><NumInput value={local.rr} onChange={(v)=>set('rr',v)} min={0.5} max={5} step={0.1} /></SetRow>
        </div>

        {/* ── Options ─────────────────────── */}
        <div className="setting-card">
          <h4>⚡ Options Thresholds</h4>
          <SetRow label="Min Delta (abs)"      sub="Directional strength"><NumInput value={local.delta} onChange={(v)=>set('delta',v)} min={0.1} step={0.05} /></SetRow>
          <SetRow label="IV Alert %"           sub="Above = high vol signal"><NumInput value={local.iv} onChange={(v)=>set('iv',v)} min={5} /></SetRow>
          <SetRow label="OI Change % Alert"    sub="Buildup threshold"><NumInput value={local.oi} onChange={(v)=>set('oi',v)} min={5} /></SetRow>
          <SetRow label="Options SL %"         sub="% below entry = SL"><NumInput value={local.optSL} onChange={(v)=>set('optSL',v)} min={5} max={60} /></SetRow>
          <SetRow label="Options Target %"     sub="% above entry = target"><NumInput value={local.optTgt} onChange={(v)=>set('optTgt',v)} min={10} max={200} /></SetRow>
          <SetRow label="Max Capital ₹"        sub="Hide options above this · 0 = no limit"><NumInput value={local.maxOptCapital} onChange={(v)=>set('maxOptCapital',v)} min={0} step={1000} width={90} /></SetRow>
        </div>

        {/* ── Scan Intervals ───────────────── */}
        <div className="setting-card">
          <h4>⏱ Scan Intervals</h4>
          <SetRow label="Stocks scan (min)"        sub="Full analysis cycle"><NumInput value={local.scanStocks}  onChange={(v)=>set('scanStocks',v)}  min={5}  max={60} /></SetRow>
          <SetRow label="Price tick (sec)"          sub="LTP refresh frequency"><NumInput value={local.tick}        onChange={(v)=>set('tick',v)}        min={10} max={60} /></SetRow>
          <SetRow label="Portfolio refresh (sec)"   sub="P&L update frequency"><NumInput value={local.portRef}     onChange={(v)=>set('portRef',v)}     min={30} max={300} /></SetRow>
          <SetRow label="Options refresh (min)"     sub="Full options chain rescan"><NumInput value={local.scanOpts}    onChange={(v)=>set('scanOpts',v)}    min={5}  max={60} /></SetRow>
          <SetRow label="Market Mood refresh (min)" sub="How often to re-check mood"><NumInput value={local.moodRefresh} onChange={(v)=>set('moodRefresh',v)} min={5}  max={30} /></SetRow>
        </div>

        {/* ── Signal Log / GitHub ──────────── */}
        <div className="setting-card">
          <h4>📋 Signal Log (GitHub)</h4>
          <div className="set-sub" style={{ marginBottom: 10, lineHeight: 1.7 }}>
            Logs every signal to your GitHub repo as daily JSON files.<br />
            Settings sync across all browsers automatically.<br />
            <a href="https://github.com/settings/tokens/new?scopes=repo&description=FRIDAY+Signal+Log"
              target="_blank" rel="noreferrer" style={{ color: '#16a34a', fontWeight: 700 }}>Generate GitHub Token →</a>
          </div>
          <SetRow label="GitHub Token (PAT)" sub="repo scope required · stored locally only">
            <input className="set-inp" type="text" placeholder="ghp_xxxxxx" value={ghLocal.token}
              onChange={(e) => setGhLocal((p) => ({ ...p, token: e.target.value.trim() }))} style={{ width: 140 }} />
          </SetRow>
          <SetRow label="GitHub Username" sub="Your GitHub username">
            <input className="set-inp" type="text" placeholder="username" value={ghLocal.user}
              onChange={(e) => setGhLocal((p) => ({ ...p, user: e.target.value.trim().toLowerCase() }))} />
          </SetRow>
          <SetRow label="Repository Name" sub="Repo where app is deployed">
            <input className="set-inp" type="text" placeholder="username.github.io" value={ghLocal.repo}
              onChange={(e) => setGhLocal((p) => ({ ...p, repo: e.target.value.trim() }))} />
          </SetRow>
          <button className="btn" onClick={handleTestGH}
            style={{ width: '100%', marginTop: 8, fontSize: 11, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #93c5fd', borderRadius: 7, padding: '8px 12px', fontWeight: 700, cursor: 'pointer' }}>
            🔗 Test Connection
          </button>
          {ghStatus && <div style={{ marginTop: 7, fontSize: 10, color: ghStatus.startsWith('✅') ? '#16a34a' : '#dc2626', fontWeight: 600, lineHeight: 1.5 }}>{ghStatus}</div>}
        </div>

        {/* ── Notifications ────────────────── */}
        <div className="setting-card">
          <h4>🔔 Browser Notifications</h4>
          <div style={{ fontSize: 10, color: '#64748b', marginBottom: 10, lineHeight: 1.7 }}>
            Get notified for: high confidence signals (≥80%), RSI divergence, BB squeeze, target hit, SL hit.
          </div>
          {notifStatus === 'granted' ? (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 13px', fontSize: 11, color: '#15803d', fontWeight: 600 }}>
              ✅ Notifications enabled
            </div>
          ) : notifStatus === 'denied' ? (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 13px', fontSize: 11, color: '#991b1b', fontWeight: 600 }}>
              ❌ Notifications blocked — allow in browser settings
            </div>
          ) : notifStatus === 'unsupported' ? (
            <div style={{ fontSize: 11, color: '#94a3b8' }}>Browser notifications not supported</div>
          ) : (
            <button className="btn btn-g" onClick={handleRequestNotifications}
              style={{ width: '100%', fontSize: 11, borderRadius: 7, padding: '9px 14px', fontWeight: 700 }}>
              🔔 Enable Browser Notifications
            </button>
          )}
        </div>

        {/* ── Token Management ─────────────── */}
        <div className="setting-card">
          <h4>🔐 Upstox Token</h4>
          {tokenSavedDate && (
            <div style={{ fontSize: 10, color: '#16a34a', fontWeight: 600, marginBottom: 10 }}>
              ✅ Token saved: {tokenSavedDate}
            </div>
          )}
          <div className="set-sub" style={{ marginBottom: 8 }}>Tokens expire daily. Paste a fresh token each morning.</div>
          <label style={{ fontSize: 10, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>NEW TOKEN</label>
          <textarea className="token-area" rows={3} value={tokenInput} onChange={(e) => setTokenInput(e.target.value)}
            placeholder="Paste new Upstox access token to replace current..." />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-g" style={{ flex: 1, fontSize: 11, borderRadius: 7 }}
              onClick={() => {
                const v = tokenInput.trim();
                if (!v || v.length < 20) { showToast('⚠ Token too short', '#dc2626'); return; }
                localStorage.setItem('friday_token', v);
                localStorage.setItem('friday_token_date', new Date().toDateString());
                setTokenInput('');
                showToast('✅ Token updated! Refresh to apply.');
              }}>
              💾 Save Token
            </button>
            <button className="btn" style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 7, padding: '7px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              onClick={clearToken}>
              🚪 Log Out
            </button>
          </div>
        </div>

        {/* ── Sticky Save Bar ──────────────── */}
        <div style={{ gridColumn: '1 / -1', position: 'sticky', bottom: 0, background: 'linear-gradient(to top,#f8fafc 80%,transparent)', padding: '14px 0 4px', zIndex: 10 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-g" onClick={handleSave}
              style={{ flex: 1, padding: 13, fontSize: 13, fontWeight: 800, borderRadius: 10 }}>
              💾 Save All Settings
            </button>
            <button className="btn" onClick={handleReset}
              style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 10, padding: '13px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              ↺ Reset
            </button>
          </div>
          {saveStatus && <div style={{ textAlign: 'center', fontSize: 10, color: '#64748b', marginTop: 6 }}>{saveStatus}</div>}
        </div>

      </div>
    </div>
  );
}
