import test from "node:test";
import assert from "node:assert/strict";
import { evaluatePilotReadiness, pilotIsReady } from "../lib/pilot-readiness.ts";

const readyEnv = {
  NODE_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: "https://pilot-project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_valid_test_key",
  SUPABASE_SERVICE_ROLE_KEY: "service_role_secret_longer_than_thirty_characters",
  NEXT_PUBLIC_APP_URL: "https://pilot.scanmymeal.example",
  SUPABASE_AUTH_REDIRECT_URL: "https://pilot.scanmymeal.example/auth/callback",
  AI_ANALYSIS_ENDPOINT: "https://analysis.example/v1/meal",
  AI_API_KEY: "analysis_secret_key",
};

test("a complete HTTPS production configuration is pilot-ready", () => assert.equal(pilotIsReady(readyEnv), true));
test("production rejects demo analysis and mismatched callback origins", () => {
  const checks = evaluatePilotReadiness({ ...readyEnv, ALLOW_DEMO_ANALYSIS: "true", SUPABASE_AUTH_REDIRECT_URL: "https://evil.example/auth/callback" });
  assert.equal(checks.find((item) => item.key === "demo_disabled")?.ready, false);
  assert.equal(checks.find((item) => item.key === "callback")?.ready, false);
});
test("missing secrets fail without returning their values", () => {
  const checks = evaluatePilotReadiness({ NODE_ENV: "production" });
  assert.equal(checks.filter((item) => item.key !== "demo_disabled").every((item) => !item.ready), true);
  assert.equal(JSON.stringify(checks).includes("service_role_secret"), false);
});
