"use client";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Rocket, Github, Terminal, Server, Activity, 
  Globe, Box, Cpu, Clock, Code2, PlayCircle, Plus
} from "lucide-react";

export default function Dashboard() {
  const [deployments, setDeployments] = useState([]);
  const [repoUrl, setRepoUrl] = useState("https://github.com/heroku/node-js-getting-started");
  const [subdomain, setSubdomain] = useState("");
  const [logs, setLogs] = useState("System initialized. Awaiting deployments...");
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
        // Find the most recent active container name to stream its logs
        let activeContainer = "my-tunnel";
        if (deployments.length > 0) {
           activeContainer = deployments[0].name;
        }

        const res = await fetch(`http://localhost:8080/logs?container=${activeContainer}`);
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
  }, [deployments]);

  // Auto-scroll logs
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  const handleDeploy = async () => {
    setIsDeploying(true);
    setLogs((prev) => prev + "\n[SYSTEM] Initiating deployment for " + repoUrl + "...\n");
    try {
      await fetch("http://localhost:8080/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo_url: repoUrl, subdomain: subdomain }),
      });
    } catch (err) {
      console.error(err);
      setLogs((prev) => prev + "\n[ERROR] Failed to connect to Engine.\n");
    }
    setTimeout(() => setIsDeploying(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#050505] text-gray-200 font-sans selection:bg-indigo-500/30 overflow-hidden relative">
      
      {/* Background Gradients */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-600/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-fuchsia-600/10 blur-[120px] rounded-full pointer-events-none" />

      {/* Navbar */}
      <nav className="sticky top-0 z-50 border-b border-white/5 bg-black/40 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Rocket className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
              Open-PaaS
            </span>
            <span className="px-2 py-0.5 rounded-full bg-white/10 text-xs font-medium text-gray-300 ml-2 border border-white/5">
              Enterprise Engine
            </span>
          </div>
          <div className="flex items-center gap-6 text-sm font-medium text-gray-400">
            <a href="#" className="hover:text-white transition-colors flex items-center gap-2"><Globe className="w-4 h-4"/> Edge Network</a>
            <a href="#" className="hover:text-white transition-colors flex items-center gap-2"><Cpu className="w-4 h-4"/> MicroVMs</a>
            <a href="https://github.com/Aiman003516/open-paas" target="_blank" className="hover:text-white transition-colors flex items-center gap-2">
              <Github className="w-4 h-4" /> GitHub
            </a>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10">
          
          {/* Left Column (Forms & List) */}
          <div className="lg:col-span-5 flex flex-col gap-8">
            
            {/* Deploy Card */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative p-[1px] rounded-2xl bg-gradient-to-b from-white/15 to-white/5 shadow-2xl"
            >
              <div className="bg-[#0a0a0a] p-8 rounded-2xl w-full h-full">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
                    <Plus className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-white">New Deployment</h2>
                    <p className="text-sm text-gray-400">Deploy any Git repository instantly.</p>
                  </div>
                </div>

                <div className="space-y-5">
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider flex items-center gap-2">
                      <Github className="w-3 h-3" /> Repository URL
                    </label>
                    <div className="relative group">
                      <input
                        type="text"
                        value={repoUrl}
                        onChange={(e) => setRepoUrl(e.target.value)}
                        className="w-full bg-[#111] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all"
                        placeholder="https://github.com/..."
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider flex items-center gap-2">
                      <Globe className="w-3 h-3" /> Custom Subdomain (Optional)
                    </label>
                    <div className="flex rounded-xl overflow-hidden border border-white/10 focus-within:border-indigo-500/50 focus-within:ring-1 focus-within:ring-indigo-500/50 transition-all">
                      <input
                        type="text"
                        value={subdomain}
                        onChange={(e) => setSubdomain(e.target.value)}
                        className="w-full bg-[#111] px-4 py-3 text-white focus:outline-none"
                        placeholder="my-cool-app"
                      />
                      <span className="bg-[#1a1a1a] px-4 py-3 text-gray-500 text-sm flex items-center font-mono border-l border-white/10">
                        .loca.lt
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={handleDeploy}
                    disabled={isDeploying}
                    className="relative w-full overflow-hidden rounded-xl font-semibold py-3 text-white transition-all active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 group mt-2"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-600 transition-opacity group-hover:opacity-90" />
                    {isDeploying ? (
                      <span className="relative flex items-center justify-center gap-2">
                        <Activity className="w-5 h-5 animate-pulse" /> Deploying...
                      </span>
                    ) : (
                      <span className="relative flex items-center justify-center gap-2 text-[15px]">
                        <PlayCircle className="w-5 h-5" /> Deploy Application
                      </span>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>

            {/* Active Apps Card */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="relative p-[1px] rounded-2xl bg-gradient-to-b from-white/10 to-transparent flex-1 flex flex-col"
            >
              <div className="bg-[#0a0a0a] p-6 rounded-2xl w-full h-full flex flex-col">
                <div className="flex justify-between items-center mb-6">
                  <div className="flex items-center gap-3">
                     <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
                      <Server className="w-5 h-5" />
                    </div>
                    <h2 className="text-lg font-semibold text-white">Active Instances</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 font-medium">LIVE</span>
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
                  </div>
                </div>

                {deployments.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-gray-500 py-10 border border-dashed border-white/10 rounded-xl bg-white/[0.02]">
                    <Box className="w-10 h-10 mb-3 opacity-20" />
                    <p className="text-sm">No instances running</p>
                  </div>
                ) : (
                  <ul className="space-y-3 overflow-y-auto max-h-[300px] pr-2 custom-scrollbar">
                    <AnimatePresence>
                      {deployments.map((dep: any, i: number) => (
                        <motion.li 
                          key={dep.name + i}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, height: 0 }}
                          className="group flex flex-col p-4 bg-[#111] hover:bg-[#161616] transition-colors rounded-xl border border-white/5 hover:border-white/10"
                        >
                          <div className="flex justify-between items-center mb-2">
                            <span className="font-mono text-sm text-gray-200 truncate pr-4">{dep.name}</span>
                            <span className={`text-[10px] uppercase tracking-widest px-2.5 py-1 rounded-full font-bold border ${dep.status.includes('Up') ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                              {dep.status.split(' ')[0]}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-gray-500 font-mono">
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3"/> {dep.status.replace(/Up [a-zA-Z0-9 ]+/, '') || 'Running'}</span>
                            <span className="flex items-center gap-1"><Code2 className="w-3 h-3"/> {dep.id.substring(0, 8)}</span>
                          </div>
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                )}
              </div>
            </motion.div>
          </div>

          {/* Right Column (Terminal) */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="lg:col-span-7 h-[800px] lg:h-auto flex flex-col"
          >
            <div className="relative p-[1px] rounded-2xl bg-gradient-to-b from-white/15 to-white/5 shadow-2xl flex-1 flex flex-col">
              <div className="bg-[#050505] rounded-2xl w-full h-full flex flex-col overflow-hidden">
                
                {/* Terminal Header */}
                <div className="bg-[#0a0a0a] border-b border-white/5 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500/80 border border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.2)]"></div>
                      <div className="w-3 h-3 rounded-full bg-amber-500/80 border border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.2)]"></div>
                      <div className="w-3 h-3 rounded-full bg-emerald-500/80 border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.2)]"></div>
                    </div>
                    <div className="h-4 w-[1px] bg-white/10"></div>
                    <span className="text-xs font-mono text-gray-400 flex items-center gap-2">
                      <Terminal className="w-3.5 h-3.5" /> Engine Telemetry
                    </span>
                  </div>
                  <div className="text-[10px] font-mono text-gray-600 bg-white/5 px-2 py-1 rounded">bash - 80x24</div>
                </div>

                {/* Terminal Body */}
                <div className="flex-1 p-5 font-mono text-[13px] leading-relaxed overflow-y-auto bg-black text-gray-300 custom-scrollbar">
                  {logs.split('\n').map((line, i) => {
                    let colorClass = "text-gray-300";
                    if (line.includes("ERROR") || line.includes("Failed")) colorClass = "text-red-400";
                    else if (line.includes("WARN")) colorClass = "text-yellow-400";
                    else if (line.includes("SUCCESS") || line.includes("LIVE")) colorClass = "text-emerald-400 font-bold";
                    else if (line.includes("Step") || line.includes("Building")) colorClass = "text-indigo-300";
                    else if (line.includes("http")) colorClass = "text-cyan-400 underline decoration-cyan-400/30 underline-offset-4";
                    
                    return (
                      <div key={i} className={`mb-1 break-words ${colorClass}`}>
                        <span className="text-gray-700 select-none mr-3">{String(i + 1).padStart(3, '0')}</span>
                        {line}
                      </div>
                    );
                  })}
                  <div ref={logsEndRef} className="h-4" />
                </div>
              </div>
            </div>
          </motion.div>

        </div>
      </div>
      
      {/* Global Scrollbar Styles */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(0,0,0,0.2);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.2);
        }
      `}} />
    </div>
  );
}
