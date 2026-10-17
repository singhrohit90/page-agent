# TestFloor Admin (demo): instructions for Claude Code

Read HANDOFF.md first. It holds the session history, what is verified, and the open problem.

## What this project is

A self-contained demo that evaluates `page-agent` (alibaba/page-agent, pinned `page-agent@1.12.4` from npm) for an Angular, multi-tenant manufacturing analytics product. It is a fake internal admin tool (Angular 22) plus a zero-dependency Node proxy that holds the LLM key. All data is synthetic. It is not for customer-facing use.

- `src/` Angular app (agent wiring in `src/app/agent/`, pages in `src/app/pages/`)
- `server/` Node proxy: `proxy.mjs`, `upstream.mjs`, `anthropic-native.mjs` (OpenAI-to-Anthropic Messages translation), `mock-llm.mjs`, `config.mjs`, `log.mjs`
- `tests/` unit (`node:test`), smoke (Playwright, mock mode), live (Playwright, needs a real key)
- `context/` the research findings and the original build plan. Read-only background.

## Commands

Node 24.15 or newer is required (Angular 22).

```
npm ci                    # first time
npm start                 # preflight, build, proxy on http://localhost:8787
npm run build
npm run test:unit         # expect 23 pass
npm run test:smoke        # expect 18 pass (first: npx playwright install chromium)
npm run test:live         # needs "mode": "live" in llm.config.json and a key in .env, else all skipped
```

Single tests:

```
node --test tests/config.test.mjs                  # one unit file
npx playwright test -c playwright.mock.config.ts -g "S8"   # one smoke test by title
```

Smoke tests start their own proxy on port 8799 in mock mode (key is a fake canary, `.env` is skipped via `DEMO_SKIP_ENV_FILE=1`, log goes to `logs/proxy-test.log`). Set `PW_CHROMIUM_PATH` to use an already installed Chromium. `tests/anthropic-proxy.test.mjs` needs `dist/` (run `npm run build` first), otherwise it skips with a visible reason.

Configuration is split on purpose:

- `.env` holds ONLY `LLM_API_KEY`. The user creates it from `.env.example`. You never read or edit it.
- `llm.config.json` holds every other setting (mode, provider, baseUrl, model, anthropic.strict, anthropic.thinking, anthropic.beta, timeouts, port). You may edit it freely, it has no secret. Restart the proxy after changing either file.
- Non-secret keys left in `.env` are ignored with a startup warning. Process env vars still override the config file (the tests use this).

## Architecture (needs several files to see)

Request path: page-agent in the browser (`AgentService.init()` in `src/app/agent/agent.service.ts`) calls same-origin `/api/llm/chat/completions` in OpenAI format. `server/proxy.mjs` is the only process with the key. Its routes are `GET /api/health` (mode, provider, model; the app reads this at startup and disables the agent if it fails), `POST /api/llm/chat/completions`, `POST /api/audit` (per-step metadata from the browser), and static serving of `dist/demo-app/browser`. It listens on 127.0.0.1 only.

- `config.mjs` merges `llm.config.json`, `.env` (key only) and process env. `mode: mock` routes to `mock-llm.mjs` (scripted tool calls, no network); `mode: live` goes to `upstream.mjs`, which builds the provider request (generic, openai, azure) or, for `anthropic`, hands off to `anthropic-native.mjs` (OpenAI request to Messages API request, and the response back). `log.mjs` whitelists loggable keys; adding a log field means adding it there and to `ALLOWED_LOG_KEYS` in `tests/smoke.spec.ts`.
- `tests/fake-anthropic.mjs` is a strict fake of the native API used by the unit and proxy-integration tests. It is not the real API.
- Write safety is enforced in code, not in the prompt: `guarded-click.ts` replaces page-agent's `click_element_by_index`. Anything inside a `[data-agent-write]` container needs `window.confirm()`, and a submit with empty or invalid required fields is refused with a `NEEDS_INPUT` message first. Unresolvable elements fail closed. New write buttons must carry `data-agent-write`.
- `agent.service.ts` also disables `execute_javascript`, enforces `TOKEN_BUDGET`, masks emails in page content (`masking.ts`), and posts one audit record per step. `window.__demoAgentInfo` is a frozen diagnostic the smoke tests read to assert no script tool and no key in the browser.
- `ask-choice.ts` adds the `ask_choice` tool: the model passes visible option texts, the app shows a drop-down (or checkboxes) and takes single or multiple from the page control that already holds those texts (multi-select or checkbox group means multiple). Page-specific agent hints live in `instructions.ts`. Demo state (work orders, remembered defaults) is client-side only (`src/app/state/`).
- `.claude/commands/live-check.md` is a project slash command for the live run.

## Hard rules

1. Never read, print, copy or log `.env` or any API key. Do not ask the user to paste a key. Settings deny reading `.env`. Settings are in `llm.config.json`, which you can read and edit. Only the key is secret.
2. The key lives only in the proxy. The browser has no key, `connect-src 'self'` CSP blocks direct calls to AI hosts. Keep it that way.
3. Proxy logs are metadata only (times, tokens, status, key NAMES of model output). Never log message content, page content, tool arguments or values.
4. Do not silently repair malformed model output in the proxy or the app. A wrong guess on a write action is the worst failure. Failures must stay visible and traceable. Any repair or retry must be explicit, logged and opt-in.
5. `experimentalScriptExecutionTool` stays off. No CDN demo bundle, no free demo LLM.
6. Synthetic data only. Never add real customer, plant or person data.
7. Do not push to the public fork `singhrohit90/page-agent`. This folder is a standalone copy. Ask before adding any remote.
8. No em dashes in any file. Plain ASCII quotes. All code and comments in English.

## Code style

Tabs, no semicolons, single quotes, explicit types on exported TypeScript APIs. Match the surrounding files. Do not add redundant tests. Prefer a failing test that reproduces a bug before fixing it.

## Verification discipline

Report outcomes faithfully. Mock-mode and fake-server tests do not prove the real Anthropic path works. Only `npm run test:live` and a manual run against the real endpoint do. State clearly which kind of evidence you have.
