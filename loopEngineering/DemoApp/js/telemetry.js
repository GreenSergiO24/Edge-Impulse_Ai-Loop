const WEBSOCKET_URL = "wss://thingsboard.cloud/api/ws/plugins/telemetry";
const CONNECT_TIMEOUT_MS = 10_000;
const HISTORY_WINDOW_MS = 8_000;
const TELEMETRY_STALE_AFTER_MS = 5_000;
const RECONNECT_MAX_MS = 30_000;
const TELEMETRY_KEYS = Object.freeze({
  acc_x: { min: -16, max: 16 },
  acc_y: { min: -16, max: 16 },
  acc_z: { min: -16, max: 16 },
  gyro_x: { min: -2000, max: 2000 },
  gyro_y: { min: -2000, max: 2000 },
  gyro_z: { min: -2000, max: 2000 },
  angle_x: { min: -180, max: 180 },
  angle_y: { min: -180, max: 180 },
  angle_z: { min: -180, max: 180 },
  mpu_temp: { min: -40, max: 85 },
});
const ACCELERATION_KEYS = ["acc_x", "acc_y", "acc_z"];
const accelerationHistory = {
  acc_x: [],
  acc_y: [],
  acc_z: [],
};
const latestNumericValues = {};

let activeSocket = null;
let activeSocketHandlers = null;
let connectionTimeoutId = null;
let reconnectTimeoutId = null;
let drawIntervalId = null;
let freshnessIntervalId = null;
let connectionOpenedAt = null;
let lastTelemetryTimestamp = null;
let reconnectAttempt = 0;
let started = false;

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function setConnectionStatus(state, message) {
  const status = document.querySelector("#connection-status");
  const label = document.querySelector("#connection-label");
  if (status && label) {
    status.dataset.state = state;
    label.textContent = message;
  }
}

function updateConnectionStatus(now = Date.now()) {
  if (!started) {
    return;
  }

  if (activeSocket?.readyState === WebSocket.OPEN) {
    if (connectionOpenedAt === null) {
      connectionOpenedAt = now;
    }
    const telemetryAge = lastTelemetryTimestamp === null
      ? null
      : Math.max(0, now - lastTelemetryTimestamp);
    if (telemetryAge !== null && telemetryAge <= TELEMETRY_STALE_AFTER_MS) {
      setConnectionStatus("connected", "Device active");
    } else if (telemetryAge !== null
      || (connectionOpenedAt !== null && now - connectionOpenedAt > TELEMETRY_STALE_AFTER_MS)) {
      setConnectionStatus("inactive", "Device inactive");
    } else {
      setConnectionStatus("connecting", "Waiting for telemetry");
    }
    return;
  }

  if (reconnectTimeoutId !== null) {
    setConnectionStatus("reconnecting", "Connection interrupted — retrying");
  } else if (activeSocket?.readyState === WebSocket.CONNECTING) {
    setConnectionStatus("connecting", "Connecting to device");
  } else {
    setConnectionStatus("disconnected", "Device disconnected");
  }
}

function updateTelemetryFreshness(now = Date.now()) {
  const lastUpdated = document.querySelector("#last-updated");
  if (lastTelemetryTimestamp === null) {
    setLiveStatus("connecting", "WAITING");
    if (lastUpdated) {
      lastUpdated.textContent = "No telemetry received yet";
    }
    return;
  }

  const ageMs = Math.max(0, now - lastTelemetryTimestamp);
  const totalSeconds = Math.floor(ageMs / 1000);
  const ageText = totalSeconds < 60
    ? `${totalSeconds} second${totalSeconds === 1 ? "" : "s"}`
    : `${Math.floor(totalSeconds / 60)} min ${totalSeconds % 60} sec`;
  const isFresh = ageMs <= TELEMETRY_STALE_AFTER_MS;

  setLiveStatus(isFresh ? "connected" : "stale", isFresh ? "LIVE" : "STALE");
  if (lastUpdated) {
    lastUpdated.textContent = `Last reading ${ageText} ago`;
  }
}

function setStreamStatus(state, message) {
  const summary = document.querySelector(".stream-summary");
  const streamMessage = document.querySelector("#stream-message");
  if (summary) {
    summary.dataset.state = state;
  }
  if (streamMessage) {
    const shouldShowMessage = state === "error" || state === "reconnecting";
    streamMessage.textContent = shouldShowMessage ? message : "";
    streamMessage.hidden = !shouldShowMessage;
  }
}

function setLiveStatus(state, message) {
  const status = document.querySelector("#telemetry-live-status");
  const label = document.querySelector("#telemetry-live-label");
  if (status && label) {
    status.dataset.state = state;
    label.textContent = message;
  }
}

