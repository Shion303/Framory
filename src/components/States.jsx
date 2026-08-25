import React from "react";
import { Loader2, AlertTriangle, RefreshCw, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Loading({ label = "Loading…", className = "" }) {
  return (
    <div className={`flex flex-col items-center justify-center py-20 text-muted-foreground ${className}`}>
      <Loader2 className="w-7 h-7 animate-spin text-primary mb-3" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function ErrorState({ message = "Something went wrong", onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-6">
      <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
        <AlertTriangle className="w-7 h-7 text-destructive" />
      </div>
      <p className="text-foreground font-medium mb-1">{message}</p>
      <p className="text-sm text-muted-foreground mb-4">TVmaze may be unavailable. Try again.</p>
      {onRetry && (
        <Button onClick={onRetry} variant="secondary" className="gap-2">
          <RefreshCw className="w-4 h-4" /> Retry
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ title = "Nothing here yet", description, icon: Icon = Inbox, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-6">
      <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-muted-foreground" />
      </div>
      <p className="text-foreground font-medium mb-1">{title}</p>
      {description && <p className="text-sm text-muted-foreground mb-4 max-w-sm">{description}</p>}
      {action}
    </div>
  );
}

export function ProgressBar({ percent, className = "" }) {
  return (
    <div className={`h-1.5 w-full rounded-full bg-secondary overflow-hidden ${className}`}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-primary to-fuchsia-400 transition-all duration-500"
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}