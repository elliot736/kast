"use client";

import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorBannerProps {
  message: string;
  description?: string;
  onDismiss?: () => void;
  onRetry?: () => void;
}

export function ErrorBanner({ message, description, onDismiss, onRetry }: ErrorBannerProps) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.2 }}
        className="flex items-center gap-3 rounded-lg border border-critical/30 bg-critical/5 px-4 py-3"
      >
        <AlertTriangle className="size-4 text-critical shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-critical">{message}</p>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{description}</p>
          )}
        </div>
        {onRetry && (
          <Button variant="outline" size="xs" onClick={onRetry} className="shrink-0">
            <RefreshCw className="size-3 mr-1" />
            Retry
          </Button>
        )}
        {onDismiss && (
          <Button variant="ghost" size="icon-xs" onClick={onDismiss} className="shrink-0 text-muted-foreground hover:text-foreground">
            <X className="size-3.5" />
          </Button>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
