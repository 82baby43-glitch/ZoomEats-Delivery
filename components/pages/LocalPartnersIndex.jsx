"use client";

import Link from "next/link";
import Header from "@/components/Header";
import LocalPartnerSpotlight from "@/components/spotlight/LocalPartnerSpotlight";

export default function LocalPartnersIndex() {
  return (
    <div>
      <Header />
      <div className="max-w-7xl mx-auto px-6 md:px-12 pt-12 pb-8">
        <div className="label-eyebrow">Discover</div>
        <h1 className="font-display text-4xl md:text-5xl font-black tracking-tight mt-1">
          Local Partner Spotlight
        </h1>
        <p className="mt-3 max-w-2xl text-lg" style={{ color: "var(--muted)" }}>
          Featured independent restaurants and local businesses in Columbia — discover their stories and order direct on ZoomEats.
        </p>
        <Link href="/restaurant/claim" className="btn-secondary inline-flex mt-6">
          Own a restaurant? Claim your listing
        </Link>
      </div>
      <LocalPartnerSpotlight showFilters limit={12} />
    </div>
  );
}
