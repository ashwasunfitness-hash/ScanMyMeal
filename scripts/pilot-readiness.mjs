import { evaluatePilotReadiness } from "../lib/pilot-readiness.ts";

const checks = evaluatePilotReadiness(process.env);
console.log("\nScan My Meal — pilot readiness\n");
for (const item of checks) console.log(`${item.ready ? "✓" : "✗"} ${item.label}${item.ready ? "" : ` — ${item.guidance}`}`);
const ready = checks.every((item) => !item.required || item.ready);
console.log(ready ? "\nReady for a private pilot deployment.\n" : "\nSetup is incomplete. No secret values were displayed.\n");
process.exitCode = ready ? 0 : 1;
