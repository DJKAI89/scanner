import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { DEF, CFG_VERSION } from '../constants/config';
import { localIsOpen, getMarketStatusLocal, getIST } from '../utils/marketTime';
import { fetchMarketStatus, fetchUserProfile } from '../services/api';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  // ── Token ──
  const [token, setTokenState] = useState(() => localStorage.getItem('friday_token') || '');
  const [tokenExpired, setTokenExpired] = useState(false);
  const [booted, setBooted]   = useState(false);

  // ── Config ──
  const [cfg, setCfgState] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('friday_cfg') || 'null');
      if (saved && saved._v === CFG_VERSION) return { ...DEF, ...saved };
    } catch (e) { /* ignore */ }
    return { ...DEF };
  });

  // ── Market ──
  const [marketStatus, setMarketStatus] = useState(() => localIsOpen()
    ? { open: true, msg: '' }
    : getMarketStatusLocal()
  );
  const _mktCacheTs = useRef(0);

  // ── User ──
  const [userName, setUserName] = useState(() => localStorage.getItem('friday_user_name') || '');
  const [userId, setUserId]     = useState(() => localStorage.getItem('friday_user_id')   || '');

  // ── GitHub credentials ──
  const [gh, setGhState] = useState(() => ({
    token: localStorage.getItem('friday_gh_token') || '',
    user:  localStorage.getItem('friday_gh_user')  || '',
    repo:  localStorage.getItem('friday_gh_repo')  || '',
  }));

  // ── Active tab ──
  const [activeTab, setActiveTab] = useState('stocks');

  // ── Scan state ──
  const [scanning, setScanning]     = useState(false);
  const [scanSecs, setScanSecs]     = useState(0);
  const [statusDot, setStatusDot]   = useState('live'); // 'live' | 'scan' | 'err'
  const [statusTxt, setStatusTxt]   = useState('Live');

  // ── Nav badges ──
  const [badges, setBadges] = useState({ stocks: '—', options: '—', log: '—', analysis: '—' });

  // ── Log drawer ──
  const [logOpen, setLogOpen]   = useState(false);
  const [logLines, setLogLines] = useState([]);

  // ── Toast ──
  const [toast, setToast] = useState(null);

  // ── Stocks universe ──
  const [stocks, setStocks] = useState([]);

  // ─── Helpers ───────────────────────────────────────────────

  const lg = useCallback((msg, t = '') => {
    setLogLines((prev) => [...prev.slice(-200), { msg, t, ts: getIST() }]);
  }, []);

  const showToast = useCallback((msg, color = '#16a34a', duration = 5000) => {
    setToast({ msg, color });
    setTimeout(() => setToast(null), duration);
  }, []);

  const onTokenExpired = useCallback(() => {
    localStorage.removeItem('friday_token');
    localStorage.removeItem('friday_token_date');
    setTokenState('');
    setBooted(false);
    setTokenExpired(true);
  }, []);

  const saveToken = useCallback((newToken) => {
    const v = newToken.trim();
    if (!v || v.length < 20) return 'Token too short';
    localStorage.setItem('friday_token', v);
    localStorage.setItem('friday_token_date', new Date().toDateString());
    setTokenState(v);
    setTokenExpired(false);
    setBooted(true);
    return null;
  }, []);

  const clearToken = useCallback(() => {
    localStorage.removeItem('friday_token');
    localStorage.removeItem('friday_token_date');
    localStorage.removeItem('friday_user_name');
    localStorage.removeItem('friday_user_id');
    setTokenState('');
    setUserName('');
    setUserId('');
    setBooted(false);
  }, []);

  const saveCfg = useCallback((newCfg) => {
    const merged = { ...newCfg, _v: CFG_VERSION };
    localStorage.setItem('friday_cfg', JSON.stringify(merged));
    setCfgState(merged);
  }, []);

  const resetCfg = useCallback(() => {
    localStorage.removeItem('friday_cfg');
    setCfgState({ ...DEF });
  }, []);

  const saveGh = useCallback((newGh) => {
    localStorage.setItem('friday_gh_token', newGh.token || '');
    localStorage.setItem('friday_gh_user',  newGh.user  || '');
    localStorage.setItem('friday_gh_repo',  newGh.repo  || '');
    setGhState(newGh);
  }, []);

  const updateBadge = useCallback((tab, text) => {
    setBadges((prev) => ({ ...prev, [tab]: text }));
  }, []);

  // ── Refresh market status ──
  const refreshMarketStatus = useCallback(async () => {
    if (Date.now() - _mktCacheTs.current < 60000) return;
    _mktCacheTs.current = Date.now();
    if (!token) { setMarketStatus(getMarketStatusLocal()); return; }
    try {
      const result = await fetchMarketStatus(token);
      if (result) {
        setMarketStatus({ open: result.open, msg: result.open ? '' : '🔔 NSE Market Closed' });
        lg(`Market: ${result.status} → ${result.open ? 'OPEN' : 'CLOSED'}`);
      }
    } catch (e) {
      setMarketStatus(getMarketStatusLocal());
    }
  }, [token, lg]);

  // ── Fetch user profile on boot ──
  useEffect(() => {
    if (!booted || !token) return;
    fetchUserProfile(token, onTokenExpired).then((user) => {
      if (!user) return;
      const name = user.user_name || user.email?.split('@')[0] || 'Trader';
      const id   = user.user_id || user.client_id || '';
      setUserName(name);
      setUserId(id);
      localStorage.setItem('friday_user_name', name);
      localStorage.setItem('friday_user_id',   id);
      lg('✅ User: ' + name + (id ? ' (' + id + ')' : ''), 'o');
    }).catch(() => {});
  }, [booted, token, onTokenExpired, lg]);

  // ── Boot when token present ──
  useEffect(() => {
    if (token && token.length > 20) setBooted(true);
  }, [token]);

  // ── Countdown timer ──
  useEffect(() => {
    if (!booted) return;
    const id = setInterval(() => {
      setMarketStatus((prev) => {
        const nowOpen = localIsOpen();
        return { ...prev, open: nowOpen };
      });
      setScanSecs((s) => {
        const nowOpen = localIsOpen();
        if (!nowOpen) return cfg.scanStocks * 60;
        const next = Math.max(0, s - 1);
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [booted, cfg.scanStocks]);

  // ── Refresh market status every 60s ──
  useEffect(() => {
    if (!booted) return;
    refreshMarketStatus();
    const id = setInterval(refreshMarketStatus, 60000);
    return () => clearInterval(id);
  }, [booted, refreshMarketStatus]);

  const value = {
    // state
    token, booted, tokenExpired,
    cfg, gh,
    marketStatus,
    activeTab, setActiveTab,
    scanning, setScanning,
    scanSecs, setScanSecs,
    statusDot, setStatusDot,
    statusTxt, setStatusTxt,
    badges, updateBadge,
    logOpen, setLogOpen,
    logLines, setLogLines,
    toast,
    stocks, setStocks,
    userName, userId,
    // actions
    saveToken, clearToken, onTokenExpired,
    saveCfg, resetCfg,
    saveGh,
    lg, showToast,
    refreshMarketStatus,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
