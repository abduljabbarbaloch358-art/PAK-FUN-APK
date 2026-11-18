import { useEffect, useRef, useState, useCallback } from 'react';
import { AviatorState, LiveFeedItem, PokerState, RouletteState } from '../types/platform';

export interface AviatorCashoutEvent {
  roundId: number;
  playerId: string;
  multiplier: number;
  payout: number;
  betAmount: number;
}

export interface RouletteSettledEvent {
  roundId: number;
  playerId: string;
  winningNumber: number;
  winningColor: 'red' | 'black' | 'green';
  wagered: number;
  payout: number;
}

export function useMultiplayerWs(
  playerId?: string,
  playerName?: string,
  onAviatorCashout?: (ev: AviatorCashoutEvent) => void,
  onRouletteSettled?: (ev: RouletteSettledEvent) => void,
) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [onlineCount, setOnlineCount] = useState(1);
  const [aviator, setAviator] = useState<AviatorState | null>(null);
  const [roulette, setRoulette] = useState<RouletteState | null>(null);
  const [poker, setPoker] = useState<PokerState | null>(null);
  const [liveFeed, setLiveFeed] = useState<LiveFeedItem[]>([]);

  const cashoutCbRef = useRef(onAviatorCashout);
  const rouletteCbRef = useRef(onRouletteSettled);
  cashoutCbRef.current = onAviatorCashout;
  rouletteCbRef.current = onRouletteSettled;

  useEffect(() => {
    let active = true;
    let reconnectTimer: number | undefined;

    function connect() {
      if (!active) return;
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!active) return;
        setConnected(true);
        if (playerId) {
          ws.send(JSON.stringify({ type: 'auth:identify', payload: { playerId, playerName } }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'init') {
            setAviator(msg.payload.aviator);
            setRoulette(msg.payload.roulette);
            setPoker(msg.payload.poker);
            setLiveFeed(msg.payload.liveFeed || []);
            setOnlineCount(msg.payload.onlineCount || 1);
          } else if (msg.type === 'presence:count') {
            setOnlineCount(msg.payload.onlineCount || 1);
          } else if (msg.type === 'aviator:state') {
            setAviator(msg.payload);
          } else if (msg.type === 'aviator:tick') {
            setAviator((prev) => (prev ? { ...prev, multiplier: msg.payload.multiplier } : prev));
          } else if (msg.type === 'aviator:cashed_out') {
            cashoutCbRef.current?.(msg.payload);
          } else if (msg.type === 'roulette:state') {
            setRoulette(msg.payload);
          } else if (msg.type === 'roulette:settled') {
            rouletteCbRef.current?.(msg.payload);
          } else if (msg.type === 'poker:state') {
            setPoker(msg.payload);
          } else if (msg.type === 'live:feed_item') {
            setLiveFeed((prev) => [msg.payload, ...prev].slice(0, 30));
          }
        } catch {
          // Ignore invalid JSON frames
        }
      };

      ws.onclose = () => {
        if (!active) return;
        setConnected(false);
        reconnectTimer = window.setTimeout(connect, 1800);
      };
    }

    connect();
    return () => {
      active = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN && playerId) {
      wsRef.current.send(JSON.stringify({ type: 'auth:identify', payload: { playerId, playerName } }));
    }
  }, [playerId, playerName]);

  const sendEvent = useCallback((type: string, payload: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, payload }));
    }
  }, []);

  return {
    connected,
    onlineCount,
    aviator,
    roulette,
    poker,
    liveFeed,
    sendEvent,
  };
}
