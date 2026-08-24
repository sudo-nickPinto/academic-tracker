// Thin wrapper around the GitHub REST API for committing directly to `main`
// from the browser, using a personal access token the visitor supplies once
// (see /settings/). The token lives only in localStorage — it's never sent
// anywhere but api.github.com, and never written into any file in the repo.

const TOKEN_KEY = "academic-tracker:gh-token";

export class GHError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "GHError";
    this.status = status;
  }
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token.trim());
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function apiHeaders() {
  const token = getToken();
  if (!token) {
    throw new GHError("No GitHub token saved yet — add one on the Settings page.", 0);
  }
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function friendlyError(status, fallback) {
  if (status === 401) return "GitHub rejected the token (401). It may be expired or mistyped — check it on the Settings page.";
  if (status === 403) return "GitHub refused the request (403). The token is likely missing a required permission — see Settings for the scopes this needs.";
  if (status === 404) return "GitHub returned 404 — either the repo name is wrong, or the token isn't scoped to this repo.";
  return fallback;
}

function b64EncodeUtf8(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function b64DecodeUtf8(b64) {
  const binary = atob(b64.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Fetches a data file's current text content + blob sha (needed to update it). */
export async function getFile(repo, path) {
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    headers: apiHeaders(),
  });
  if (!res.ok) {
    throw new GHError(friendlyError(res.status, `Couldn't read ${path} (${res.status}).`), res.status);
  }
  const json = await res.json();
  return { text: b64DecodeUtf8(json.content), sha: json.sha };
}

async function putFile(repo, path, text, sha, message) {
  return fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    method: "PUT",
    headers: { ...apiHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ message, content: b64EncodeUtf8(text), sha, branch: "main" }),
  });
}

/**
 * Reads a data file, runs `mutate(text) -> newText`, and commits the result.
 * Retries once on a sha conflict (409) by re-reading and re-applying `mutate`
 * to the fresh content.
 */
export async function commitFile(repo, path, mutate, message) {
  let { text, sha } = await getFile(repo, path);
  let res = await putFile(repo, path, mutate(text), sha, message);

  if (res.status === 409) {
    ({ text, sha } = await getFile(repo, path));
    res = await putFile(repo, path, mutate(text), sha, message);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new GHError(friendlyError(res.status, body.message || `Commit failed (${res.status}).`), res.status);
  }
  return res.json();
}

/** Triggers the rebuild workflow (workflow_dispatch) so docs/ regenerates from the new data. */
export async function dispatchRebuild(repo, workflowFile) {
  const res = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/${workflowFile}/dispatches`,
    {
      method: "POST",
      headers: { ...apiHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ ref: "main" }),
    }
  );
  if (!res.ok && res.status !== 204) {
    throw new GHError(
      friendlyError(res.status, `Couldn't trigger a rebuild (${res.status}). The data was saved either way — a nightly rebuild will pick it up.`),
      res.status
    );
  }
}

/** Verifies the saved token works and can see the given repo. Throws GHError on failure. */
export async function verifyToken(repo) {
  const userRes = await fetch("https://api.github.com/user", { headers: apiHeaders() });
  if (!userRes.ok) {
    throw new GHError(friendlyError(userRes.status, `Token check failed (${userRes.status}).`), userRes.status);
  }
  const user = await userRes.json();

  const repoRes = await fetch(`https://api.github.com/repos/${repo}`, { headers: apiHeaders() });
  if (!repoRes.ok) {
    throw new GHError(friendlyError(repoRes.status, `Can't see ${repo} with this token (${repoRes.status}).`), repoRes.status);
  }

  return { login: user.login };
}
