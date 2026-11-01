## Session 1 — 2026-11-01

### Done
- Completed the startup read and resolved the local ES-module serving clarification.
- Planned the L1 build and completed the shared login foundation, authenticated ThingsBoard lookup flow, and protected dashboard shell.
- Verified login success/failure, one-time token refresh, session storage, responsive layouts, dashboard guarding, and logout with browser-based mocks.
- At the live-authentication checkpoint, login and user lookup succeeded but device listing returned 403; per developer direction, make the denial explicit and continue with mocked checks.
- Added and re-verified the device-permission-specific login message; normal auth, 403 denial, and refresh paths pass mocked browser checks.
- Local static server is available at `http://127.0.0.1:8765/login.html` for the live-authentication checkpoint.

### Files Changed
- `CLARIFICATIONS.md` — recorded the local static-server answer.
- `DECISION.md` — recorded first-device selection and the logout cleanup event.
- `TASK.md` — tracked plan and completed checks.
- `SESSION.md` — recorded this checkpoint.
- `DemoApp/login.html` — created accessible login form.
- `DemoApp/css/common.css` — created shared design tokens and base styles.
- `DemoApp/css/login.css` — styled responsive login page and error state.
- `DemoApp/js/auth.js` — implemented authentication, token refresh, session storage, and logout.
- `DemoApp/dashboard.html` — created four-widget dashboard shell.
- `DemoApp/css/dashboard.css` — styled responsive dashboard shell.
- `DemoApp/js/dashboard.js` — added session guard and logout handling.

### Next
- Complete Phase 5 requirement/security review and pause at the required human confirmation.
- Ask the instructor to resolve the recorded ThingsBoard device-list permission 403 before live-device verification.

## Telemetry verification checkpoint

### Done
- Completed the live telemetry task with mocked WebSocket messages for sensor readouts, chart, and tilt; invalid/out-of-range values and unrelated keys were verified not to corrupt readings.
- Verified reconnect backoff at 1/2/4/8/16/30/30 seconds, the 10-second connection timeout, and logout cleanup (socket closed, four listeners removed, no pending timers).
- Rechecked dashboard layout at 320/768/1280px. Fixed the tilt readouts to wrap long raw values at 320px without horizontal overflow.
- IDE Problems reported no errors for the telemetry/dashboard files.

### Next
- Implemented and mock-verified LED attribute loading, WebSocket state changes, twoway RPC success, pending-update suppression, and failure rollback; see the following checkpoint.
- Keep live ThingsBoard checks blocked until the instructor resolves the account's device-list 403; do not bypass the permission denial.

## LED control verification checkpoint

### Done
- Added `led-control.js` for initial client-attribute loading, WebSocket state events, and authenticated twoway RPC; wired it into the protected dashboard.
- Missing/invalid attributes and a failed attribute request visibly fall back to OFF. Live updates are ignored while an RPC is pending.
- Mocked RPC success applied the device-returned state; HTTP 504 restored the previous state with “Device not responding.” The request path, method, boolean payload, timeout, and auth header shape match the API contract.
- Added an accessible error icon/message; IDE Problems reported no errors for the LED/dashboard files.

### Files Changed
- `DemoApp/js/led-control.js` — LED attribute, WebSocket, and RPC state handling.
- `DemoApp/js/dashboard.js` — starts LED control with telemetry for authenticated sessions.
- `DemoApp/dashboard.html` — accessible LED status message and error icon.
- `DemoApp/css/dashboard.css` — LED status styling and responsive raw-value wrapping.
- `TASK.md` — marked all Phase 4 tasks complete with mock-verification evidence.

### Next
- Complete the Phase 5 requirement-by-requirement and security review.
- Pause for human confirmation; live ThingsBoard sign-in/device behavior remains unverified until the instructor resolves the account's device-list 403.

## Phase 5 review checkpoint

### Done
- Completed the new telemetry freshness and last-reading-age behavior; mocked checks covered no-data inactivity, stale and fresh timestamps, advancing age, invalid-sample errors, and transition back to stale.
- Updated the customer-device-list 403 guidance to ask the ThingsBoard tenant admin; a mocked 403 verified the message and cleared all five session keys.
- Compared the official `/api/ws` + `authCmd` flow with the live-verified `/api/ws/plugins/telemetry` protocol. Per developer direction, retained the API-contract flow; documented its HIGH residual JWT-in-query risk, mitigations, and the need for a contract update before any future migration.
- Replaced the hard-coded autofill overlay size with a shared CSS design token and re-verified the login page at 320/768/1280px.
- Completed the Phase 5 requirement/security review. All tasks pass; online LED RPC success is still unverified, and the accepted WebSocket URL-token risk is recorded.

### Files Changed
- `DemoApp/dashboard.html` — separate age text from stream errors.
- `DemoApp/css/common.css` — added the autofill overlay design token.
- `DemoApp/css/dashboard.css` — stale/fresh status styling.
- `DemoApp/css/login.css` — uses the shared autofill overlay token.
- `DemoApp/js/telemetry.js` — freshness/age display and no-data inactivity handling.
- `DemoApp/js/auth.js` — updated 403 guidance.
- `CLARIFICATIONS.md` — recorded tenant-admin guidance and approval to retain the contract WebSocket flow.
- `DECISION.md` — documented the accepted WebSocket flow, mitigations, and HIGH residual URL-token risk.
- `TASK.md` — completed all Phase 4 tasks and recorded the Phase 5 requirement/security review.
- `SESSION.md` — recorded this checkpoint.