function clearConnectionTimeout() {
  if (connectionTimeoutId !== null) {
    clearTimeout(connectionTimeoutId);
    connectionTimeoutId = null;
  }
}

function clearReconnectTimeout() {
  if (reconnectTimeoutId !== null) {
    clearTimeout(reconnectTimeoutId);
    reconnectTimeoutId = null;
  }
}

function detachSocketHandlers(socket) {
  if (activeSocketHandlers === null) {
    return;
  }

  socket.removeEventListener("open", activeSocketHandlers.open);
  socket.removeEventListener("message", activeSocketHandlers.message);
  socket.removeEventListener("error", activeSocketHandlers.error);
  socket.removeEventListener("close", activeSocketHandlers.close);
  activeSocketHandlers = null;
}

function scheduleReconnect(message) {
  if (!started || reconnectTimeoutId !== null) {
    return;
  }

  const delay = Math.min(1000 * (2 ** reconnectAttempt), RECONNECT_MAX_MS);
  reconnectAttempt += 1;
  setConnectionStatus("reconnecting", "Connection interrupted — retrying");
  setStreamStatus("reconnecting", message);
  updateTelemetryFreshness();
  reconnectTimeoutId = setTimeout(() => {
    reconnectTimeoutId = null;
    connect();
  }, delay);
}

function finishFailedConnection(socket, message) {
  if (!started || socket !== activeSocket) {
    return;
  }

  clearConnectionTimeout();
  detachSocketHandlers(socket);
  activeSocket = null;
  connectionOpenedAt = null;

  if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
    socket.close();
  }

  scheduleReconnect(message);
}

function createSubscription(deviceId) {
  return {
    tsSubCmds: [{
      entityType: "DEVICE",
      entityId: deviceId,
      scope: "LATEST_TELEMETRY",
      keys: Object.keys(TELEMETRY_KEYS).join(","),
      cmdId: 1,
    }],
    historyCmds: [],
    attrSubCmds: [{
      entityType: "DEVICE",
      entityId: deviceId,
      scope: "CLIENT_SCOPE",
      keys: "led_state",
      cmdId: 2,
    }],
  };
}

function updateSensorOutput(key, numericValue) {
  latestNumericValues[key] = numericValue;
  const displayValue = numericValue.toFixed(3);
  for (const output of document.querySelectorAll("[data-sensor-key]")) {
    if (output.dataset.sensorKey === key) {
      output.textContent = displayValue;
    }
  }
}

function updateTiltIndicator() {
  const x = latestNumericValues.acc_x;
  const y = latestNumericValues.acc_y;
  const dot = document.querySelector("#tilt-dot");
  const gauge = document.querySelector("#tilt-gauge");

  if (!Number.isFinite(x) || !Number.isFinite(y) || !dot || !gauge) {
    return;
  }

  const xPosition = Math.max(0, Math.min(100, (x + 1) * 50));
  const yPosition = 100 - Math.max(0, Math.min(100, (y + 1) * 50));
  dot.style.left = `${xPosition}%`;
  dot.style.top = `${yPosition}%`;
  gauge.setAttribute("aria-label", `Sensor tilt. X ${x.toFixed(2)}g, Y ${y.toFixed(2)}g.`);
}

function pruneHistory(now) {
  const cutoff = now - HISTORY_WINDOW_MS;
  for (const key of ACCELERATION_KEYS) {
    accelerationHistory[key] = accelerationHistory[key].filter(
      (point) => point.timestamp >= cutoff && point.timestamp <= now,
    );
  }
}

function applyTelemetryData(data) {
  if (!isRecord(data)) {
    return { validSamples: 0, invalidSamples: true };
  }

  let validSamples = 0;
  let invalidSamples = false;
  const now = Date.now();

  for (const [key, entries] of Object.entries(data)) {
    if (!Object.hasOwn(TELEMETRY_KEYS, key)) {
      continue;
    }
    const range = TELEMETRY_KEYS[key];
    if (!Array.isArray(entries)) {
      invalidSamples = true;
      continue;
    }

    for (const entry of entries) {
      if (!Array.isArray(entry) || entry.length < 2) {
        invalidSamples = true;
        continue;
      }

      const [timestamp, rawValue] = entry;
      if (!Number.isFinite(timestamp) || timestamp < 0
        || timestamp > now + TELEMETRY_STALE_AFTER_MS
        || typeof rawValue !== "string" || rawValue.trim() === "") {
        invalidSamples = true;
        continue;
      }

      const numericValue = Number(rawValue);
      if (!Number.isFinite(numericValue) || numericValue < range.min || numericValue > range.max) {
        invalidSamples = true;
        continue;
      }

      updateSensorOutput(key, numericValue);
      const effectiveTimestamp = Math.min(timestamp, now);
      lastTelemetryTimestamp = Math.max(
        lastTelemetryTimestamp ?? effectiveTimestamp,
        effectiveTimestamp,
      );
      if (ACCELERATION_KEYS.includes(key)) {
        accelerationHistory[key].push({ timestamp, value: numericValue });
      }
      validSamples += 1;
    }
  }

  pruneHistory(now);
  updateTiltIndicator();
  return { validSamples, invalidSamples };
}

