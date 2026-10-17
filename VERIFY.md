# Verification results

Run on 2026-10-17 in the build sandbox, from the repo's `demo/` directory. Node 24.15.0 came from a scratch directory outside the repo (DEVIATIONS.md item 1). Chromium was the preinstalled 1194 build via `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (DEVIATIONS.md item 2). This table replaces the earlier one; every row below comes from a command run in this pass.

| # | Check | Command | Result | Key output |
|---|---|---|---|---|
| 1 | Node version | `node -v` | PASS | `v24.15.0` |
| 2 | No `.env` present | `ls -a \| grep -c '^.env$'` | PASS | `0` |
| 3 | Clean install | `npm ci` | PASS | `found 0 vulnerabilities` |
| 4 | Pinned versions | `npm ls page-agent zod` | PASS | `page-agent@1.12.4`, `zod@4.6.7` (a nested `zod@4.6.6` exists only under `@angular/cli`) |
| 4b | No `^` or `~` in package.json | node one-liner | PASS | `caret/tilde: 0` |
| 5 | Build | `npm run build` | PASS | exit 0, initial total 483.23 kB, lazy `page-agent` chunk 107.55 kB, `dist/demo-app/browser/index.html` exists |
| 6 | Unit tests | `npm run test:unit` | PASS | tests 23, pass 23, fail 0, skipped 0 (translation both ways, strict fake self-test, proxy integration against the fake, upstream builders for anthropic/generic/openai/azure) |
| 6b | Proxy integration test without `dist/` | `node --test tests/anthropic-proxy.test.mjs` with `dist` moved away | PASS (skip is visible) | `dist/ is missing, run npm run build first` reported as the skip reason |
| 7 | Smoke tests (mock mode) | `npm run test:smoke` | PASS | `15 passed (2.1m)`: S1 to S15 including S12 (complete script creates WO-1043 after the dialog), S13 (NEEDS_INPUT, ask_user answered in the panel, no work order), S14 (dialog lists title, station, priority, due date), S15 (remembered defaults) |
| 8 | Live tests without a key | `npm run test:live` | PASS (skip behaviour) | `9 skipped` (T1 to T6, F1, F2, G1), exit 0 |
| 9 | Live path with a real key | `npm run test:live` with a real key | SKIPPED: no key and no access to a real endpoint | T1 to T6, F1, F2, G1 are unverified against a real model, including the new T6 |
| 10 | Real Anthropic API | `LLM_PROVIDER=anthropic` against `https://api.anthropic.com/v1` | SKIPPED: no key, no network path to the real API | The native adapter and `LLM_ANTHROPIC_STRICT=true` are verified only against `tests/fake-anthropic.mjs` |
| 11 | No key literal in source | `grep -rn "apiKey" src` | PASS | no output |
| 12 | No CDN or demo bundle | `grep -rnE "fcapp\.run\|unpkg\.com\|jsdelivr\|page-agent\.demo" src dist/demo-app/browser` | PASS | no output |
| 13 | `.env` ignored, `.env.example` tracked | `git check-ignore -q .env; echo $?` and same for `.env.example` | PASS | `0` and `1` |
| 14 | No key-like strings, no eval | `grep -rnE "sk-[A-Za-z0-9]{20,}"` over demo (excluding node_modules, dist, .angular, logs, test-results); `grep -rnE "eval\(\|new Function" src server tests scripts` | PASS | no output from either |
| 15 | No em dashes | `grep -rnP "\x{2014}"` over README.md, src, server, tests, scripts, .env.example, package.json, playwright configs (UTF-8 locale) | PASS | no output |
| 16 | Mock start, no `.env` | `DEMO_SKIP_ENV_FILE=1 PORT=8791 node server/proxy.mjs` | PASS | `TestFloor demo on http://localhost:8791  mode=mock provider=mock model=mock-scripted key=not set` |
| 17 | Health, headers, cookie | `curl` on `/api/health` and `/dashboard` | PASS | `{"ok":true,"mode":"mock","provider":"mock","model":"mock-scripted","pageAgentVersion":"1.12.4"}`, `200`, CSP with `connect-src 'self'`, `Set-Cookie: pa_demo_session=...; HttpOnly; SameSite=Strict; Path=/` |
| 18 | LLM route without cookie | `curl -X POST .../api/llm/chat/completions -d "{}"` | PASS | `401` |
| 19 | Live mode, no key | `LLM_MODE=live LLM_PROVIDER=anthropic LLM_API_KEY= DEMO_SKIP_ENV_FILE=1 node server/proxy.mjs` | PASS | exit 1, `LLM_API_KEY is not set in demo/.env` |
| 20 | Invalid thinking setting | same with `LLM_ANTHROPIC_THINKING=bogus` and a dummy key | PASS | exit 1, `Invalid LLM_ANTHROPIC_THINKING (use between_tools or omit)` |
| 21 | One-command start | delete `node_modules`, `dist`, `.angular`; `DEMO_SKIP_ENV_FILE=1 PORT=8792 npm start` | PASS | preflight ran `npm ci` (`added 247 packages`), build ran, printed `TestFloor demo on http://localhost:8792  mode=mock provider=mock model=mock-scripted key=not set`; `/api/health` returned ok and `/` returned 200 |

Not run: root `npm run lint` (`demo` is on the root ESLint ignore list). `tsc` over `tests/` (the test files are compiled by Playwright, not by the app build; `ng build` type-checks `src/`).
