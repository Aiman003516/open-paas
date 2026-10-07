"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Box,
  Check,
  CircleAlert,
  Clock3,
  Code2,
  ExternalLink,
  LoaderCircle,
  Plus,
  RefreshCw,
  Rocket,
  Server,
  TerminalSquare,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";

type Deployment = {
  id: string;
  name: string;
  status: string;
};

type EngineState = "checking" | "connected" | "offline";
type ToastMessage = { id: number; kind: "success" | "error"; text: string };

const ENGINE_URL = "/api/engine";
const REPOSITORY_PATTERN = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?\/?$/i;
const SUBDOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function statusIsRunning(status: string) {
  return /^Up\b/i.test(status);
}

async function apiErrorMessage(response: Response) {
  const text = await response.text();
  if (!text) return `Request failed (HTTP ${response.status}).`;
  try {
    const payload = JSON.parse(text) as { error?: string };
    if (payload.error) return payload.error;
  } catch {
    // Use the response text below when the API did not return JSON.
  }
  return text.slice(0, 240);
}

export default function Dashboard() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [repoUrl, setRepoUrl] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [logs, setLogs] = useState("");
  const [engineState, setEngineState] = useState<EngineState>("checking");
  const [isDeploying, setIsDeploying] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [selectedContainer, setSelectedContainer] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const toastSequence = useRef(0);
  const engineErrorShown = useRef(false);
  const logsErrorContainer = useRef("");

  const showToast = useCallback((kind: ToastMessage["kind"], text: string) => {
    const id = ++toastSequence.current;
    setToasts((current) => [...current.slice(-2), { id, kind, text }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 6000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const runningCount = useMemo(
    () => deployments.filter((deployment) => statusIsRunning(deployment.status)).length,
    [deployments],
  );
  const chosenContainer = deployments.some((deployment) => deployment.name === selectedContainer)
    ? selectedContainer
    : deployments[0]?.name || "";
  const repoIsValid = REPOSITORY_PATTERN.test(repoUrl.trim());
  const subdomainIsValid = !subdomain.trim() || SUBDOMAIN_PATTERN.test(subdomain.trim().toLowerCase());
  const refresh = useCallback(async (showSpinner = false) => {
    if (showSpinner) setIsRefreshing(true);
    try {
      const [healthResponse, deploymentsResponse] = await Promise.all([
        fetch(`${ENGINE_URL}/health`, { cache: "no-store" }),
        fetch(`${ENGINE_URL}/deployments`, { cache: "no-store" }),
      ]);
      if (!healthResponse.ok) throw new Error(await apiErrorMessage(healthResponse));
      if (!deploymentsResponse.ok) throw new Error(await apiErrorMessage(deploymentsResponse));
      const nextDeployments = (await deploymentsResponse.json()) as Deployment[];
      setDeployments(Array.isArray(nextDeployments) ? nextDeployments : []);
      setEngineState("connected");
      engineErrorShown.current = false;
      setUpdatedAt(new Date());
    } catch (error) {
      setEngineState("offline");
      if (!engineErrorShown.current) {
        engineErrorShown.current = true;
        showToast("error", error instanceof Error ? error.message : "Could not reach the Open-PaaS engine.");
      }
    } finally {
      if (showSpinner) setIsRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), 8000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
    };
  }, [refresh]);

  useEffect(() => {
    if (!chosenContainer) {
      return;
    }
    let cancelled = false;
    const loadLogs = async () => {
      try {
        const response = await fetch(
          `${ENGINE_URL}/logs?container=${encodeURIComponent(chosenContainer)}`,
          { cache: "no-store" },
        );
        if (!response.ok) {
          const message = await apiErrorMessage(response);
          if (!cancelled) {
            setLogs(message);
            if (logsErrorContainer.current !== chosenContainer) {
              logsErrorContainer.current = chosenContainer;
              showToast("error", `Could not load ${chosenContainer} logs: ${message}`);
            }
          }
          return;
        }
        const text = await response.text();
        logsErrorContainer.current = "";
        if (!cancelled) setLogs(text);
      } catch (error) {
        if (!cancelled) {
          setLogs("Could not reach the engine to load logs.");
          if (logsErrorContainer.current !== chosenContainer) {
            logsErrorContainer.current = chosenContainer;
            showToast("error", error instanceof Error ? error.message : "Could not reach the engine to load logs.");
          }
        }
      }
    };
    void loadLogs();
    const interval = window.setInterval(() => void loadLogs(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [chosenContainer, showToast]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [logs]);

  async function handleDeploy(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    if (!repoIsValid) {
      setNotice({ kind: "error", text: "Enter a valid public GitHub repository URL, such as https://github.com/owner/project." });
      return;
    }
    if (!subdomainIsValid) {
      setNotice({ kind: "error", text: "Use lowercase letters, numbers, and hyphens for the subdomain." });
      return;
    }

    setIsDeploying(true);
    try {
      const response = await fetch(`${ENGINE_URL}/deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo_url: repoUrl.trim(), subdomain: subdomain.trim().toLowerCase() }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; status?: string };
      if (!response.ok) throw new Error(body.error || "The deployment request was rejected.");
      setNotice({ kind: "success", text: "Deploy request received. Your app will appear here when its container starts." });
      showToast("success", "Deployment request accepted.");
      setRepoUrl("");
      await refresh();
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Could not send the deployment request.",
      });
      showToast("error", error instanceof Error ? error.message : "Could not send the deployment request.");
    } finally {
      setIsDeploying(false);
    }
  }

  const engineLabel = engineState === "connected" ? "Engine connected" : engineState === "checking" ? "Checking engine" : "Engine offline";

  return (
    <main className="app-shell min-h-screen">
      <header className="topbar">
        <div className="topbar-inner">
          <a href="#home" className="brand" aria-label="Open-PaaS home">
            <span className="brand-mark"><Rocket size={18} strokeWidth={2.2} /></span>
            <span>open<span className="brand-light">-paas</span></span>
            <span className="personal-tag">personal cloud</span>
          </a>
          <div className="topbar-actions">
            <span className={`connection-pill ${engineState}`} role="status">
              {engineState === "connected" ? <Wifi size={14} /> : engineState === "offline" ? <WifiOff size={14} /> : <LoaderCircle size={14} className="spin" />}
              {engineLabel}
            </span>
            <a className="github-link" href="https://github.com/Aiman003516/open-paas" target="_blank" rel="noreferrer">
              <Code2 size={16} /> <span>GitHub</span><ExternalLink size={13} />
            </a>
          </div>
        </div>
      </header>

      <div className="toast-region" aria-label="Notifications" aria-live="polite" aria-relevant="additions">
        {toasts.map((toast) => (
          <div className={`toast ${toast.kind}`} key={toast.id} role={toast.kind === "error" ? "alert" : "status"}>
            <span className="toast-icon">{toast.kind === "error" ? <CircleAlert size={18} /> : <Check size={18} />}</span>
            <p>{toast.text}</p>
            <button type="button" className="toast-dismiss" onClick={() => dismissToast(toast.id)} aria-label="Dismiss notification">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>

      <div className="page-wrap" id="home">
        <section className="welcome-row">
          <div>
            <p className="eyebrow"><span className="eyebrow-dot" /> YOUR PROJECTS, YOUR MACHINE</p>
            <h1>Good things start <span>with a deploy.</span></h1>
            <p className="welcome-copy">A small, self-hosted home for the apps you&apos;re building.</p>
          </div>
          <button className="refresh-button" onClick={() => void refresh(true)} disabled={isRefreshing} type="button">
            <RefreshCw size={15} className={isRefreshing ? "spin" : ""} />
            {isRefreshing ? "Refreshing" : "Refresh"}
          </button>
        </section>

        <section className="summary-grid" aria-label="Project summary">
          <article className="summary-card">
            <div className="summary-icon violet"><Box size={18} /></div>
            <div><p className="summary-label">RUNNING APPS</p><p className="summary-value">{engineState === "connected" ? runningCount : "—"}</p></div>
            <span className="summary-foot">{engineState === "connected" ? `${deployments.length} total` : "Waiting for engine"}</span>
          </article>
          <article className="summary-card">
            <div className={`summary-icon ${engineState === "connected" ? "green" : engineState === "offline" ? "red" : "amber"}`}><Activity size={18} /></div>
            <div><p className="summary-label">LOCAL ENGINE</p><p className="summary-value summary-state">{engineState === "connected" ? "Ready" : engineState === "checking" ? "Checking" : "Offline"}</p></div>
            <span className="summary-foot">{updatedAt ? `Updated ${updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Connect to get started"}</span>
          </article>
          <article className="summary-card summary-note">
            <div className="summary-icon blue"><Code2 size={18} /></div>
            <div><p className="summary-label">BUILT FOR</p><p className="summary-value summary-state">Your next idea</p></div>
            <span className="summary-foot">No team setup. Just you and your code.</span>
          </article>
        </section>

        <div className="workspace-grid">
          <section className="panel deploy-panel" aria-labelledby="deploy-heading">
            <div className="panel-heading">
              <div className="heading-icon violet"><Plus size={19} /></div>
              <div><p className="section-kicker">START SOMETHING</p><h2 id="deploy-heading">New deployment</h2></div>
              <span className="step-tag">01</span>
            </div>
            <p className="panel-intro">Point to a public GitHub repo and let your local engine take it from there.</p>
            <form onSubmit={handleDeploy} noValidate>
              <div className="field-group">
                <label htmlFor="repo-url">Repository URL</label>
                <div className={`input-wrap ${repoUrl && !repoIsValid ? "input-invalid" : ""}`}>
                  <Code2 size={17} aria-hidden="true" />
                  <input
                    id="repo-url"
                    type="url"
                    autoComplete="url"
                    value={repoUrl}
                    onChange={(event) => setRepoUrl(event.target.value)}
                    placeholder="https://github.com/you/your-project"
                    aria-describedby="repo-help"
                  />
                  {repoUrl && repoIsValid && <Check size={16} className="input-check" aria-label="Valid GitHub URL" />}
                </div>
                <p id="repo-help" className="field-hint">Public GitHub repositories only, for now.</p>
              </div>
              <div className="field-group">
                <label htmlFor="subdomain">Custom address <span className="optional">OPTIONAL</span></label>
                <div className={`input-wrap subdomain-wrap ${subdomain && !subdomainIsValid ? "input-invalid" : ""}`}>
                  <span className="subdomain-prefix">https://</span>
                  <input
                    id="subdomain"
                    type="text"
                    autoCapitalize="none"
                    autoComplete="off"
                    value={subdomain}
                    onChange={(event) => setSubdomain(event.target.value)}
                    placeholder="my-little-app"
                    aria-describedby="subdomain-help"
                  />
                  <span className="subdomain-suffix">.loca.lt</span>
                </div>
                <p id="subdomain-help" className="field-hint">Letters, numbers, and hyphens. Leave blank for an automatic name.</p>
              </div>
              <button className="deploy-button" type="submit" disabled={engineState !== "connected" || isDeploying}>
                {isDeploying ? <LoaderCircle size={17} className="spin" /> : <Rocket size={17} />}
                {isDeploying ? "Sending your deploy…" : "Deploy project"}
                {!isDeploying && <ArrowUpRight size={16} className="button-arrow" />}
              </button>
              {notice && (
                <div className={`form-notice ${notice.kind}`} role="status">
                  {notice.kind === "success" ? <Check size={16} /> : <CircleAlert size={16} />}
                  <span>{notice.text}</span>
                </div>
              )}
              {engineState === "offline" && (
                <p className="offline-hint">Start the Open-PaaS engine and refresh to deploy.</p>
              )}
            </form>
            <div className="safe-note"><span className="safe-note-dot" /> Only deploy code you trust on your own machine.</div>
          </section>

          <section className="panel apps-panel" aria-labelledby="apps-heading">
            <div className="panel-heading apps-heading">
              <div className="heading-icon green"><Server size={18} /></div>
              <div><p className="section-kicker">WHAT&apos;S RUNNING</p><h2 id="apps-heading">Your apps</h2></div>
              <span className="count-badge">{engineState === "connected" ? deployments.length : "—"}</span>
            </div>
            {engineState === "offline" ? (
              <div className="empty-state">
                <div className="empty-icon offline"><WifiOff size={22} /></div>
                <h3>Can&apos;t reach your engine</h3>
                <p>Make sure it&apos;s running on this machine, then try again.</p>
                <button type="button" className="text-button" onClick={() => void refresh(true)}>Try again <ArrowUpRight size={14} /></button>
              </div>
            ) : engineState === "checking" ? (
              <div className="empty-state"><div className="empty-icon"><LoaderCircle size={22} className="spin" /></div><h3>Finding your engine</h3><p>Checking for apps on your machine…</p></div>
            ) : deployments.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon"><Box size={22} /></div>
                <h3>A clean slate</h3>
                <p>Your first deployed app will show up here. Ready when you are.</p>
              </div>
            ) : (
              <ul className="app-list">
                {deployments.map((deployment) => {
                  const isRunning = statusIsRunning(deployment.status);
                  return (
                    <li key={deployment.id || deployment.name}>
                      <button
                        className={`app-row ${chosenContainer === deployment.name ? "selected" : ""}`}
                        type="button"
                        onClick={() => setSelectedContainer(deployment.name)}
                        aria-pressed={chosenContainer === deployment.name}
                        title={`Show logs for ${deployment.name}`}
                      >
                        <span className={`app-status-dot ${isRunning ? "running" : "stopped"}`} />
                        <span className="app-details"><span className="app-name">{deployment.name.replace(/^open-paas-app-/, "")}</span><span className="app-runtime"><Clock3 size={12} /> {deployment.status || "Status unavailable"}</span></span>
                        <span className={`status-label ${isRunning ? "running" : "stopped"}`}>{isRunning ? "Running" : "Stopped"}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="apps-footer"><span><span className={`small-dot ${engineState === "connected" ? "online" : ""}`} /> {engineState === "connected" ? "Synced with your machine" : "Not connected"}</span><span>Refreshes every 8 sec</span></div>
          </section>
        </div>

        <section className="panel logs-panel" aria-labelledby="logs-heading">
          <div className="logs-header">
            <div className="panel-heading logs-title">
              <div className="heading-icon dark"><TerminalSquare size={18} /></div>
              <div><p className="section-kicker">A LOOK UNDER THE HOOD</p><h2 id="logs-heading">Recent logs</h2></div>
            </div>
            <div className="log-controls">
              {deployments.length > 0 && (
                <label className="sr-only" htmlFor="log-container">Choose app logs</label>
              )}
              {deployments.length > 0 && (
                <select id="log-container" value={chosenContainer} onChange={(event) => setSelectedContainer(event.target.value)}>
                  {deployments.map((deployment) => <option key={deployment.name} value={deployment.name}>{deployment.name.replace(/^open-paas-app-/, "")}</option>)}
                </select>
              )}
              <span className="live-label"><span className="small-dot online" /> LIVE</span>
            </div>
          </div>
          <div className="terminal-window" aria-live="polite" aria-label="Application logs">
            <div className="terminal-topline"><span className="terminal-dots"><i /><i /><i /></span><span className="terminal-path">{chosenContainer || "your-app"} <span>/ logs</span></span><span className="terminal-mode">TAIL · 100 LINES</span></div>
            <div className="terminal-content">
              {!chosenContainer ? (
                <div className="terminal-empty"><span className="terminal-prompt">$</span> Deploy an app to see its logs here<span className="cursor-block" /></div>
              ) : logs.trim() ? (
                logs.split("\n").slice(-100).map((line, index) => (
                  <div className="log-line" key={`${index}-${line.slice(0, 20)}`}><span className="line-number">{String(index + 1).padStart(2, "0")}</span><span className={line.toLowerCase().includes("error") ? "log-error" : line.toLowerCase().includes("warn") ? "log-warn" : ""}>{line}</span></div>
                ))
              ) : (
                <div className="terminal-empty"><span className="terminal-prompt">$</span> Waiting for output…<span className="cursor-block" /></div>
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
          <p className="logs-footnote"><Activity size={13} /> Logs are read from your local Docker containers. Updates every 5 seconds.</p>
        </section>

        <footer className="page-footer">
          <span>Made for tinkering. Built to run where you do.</span>
          <a href="https://github.com/Aiman003516/open-paas" target="_blank" rel="noreferrer">Open source on GitHub <ExternalLink size={13} /></a>
        </footer>
      </div>
    </main>
  );
}
