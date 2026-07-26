import { Suspense } from "react";
import { ComplianceGate } from "@/components/ComplianceGate";
import Header from "@/components/Header";
import SystemHealthClient from "./SystemHealthClient";

export default function SystemHealthPage() {
  return (
    <ComplianceGate roles={["admin"]} requireCompliance={false} loginPath="/login">
      <Header />
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-12">
        <Suspense fallback={<div className="text-sm" style={{ color: "var(--muted)" }}>Loading system health…</div>}>
          <SystemHealthClient />
        </Suspense>
      </div>
    </ComplianceGate>
  );
}