### Next
- Await developer confirmation at the Human Checkpoint before proceeding to Phase 6.
- The API contract remains unchanged. Online LED RPC success remains unverified; offline RPC 504 and rollback were live-verified.

## Wokwi telemetry re-test checkpoint

### Done
- The developer reported that Wokwi publishes Latest telemetry every second but the dashboard remained STALE with an invalid-data warning; the device also has `fault: "unknown_anomaly"` and `anomaly_score`.
- Confirmed `createSubscription` already sends the contract's exact ten-key `keys` filter. Made telemetry validation explicitly iterate incoming keys and skip unknown keys before validation.
- Mocked the complete ten-sensor message plus the extra fault/anomaly fields: all ten tiles updated, the dashboard stayed LIVE, and no warning appeared. A malformed known key did not prevent a valid sensor key in the same message from updating. Unknown-only messages were ignored without a warning.
- The developer hard-reloaded the local dashboard but reports the live issue persists. They cannot provide sanitized WebSocket frames now; the live payload mismatch is recorded as an open known issue in `TASK.md`.
- IDE Problems reported no errors. Phase 5 remains open.

### Files Changed
- `DemoApp/js/telemetry.js` — explicit known-key filtering during per-key validation.
- `TASK.md` — verified the mixed-key mock and added the unresolved live Wokwi issue.
- `CLARIFICATIONS.md` — recorded the Wokwi report and requested behavior.
- `SESSION.md` — recorded this checkpoint.

### Next
- When available, inspect a sanitized live `subscriptionId: 1` frame and resolve the Wokwi payload mismatch; do not close Phase 5 until the live dashboard shows fresh readings without the warning.

## Phase 6 — 2026-11-01

### Done
- Logged the completed work and verification status. All scoped mock checks pass; Phase 5 remains open due the unresolved live Wokwi telemetry issue and the user-requested live re-test.
- Kept `L1/3api-contract.md` unchanged. The accepted HIGH JWT-in-WebSocket-query risk and mitigations remain documented in `DECISION.md`.

### Bug and finding ledger

| Finding | Status | Prompt/source |
| --- | --- | --- |
| Customer-device list returned 403 for the lab user | Resolved externally when the user added the customer to the “Customer Users” group | User's live-access update; the user then asked to continue the remaining fixes and Phase 5 review. |
| Login credentials could enter the URL | Fixed | User requested POST, unconditional `preventDefault()`, disabled-until-ready submission, query cleanup, and a severity entry in `DECISION.md`. |
| Sensor values lacked consistent three-decimal display | Fixed | User requested three decimals without unit conversion. |
| WebSocket connection alone could imply device activity | Fixed | User requested activity status based on both socket state and telemetry freshness. |
| Old stored telemetry could still appear LIVE without an age | Fixed | User requested LIVE only for fresh readings, STALE for old readings, and a visible last-reading age. |
| Long raw tilt values could overflow the mobile dashboard | Fixed | Found during the requested dashboard breakpoint verification; the L1 requirements specify 320px, 768px, and 1280px layouts. |
| Device-list 403 guidance named the instructor | Fixed | User requested the message say to ask the ThingsBoard tenant admin. |
| WebSocket JWT is carried in the query string | Accepted HIGH residual risk | User requested evaluation of `authCmd`; user confirmed retaining the live-verified API-contract flow, with WSS, short-lived JWT, no URL/token logging, and no `localStorage`; future migration requires a contract update. |
| Autofill shadow size was hard-coded | Fixed | Found during Phase 5 review against the shared CSS-variable requirement; replaced with a common design token. |
| Extra telemetry keys and per-key validation | Mock fixed/verified; live behavior open | User reported Wokwi's `fault: "unknown_anomaly"` and `anomaly_score`, requested the ten-key subscription filter and per-key validation. The filter was already present; explicit unknown-key skipping was added and the mixed-key mock passes. |
| Live Wokwi dashboard remains STALE with an invalid-data warning | Open known issue | User's latest live re-test report; user asked to record it and could not provide WebSocket frames. See the open task in `TASK.md`. |
| Online LED RPC success | Unverified, not a confirmed bug | No live success result was reported; offline RPC 504/rollback is verified. |

### Files Changed
- `DemoApp/js/telemetry.js` — explicit per-key telemetry filtering/validation.
- `TASK.md` — open Wokwi known issue and verification evidence.
- `SESSION.md` — Phase 6 log and bug ledger.

### Next
- Await a sanitized live telemetry frame when available; diagnose and verify the Wokwi issue before closing Phase 5.

### Latest live re-test
- The developer reports the hard-reloaded dashboard still remains STALE with the invalid-data warning.
- The mock verifies the contract-shaped payload, and the source already sends the ten-key filter. The live task is reopened to diagnose the actual server message shape.
- Next: obtain a sanitized outgoing subscription frame and incoming `subscriptionId: 1` frame (preserving field names, value types, and array structure), then adjust and re-test the parser.