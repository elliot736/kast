"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const timelineEvents = [
  { time: "03:00:00", label: "db-backup expected", type: "expected" },
  { time: "03:00:00", label: "No ping received", type: "miss" },
  { time: "03:05:00", label: "Grace period expired", type: "alert" },
  { time: "03:05:01", label: "Incident opened — missed_ping", type: "incident" },
  { time: "03:05:02", label: "Slack alert dispatched", type: "notify" },
  { time: "03:05:02", label: "PagerDuty alert triggered", type: "notify" },
  { time: "03:12:45", label: "Manual restart initiated", type: "action" },
  { time: "03:14:22", label: "db-backup ping: success (4.2s)", type: "resolve" },
  { time: "03:14:22", label: "Incident resolved — 14m 22s downtime", type: "resolve" },
];

const typeColors: Record<string, string> = {
  expected: "bg-[#8B949E]",
  miss: "bg-[#FF4444]",
  alert: "bg-[#F59E0B]",
  incident: "bg-[#FF4444]",
  notify: "bg-[#F59E0B]",
  action: "bg-[#8B949E]",
  resolve: "bg-[#00E5C3]",
};

export function IncidentReplay() {
  const [scrubberPos, setScrubberPos] = useState(65);
  const visibleCount = Math.ceil((scrubberPos / 100) * timelineEvents.length);

  return (
    <div className="rounded-none border border-[#1C2128] bg-[#0D1117] overflow-hidden">
      <Tabs defaultValue="replay" className="w-full">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1C2128] bg-[#080B0F]">
          <span className="text-[11px] font-mono text-[#8B949E]">
            incident #a3f8 — db-backup
          </span>
          <TabsList className="bg-transparent border border-[#1C2128] rounded-none h-7 p-0">
            <TabsTrigger
              value="live"
              className="rounded-none text-[11px] px-3 h-7 data-[state=active]:bg-[#161B22] data-[state=active]:text-[#E6EDF3] text-[#8B949E]"
            >
              Live
            </TabsTrigger>
            <TabsTrigger
              value="replay"
              className="rounded-none text-[11px] px-3 h-7 data-[state=active]:bg-[#161B22] data-[state=active]:text-[#00E5C3] text-[#8B949E]"
            >
              Replay
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="live" className="mt-0 p-4">
          <p className="text-sm text-[#8B949E] text-center py-8 font-mono">
            No active incidents. All systems operational.
          </p>
        </TabsContent>

        <TabsContent value="replay" className="mt-0">
          {/* Scrubber */}
          <div className="px-4 pt-4 pb-2">
            <div className="flex items-center justify-between text-[10px] font-mono text-[#8B949E] mb-1.5">
              <span>03:00:00</span>
              <span>03:14:22</span>
            </div>
            <div className="relative h-6 flex items-center">
              <div className="absolute inset-x-0 h-0.5 bg-[#1C2128]" />
              {/* Colored segments */}
              <div
                className="absolute left-0 h-0.5 bg-gradient-to-r from-[#FF4444] via-[#F59E0B] to-[#00E5C3]"
                style={{ width: `${scrubberPos}%` }}
              />
              {/* Scrubber handle */}
              <input
                type="range"
                min={0}
                max={100}
                value={scrubberPos}
                onChange={(e) => setScrubberPos(Number(e.target.value))}
                className="absolute inset-x-0 w-full h-6 opacity-0 cursor-pointer z-10"
              />
              <div
                className="absolute w-3 h-3 border-2 border-[#00E5C3] bg-[#080B0F] rounded-none -translate-x-1/2 pointer-events-none"
                style={{ left: `${scrubberPos}%` }}
              />
            </div>
          </div>

          {/* Event list */}
          <div className="px-4 pb-4 space-y-0">
            {timelineEvents.slice(0, visibleCount).map((event, i) => (
              <div key={i} className="flex items-start gap-3 py-1.5">
                <span className="text-[11px] font-mono text-[#8B949E] w-16 shrink-0 pt-0.5">
                  {event.time}
                </span>
                <div className="relative flex flex-col items-center pt-1">
                  <div className={`w-1.5 h-1.5 rounded-full ${typeColors[event.type]} shrink-0`} />
                  {i < visibleCount - 1 && (
                    <div className="w-px h-4 bg-[#1C2128]" />
                  )}
                </div>
                <span
                  className={`text-[12px] font-mono pt-0 ${
                    event.type === "resolve"
                      ? "text-[#00E5C3]"
                      : event.type === "miss" || event.type === "incident"
                        ? "text-[#FF4444]"
                        : "text-[#8B949E]"
                  }`}
                >
                  {event.label}
                </span>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
