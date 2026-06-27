import React, { useState, useEffect, useRef } from 'react';
import { Network, Terminal, Settings2, ShieldCheck, Flame, Server } from 'lucide-react';

export default function ConsensusVisualizer({ nodes, events, setEvents }) {
  const consoleEndRef = useRef(null);
  const [activePackets, setActivePackets] = useState([]); // Array of { id, from, to, type }
  const [consensusStage, setConsensusStage] = useState('Idle'); // Idle, Proposing, Preparing, Committing, Committed

  // Node positions in the SVG container (500x400)
  const nodePositions = {
    0: { x: 250, y: 80, label: "Node 0 (Primary)" },
    1: { x: 420, y: 220, label: "Node 1" },
    2: { x: 250, y: 320, label: "Node 2" },
    3: { x: 80, y: 220, label: "Node 3" }
  };

  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [events]);

  // Handle incoming WebSocket events to trigger packet animations
  useEffect(() => {
    if (events.length === 0) return;
    const latestEvent = events[events.length - 1];

    if (latestEvent.event_type === "PRE-PREPARE" || latestEvent.event_type === "PREPARE" || latestEvent.event_type === "COMMIT") {
      const from = latestEvent.from_node;
      const to = latestEvent.to_node;

      // Update stage indicators
      if (latestEvent.event_type === "PRE-PREPARE") setConsensusStage('Proposing');
      else if (latestEvent.event_type === "PREPARE") setConsensusStage('Preparing');
      else if (latestEvent.event_type === "COMMIT") setConsensusStage('Committing');

      if (from !== undefined && to !== undefined && from !== null && to !== null) {
        const packetId = Math.random().toString(36).substr(2, 9);
        setActivePackets((prev) => [...prev, { id: packetId, from, to, type: latestEvent.event_type }]);

        // Remove packet after animation duration (1.2 seconds)
        setTimeout(() => {
          setActivePackets((prev) => prev.filter((p) => p.id !== packetId));
        }, 1200);
      }
    } else if (latestEvent.event_type === "COMMITTED") {
      setConsensusStage('Committed');
      setTimeout(() => setConsensusStage('Idle'), 4000);
    }
  }, [events]);

  const clearLogs = () => {
    setEvents([]);
  };

  const getPacketColor = (type) => {
    switch (type) {
      case 'PRE-PREPARE': return '#e11d48'; // Rose
      case 'PREPARE': return '#f59e0b'; // Amber
      case 'COMMIT': return '#10b981'; // Emerald
      default: return '#6366f1'; // Indigo
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
      {/* Visualizer Panel (3/5 width) */}
      <div className="lg:col-span-3 glass-panel p-6 rounded-2xl flex flex-col justify-between h-[520px]">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold flex items-center gap-2 text-indigo-400">
            <Network className="w-5 h-5" /> Live PBFT Graph
          </h2>

          <div className="flex gap-2">
            <div className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${
              consensusStage === 'Proposing' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/25' :
              consensusStage === 'Preparing' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/25' :
              consensusStage === 'Committing' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25' :
              consensusStage === 'Committed' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' :
              'bg-slate-900/80 text-slate-500 border border-slate-800'
            }`}>
              State: {consensusStage}
            </div>
          </div>
        </div>

        {/* Network Diagram */}
        <div className="relative flex-1 bg-slate-950/40 rounded-2xl border border-slate-850 flex items-center justify-center overflow-hidden">
          <svg className="w-full h-full max-w-[500px] max-h-[400px]" viewBox="0 0 500 400">
            {/* Draw permanent connections between nodes */}
            {Object.keys(nodePositions).map((fromId) =>
              Object.keys(nodePositions).map((toId) => {
                if (fromId >= toId) return null;
                const from = nodePositions[fromId];
                const to = nodePositions[toId];
                return (
                  <line
                    key={`${fromId}-${toId}`}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke="#1e293b"
                    strokeWidth="1.5"
                  />
                );
              })
            )}

            {/* Draw flying packet lines */}
            {activePackets.map((packet) => {
              const from = nodePositions[packet.from];
              const to = nodePositions[packet.to];
              if (!from || !to) return null;

              return (
                <g key={packet.id}>
                  {/* Packet flow line */}
                  <line
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke={getPacketColor(packet.type)}
                    strokeWidth="2.5"
                    className="packet-line"
                  />
                  {/* Flying packet dot */}
                  <circle r="5" fill={getPacketColor(packet.type)}>
                    <animateMotion
                      dur="1.2s"
                      repeatCount="indefinite"
                      path={`M ${from.x} ${from.y} L ${to.x} ${to.y}`}
                    />
                  </circle>
                </g>
              );
            })}

            {/* Draw Validator Nodes */}
            {Object.keys(nodePositions).map((key) => {
              const id = parseInt(key);
              const pos = nodePositions[id];
              const nodeInfo = nodes.find((n) => n.node_id === id);
              const isOnline = nodeInfo ? nodeInfo.is_online : true;

              return (
                <g key={id}>
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r="24"
                    fill={isOnline ? (id === 0 ? "#1e293b" : "#0f172a") : "#2d161a"}
                    stroke={isOnline ? (id === 0 ? "#e11d48" : "#4f46e5") : "#ef4444"}
                    strokeWidth="2.5"
                    className={`transition-all duration-300 ${isOnline && consensusStage !== 'Idle' ? 'animate-pulse' : ''}`}
                  />
                  <text
                    x={pos.x}
                    y={pos.y + 5}
                    fill={isOnline ? "#f8fafc" : "#fca5a5"}
                    fontSize="11"
                    fontWeight="bold"
                    textAnchor="middle"
                    className="select-none font-mono"
                  >
                    V{id}
                  </text>
                  <text
                    x={pos.x}
                    y={pos.y + 40}
                    fill="#94a3b8"
                    fontSize="10"
                    textAnchor="middle"
                    className="select-none font-semibold"
                  >
                    {pos.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="flex justify-between items-center text-xs text-slate-500 mt-2">
          <div className="flex gap-4">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-rose-600 rounded-full"></span> Pre-Prepare</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-amber-500 rounded-full"></span> Prepare</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-emerald-500 rounded-full"></span> Commit</span>
          </div>
        </div>
      </div>

      {/* Console Logs Panel (2/5 width) */}
      <div className="lg:col-span-2 glass-panel p-6 rounded-2xl flex flex-col justify-between h-[520px]">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold flex items-center gap-2 text-indigo-400">
            <Terminal className="w-5 h-5" /> Consensus Console
          </h2>
          <button
            onClick={clearLogs}
            className="text-[10px] bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-200 px-2.5 py-1 rounded transition-colors"
          >
            Clear Screen
          </button>
        </div>

        {/* Scrollable console terminal */}
        <div className="flex-1 bg-slate-950 font-mono text-[11px] p-4 rounded-xl border border-slate-900 overflow-y-auto space-y-2 text-slate-300">
          {events.length === 0 ? (
            <div className="text-slate-600 text-xs italic">System idle. Submit a vote from the voter portal to launch PBFT round consensus packets...</div>
          ) : (
            events.map((e, index) => {
              const time = new Date(e.timestamp).toLocaleTimeString();
              let prefixColor = "text-slate-500";
              if (e.event_type === "PRE-PREPARE") prefixColor = "text-rose-500";
              else if (e.event_type === "PREPARE") prefixColor = "text-amber-500";
              else if (e.event_type === "COMMIT") prefixColor = "text-emerald-500";
              else if (e.event_type === "COMMITTED") prefixColor = "text-indigo-400 font-semibold";
              else if (e.event_type === "STATUS") prefixColor = "text-sky-400";

              return (
                <div key={index} className="leading-5 border-b border-slate-950 pb-1">
                  <span className="text-slate-600">[{time}]</span>{' '}
                  <span className={`font-bold ${prefixColor}`}>[{e.event_type}]</span>{' '}
                  {e.from_node !== null && e.from_node !== undefined && (
                    <span className="text-indigo-300 font-semibold">Node {e.from_node}</span>
                  )}
                  {e.to_node !== null && e.to_node !== undefined && (
                    <> &rarr; <span className="text-indigo-300 font-semibold">Node {e.to_node}</span></>
                  )}
                  : <span className="text-slate-300">{e.message}</span>
                </div>
              );
            })
          )}
          <div ref={consoleEndRef} />
        </div>
      </div>
    </div>
  );
}
