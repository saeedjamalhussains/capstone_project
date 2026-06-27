import React, { useState, useEffect } from 'react';
import { ShieldAlert, Layers, ShieldCheck, Network, Award, Terminal, LayoutDashboard } from 'lucide-react';
import VoterPortal from './components/VoterPortal';
import AdminPortal from './components/AdminPortal';
import ConsensusVisualizer from './components/ConsensusVisualizer';
import Explorer from './components/Explorer';

const BACKEND_URL = 'http://localhost:5000';
const WS_URL = 'ws://localhost:5000/ws';

export default function App() {
  const [activeTab, setActiveTab] = useState('voter');
  const [elections, setElections] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [events, setEvents] = useState([]);
  const [wsConnected, setWsConnected] = useState(false);

  const fetchElections = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/elections`);
      if (res.ok) {
        const data = await res.json();
        setElections(data);
      }
    } catch (err) {
      console.error("Failed to fetch elections", err);
    }
  };

  const fetchNodes = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/nodes/status`);
      if (res.ok) {
        const data = await res.json();
        setNodes(data);
      }
    } catch (err) {
      console.error("Failed to fetch validator nodes status", err);
    }
  };

  // Setup WebSocket connection to receive live consensus events
  useEffect(() => {
    let ws;
    let reconnectTimeout;

    const connectWs = () => {
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        setWsConnected(true);
        console.log("WebSocket connected to TSBTChain node broker.");
      };

      ws.onmessage = (event) => {
        try {
          const pbftEvent = JSON.parse(event.data);
          setEvents((prev) => {
            const updated = [...prev, pbftEvent];
            return updated.length > 500 ? updated.slice(-500) : updated;
          });
        } catch (err) {
          console.error("Failed to parse incoming PBFT socket message", err);
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        console.log("WebSocket closed. Attempting reconnect in 3s...");
        reconnectTimeout = setTimeout(connectWs, 3000);
      };

      ws.onerror = (err) => {
        ws.close();
      };
    };

    connectWs();
    fetchElections();
    fetchNodes();

    // Poll node status every 3 seconds
    const interval = setInterval(fetchNodes, 3000);

    return () => {
      if (ws) ws.close();
      clearTimeout(reconnectTimeout);
      clearInterval(interval);
    };
  }, []);

  const onlineNodes = nodes.filter(n => n.is_online).length;
  const pbftActive = onlineNodes >= 3;

  return (
    <div className="min-h-screen flex flex-col justify-between">
      {/* HEADER SECTION */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/30">
              <Network className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight text-white flex items-center gap-1.5">
                TSBTChain <span className="text-xs bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 font-semibold px-2 py-0.5 rounded-full">v1.0 (PBFT)</span>
              </h1>
              <p className="text-[10px] text-slate-500 font-medium">Custom Permissioned Blockchain-Based Voting Console</p>
            </div>
          </div>

          {/* Quick status bar */}
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
              <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
              <span className="text-slate-400 font-medium">API: {wsConnected ? 'Connected' : 'Offline'}</span>
            </div>
            <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
              <span className={`w-2 h-2 rounded-full ${pbftActive ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500 animate-pulse'}`}></span>
              <span className="text-slate-400 font-medium">
                PBFT: {onlineNodes}/4 Online {pbftActive ? '(Active)' : '(Stalled)'}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 space-y-8">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-2 pb-2 border-b border-slate-900">
          <button
            onClick={() => setActiveTab('voter')}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 border ${
              activeTab === 'voter'
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/10'
                : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <Award className="w-4 h-4" /> Voter Portal
          </button>
          <button
            onClick={() => setActiveTab('admin')}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 border ${
              activeTab === 'admin'
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/10'
                : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" /> Admin Console
          </button>
          <button
            onClick={() => setActiveTab('consensus')}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 border ${
              activeTab === 'consensus'
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/10'
                : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <Terminal className="w-4 h-4" /> Consensus Visualizer
          </button>
          <button
            onClick={() => setActiveTab('explorer')}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 border ${
              activeTab === 'explorer'
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/10'
                : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <Layers className="w-4 h-4" /> Blockchain Explorer
          </button>
        </div>

        {/* Dynamic Tab Rendering */}
        <div className="py-4">
          {activeTab === 'voter' && (
            <VoterPortal
              backendUrl={BACKEND_URL}
              elections={elections}
              setActiveTab={setActiveTab}
            />
          )}
          {activeTab === 'admin' && (
            <AdminPortal
              backendUrl={BACKEND_URL}
              fetchElections={fetchElections}
              elections={elections}
              nodes={nodes}
              fetchNodes={fetchNodes}
            />
          )}
          {activeTab === 'consensus' && (
            <ConsensusVisualizer
              nodes={nodes}
              events={events}
              setEvents={setEvents}
            />
          )}
          {activeTab === 'explorer' && (
            <Explorer
              backendUrl={BACKEND_URL}
            />
          )}
        </div>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-slate-950 py-6 text-center text-xs text-slate-600 bg-slate-950/40">
        <div className="max-w-7xl mx-auto px-6">
          TSBTChain Capstone Project &copy; {new Date().getFullYear()}. Implemented using Rust (Axum, Tokio TCP) & React (JS + Tailwind).
        </div>
      </footer>
    </div>
  );
}
