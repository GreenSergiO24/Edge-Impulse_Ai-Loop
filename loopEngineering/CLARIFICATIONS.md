## 2026-11-01 Launch mode

- **Question**: How should the app launch when `login.html` is intended to be opened directly but JavaScript ES modules generally require HTTP serving?
- **Answer**: Keep ES modules and use a minimal local static server.
- **Impact**: `DemoApp/` launch and verification; do not replace modules with classic scripts for `file://` support.

## 2026-11-01 Device access denial

- **Question**: What should the login flow show when the customer device-list request is forbidden?
- **Answer**: Show “This account has no permission to view devices — ask your instructor to assign a device.” Continue the remaining work with mocked checks until the instructor fixes the permission.
- **Impact**: `DemoApp/js/auth.js` device lookup error handling and live-authentication verification.

## 2026-11-01 Live ThingsBoard access restored

- **Question**: Was the customer-device permission issue resolved, and what was verified live?
- **Answer**: The customer user was added to the “Customer Users” group. In Chrome, login → dashboard succeeded; the telemetry WebSocket returned 101, the CLIENT_SCOPE attribute request returned 200, and an LED command while the device was offline returned RPC 504, displayed “Device not responding,” and reverted the toggle.
- **Impact**: Live verification is now available for the dashboard. The observed offline RPC failure behavior is verified; online RPC success remains unverified.

## 2026-11-01 Device-permission guidance update

- **Question**: Who should a user contact when the customer-device-list request returns 403?
- **Answer**: Tell the user to ask the ThingsBoard tenant admin.
- **Impact**: Update the login flow's device-permission message and verify the 403 flow leaves no partial session.

## 2026-11-01 WebSocket authentication flow

- **Question**: Should the dashboard replace the contract's plugin telemetry WebSocket with the documented `/api/ws` + `authCmd` flow?
- **Answer**: Keep the current contract flow; `L1/3api-contract.md` is the source of truth and the existing flow is live-verified.
- **Impact**: Keep the runtime endpoint and subscription protocol unchanged; document the JWT-in-query residual risk and mitigations in `DECISION.md`. An `authCmd` migration requires an API-contract update first.

## 2026-11-01 Wokwi telemetry key filtering

- **Question**: Why does the live Wokwi stream remain STALE while reporting invalid sensor data, and how should extra telemetry keys be handled?
- **Answer**: Keep a `keys` filter for the ten MPU telemetry keys and validate samples per key so unrelated `fault` text and `anomaly_score` do not invalidate valid sensor readings.
- **Impact**: A focused mock passed with the mixed payload; the developer will re-test the updated dashboard against Wokwi before Phase 5 is closed.