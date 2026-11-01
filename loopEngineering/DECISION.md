## 2026-11-01 Customer device selection

- **Context**: The API contract notes a possible device-name filter, while the requirement excludes a device picker and says to use the customer's first device.
- **Decision**: Use the first device returned by the customer's device list.
- **Alternatives**: Filter by device name or add a device picker; neither is needed for the stated L1 scope.

## 2026-11-01 Logout cleanup signal

- **Context**: Logout must release WebSocket resources without coupling authentication code to the telemetry transport.
- **Decision**: Dispatch `motion-lab:logout` before clearing credentials and redirecting; the live-data module will close its socket and timers when it receives the event.
- **Alternatives**: Importing the telemetry module directly into authentication code would couple session management to one transport.

## 2026-11-01 Login credential URL exposure — HIGH severity

- **Context**: Review found that the login form could submit with the default GET method, placing username and password query parameters in the URL, browser history, and request logs.
- **Decision**: Treat this as HIGH severity and prevent native form submission: declare POST, always call `preventDefault()`, keep submit disabled until the module installs its handler, and remove any existing query string from the current history entry on load.
- **Alternatives**: Relying only on the JavaScript submit handler leaves a window where credentials can be submitted by the browser before the module initializes; relying only on `method="post"` does not remove previously leaked query parameters.

## 2026-11-01 Device telemetry freshness threshold

- **Context**: A successful WebSocket handshake only proves the browser is connected to ThingsBoard; it does not prove the device is publishing telemetry. The device normally publishes at 1 Hz and the simulator has been observed near 2-second intervals.
- **Decision**: Treat telemetry no older than 5 seconds as fresh. Show an initial waiting state for up to 5 seconds after WebSocket open, then mark the device inactive until a fresh valid sensor sample arrives.
- **Alternatives**: Marking the device active as soon as the WebSocket opens confuses platform connectivity with device activity; a 2–3 second cutoff would mark the slower simulator stale between normal updates.

## 2026-11-01 ThingsBoard WebSocket authCmd evaluation

- **Context**: The live-verified L1 contract uses `wss://thingsboard.cloud/api/ws/plugins/telemetry?token=...` with `tsSubCmds` and `attrSubCmds`. The [official WebSocket API](https://thingsboard.io/docs/reference/websocket-api/) also documents `wss://thingsboard.cloud/api/ws`, an initial `authCmd` carrying the JWT in a WebSocket frame, and `cmds` messages for telemetry and attribute operations.
- **Risk assessment**: HIGH — the query parameter is a bearer JWT and may be captured by infrastructure that records complete WebSocket request URLs. No disclosure was observed; exploitability depends on URL logging and token validity.
- **Decision**: Keep the current `/api/ws/plugins/telemetry` flow because `L1/3api-contract.md` is the source of truth and this exact flow is live-verified. Mitigate exposure by requiring WSS, using the short-lived session JWT only from `sessionStorage`, never logging the WebSocket URL or token, and never storing the token in `localStorage`. These controls do not eliminate logging by external infrastructure; retain the HIGH residual-risk assessment.
- **Alternatives**: Migrate to the documented `/api/ws` + `authCmd` flow, which moves the JWT out of the request URL and into a TLS-protected WebSocket frame but does not hide it from the browser/client or ThingsBoard endpoint. This requires a contract update before changing the endpoint, subscription requests, and response parsing, followed by mock and live verification.