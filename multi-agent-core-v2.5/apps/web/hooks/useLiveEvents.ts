"use client";

import { useEffect, useRef, useState } from "react";
import { AgentEnvelopeSchema, type AgentEnvelope } from "@ma-core/shared";
import { fetchRecentEvents, isDemoApiMode, liveEventsUrl } from "../lib/api";
import { demoLiveEnvelope } from "../lib/demoApi";

export interface LiveEventState { connected: boolean; events: AgentEnvelope[]; error: string | null }

const liveEventNames = ["agent.market.vector", "agent.strategy.signal", "agent.strategy.feed", "agent.execution.order", "agent.execution.status", "agent.risk.state", "agent.risk.halt", "agent.position.timeout", "agent.live.log", "security.audit"] as const;

export function useLiveEvents(active: boolean, maxEvents = 80): LiveEventState {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<AgentEnvelope[]>([]);
  const [error, setError] = useState<string | null>(null);
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!active) {
      seen.current.clear();
      setConnected(false);
      setEvents([]);
      setError(null);
      return () => undefined;
    }

    let alive = true;
    const appendEvent = (event: AgentEnvelope): void => {
      const fingerprint = `${event.idempotency_key}:${event.timestamp}`;
      if (seen.current.has(fingerprint)) {
        return;
      }
      seen.current.add(fingerprint);
      setEvents((current) => [event, ...current].slice(0, maxEvents));
      if (seen.current.size > maxEvents * 3) {
        seen.current = new Set(Array.from(seen.current).slice(0, maxEvents * 2));
      }
    };

    fetchRecentEvents(maxEvents).then((result) => {
      if (!alive) return;
      if (result.data) {
        seen.current.clear();
        result.data.slice(0, maxEvents).forEach((event) => {
          seen.current.add(`${event.idempotency_key}:${event.timestamp}`);
        });
        setEvents(result.data.slice(0, maxEvents));
      }
      if (result.error) {
        setError(result.error);
      }
    }).catch(() => undefined);

    if (isDemoApiMode()) {
      setConnected(true);
      setError(null);
      let tick = 0;
      const timer = window.setInterval(() => {
        if (!alive) return;
        appendEvent(demoLiveEnvelope(tick));
        tick += 1;
      }, 4200);
      return () => {
        alive = false;
        window.clearInterval(timer);
        setConnected(false);
      };
    }

    const source = new EventSource(liveEventsUrl(), { withCredentials: true });
    const handleEnvelopeMessage = (message: MessageEvent<string>): void => {
      try {
        const parsed = AgentEnvelopeSchema.safeParse(JSON.parse(message.data) as unknown);
        if (parsed.success) {
          appendEvent(parsed.data);
          setError(null);
        } else {
          setError("Получено SSE-событие с неверной схемой. Оно было отброшено.");
        }
      } catch {
        setError("Получено поврежденное SSE-событие. Оно было отброшено.");
      }
    };

    const handleNamedEvent = (event: Event): void => {
      if (event instanceof MessageEvent) {
        handleEnvelopeMessage(event as MessageEvent<string>);
      }
    };

    source.onopen = () => { setConnected(true); setError(null); };
    source.onerror = () => { setConnected(false); setError("SSE-соединение временно недоступно. Интерфейс автоматически переподключится."); };
    source.addEventListener("message", handleNamedEvent);
    source.addEventListener("heartbeat", () => { setConnected(true); });
    for (const eventName of liveEventNames) {
      source.addEventListener(eventName, handleNamedEvent);
    }

    return () => {
      alive = false;
      source.close();
      setConnected(false);
    };
  }, [active, maxEvents]);

  return { connected, events, error };
}
