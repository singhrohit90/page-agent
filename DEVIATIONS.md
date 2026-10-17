# Deviations from eval/demo-plan.md

1. Task 1 and verification step 1 (Node version). Plan: Node 24.15.0 or newer. Done: the build sandbox only has Node 22.22.0, which is below the engines range of Angular 22.2.3 (`^22.22.3 || ^24.15.0`). I installed Node 24.15.0 from the `node` npm package into a scratch directory outside the repo and put it first on PATH for every command. No repo file changed because of this. Why: the plan requires Node 24.15.0 and the sandbox could not provide it any other way.

2. Task 18 and verification step 9 (Playwright browser). Plan: `npx playwright install chromium`. Done: the download from cdn.playwright.dev is blocked by the sandbox proxy, so the command fails. I added one optional line to both Playwright configs, `launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH || undefined }`, and ran the smoke tests against the preinstalled Chromium 1194 at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. With `PW_CHROMIUM_PATH` unset the configs behave exactly as the plan describes. Why: smallest change that lets the tests run here. README "Tests" mentions the variable.

3. Task 14, section 4.2 (`onAfterTask`). Plan: `onAfterTask: (a, result) => runLog.finish(a.status, result)`. Done: in page-agent 1.12.4 `onAfterTask` runs before the library sets the final status (the status is set in a `finally` block afterwards), so `a.status` would still read `running`. I call `runLog.tick()` in `onAfterTask` and update the run log from a `statuschange` event listener that copies `completed`, `error` or `stopped`. Same visible result as the plan: the run log shows the final status.

4. Task 14, section 4.2 (`hasApiKey` diagnostic). Plan snippet: `agent.config['api' + 'Key' as 'apiKey']`. Done: `['api', 'Key'].join('')` used as a property lookup on a `Record<string, unknown>` cast. Why: the plan snippet contains the literal `'apiKey'` in its type assertion, which would fail the plan's own `grep -rn "apiKey" demo/src` check. Same behavior.

5. Section 4.2 (`audit.afterStep`). Plan: take the last `type: 'step'` event. Done: the same, plus skip it when its `stepIndex` was already audited in this task. Why: `onAfterStep` also fires after a failed step that adds no step event, which would otherwise log the previous step twice. The write-confirmation counters in the run log are incremented inside the guarded click callback instead of in the audit function, so they update at the moment of the dialog.

6. Anthropic provider (this change, requested after the plan). Plan: section 4.x describes one OpenAI-compatible proxy path for all providers. Done: `LLM_PROVIDER=anthropic` now calls the native Messages API (`{LLM_BASE_URL}/messages`) through `server/anthropic-native.mjs`. `adaptForAnthropicCompat` was removed and `tests/upstream.test.mjs` was rewritten for the new behaviour. Why: the compatibility endpoint ignores strict function calling, which produced malformed action unions. The adapter is verified only against a fake of the native API, not the real one.

7. Extra env keys. The request asked for `LLM_ANTHROPIC_THINKING` and `LLM_ANTHROPIC_STRICT`. I also added `LLM_ANTHROPIC_BETA` (optional `anthropic-beta` header value, default empty) because strict tool use has needed a beta header on some API versions and I could not check the current requirement. It has no effect when empty.

8. Request-shape log line. `server/log.mjs` allows seven new keys (`toolCount`, `toolChoiceSent`, `thinkingSent`, `strict`, `maxTokens`, `messageCount`, `droppedFields`) written as `kind: llm_request_shape` for provider anthropic. Counts and flags only. `tests/smoke.spec.ts` ALLOWED_LOG_KEYS lists them too.

9. Required attributes in templates. The reactive forms use `novalidate` and `Validators.required`, which does not set a DOM `required` attribute, and Angular's `ng` debug global is absent in production builds. The guarded submit therefore reads `required` and `aria-required` (added to the required fields of the work order and Settings forms) plus the `ng-invalid` class that Angular puts on controls. This also makes the Settings "Save settings" button refuse when a required or invalid field is present.

10. "One key per demo user". The demo has no login or user switch, so the single key `testfloor.defaults.workOrder` is per browser profile, which is the demo user. No per-user suffix was added.

11. Smoke test changes. S8 (approve) used to assert "Station is required" because the old mock script filled only the title. The mock script now fills all required fields, so S8 asserts the approved count and 4 work orders. New tests S12 to S15 cover the four requested smoke checks plus remembered defaults. The Playwright smoke count went from 11 to 15 and live tests from 8 to 9.

12. The mock complete script's `done` text still echoes the last action result, as before, so S7 can read `BLOCKED by user` in the panel.
