"use client";

import { useState } from "react";

export default function SyncConnection({ apiBase, request }: {
  apiBase: string;
  request: (path: string, init?: RequestInit) => Promise<any>;
}) {
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    setMessage("");
    try {
      const result = await request("/api/tracking/tokens", {
        method: "POST", body: JSON.stringify({ name: "Desktop POS sync", daysValid: 90 }),
      });
      setToken(result.token);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create sync token");
    } finally {
      setBusy(false);
    }
  };
  return <article className="surface settings-card">
    <span className="section-eyebrow">Desktop connection</span>
    <h2>Connect your POS records</h2>
    <p>In the desktop POS, open Settings → Data Backup → Web Tracking Sync. Save this endpoint and a sync token, then use Test Connection and Sync All Data.</p>
    <label>Tracking endpoint<input readOnly value={apiBase.replace(/\/+$/, "").replace(/\/api$/, "")} style={{ width: "100%" }} /></label>
    <p>The token uses your current account’s company access. Keep it private.</p>
    <button className="button secondary" disabled={busy || Boolean(token)} onClick={() => void create()}>{busy ? "Creating…" : token ? "Token created" : "Create desktop sync token"}</button>
    {token && <label>Copy this token to your POS<input aria-label="Desktop sync token" readOnly type="password" value={token} onFocus={(event) => event.target.select()} style={{ width: "100%" }} /><button className="button secondary" onClick={() => void navigator.clipboard.writeText(token).then(() => setMessage("Token copied.")).catch(() => setMessage("Select the token field and copy it manually."))}>Copy token</button></label>}
    {message && <p role="status">{message}</p>}
  </article>;
}
