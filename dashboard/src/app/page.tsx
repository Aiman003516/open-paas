"use client";
import { useState, useEffect, useRef } from "react";

export default function Dashboard() {
  const [deployments, setDeployments] = useState([]);
  const [repoUrl, setRepoUrl] = useState("https://github.com/heroku/node-js-getting-started");
  const [subdomain, setSubdomain] = useState("");
  const [logs, setLogs] = useState("Waiting for logs...");
  const [isDeploying, setIsDeploying] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Fetch Deployments
  useEffect(() => {
    const fetchDeployments = async () => {
      try {
        const res = await fetch("http://localhost:8080/deployments");
        if (res.ok) {
          const data = await res.json();
          setDeployments(data || []);
        }
      } catch (err) {
        console.error("Failed to fetch deployments", err);
      }
    };
    fetchDeployments();
    const interval = setInterval(fetchDeployments, 3000);
    return () => clearInterval(interval);
  }, []);

  // Fetch Logs
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await fetch("http://localhost:8080/logs?container=my-tunnel");
        if (res.ok) {
          const text = await res.text();
          if (text) setLogs(text);
        }
      } catch (err) {
        // ignore log errors
      }
    };
    fetchLogs();
    const interval = setInterval(fetchLogs, 2000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  const handleDeploy = async () => {
    setIsDeploying(true);
    try {
      await fetch("http://localhost:8080/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo_url: repoUrl, subdomain: subdomain }),
      });
      setLogs("Deployment started! Fetching logs...");
    } catch (err) {
      console.error(err);
      alert("Failed to connect to the Open-PaaS Engine. Is it running on port 8080?");
    }
    setTimeout(() => setIsDeploying(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#000] text-gray-200 font-sans p-8">
      <div className="max-w-6xl mx-auto">
        
        {/* Header */}
        <header className="flex items-center justify-between pb-8 mb-8 border-b border-[#333]">
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <span className="text-white">▲</span> Open-PaaS Engine
          </h1>
          <div className="text-sm text-gray-400">Zero-Config • GitOps • Zero-Trust</div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column: Deploy and Active Apps */}
          <div className="lg:col-span-1 space-y-8">
            
            {/* Deploy Card */}
            <div className="bg-[#111] p-6 rounded-lg border border-[#333] shadow-lg">
              <h2 className="text-xl font-semibold text-white mb-4">Deploy New Project</h2>
              <p className="text-sm text-gray-400 mb-4">
                Paste a GitHub URL. Nixpacks will auto-detect the language, build a Docker image, and tunnel it publicly.
              </p>
              <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase">GitHub Repository URL</label>
              <input
                type="text"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                className="w-full bg-[#222] border border-[#444] rounded px-4 py-2 text-white focus:outline-none focus:border-white mb-4"
                placeholder="https://github.com/..."
              />
              <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase">Custom Subdomain (Optional)</label>
              <div className="flex mb-4">
                <input
                  type="text"
                  value={subdomain}
                  onChange={(e) => setSubdomain(e.target.value)}
                  className="w-full bg-[#222] border border-[#444] rounded-l px-4 py-2 text-white focus:outline-none focus:border-white"
                  placeholder="my-cool-app"
                />
                <span className="bg-[#333] border border-[#444] border-l-0 rounded-r px-3 py-2 text-gray-400 text-sm flex items-center">
                  .loca.lt
                </span>
              </div>
              <button
                onClick={handleDeploy}
                disabled={isDeploying}
                className="w-full bg-white text-black font-semibold py-2 rounded hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                {isDeploying ? "Triggering..." : "Deploy"}
              </button>
            </div>

            {/* Active Deployments */}
            <div className="bg-[#111] p-6 rounded-lg border border-[#333] shadow-lg">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center justify-between">
                Active Containers
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              </h2>
              {deployments.length === 0 ? (
                <p className="text-gray-500 text-sm">No active containers found.</p>
              ) : (
                <ul className="space-y-3">
                  {deployments.map((dep: any, i: number) => (
                    <li key={i} className="flex justify-between items-center p-3 bg-[#222] rounded border border-[#333]">
                      <span className="text-sm font-mono truncate max-w-[120px]">{dep.name}</span>
                      <span className={`text-xs px-2 py-1 rounded font-bold ${dep.status.includes('Up') ? 'bg-green-900/30 text-green-400 border border-green-800' : 'bg-yellow-900/30 text-yellow-400 border border-yellow-800'}`}>
                        {dep.status.split(' ')[0]}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Right Column: Terminal Logs */}
          <div className="lg:col-span-2">
            <div className="bg-[#0c0c0c] h-[600px] rounded-lg border border-[#333] shadow-lg flex flex-col overflow-hidden">
              <div className="bg-[#1a1a1a] px-4 py-2 border-b border-[#333] flex items-center justify-between">
                <span className="text-xs font-mono text-gray-400 uppercase tracking-wider">Tunnel Network Logs</span>
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                </div>
              </div>
              <div className="flex-1 p-4 font-mono text-sm overflow-y-auto text-green-400 whitespace-pre-wrap">
                {logs}
                <div ref={logsEndRef} />
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
