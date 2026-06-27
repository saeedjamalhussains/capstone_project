import React, { useState, useEffect } from 'react';
import { Plus, Shield, ShieldAlert, Wifi, WifiOff, Users, Award, Play } from 'lucide-react';

export default function AdminPortal({ backendUrl, fetchElections, elections, nodes, fetchNodes }) {
  const [title, setTitle] = useState('');
  const [candidates, setCandidates] = useState('');
  const [voters, setVoters] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  const handleCreateElection = async (e) => {
    e.preventDefault();
    if (!title || !candidates || !voters) return;

    setLoading(true);
    setMsg(null);

    const candidatesList = candidates.split(',').map(c => c.trim()).filter(Boolean);
    const votersList = voters.split(/[\n,]+/).map(v => v.trim()).filter(Boolean);

    try {
      const res = await fetch(`${backendUrl}/api/elections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          candidates: candidatesList,
          voter_registry: votersList,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setMsg({ type: 'success', text: `Election "${data.title}" successfully created! ID: ${data.id}` });
        setTitle('');
        setCandidates('');
        setVoters('');
        fetchElections();
      } else {
        const errText = await res.text();
        setMsg({ type: 'error', text: `Failed: ${errText}` });
      }
    } catch (err) {
      setMsg({ type: 'error', text: 'Network connection failed.' });
    } finally {
      setLoading(false);
    }
  };

  const toggleNode = async (nodeId) => {
    try {
      const res = await fetch(`${backendUrl}/api/nodes/${nodeId}/toggle`, {
        method: 'POST',
      });
      if (res.ok) {
        fetchNodes();
      }
    } catch (err) {
      console.error("Failed to toggle node", err);
    }
  };

  // Determine active validators count
  const onlineCount = nodes.filter(n => n.is_online).length;
  // PBFT requires 3f + 1 nodes. With N=4, f=1.
  // We need 2f + 1 = 3 nodes online to reach consensus.
  const canReachConsensus = onlineCount >= 3;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* LEFT: Create Election */}
      <div className="lg:col-span-2 glass-panel p-6 rounded-2xl relative overflow-hidden">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2 text-indigo-400">
          <Plus className="w-6 h-6" /> Create New Election Cycle
        </h2>

        <form onSubmit={handleCreateElection} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Election Title</label>
            <input
              type="text"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500 transition-colors"
              placeholder="e.g., Student Council President Election 2026"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Candidates <span className="text-slate-500 text-xs">(comma-separated)</span>
            </label>
            <input
              type="text"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500 transition-colors"
              placeholder="Alice Smith, Bob Jones, Charlie Brown"
              value={candidates}
              onChange={(e) => setCandidates(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Eligible Voter ID Registry <span className="text-slate-500 text-xs">(one per line or comma-separated)</span>
            </label>
            <textarea
              className="w-full h-32 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500 transition-colors resize-none"
              placeholder="STUDENT001&#10;STUDENT002&#10;STUDENT003"
              value={voters}
              onChange={(e) => setVoters(e.target.value)}
              required
            />
          </div>

          {msg && (
            <div className={`p-4 rounded-xl text-sm ${msg.type === 'success' ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-500/20' : 'bg-rose-950/40 text-rose-300 border border-rose-500/20'}`}>
              {msg.text}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
          >
            {loading ? 'Initializing ledger parameters...' : 'Deploy Election Parameters'}
          </button>
        </form>
      </div>

      {/* RIGHT: PBFT Network & Active Elections */}
      <div className="space-y-8">
        {/* PBFT Validator Node Status */}
        <div className="glass-panel p-6 rounded-2xl">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold flex items-center gap-2 text-indigo-400">
              <Shield className="w-5 h-5" /> Validator Network
            </h2>
            <div className={`px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 ${canReachConsensus ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/30' : 'bg-rose-950/40 text-rose-400 border border-rose-500/30'}`}>
              {canReachConsensus ? (
                <>
                  <Wifi className="w-3.5 h-3.5" /> PBFT Active
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5" /> Stalled (No Quorum)
                </>
              )}
            </div>
          </div>

          <p className="text-slate-400 text-xs mb-4">
            TSBTChain uses PBFT consensus. To achieve block finality, at least 3 nodes ($2f + 1$ out of 4) must be online. Toggle nodes to simulate faults.
          </p>

          <div className="space-y-3">
            {nodes.map((node) => (
              <div
                key={node.node_id}
                className={`p-3.5 rounded-xl border flex items-center justify-between transition-all ${
                  node.is_online
                    ? 'bg-slate-900/60 border-slate-800'
                    : 'bg-rose-950/10 border-rose-900/30'
                }`}
              >
                <div>
                  <div className="font-semibold text-sm flex items-center gap-2">
                    Validator #{node.node_id}
                    {node.node_id === 0 && (
                      <span className="text-[10px] bg-amber-500/10 border border-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">
                        Primary
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">Port {node.port}</div>
                </div>

                <button
                  onClick={() => toggleNode(node.node_id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1 ${
                    node.is_online
                      ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400 hover:bg-rose-950/40 hover:border-rose-500/30 hover:text-rose-400'
                      : 'bg-rose-950/40 border-rose-500/30 text-rose-400 hover:bg-emerald-950/40 hover:border-emerald-500/30 hover:text-emerald-400'
                  }`}
                >
                  {node.is_online ? (
                    <>
                      <Wifi className="w-3.5 h-3.5" /> Online
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-3.5 h-3.5" /> Offline
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>

          {!canReachConsensus && (
            <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                <strong>Warning:</strong> Consensus requires &ge; 3 nodes online. Any vote cast now will result in a gateway timeout.
              </span>
            </div>
          )}
        </div>

        {/* Active Elections */}
        <div className="glass-panel p-6 rounded-2xl">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-indigo-400">
            <Award className="w-5 h-5" /> Active Elections
          </h2>
          <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
            {elections.length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-sm">No active elections found.</div>
            ) : (
              elections.map((el) => (
                <div key={el.id} className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl">
                  <div className="font-semibold text-sm text-slate-200">{el.title}</div>
                  <div className="text-xs text-slate-500 mt-1 flex justify-between">
                    <span>ID: {el.id}</span>
                    <span>Voters: {el.voter_registry.length}</span>
                  </div>
                  <div className="flex gap-1.5 flex-wrap mt-2">
                    {el.candidates.map((c, i) => (
                      <span key={i} className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full border border-slate-700/50">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
