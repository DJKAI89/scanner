// ── GitHub API service — signal logging & settings sync ──

function _ghLogUserId() {
  return localStorage.getItem('friday_user_id') || 'unknown';
}

function getLogDayPath(date) {
  const uid = _ghLogUserId();
  return `signal-logs/${uid}/${date}.json`;
}

function getLogIndexPath() {
  const uid = _ghLogUserId();
  return `signal-logs/${uid}/index.json`;
}

function getSettingsPath() {
  const uid = _ghLogUserId();
  return `settings/${uid}/config.json`;
}

async function _ghFetch(gh, path) {
  if (!gh.token || !gh.user || !gh.repo) return null;
  try {
    const r = await fetch(
      `https://api.github.com/repos/${gh.user}/${gh.repo}/contents/${path}`,
      { headers: { Authorization: 'token ' + gh.token, Accept: 'application/vnd.github.v3+json' } }
    );
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  } catch (e) {
    return null;
  }
}

async function _ghPut(gh, path, content, sha, message) {
  if (!gh.token || !gh.user || !gh.repo) return null;
  const body = {
    message,
    content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))),
  };
  if (sha) body.sha = sha;
  return fetch(
    `https://api.github.com/repos/${gh.user}/${gh.repo}/contents/${path}`,
    {
      method: 'PUT',
      headers: {
        Authorization: 'token ' + gh.token,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );
}

// ── Read one day's signals ──
export async function ghReadDay(gh, date) {
  const d = await _ghFetch(gh, getLogDayPath(date));
  if (!d) return { signals: [], sha: null };
  try {
    const content = JSON.parse(atob(d.content.replace(/\n/g, '')));
    return { signals: content.signals || [], sha: d.sha };
  } catch (e) {
    return { signals: [], sha: null };
  }
}

// ── Write one day's signals ──
export async function ghWriteDay(gh, signals, sha, date) {
  const uid = _ghLogUserId();
  const payload = {
    signals,
    lastUpdated: new Date().toISOString(),
    upstoxId: uid,
  };
  const r = await _ghPut(gh, getLogDayPath(date), payload, sha, `FRIDAY log · ${uid} · ${date}`);
  if (r?.ok) {
    const rd = await r.json();
    return rd?.content?.sha || sha;
  }
  return null;
}

// ── Read signal log index ──
export async function ghReadIndex(gh) {
  const d = await _ghFetch(gh, getLogIndexPath());
  if (!d) return { dates: [], dailyStats: {}, sha: null };
  try {
    const content = JSON.parse(atob(d.content.replace(/\n/g, '')));
    return { dates: content.dates || [], dailyStats: content.dailyStats || {}, sha: d.sha };
  } catch (e) {
    return { dates: [], dailyStats: {}, sha: null };
  }
}

// ── Update index: add/refresh one date's stats ──
export async function ghUpdateIndex(gh, date, stats) {
  const { dates, dailyStats, sha } = await ghReadIndex(gh);
  const newDates = dates.includes(date) ? dates : [...dates, date].sort();
  const pruned = newDates.slice(-90);
  const newStats = { ...dailyStats, [date]: stats };
  for (const d of Object.keys(newStats)) {
    if (!pruned.includes(d)) delete newStats[d];
  }
  const uid = _ghLogUserId();
  await _ghPut(gh, getLogIndexPath(), {
    dates: pruned,
    dailyStats: newStats,
    lastUpdated: new Date().toISOString(),
    upstoxId: uid,
  }, sha, `FRIDAY index · ${uid}`);
}

// ── Read multiple days of signals ──
export async function ghReadMultipleDays(gh, maxDays = 30) {
  const { dates } = await ghReadIndex(gh);
  if (!dates.length) return [];
  const toFetch = dates.slice(-maxDays);
  const all = [];
  for (let i = 0; i < toFetch.length; i += 5) {
    const batch = toFetch.slice(i, i + 5);
    const res = await Promise.allSettled(batch.map((d) => ghReadDay(gh, d)));
    for (const r of res) {
      if (r.status === 'fulfilled') all.push(...r.value.signals);
    }
  }
  return all;
}

// ── Push settings to GitHub ──
export async function pushSettingsToGH(gh, cfg) {
  if (!gh.token || !gh.user || !gh.repo) return false;
  try {
    const path = getSettingsPath();
    const existing = await _ghFetch(gh, path);
    const sha = existing?.sha || null;
    const r = await _ghPut(gh, path, { config: cfg, updatedAt: new Date().toISOString() },
      sha, `FRIDAY settings · ${_ghLogUserId()}`);
    return r?.ok ?? false;
  } catch (e) {
    return false;
  }
}

// ── Pull settings from GitHub ──
export async function pullSettingsFromGH(gh) {
  if (!gh.token || !gh.user || !gh.repo) return null;
  try {
    const d = await _ghFetch(gh, getSettingsPath());
    if (!d) return null;
    const content = JSON.parse(atob(d.content.replace(/\n/g, '')));
    return content.config || null;
  } catch (e) {
    return null;
  }
}

// ── Read FII/DII data ──
export async function ghReadFIIDII(gh) {
  const d = await _ghFetch(gh, 'fii-dii/latest.json');
  if (!d) return { data: null, sha: null };
  try {
    const data = JSON.parse(atob(d.content.replace(/\n/g, '')));
    return { data, sha: d.sha };
  } catch (e) {
    return { data: null, sha: null };
  }
}

// ── Load stocks.json from GitHub ──
export async function loadStocksFromGitHub(gh) {
  if (!gh.token || !gh.user || !gh.repo) return null;
  const r = await fetch(
    `https://api.github.com/repos/${gh.user}/${gh.repo}/contents/stocks/stocks.json`,
    { headers: { Authorization: 'token ' + gh.token, Accept: 'application/vnd.github.v3+json' } }
  );
  if (!r.ok) return null;
  const d = await r.json();
  const parsed = JSON.parse(atob(d.content.replace(/\n/g, '')));
  const rawList = parsed.data || parsed.stocks || (Array.isArray(parsed) ? parsed : null);
  if (!rawList?.length) return null;
  return rawList.map((item) => {
    const sym = item.s || item.symbol || '';
    const name = item.n || item.name || sym;
    return {
      key: item.key || '',
      s: sym,
      n: name,
      sec: item.sec || item.sector || 'NSE',
      scan: true,
      fo: !!(item.fo ?? item.hasOption ?? false),
      lot: item.lot || 0,
      step: item.step || 0,
    };
  }).filter((s) => s.key && s.s);
}
