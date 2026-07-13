import test from "node:test";
import assert from "node:assert/strict";
import { destinationFor, safeReturnTo } from "../lib/access-rules.ts";

test("client access follows account, onboarding and programme state", () => {
  assert.equal(destinationFor({ role: "client", accountStatus: "invited", onboardingCompleted: false }), "/onboarding");
  assert.equal(destinationFor({ role: "client", accountStatus: "active", onboardingCompleted: true, programmeStatus: "active" }), "/client/dashboard");
  assert.equal(destinationFor({ role: "client", accountStatus: "expired", onboardingCompleted: true }), "/access-expired");
  assert.equal(destinationFor({ role: "client", accountStatus: "active", onboardingCompleted: true, programmeStatus: "paused" }), "/account-suspended");
});

test("roles route to their protected workspaces", () => {
  assert.equal(destinationFor({ role: "admin", accountStatus: "active", onboardingCompleted: true }), "/admin");
  assert.equal(destinationFor({ role: "coach", accountStatus: "active", onboardingCompleted: true }), "/coach");
});

test("return paths reject external and protocol-relative redirects", () => {
  assert.equal(safeReturnTo("/client/dashboard?tab=history"), "/client/dashboard?tab=history");
  assert.equal(safeReturnTo("//evil.example"), "/");
  assert.equal(safeReturnTo("https://evil.example"), "/");
});
