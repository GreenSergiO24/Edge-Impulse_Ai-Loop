- [x] Create shared styles and login page
  - Verify: through the local static server, the username and password fields plus “Login to Dashboard” render and remain usable at 320px, 768px, and 1280px; shared design values are CSS custom properties and the page has visible focus states.
  - Check: PASS — browser verified no horizontal overflow at all three widths, 48px controls, associated labels, and keyboard focus outline; Problems reported no errors.
- [x] Implement authentication and login flow
  - Verify: mocked API responses exercise login → current user → first customer device → device credentials; valid data is stored only in `sessionStorage` and routes to the dashboard, failures show friendly errors including a device-step 403 permission message, and a protected API request retries once after a successful refresh.
- Check: PASS — re-ran the four-call success flow, login 401/no retry, protected 401/one refresh plus one retry, and device-list 403 with the specific accessible message and cleared partial session; Problems reported no errors.
- [x] Create protected dashboard shell and logout
  - Verify: a missing session redirects to login; an authenticated session renders all four dashboard regions and Logout at 320px, 768px, and 1280px; logout clears all five session keys and returns to login. WebSocket cleanup is verified with the live-data task.
  - Check: PASS — browser verified the no-session redirect, four dashboard panels, ten unique sensor keys, no horizontal overflow at 320/768/1280px, 48px controls, and logout clearing all five credentials; Problems reported no errors.
- [x] Implement live telemetry widgets and WebSocket resilience
  - Verify: mocked WebSocket messages update all nine sensor tiles, the 8-second canvas chart and tilt indicator; invalid/out-of-range values do not corrupt displays, unrelated keys are ignored, disconnects reconnect with exponential backoff capped at 30 seconds, and logout closes the socket and clears listeners/timers.
  - Check: PASS — mock messages updated the sensor readouts/chart/tilt; out-of-range and nonnumeric values were ignored while preserving the last valid readings, and an unrelated key had no effect. Reconnect delays were 1/2/4/8/16/30/30 seconds; the 10-second connection timeout triggered retry and logout cleanup closed the socket, removed four listeners, and left no timers. Dashboard fit 320/768/1280px after fixing long tilt values to wrap without horizontal overflow; Problems reported no errors.
- [x] Implement LED state and RPC control
  - Verify: startup client attributes set the initial switch state (missing/invalid means OFF); WebSocket state updates are reflected unless an RPC is pending; successful RPC uses the contract method/payload and failures restore the prior state with a friendly message.
  - Check: PASS — mocked initial `led_state: true` set ON; an invalid value and HTTP 403 both showed OFF with a visible message. WebSocket changes updated the switch, a change during RPC was ignored, and successful twoway RPC used `setLed`, a boolean `params`, 5000ms timeout, and the authenticated API helper. The returned state was applied; HTTP 504 restored the previous state and showed “Device not responding.” The developer also verified login → dashboard, WebSocket 101, CLIENT_SCOPE 200, and offline RPC 504 with UI rollback in Chrome. Online RPC success remains unverified.

- [x] Prevent login credentials from entering the URL
  - Verify: the form declares `method="post"`, the submit handler always prevents default submission, the button stays disabled until JavaScript is ready, and loading `login.html` with a query string removes it via `history.replaceState`; mocked login still works and no credential appears in the resulting URL.
- Check: PASS — loaded `login.html` with sentinel query parameters; the query was removed before interaction, the form method was POST, and the submit control enabled after handler setup. Mocked login completed through all four REST calls and landed on `dashboard.html` without a query string; token data was not logged or placed in the URL.
- [x] Format sensor readouts to three decimals
  - Verify: all numeric sensor and tilt readouts display exactly three fractional digits without changing the underlying telemetry values or units.
- Check: PASS — mocked values with more than three decimals were rendered to three decimal places in all nine sensor tiles and both tilt readouts. Tilt coordinates matched the original numeric inputs, confirming display formatting did not alter calculations or units.
- [x] Reflect device activity in the connection badge
  - Verify: WebSocket connection alone does not mark the device active; fresh telemetry marks it active, while an open socket with stale or absent telemetry marks it inactive; WebSocket loss/reconnect remains distinguishable.
- Check: PASS — an open socket showed “Waiting for telemetry,” stale stored telemetry showed “Device inactive,” fresh telemetry showed “Device active,” and the badge returned to inactive after 6.5 seconds without another reading. A WebSocket close produced the distinct reconnecting state.
- [x] Show telemetry freshness and last-reading age
  - Verify: fresh telemetry displays LIVE, stale stored telemetry displays STALE, and the age text advances from the timestamp of the last valid reading.
- Check: PASS — mocked no-data connection became inactive after the grace period; a 20-second-old sample displayed STALE and its age; a current sample displayed LIVE with advancing age; invalid samples showed a separate stream error without resetting age; after six seconds the reading became STALE and the device inactive. A timestamp four seconds in the future was normalized to receipt time and became stale after the normal freshness interval. Problems reported no errors.
- [x] Update device-permission guidance
  - Verify: a customer-device-list 403 displays “ask the ThingsBoard tenant admin” and does not leave a partial session.
