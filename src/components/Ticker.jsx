import React from 'react';

const TICKER_TEXT =
  '  F.R.I.D.A.Y  ●  PROFESSIONAL NSE SCANNER  ●  NIFTY 50  ●  BANK NIFTY  ●  SENSEX  ●  FIN NIFTY  ●  ' +
  'REAL-TIME SIGNALS  ●  UPSTOX API  ●  RSI · MACD · SUPERTREND · EMA  ●  ';

export default function Ticker() {
  // Duplicate for seamless loop
  const text = TICKER_TEXT + TICKER_TEXT;
  return (
    <div className="tkr-w">
      <div className="tkr-i">{text}</div>
    </div>
  );
}
