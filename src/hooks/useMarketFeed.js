import { useEffect, useRef, useCallback, useState } from 'react';

// ── Upstox WebSocket Market Feed ──────────────────────────────
// Upstox v3 Streamer: wss://api.upstox.com/v3/feed/market-data-streamer
// Docs: https://upstox.com/developer/api-documentation/market-data-streamer

const WS_URL = 'wss://api.upstox.com/v3/feed/market-data-streamer';

export function useMarketFeed(token, instrumentKeys = [], enabled = true) {
  const ws        = useRef(null);
  const retryRef  = useRef(0);
  const retryTimer = useRef(null);

  const [connected, setConnected]   = useState(false);
  const [lastPrices, setLastPrices] = useState({}); // key → { ltp, chgPct, vol }

  const disconnect = useCallback(() => {
    if (ws.current) {
      ws.current.onclose = null;  // prevent auto-reconnect on manual close
      ws.current.close();
      ws.current = null;
    }
    clearTimeout(retryTimer.current);
    setConnected(false);
  }, []);

  const connect = useCallback(() => {
    if (!token || !instrumentKeys.length || !enabled) return;
    if (ws.current?.readyState === WebSocket.OPEN) return;

    const socket = new WebSocket(`${WS_URL}?api-version=2.0`, [], {
      headers: { Authorization: 'Bearer ' + token },
    });

    // Upstox also accepts token as a URL param on some environments (CORS):
    // const socket = new WebSocket(`${WS_URL}?api-version=2.0&token=${token}`);

    socket.onopen = () => {
      retryRef.current = 0;
      setConnected(true);
      // Subscribe to instrument keys
      const sub = {
        guid:   crypto.randomUUID(),
        method: 'sub',
        data:   { mode: 'ltpc', instrumentKeys },
      };
      socket.send(JSON.stringify(sub));
    };

    socket.onmessage = (evt) => {
      try {
        // Upstox sends binary protobuf or JSON depending on mode
        let data;
        if (typeof evt.data === 'string') {
          data = JSON.parse(evt.data);
        } else {
          // Binary: decode ArrayBuffer as UTF-8 (JSON mode) or proto (full mode)
          data = JSON.parse(new TextDecoder('utf-8').decode(evt.data));
        }
        // ltpc mode payload: { feeds: { "NSE_EQ|ISIN": { ltpc: { ltp, cp, chg, chgp } } } }
        const feeds = data?.feeds || {};
        setLastPrices((prev) => {
          const next = { ...prev };
          for (const [key, val] of Object.entries(feeds)) {
            const ltpc = val?.ltpc || val?.ff?.marketFF?.ltpc;
            if (!ltpc) continue;
            const ltp    = ltpc.ltp ?? ltpc.last_price ?? 0;
            const cp     = ltpc.cp  ?? ltpc.close_price ?? ltp;
            const chgPct = cp > 0 ? +((ltp - cp) / cp * 100).toFixed(2) : 0;
            next[key] = { ltp, chgPct, vol: ltpc.vol || 0 };
          }
          return next;
        });
      } catch (e) { /* ignore malformed frames */ }
    };

    socket.onerror = () => {
      setConnected(false);
    };

    socket.onclose = () => {
      setConnected(false);
      ws.current = null;
      // Exponential back-off: 2s, 4s, 8s … max 30s
      const delay = Math.min(30000, 2000 * Math.pow(2, retryRef.current));
      retryRef.current++;
      retryTimer.current = setTimeout(connect, delay);
    };

    ws.current = socket;
  }, [token, instrumentKeys.join(','), enabled]); // eslint-disable-line

  // Subscribe to new keys when list changes
  const subscribe = useCallback((keys) => {
    if (ws.current?.readyState !== WebSocket.OPEN) return;
    ws.current.send(JSON.stringify({
      guid:   crypto.randomUUID(),
      method: 'sub',
      data:   { mode: 'ltpc', instrumentKeys: keys },
    }));
  }, []);

  const unsubscribe = useCallback((keys) => {
    if (ws.current?.readyState !== WebSocket.OPEN) return;
    ws.current.send(JSON.stringify({
      guid:   crypto.randomUUID(),
      method: 'unsub',
      data:   { instrumentKeys: keys },
    }));
  }, []);

  useEffect(() => {
    if (enabled && token && instrumentKeys.length) connect();
    return disconnect;
  }, [token, enabled, connect, disconnect]); // eslint-disable-line

  return { connected, lastPrices, connect, disconnect, subscribe, unsubscribe };
}
