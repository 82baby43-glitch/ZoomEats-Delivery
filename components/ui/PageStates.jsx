"use client";

import { Loader2, Inbox, AlertCircle } from "lucide-react";

export function LoadingSkeleton({ label = "Loading…", rows = 3 }) {
  return (
    <div className="space-y-3" data-testid="page-loading">
      <div className="flex items-center gap-2 text-sm" style={{ color: "var(--muted)" }}>
        <Loader2 size={16} className="animate-spin" />
        {label}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="card p-4 animate-pulse"
          style={{ background: "var(--surface-2)", minHeight: 56 }}
        />
      ))}
    </div>
  );
}

export function EmptyState({ title = "Nothing here yet", description, action }) {
  return (
    <div className="card p-10 text-center" data-testid="page-empty">
      <Inbox size={40} className="mx-auto mb-3" style={{ color: "var(--muted)" }} />
      <h2 className="font-display text-xl font-bold">{title}</h2>
      {description && (
        <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
          {description}
        </p>
      )}
      {action}
    </div>
  );
}

export function ErrorState({ title = "Could not load data", description, onRetry }) {
  return (
    <div className="card p-10 text-center" data-testid="page-error">
      <AlertCircle size={40} className="mx-auto mb-3" style={{ color: "var(--primary)" }} />
      <h2 className="font-display text-xl font-bold">{title}</h2>
      {description && (
        <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
          {description}
        </p>
      )}
      {onRetry && (
        <button type="button" className="btn-primary mt-6" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
