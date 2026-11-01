import { hasSession, logout } from "./auth.js";
import { startLedControl } from "./led-control.js";
import { startTelemetry } from "./telemetry.js";

const logoutButton = document.querySelector("#logout-button");

if (!hasSession()) {
  logout();
} else if (logoutButton instanceof HTMLButtonElement) {
  logoutButton.addEventListener("click", logout);
  startLedControl();
  startTelemetry();
}
