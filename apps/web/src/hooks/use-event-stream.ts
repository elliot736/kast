"use client";

import { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface StreamEvent {
  id: string;
  type: "ping" | "monitor-state" | "incident" | "job-run" | "job-log" | "workflow-step";
  data: Record<string, unknown>;
  receivedAt: string;
}

export function useEventStream() {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const counterRef = useRef(0);

  useEffect(() => {
    const socket = io(`${API_BASE}/events`, {
      transports: ["websocket"],
    });

    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    const addEvent = (type: StreamEvent["type"], data: Record<string, unknown>) => {
      counterRef.current++;
      setEvents((prev) => [
        {
          id: `${type}-${counterRef.current}`,
          type,
          data,
          receivedAt: new Date().toISOString(),
        },
        ...prev.slice(0, 199), // Keep last 200 events
      ]);
    };

    socket.on("ping", (data) => addEvent("ping", data));
    socket.on("monitor-state", (data) => addEvent("monitor-state", data));
    socket.on("incident", (data) => addEvent("incident", data));
    socket.on("job-run", (data) => addEvent("job-run", data));
    socket.on("job-log", (data) => addEvent("job-log", data));
    socket.on("workflow-step", (data) => addEvent("workflow-step", data));

    return () => {
      socket.disconnect();
    };
  }, []);

  return { events, connected };
}
