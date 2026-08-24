import { getToken, setToken, clearToken, verifyToken, GHError } from "./gh-client.js";

const SITE = window.SITE_CONFIG || {};
const input = document.getElementById("token-input");
const saveBtn = document.getElementById("token-save");
const clearBtn = document.getElementById("token-clear");
const testBtn = document.getElementById("token-test");
const statusEl = document.getElementById("token-status");

function setStatus(kind, message) {
  statusEl.className = `form-status form-status-${kind}`;
  statusEl.textContent = message;
}

function refreshState() {
  const token = getToken();
  input.value = token;
  clearBtn.disabled = !token;
  testBtn.disabled = !token;
}

saveBtn.addEventListener("click", () => {
  const value = input.value.trim();
  if (!value) {
    setStatus("error", "Paste a token first.");
    return;
  }
  setToken(value);
  setStatus("success", "Token saved to this browser.");
  refreshState();
});

clearBtn.addEventListener("click", () => {
  clearToken();
  input.value = "";
  setStatus("pending", "Token cleared.");
  refreshState();
});

testBtn.addEventListener("click", async () => {
  setStatus("pending", "Checking…");
  testBtn.disabled = true;
  try {
    const { login } = await verifyToken(SITE.repo);
    setStatus("success", `Connected as ${login}, with access to ${SITE.repo}.`);
  } catch (err) {
    setStatus("error", err instanceof GHError ? err.message : `Check failed: ${err.message}`);
  } finally {
    testBtn.disabled = !getToken();
  }
});

refreshState();
