"use client";

import { useState, useEffect } from "react";

/**
 * Forces a re-render every `intervalMs` so relative timestamps stay fresh.
 */
export function useRelativeTime(intervalMs = 30_000) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}
