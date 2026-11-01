const THINGSBOARD_URL = "https://thingsboard.cloud";
const REQUEST_TIMEOUT_MS = 10_000;
const SESSION_KEYS = Object.freeze([
  "token",
  "refreshToken",
  "customerId",
  "deviceId",
  "deviceAccessToken",
]);

class ApiError extends Error {
  constructor(status, kind) {
    super(kind);
    this.name = "ApiError";
    this.status = status;
    this.kind = kind;
  }
}

class AuthFlowError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuthFlowError";
  }
}

let refreshInFlight = null;

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function clearSession() {
  for (const key of SESSION_KEYS) {
    sessionStorage.removeItem(key);
  }
}

function storeSessionValue(key, value) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    throw new ApiError(0, "storage");
  }
}

function storeTokenPair(data) {
  if (!isRecord(data) || !isNonEmptyString(data.token) || !isNonEmptyString(data.refreshToken)) {
    throw new ApiError(0, "invalid-response");
  }

  storeSessionValue("token", data.token);
  storeSessionValue("refreshToken", data.refreshToken);
}

async function fetchJson(path, { method = "GET", headers, body } = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  let responseText;

  try {
    response = await fetch(`${THINGSBOARD_URL}${path}`, {
      method,
      headers,
      signal: controller.signal,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    responseText = await response.text();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError(0, "timeout");
    }
    throw new ApiError(0, "network");
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new ApiError(response.status, "http");
  }

  try {
    return JSON.parse(responseText);
  } catch {
    throw new ApiError(0, "invalid-response");
  }
}

function createHeaders(body, authenticated) {
  const headers = { Accept: "application/json" };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (authenticated) {
    const token = sessionStorage.getItem("token");
    if (!isNonEmptyString(token)) {
      throw new ApiError(401, "unauthorized");
    }
    headers["X-Authorization"] = `Bearer ${token}`;
  }

  return headers;
}

async function refreshTokensDirectly() {
  const refreshToken = sessionStorage.getItem("refreshToken");
  if (!isNonEmptyString(refreshToken)) {
    throw new ApiError(401, "unauthorized");
  }

  const data = await fetchJson("/api/auth/token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: { refreshToken },
  });

  storeTokenPair(data);
}

