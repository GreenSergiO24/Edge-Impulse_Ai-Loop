import { apiRequest } from "./auth.js";

const ATTRIBUTE_PATH = "/api/plugins/telemetry/DEVICE";
const RPC_TIMEOUT_MS = 5000;

let button = null;
let stateLabel = null;
let statusContainer = null;
let statusMessage = null;
let ledState = false;
let started = false;
let initialized = false;
let rpcPending = false;
let hasLiveAttribute = false;

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function setLedState(state) {
  ledState = state;
  if (button) {
    button.setAttribute("aria-checked", String(state));
  }
  if (stateLabel) {
    stateLabel.textContent = state ? "ON" : "OFF";
    stateLabel.dataset.state = state ? "on" : "off";
  }
}

function setStatus(message) {
  if (!statusContainer || !statusMessage) {
    return;
  }
  statusMessage.textContent = message;
  statusContainer.hidden = message === "";
}

function handleLiveState(event) {
  if (!started || typeof event.detail !== "boolean" || rpcPending) {
    return;
  }

  hasLiveAttribute = true;
  setLedState(event.detail);
  setStatus("");
}

function initialState(attributes) {
  if (!Array.isArray(attributes)) {
    return null;
  }

  const attribute = attributes.find(
    (item) => isRecord(item) && item.key === "led_state",
  );
  return isRecord(attribute) && typeof attribute.value === "boolean"
    ? attribute.value
    : null;
}

async function loadInitialState() {
  const deviceId = sessionStorage.getItem("deviceId");

  try {
    if (typeof deviceId !== "string" || deviceId.trim() === "") {
      throw new Error("Missing device ID");
    }

    const attributes = await apiRequest(
      `${ATTRIBUTE_PATH}/${encodeURIComponent(deviceId)}/values/attributes/CLIENT_SCOPE`,
    );
    if (!started) {
      return;
    }

    const state = initialState(attributes);
    if (!hasLiveAttribute) {
      setLedState(state ?? false);
      if (state === null) {
        setStatus("No valid LED state found; showing OFF.");
      }
    }
  } catch {
    if (started && !hasLiveAttribute) {
      setLedState(false);
      setStatus("Unable to load LED state; showing OFF.");
    }
  } finally {
    if (started) {
      initialized = true;
      if (button) {
        button.disabled = false;
      }
    }
  }
}

function rpcErrorMessage(error) {
  const status = typeof error === "object" && error !== null && "status" in error
    ? error.status
    : undefined;
  const kind = typeof error === "object" && error !== null && "kind" in error
    ? error.kind
    : undefined;

  if (status === 504 || status === 408) {
    return "Device not responding.";
  }
  if (kind === "timeout") {
    return "Connection timed out.";
  }
  if (status === 401) {
    return "Your session expired. Please sign in again.";
  }
  if (kind === "network") {
    return "Unable to reach ThingsBoard. Please try again.";
  }
  return "Command failed — retry.";
}

async function sendLedCommand() {
  if (!started || !initialized || rpcPending) {
    return;
  }

  const previousState = ledState;
  const requestedState = !previousState;
  const deviceId = sessionStorage.getItem("deviceId");
  if (typeof deviceId !== "string" || deviceId.trim() === "") {
    setStatus("Unable to send the LED command. Please sign in again.");
    return;
  }

  rpcPending = true;
  if (button) {
    button.disabled = true;
  }
  setStatus("");
  setLedState(requestedState);

  try {
    const response = await apiRequest(
      `/api/rpc/twoway/${encodeURIComponent(deviceId)}`,
      {
        method: "POST",
        body: {
          method: "setLed",
          params: requestedState,
          timeout: RPC_TIMEOUT_MS,
        },
      },
    );
    if (!started) {
      return;
    }

    if (!isRecord(response) || response.success !== true
      || typeof response.led_state !== "boolean") {
      setLedState(previousState);
      setStatus("Command failed — retry.");
      return;
    }

    setLedState(response.led_state);
  } catch (error) {
    if (!started) {
      return;
    }
    setLedState(previousState);
    setStatus(rpcErrorMessage(error));
  } finally {
    if (started) {
      rpcPending = false;
      if (button) {
        button.disabled = !initialized;
      }
    }
  }
}

function handleLogout() {
  stopLedControl();
}

export function stopLedControl() {
  if (!started) {
    return;
  }

  started = false;
  window.removeEventListener("motion-lab:led-state", handleLiveState);
  window.removeEventListener("motion-lab:logout", handleLogout);
  window.removeEventListener("pagehide", stopLedControl);
  if (button) {
    button.removeEventListener("click", sendLedCommand);
    button.disabled = true;
  }
  rpcPending = false;
}

export function startLedControl() {
  if (started) {
    return Promise.resolve();
  }

  button = document.querySelector("#led-switch");
  stateLabel = document.querySelector("#led-state-label");
  statusContainer = document.querySelector("#led-status");
  statusMessage = document.querySelector("#led-status-text");
  if (!(button instanceof HTMLButtonElement) || !stateLabel || !statusContainer || !statusMessage) {
    throw new Error("The LED control interface is unavailable.");
  }

  started = true;
  initialized = false;
  rpcPending = false;
  hasLiveAttribute = false;
  button.disabled = true;
  setLedState(false);
  setStatus("");
  button.addEventListener("click", sendLedCommand);
  window.addEventListener("motion-lab:led-state", handleLiveState);
  window.addEventListener("motion-lab:logout", handleLogout);
  window.addEventListener("pagehide", stopLedControl);

  return loadInitialState();
}