function handleTelemetryMessage(data) {
  const result = applyTelemetryData(data);
  updateConnectionStatus();
  updateTelemetryFreshness();
  if (result.validSamples > 0) {
    const loading = document.querySelector("#telemetry-loading");
    const loadingText = document.querySelector("#telemetry-loading-text");
    const hasRecentAcceleration = ACCELERATION_KEYS.some(
      (key) => accelerationHistory[key].length > 0,
    );
    if (hasRecentAcceleration && loading) {
      loading.hidden = true;
    } else if (loadingText) {
      loadingText.textContent = "Waiting for recent acceleration data";
    }

    if (result.invalidSamples) {
      setStreamStatus("error", "Invalid samples ignored; last valid readings are shown.");
    } else {
      setStreamStatus("connected", "");
    }
    return;
  }

  if (result.invalidSamples) {
    setStreamStatus("error", "Invalid sensor data ignored; waiting for valid readings.");
  }
}

function handleAttributeMessage(data) {
  if (!isRecord(data) || data.led_state === undefined) {
    return;
  }

  if (!Array.isArray(data.led_state)) {
    setStreamStatus("error", "Invalid device attribute ignored.");
    return;
  }

  for (const entry of data.led_state) {
    if (!Array.isArray(entry) || entry.length < 2 || !Number.isFinite(entry[0])) {
      setStreamStatus("error", "Invalid device attribute ignored.");
      continue;
    }

    const rawState = entry[1];
    if (rawState !== "true" && rawState !== "false") {
      setStreamStatus("error", "Invalid device attribute ignored.");
      continue;
    }
    window.dispatchEvent(new CustomEvent("motion-lab:led-state", {
      detail: rawState === "true",
    }));
  }
}

function handleSocketMessage(event) {
  if (typeof event.data !== "string") {
    setStreamStatus("error", "Unreadable device data ignored; last valid readings are shown.");
    return;
  }

  let message;
  try {
    message = JSON.parse(event.data);
  } catch {
    setStreamStatus("error", "Unreadable device data ignored; last valid readings are shown.");
    return;
  }

  if (!isRecord(message)) {
    setStreamStatus("error", "Unexpected device data ignored.");
    return;
  }
  if (message.errorCode !== undefined
    && (!Number.isInteger(message.errorCode) || message.errorCode !== 0)) {
    setStreamStatus("error", "ThingsBoard could not provide the requested device data.");
    return;
  }

  if (message.subscriptionId === 1) {
    handleTelemetryMessage(message.data);
  } else if (message.subscriptionId === 2) {
    handleAttributeMessage(message.data);
  }
}

function connect() {
  if (!started) {
    return;
  }

  const token = sessionStorage.getItem("token");
  const deviceId = sessionStorage.getItem("deviceId");
  if (!isNonEmptyString(token) || !isNonEmptyString(deviceId)) {
    setConnectionStatus("disconnected", "Session unavailable");
    setStreamStatus("error", "Sign in again to reconnect to the device.");
    return;
  }

  setConnectionStatus("connecting", "Connecting to device");
  setStreamStatus("connecting", "");
  updateTelemetryFreshness();

  let socket;
  try {
    socket = new WebSocket(`${WEBSOCKET_URL}?token=${encodeURIComponent(token)}`);
  } catch {
    scheduleReconnect("Unable to open the device connection; retrying.");
    return;
  }

  activeSocket = socket;
  const handlers = {
    open: () => {
      if (!started || activeSocket !== socket) {
        return;
      }
      clearConnectionTimeout();
      reconnectAttempt = 0;
      connectionOpenedAt = Date.now();
      updateConnectionStatus();
      setStreamStatus("connected", "");
      updateTelemetryFreshness();

      try {
        socket.send(JSON.stringify(createSubscription(deviceId)));
      } catch {
        finishFailedConnection(socket, "Unable to subscribe to device data; retrying.");
      }
    },
    message: handleSocketMessage,
    error: () => {
      finishFailedConnection(socket, "Connection error; reconnecting.");
    },
    close: () => {
      finishFailedConnection(socket, "Device connection closed; reconnecting.");
    },
  };
  activeSocketHandlers = handlers;
  socket.addEventListener("open", handlers.open);
  socket.addEventListener("message", handlers.message);
  socket.addEventListener("error", handlers.error);
  socket.addEventListener("close", handlers.close);

  connectionTimeoutId = setTimeout(() => {
    connectionTimeoutId = null;
    if (socket.readyState === WebSocket.CONNECTING) {
      finishFailedConnection(socket, "Connection timed out; retrying.");
    }
  }, CONNECT_TIMEOUT_MS);
}

