// ── App-wide constants ──

export const CFG_VERSION = 'v4'; // match HTML exactly — bump to reset all users

// ── Default config — exact copy from HTML DEF ──
// Key calibrated values:
//   delta:      0.40  (only near-ATM options)
//   oi:         15    (5% OI change is noise; 15%+ = meaningful)
//   minOptConf: 65    (historical: 65% conf still 7% win rate; 65+ is cleaner)
export const DEF = {
  minStockConf: 50,
  pot:          3,
  risk:         55,
  rr:           1.2,
  rsiOS:        35,
  rsiOB:        65,
  vol:          1.2,
  delta:        0.40,
  iv:           15,
  oi:           15,
  optSL:        25,
  optTgt:       50,
  scanStocks:   15,
  tick:         15,
  portRef:      60,
  scanOpts:     15,
  minOptConf:   65,
  maxOptCapital: 0,
  moodRefresh:  10,
  portSize:     500000,
  riskPct:      2,
};

export const INDEX_OPTS = [
  { key: 'NSE_INDEX|Nifty 50',          name: 'NIFTY',     step: 50,  lot: 75  },
  { key: 'NSE_INDEX|Nifty Bank',         name: 'BANKNIFTY', step: 100, lot: 30  },
  { key: 'BSE_INDEX|SENSEX',             name: 'SENSEX',    step: 100, lot: 20  },
  { key: 'NSE_INDEX|Nifty Fin Service',  name: 'FINNIFTY',  step: 50,  lot: 65  },
];

export const TABS = [
  { id: 'stocks',    icon: '📈', label: 'Stocks',        pageLabel: '📈 Stocks'      },
  { id: 'options',   icon: '⚡', label: 'F&O Options',   pageLabel: '⚡ F&O Options' },
  { id: 'portfolio', icon: '💼', label: 'Portfolio',     pageLabel: '💼 Portfolio'   },
  { id: 'lookup',    icon: '🔍', label: 'Analyse Stock', pageLabel: '🔍 Analyse'     },
  { id: 'log',       icon: '📋', label: 'Signal Log',    pageLabel: '📋 Signal Log'  },
  { id: 'analysis',  icon: '📊', label: 'Analysis',      pageLabel: '📊 Analysis'    },
  { id: 'settings',  icon: '⚙',  label: 'Settings',      pageLabel: '⚙ Settings'    },
];

export const QUICK_STOCKS = [
  'RELIANCE','HDFCBANK','INFY','TCS','SBIN',
  'TATAMOTORS','BAJFINANCE','ICICIBANK','ICICIAMC','ITC',
];

export const THROTTLE_MS = 420;
