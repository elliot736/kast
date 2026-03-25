"use client";

import { useEffect, useState } from "react";
import { Moon } from "lucide-react";

export function SleepCountdown({ resumeAt }: { resumeAt: string }) {
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    function update() {
      const diff = new Date(resumeAt).getTime() - Date.now();
      if (diff <= 0) {
        setRemaining("Resuming...");
        return;
      }

      const seconds = Math.floor(diff / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);

      if (hours > 0) {
        setRemaining(`${hours}h ${minutes % 60}m ${seconds % 60}s`);
      } else if (minutes > 0) {
        setRemaining(`${minutes}m ${seconds % 60}s`);
      } else {
        setRemaining(`${seconds}s`);
      }
    }

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [resumeAt]);

  return (
    <div className="flex items-center gap-1.5 mt-1 text-xs text-warn">
      <Moon className="size-3" />
      <span>Sleeping — resumes in {remaining}</span>
    </div>
  );
}
