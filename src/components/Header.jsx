import React from 'react';
import { useApp } from '../context/AppContext';
import { TABS } from '../constants/config';

export default function Header({ onMenuToggle }) {
  const {
    booted, scanSecs, statusDot, statusTxt, activeTab,
    scanning, setScanning, marketStatus, logOpen, setLogOpen,
  } = useApp();

  const mins = Math.floor(scanSecs / 60);
  const secs = String(scanSecs % 60).padStart(2, '0');
  const cdownUrg = scanSecs < 30 && marketStatus.open;
  const currentTab = TABS.find((t) => t.id === activeTab);

  return (
    <div className="hdr">
      {/* Pre-login logo */}
      {!booted && (
        <div className="logo">
          <div className="logo-ic"><span>F</span></div>
          <div>
            <div className="logo-txt">F.R.I.D.A.Y</div>
            <div className="logo-sub">PROFESSIONAL NSE SCANNER</div>
          </div>
        </div>
      )}

      {/* Post-login hamburger + page label */}
      {booted && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            className="menu-btn"
            aria-label="Menu"
            onClick={onMenuToggle}
          >
            <span /><span /><span />
          </button>
          <span className="active-page-lbl">
            {currentTab?.pageLabel || '📈 Stocks'}
          </span>
        </div>
      )}

      {/* Right controls (post-login) */}
      {booted && (
        <div className="hdr-r">
          {/* Countdown */}
          <div className="cdown">
            <div className={'cdown-v' + (cdownUrg ? ' urg' : '')}
              style={!marketStatus.open ? { color: '#dc2626' } : {}}>
              {marketStatus.open ? `${mins}:${secs}` : 'OFF'}
            </div>
            <div className="cdown-l">
              {marketStatus.open ? 'NEXT SCAN' : 'MARKET CLOSED'}
            </div>
          </div>

          {/* Status dot */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div className={`dot ${statusDot}`} />
            <span style={{ fontSize: 10, color: '#64748b' }}>{statusTxt}</span>
          </div>

          {/* Scan button */}
          <button
            className="btn btn-g"
            disabled={scanning}
            onClick={() => {/* triggerScan dispatched via StocksPane */
              document.dispatchEvent(new CustomEvent('friday:scan'));
            }}
          >
            {scanning ? '⏳ Scanning' : '▶ Scan'}
          </button>

          {/* Log toggle */}
          <button
            className="btn btn-s"
            onClick={() => setLogOpen((v) => !v)}
            title="Scan log"
          >🔍</button>
        </div>
      )}
    </div>
  );
}