- Check: PASS — mocked login and user lookup followed by a customer-device-list 403 displayed the requested tenant-admin guidance; all five session keys were cleared. The request sequence stopped after the 403; IDE Problems reported no errors.
- [x] Evaluate ThingsBoard WebSocket authCmd
  - Verify: compare the official `authCmd` flow with the currently live-verified plugin telemetry endpoint, document the security tradeoff, protocol changes, and decision in `DECISION.md`, and keep the selected authentication/subscription flow consistent with the decision.
- Check: PASS — official documentation was compared with the contract's plugin telemetry endpoint. A browser mock confirmed the runtime uses WSS, passes the JWT in the query, and sends the expected `tsSubCmds`/`attrSubCmds` protocol. The developer confirmed retaining the contract flow; the HIGH residual risk, mitigations, and future contract-update requirement are recorded in `DECISION.md` and `CLARIFICATIONS.md`.

- [x] Replace the hard-coded autofill shadow size with a design token
  - Verify: the autofill shadow dimension is a CSS custom property, and the login page keeps its existing autofill styling with no horizontal overflow at 320px, 768px, and 1280px.
- Check: PASS — cache-busted browser stylesheets confirmed the root token resolves to `62.5rem` and the autofill rule consumes it. Login layout had no horizontal overflow at 320/768/1280px; form controls remained 48px tall and the form remained POST. Problems reported no errors.
- [x] Ignore unrelated telemetry keys without blocking valid samples
  - Verify: `tsSubCmds` requests exactly the ten MPU keys from the API contract; a mocked telemetry message containing valid MPU readings plus `fault: "unknown_anomaly"` and `anomaly_score` updates the sensors and stays LIVE without an invalid-data warning. A malformed known key is ignored without preventing other valid keys in the same message from updating.
- Check: MOCK PASS — the serialized subscription requests the ten contract keys (the filter was already present and is retained). Mocked mixed-key data updates all sensors and stays LIVE without a warning; a malformed known key does not block valid samples. IDE Problems reports no errors.
- [ ] Resolve live Wokwi telemetry freshness warning (known issue)
  - Verify: on the local dashboard with Wokwi publishing Latest telemetry every second, valid MPU readings advance, the dashboard becomes LIVE, and no invalid-data warning appears when the message also contains `fault: "unknown_anomaly"` and `anomaly_score`.
- Evidence: OPEN — the developer hard-reloaded the local dashboard and reports it still remains STALE with “Invalid sensor data ignored; waiting for valid readings,” despite one-second ThingsBoard updates. The contract-shaped mixed-key mock passes and the ten-key subscription filter is present. The developer cannot provide sanitized WebSocket frames now, so the actual live payload mismatch remains undiagnosed.

## Phase 5 Review — 2026-11-01

| Requirement area | Result | Evidence |
| --- | --- | --- |
| Login page and authentication | PASS | Labeled username/password form and POST mode verified. Browser mocks covered the four-call login chain, invalid credentials, token refresh/retry, customer-device 403 guidance, session cleanup, and query removal. |
| Protected dashboard and logout | PASS | Missing-session redirect, all four dashboard regions, and clearing all five `sessionStorage` keys were verified. Logout closes the WebSocket and clears timers/listeners. |
| Telemetry chart, values, tilt, and unknown keys | MOCK PASS; LIVE RETEST PENDING | Mocked updates covered all sensor values, 8-second canvas history, axis values, tilt mapping, three-decimal display, invalid/out-of-range values, unrelated keys, and stale/fresh status. A new Wokwi report says live values remain STALE with an invalid-data warning; the developer requested a live re-test after per-key validation. |
| LED control | PASS, live success unverified | Attribute initialization, live updates, pending-RPC suppression, mocked success, and failure rollback passed. Live login, WebSocket 101, CLIENT_SCOPE 200, and offline RPC 504/rollback were reported by the developer; live online RPC success remains unverified. |
| API contract and WebSocket resilience | PASS | Request paths/payloads, current plugin telemetry URL and subscription shape, timeouts, one-time refresh, reconnect backoff, connection timeout, and resource cleanup were verified against the read-only contract. |
| Responsive/UI standards | PASS | Login and dashboard had no horizontal overflow at 320/768/1280px; primary controls remained at least 44px. CSS variables, shared styles, focus state, and autofill token use were checked. |
| Backend/security standards | PASS WITH ACCEPTED RISK | No `innerHTML`, `outerHTML`, unsafe HTML insertion, console logging, or `localStorage` use found. Server values are validated and rendered with text APIs. The developer approved retaining the contract's WSS WebSocket flow; the HIGH JWT-in-query residual risk and mitigations are recorded in `DECISION.md`. |
| Syntax/errors | PASS | IDE Problems reports no errors for `DemoApp`; browser-loaded modules passed behavior checks. A standalone Node syntax check could not run because Node is unavailable in this environment. |

**Overall:** Phase 5 remains open because the live Wokwi re-test still fails. The focused mock passes; diagnose the actual live message before closing the review. The accepted WebSocket URL-token risk remains documented.