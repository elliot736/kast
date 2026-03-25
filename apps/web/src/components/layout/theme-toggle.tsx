"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("kast-theme");
    if (stored === "light") {
      setDark(false);
      document.documentElement.classList.remove("dark");
    }
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    if (next) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("kast-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("kast-theme", "light");
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      className="text-xs text-muted-foreground"
    >
      {dark ? "☀ Light" : "☾ Dark"}
    </Button>
  );
}
