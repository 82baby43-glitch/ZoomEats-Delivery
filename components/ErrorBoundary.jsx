"use client";

import { Component } from "react";
import { logClientError } from "@/lib/clientErrorLog";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    logClientError("ErrorBoundary", error, { componentStack: info?.componentStack });
  }

  handleRefresh = () => {
    if (typeof window !== "undefined") window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[50vh] flex flex-col items-center justify-center px-6 py-20 text-center">
          <h1 className="font-display text-2xl font-black">Something went wrong. Please refresh.</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
            An unexpected error occurred. Your data is safe — try reloading the page.
          </p>
          <button type="button" className="btn-primary mt-6" onClick={this.handleRefresh}>
            Refresh page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
