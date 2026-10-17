Run a live check of the demo against the configured model and report faithfully.

1. Confirm `.env` exists without reading it: check only that the file is present. Read `llm.config.json` for provider, model, mode and strict settings (it has no secret). Never open `.env`.
2. Make sure the proxy is not already running, then run `npm run test:unit` and `npm run build`.
3. Ask the user to run `npm start` in their own terminal and send the exact prompt result, or run `npm run test:live` if `llm.config.json` has `"mode": "live"`.
4. Read the last 20 lines of `logs/proxy.log`. For each failing call, quote the `llm_request_shape` and `llm_response_shape` lines (key names only) and the `errorType`.
5. Summarize: what was sent, what the model returned (actionKeys), which task failed, and the single most likely cause. Propose one minimal fix with a failing test first. Do not repair model output silently.
6. State plainly whether the evidence is from the real endpoint or from a fake server.
