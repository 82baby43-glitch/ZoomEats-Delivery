#!/usr/bin/env node
/**
 * Unit tests for licensed dispensary compliance helpers.
 * Usage: npx tsx --test scripts/dispensary-compliance-unit.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapApprovalToVerificationStatus } from "../lib/merchant/complianceProfile";
import { isVerifiedDispensaryMerchant } from "../lib/merchant/dispensaryPositioning";

describe("mapApprovalToVerificationStatus", () => {
  it("maps approved to approved", () => {
    assert.equal(mapApprovalToVerificationStatus("approved"), "approved");
  });

  it("maps rejected to rejected", () => {
    assert.equal(mapApprovalToVerificationStatus("rejected"), "rejected");
  });

  it("maps suspended to suspended", () => {
    assert.equal(mapApprovalToVerificationStatus("suspended"), "suspended");
  });

  it("maps documents_missing to info_requested", () => {
    assert.equal(mapApprovalToVerificationStatus("documents_missing"), "info_requested");
  });

  it("defaults unknown statuses to pending", () => {
    assert.equal(mapApprovalToVerificationStatus("review"), "pending");
    assert.equal(mapApprovalToVerificationStatus("verification"), "pending");
    assert.equal(mapApprovalToVerificationStatus(""), "pending");
  });
});

describe("isVerifiedDispensaryMerchant", () => {
  it("returns true only for approved licensed dispensaries", () => {
    assert.equal(isVerifiedDispensaryMerchant("licensed_dispensary", "approved", true), true);
  });

  it("returns false when category is not licensed_dispensary", () => {
    assert.equal(isVerifiedDispensaryMerchant("restaurants", "approved", true), false);
  });

  it("returns false when verification status is not approved", () => {
    assert.equal(isVerifiedDispensaryMerchant("licensed_dispensary", "pending", true), false);
    assert.equal(isVerifiedDispensaryMerchant("licensed_dispensary", "suspended", true), false);
  });

  it("returns false when restaurant is not approved", () => {
    assert.equal(isVerifiedDispensaryMerchant("licensed_dispensary", "approved", false), false);
    assert.equal(isVerifiedDispensaryMerchant("licensed_dispensary", "approved", null), false);
  });
});