function refreshTokens() {
  if (refreshInFlight === null) {
    refreshInFlight = refreshTokensDirectly().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export async function apiRequest(path, { method = "GET", body, authenticated = true, refreshOnUnauthorized = true } = {}) {
  const send = () => fetchJson(path, {
    method,
    headers: createHeaders(body, authenticated),
    body,
  });

  try {
    return await send();
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401 || !authenticated || !refreshOnUnauthorized) {
      throw error;
    }

    try {
      await refreshTokens();
    } catch {
      clearSession();
      window.location.replace("./login.html");
      throw new ApiError(401, "session-expired");
    }

    return send();
  }
}

export function hasSession() {
  return SESSION_KEYS.every((key) => isNonEmptyString(sessionStorage.getItem(key)));
}

export function logout() {
  window.dispatchEvent(new Event("motion-lab:logout"));
  clearSession();
  window.location.replace("./login.html");
}

function loginErrorMessage(error) {
  if (!(error instanceof ApiError)) {
    return "Unable to sign in. Please try again.";
  }
  if (error.kind === "timeout") {
    return "Connection timed out. Please try again.";
  }
  if (error.kind === "network") {
    return "Unable to connect to ThingsBoard. Check your connection and try again.";
  }
  if (error.kind === "storage") {
    return "Your browser could not start a secure session. Enable session storage and try again.";
  }
  if (error.status === 401) {
    return "Invalid username or password.";
  }
  if (error.status === 400) {
    return "Login request failed. Check your username and password.";
  }
  if (error.status >= 500) {
    return "ThingsBoard is unavailable. Please try again later.";
  }
  return "Unable to sign in. Please try again.";
}

function dashboardSetupErrorMessage(error) {
  if (error instanceof AuthFlowError) {
    return error.message;
  }
  if (error instanceof ApiError && error.kind === "timeout") {
    return "The dashboard setup timed out. Please try signing in again.";
  }
  if (error instanceof ApiError && error.kind === "network") {
    return "Unable to connect to ThingsBoard. Check your connection and try again.";
  }
  if (error instanceof ApiError && error.kind === "storage") {
    return "Your browser could not store a secure session. Enable session storage and try again.";
  }
  if (error instanceof ApiError && error.status === 401) {
    return "Your session expired during sign-in. Please try again.";
  }
  return "Unable to load your lab dashboard. Check your account and assigned device, then try again.";
}

export async function authenticate(username, password) {
  clearSession();

  let loginData;
  try {
    loginData = await apiRequest("/api/auth/login", {
      method: "POST",
      body: { username, password },
      authenticated: false,
      refreshOnUnauthorized: false,
    });
    storeTokenPair(loginData);
  } catch (error) {
    clearSession();
    throw new AuthFlowError(loginErrorMessage(error));
  }

  try {
    const user = await apiRequest("/api/auth/user");
    if (!isRecord(user) || !isRecord(user.customerId)
      || user.customerId.entityType !== "CUSTOMER"
      || !isNonEmptyString(user.customerId.id)) {
      throw new AuthFlowError("This account does not have a customer assigned.");
    }
    const customerId = user.customerId.id;
    storeSessionValue("customerId", customerId);

    let devices;
    try {
      devices = await apiRequest(
        `/api/customer/${encodeURIComponent(customerId)}/devices?pageSize=50&page=0`,
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        throw new AuthFlowError(
          "This account has no permission to view devices — ask the ThingsBoard tenant admin.",
        );
      }
      throw error;
    }
    if (!isRecord(devices) || !Array.isArray(devices.data)) {
      throw new AuthFlowError("Unable to read the devices assigned to this account.");
    }
    const firstDevice = devices.data[0];
    if (firstDevice === undefined) {
      throw new AuthFlowError("No device is assigned to this account.");
    }
    if (!isRecord(firstDevice) || !isRecord(firstDevice.id)
      || firstDevice.id.entityType !== "DEVICE"
      || !isNonEmptyString(firstDevice.id.id)) {
      throw new AuthFlowError("The assigned device information is incomplete.");
    }
    const deviceId = firstDevice.id.id;
    storeSessionValue("deviceId", deviceId);

    const credentials = await apiRequest(
      `/api/device/${encodeURIComponent(deviceId)}/credentials`,
    );
    if (!isRecord(credentials) || credentials.credentialsType !== "ACCESS_TOKEN"
      || !isNonEmptyString(credentials.credentialsId)) {
      throw new AuthFlowError("Unable to load secure access for the assigned device.");
    }
    storeSessionValue("deviceAccessToken", credentials.credentialsId);
  } catch (error) {
    clearSession();
    throw new AuthFlowError(dashboardSetupErrorMessage(error));
  }
}

const loginForm = document.querySelector("#login-form");
if (loginForm instanceof HTMLFormElement) {
  if (window.location.search) {
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${window.location.hash}`,
    );
  }

  const usernameInput = document.querySelector("#username");
  const passwordInput = document.querySelector("#password");
  const submitButton = document.querySelector("#login-submit");
  const submitLabel = submitButton.querySelector("span");
  const status = document.querySelector("#login-status");
  const statusMessage = document.querySelector("#login-status-message");
  let submitting = false;

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting) {
      return;
    }

    submitting = true;
    status.hidden = true;
    statusMessage.textContent = "";
    submitButton.disabled = true;
    loginForm.setAttribute("aria-busy", "true");
    submitLabel.textContent = "Signing in...";

    try {
      await authenticate(usernameInput.value.trim(), passwordInput.value);
      window.location.assign("./dashboard.html");
    } catch (error) {
      statusMessage.textContent = error instanceof AuthFlowError
        ? error.message
        : "Unable to sign in. Please try again.";
      status.hidden = false;
    } finally {
      submitting = false;
      submitButton.disabled = false;
      loginForm.removeAttribute("aria-busy");
      submitLabel.textContent = "Login to Dashboard";
    }
  });
  submitButton.disabled = false;
}