function handleLogout() {
  stopTelemetry();
}

function updateFreshness() {
  const now = Date.now();
  updateConnectionStatus(now);
  updateTelemetryFreshness(now);
}

export function stopTelemetry() {
  if (!started) {
    return;
  }

  started = false;
  clearConnectionTimeout();
  clearReconnectTimeout();
  if (drawIntervalId !== null) {
    clearInterval(drawIntervalId);
    drawIntervalId = null;
  }
  if (freshnessIntervalId !== null) {
    clearInterval(freshnessIntervalId);
    freshnessIntervalId = null;
  }
  window.removeEventListener("motion-lab:logout", handleLogout);
  window.removeEventListener("pagehide", stopTelemetry);

  if (activeSocket !== null) {
    const socket = activeSocket;
    detachSocketHandlers(socket);
    activeSocket = null;
    if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
      socket.close();
    }
  }
}

function renderChart() {
  const canvas = document.querySelector("#acceleration-chart");
  const context = canvas?.getContext("2d");
  if (!canvas || !context) {
    return;
  }

  const bounds = canvas.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) {
    return;
  }

  const now = Date.now();
  pruneHistory(now);
  const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
  const pixelWidth = Math.round(bounds.width * pixelRatio);
  const pixelHeight = Math.round(bounds.height * pixelRatio);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, bounds.width, bounds.height);

  const series = ACCELERATION_KEYS.map((key) => accelerationHistory[key]);
  const values = series.flatMap((points) => points.map((point) => point.value));
  if (values.length === 0) {
    return;
  }

  let minimum = Math.min(...values);
  let maximum = Math.max(...values);
  const padding = Math.max((maximum - minimum) * 0.15, 0.15);
  minimum = Math.max(-16, minimum - padding);
  maximum = Math.min(16, maximum + padding);
  if (maximum <= minimum) {
    maximum = Math.min(16, minimum + 0.3);
    minimum = Math.max(-16, maximum - 0.3);
  }

  const cutoff = now - HISTORY_WINDOW_MS;
  const colors = getComputedStyle(document.documentElement);
  context.lineWidth = 2;
  context.lineCap = "round";
  context.lineJoin = "round";

  for (let index = 0; index < ACCELERATION_KEYS.length; index += 1) {
    const key = ACCELERATION_KEYS[index];
    const points = accelerationHistory[key]
      .filter((point) => point.timestamp >= cutoff && point.timestamp <= now)
      .sort((left, right) => left.timestamp - right.timestamp);
    if (points.length === 0) {
      continue;
    }

    context.strokeStyle = colors.getPropertyValue(`--color-axis-${key.slice(-1)}`).trim();
    context.fillStyle = context.strokeStyle;
    context.beginPath();
    for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
      const point = points[pointIndex];
      const x = Math.max(0, Math.min(bounds.width, ((point.timestamp - cutoff) / HISTORY_WINDOW_MS) * bounds.width));
      const y = bounds.height - ((point.value - minimum) / (maximum - minimum)) * bounds.height;
      if (pointIndex === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    }
    if (points.length === 1) {
      const point = points[0];
      const x = Math.max(0, Math.min(bounds.width, ((point.timestamp - cutoff) / HISTORY_WINDOW_MS) * bounds.width));
      const y = bounds.height - ((point.value - minimum) / (maximum - minimum)) * bounds.height;
      context.arc(x, y, 2.5, 0, Math.PI * 2);
      context.fill();
    } else {
      context.stroke();
    }
  }
}

export function startTelemetry() {
  if (started) {
    return;
  }

  started = true;
  window.addEventListener("motion-lab:logout", handleLogout);
  window.addEventListener("pagehide", stopTelemetry);
  drawIntervalId = setInterval(renderChart, 100);
  freshnessIntervalId = setInterval(updateFreshness, 1000);
  connect();
}
