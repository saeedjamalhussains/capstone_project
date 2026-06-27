import React, { useState, useEffect } from 'react';
import { ShieldCheck, UserCheck, Flame, Key, Award, Download, Copy, CheckCircle2 } from 'lucide-react';

export default function VoterPortal({ backendUrl, elections, setActiveTab }) {
  const [selectedElectionId, setSelectedElectionId] = useState('');
  const [voterId, setVoterId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Authentication outcome
  const [authData, setAuthData] = useState(null); // { dei, tsbt, authority_pubkey }
  const [selectedCandidate, setSelectedCandidate] = useState('');
  const [votingLoading, setVotingLoading] = useState(false);
  const [voteSuccessData, setVoteSuccessData] = useState(null); // { tx_id, receipt, block_index }

  useEffect(() => {
    if (elections.length > 0 && !selectedElectionId) {
      setSelectedElectionId(elections[0].id);
    }
  }, [elections, selectedElectionId]);

  const handleAuthenticate = async (e) => {
    e.preventDefault();
    if (!selectedElectionId || !voterId) return;

    setLoading(true);
    setError(null);
    setAuthData(null);

    try {
      const res = await fetch(`${backendUrl}/api/elections/${selectedElectionId}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voter_id: voterId }),
      });

      if (res.ok) {
        const data = await res.json();
        setAuthData(data);
      } else {
        const errText = await res.text();
        setError(errText || 'Invalid credentials or already voted.');
      }
    } catch (err) {
      setError('Connection failed. Make sure the backend server is running.');
    } finally {
      setLoading(false);
    }
  };

  const handleCastVote = async () => {
    if (!selectedCandidate || !authData) return;

    setVotingLoading(true);
    setError(null);

    try {
      const res = await fetch(`${backendUrl}/api/elections/${selectedElectionId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dei: authData.dei,
          tsbt_id: authData.tsbt.id,
          vote_commitment: selectedCandidate,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setVoteSuccessData(data);
        // Burn local credential visual state
        setAuthData(prev => ({
          ...prev,
          tsbt: { ...prev.tsbt, status: 'Burned' }
        }));
      } else {
        const errText = await res.text();
        setError(errText || 'Consensus timeout or credential invalidation.');
      }
    } catch (err) {
      setError('Consensus node broadcast timed out. Nodes might be offline.');
    } finally {
      setVotingLoading(false);
    }
  };

  const resetVoterState = () => {
    setVoterId('');
    setAuthData(null);
    setSelectedCandidate('');
    setVoteSuccessData(null);
    setError(null);
  };

  const selectedElection = elections.find(e => e.id === selectedElectionId);

  // STAGE 3: Successful Voting Output
  if (voteSuccessData) {
    return (
      <div className="max-w-2xl mx-auto glass-panel p-8 rounded-3xl border-emerald-500/20 text-center relative">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent"></div>
        <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-8 h-8 text-emerald-400" />
        </div>

        <h2 className="text-3xl font-extrabold mb-2 text-slate-100">Vote Cast Immutably</h2>
        <p className="text-slate-400 text-sm mb-8">
          Your credential has been burned and block consensus is complete.
        </p>

        {/* Dynamic burn visualization */}
        <div className="relative border border-dashed border-rose-500/30 bg-rose-950/10 p-6 rounded-2xl mb-8 flex flex-col items-center">
          <Flame className="w-10 h-10 text-rose-500 animate-pulse mb-2" />
          <div className="text-sm font-semibold text-rose-400">CREDENTIAL DESTROYED (BURN-ON-VOTE)</div>
          <div className="text-xs text-slate-500 mt-1">ID: {authData.tsbt.id} status updated to: BURNED</div>
        </div>

        {/* Cryptographic Receipt */}
        <div className="bg-slate-900/80 border border-slate-800 p-6 rounded-2xl text-left space-y-4">
          <div className="flex justify-between items-center pb-3 border-b border-slate-800">
            <span className="text-xs text-slate-500 font-mono">RECEIPT METADATA</span>
            <span className="text-xs text-indigo-400 font-semibold bg-indigo-500/10 px-2 py-0.5 rounded">Block #{voteSuccessData.block_index}</span>
          </div>

          <div>
            <div className="text-xs text-slate-400 font-semibold mb-1">AUDIT RECEIPT HASH (SHA3-512)</div>
            <div className="flex items-center gap-2">
              <code className="text-xs text-emerald-300 font-mono bg-slate-950 px-3 py-2 rounded-lg flex-1 overflow-x-auto select-all">
                {voteSuccessData.receipt}
              </code>
              <button 
                onClick={() => navigator.clipboard.writeText(voteSuccessData.receipt)}
                className="p-2 bg-slate-950 text-slate-400 hover:text-slate-200 rounded-lg border border-slate-800 transition-colors"
                title="Copy Receipt Hash"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-400 font-semibold mb-1">TRANSACTION ID</div>
            <code className="text-xs text-slate-400 font-mono bg-slate-950 px-3 py-1.5 rounded-lg block">
              {voteSuccessData.tx_id}
            </code>
          </div>
        </div>

        <div className="mt-8 flex gap-4 justify-center">
          <button
            onClick={() => setActiveTab('explorer')}
            className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded-xl border border-slate-700 transition-all"
          >
            Auditor Explorer
          </button>
          <button
            onClick={resetVoterState}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition-all"
          >
            Authenticate New Session
          </button>
        </div>
      </div>
    );
  }

  // STAGE 2: Ballot / DEI / TSBT Certificate UI
  if (authData) {
    const isBurned = authData.tsbt.status === 'Burned';
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-6xl mx-auto">
        {/* LEFT: Dynamic Identity (DEI) & Soulbound Credential (TSBT) Display */}
        <div className="space-y-6">
          <div className="glass-panel p-6 rounded-2xl">
            <h3 className="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2">
              <Key className="w-5 h-5 text-indigo-400" /> Identity Privacy Mechanics
            </h3>
            
            <div className="space-y-4">
              <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
                <div className="text-xs text-slate-400 font-bold">DYNAMIC ELECTION IDENTITY (DEI) CALCULATION</div>
                <div className="text-[11px] text-slate-500 font-mono">
                  DEI = SHA3-512(PermanentID + ElectionID + Salt)
                </div>
                <div className="pt-2 border-t border-slate-800/60 font-mono text-xs text-indigo-300 break-all bg-slate-950 p-2 rounded">
                  {authData.dei}
                </div>
              </div>
              <p className="text-slate-400 text-xs leading-relaxed">
                By generating an election-specific DEI hash, the system ensures your permanent credentials never touch the blockchain and your voting records cannot be linked across multiple elections.
              </p>
            </div>
          </div>

          {/* TSBT Certificate Card */}
          <div className="glass-panel-glow p-6 rounded-3xl relative overflow-hidden flex flex-col justify-between h-72 group shadow-xl">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl -z-10 group-hover:bg-indigo-500/20 transition-all"></div>
            
            <div>
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-xs font-bold text-indigo-400 tracking-wider">TSBT ELECTION CREDENTIAL</div>
                  <div className="text-[10px] text-slate-500 font-mono">Time-Bound Soulbound Token</div>
                </div>
                <Award className="w-8 h-8 text-indigo-400/80" />
              </div>

              <div className="mt-8 space-y-2.5">
                <div className="flex justify-between">
                  <span className="text-[10px] text-slate-500">CREDENTIAL ID</span>
                  <span className="text-xs font-semibold text-slate-200 font-mono">{authData.tsbt.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[10px] text-slate-500">ASSOCIATED DEI</span>
                  <span className="text-xs font-semibold text-slate-300 font-mono">{authData.dei.substring(0, 16)}...</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[10px] text-slate-500">VALIDITY PERIOD</span>
                  <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    Active (1 Hour Expiry)
                  </span>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-800/80 pt-4 flex justify-between items-center text-xs">
              <div>
                <div className="text-[9px] text-slate-500">ED25519 DIGITAL SIGNATURE</div>
                <div className="text-[9px] text-slate-400 font-mono truncate w-48">
                  {authData.tsbt.signature.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('')}...
                </div>
              </div>
              <div className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-400">
                ACTIVE
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: Ballot Card */}
        <div className="glass-panel p-8 rounded-3xl flex flex-col justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-1 text-slate-100 flex items-center gap-2">
              <UserCheck className="w-6 h-6 text-indigo-400" /> Cast Secret Ballot
            </h2>
            <p className="text-slate-400 text-xs mb-6">
              Select one candidate. Casting your ballot triggers an atomic "vote and burn" contract on the blockchain ledger.
            </p>

            <div className="space-y-3">
              {selectedElection?.candidates.map((cand, idx) => (
                <label
                  key={idx}
                  className={`p-4 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                    selectedCandidate === cand
                      ? 'bg-indigo-600/10 border-indigo-500 text-indigo-200'
                      : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:bg-slate-800/30'
                  }`}
                >
                  <span className="font-semibold text-sm">{cand}</span>
                  <input
                    type="radio"
                    name="candidate"
                    value={cand}
                    checked={selectedCandidate === cand}
                    onChange={() => setSelectedCandidate(cand)}
                    className="w-4 h-4 accent-indigo-500"
                  />
                </label>
              ))}
            </div>

            {error && (
              <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
                {error}
              </div>
            )}
          </div>

          <div className="mt-8 space-y-3">
            <button
              onClick={handleCastVote}
              disabled={!selectedCandidate || votingLoading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
            >
              {votingLoading ? 'Achieving PBFT Consensus (Broadcasting TCP)...' : 'Cast Atomic Ballot & Burn Credential'}
            </button>
            <button
              onClick={resetVoterState}
              className="w-full bg-transparent hover:bg-slate-900 text-slate-400 text-xs font-semibold py-2 rounded-xl transition-colors border border-transparent hover:border-slate-800"
            >
              Cancel & Log Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // STAGE 1: Voter Registry Authentication Form
  return (
    <div className="max-w-md mx-auto glass-panel p-8 rounded-3xl relative overflow-hidden">
      <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl"></div>

      <div className="text-center mb-8">
        <div className="w-14 h-14 bg-indigo-500/10 border border-indigo-500/25 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <ShieldCheck className="w-7 h-7 text-indigo-400" />
        </div>
        <h2 className="text-2xl font-bold text-slate-100">Voter Authentication</h2>
        <p className="text-slate-400 text-xs mt-1">Get anonymous Dynamic Election Identity and TSBT</p>
      </div>

      <form onSubmit={handleAuthenticate} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Select Election</label>
          <select
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500 transition-colors"
            value={selectedElectionId}
            onChange={(e) => setSelectedElectionId(e.target.value)}
            required
          >
            {elections.length === 0 ? (
              <option value="">No elections available</option>
            ) : (
              elections.map((el) => (
                <option key={el.id} value={el.id}>
                  {el.title}
                </option>
              ))
            )}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Permanent Registry ID</label>
          <input
            type="text"
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500 transition-colors"
            placeholder="e.g., STUDENT001"
            value={voterId}
            onChange={(e) => setVoterId(e.target.value)}
            required
          />
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || elections.length === 0}
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
        >
          {loading ? 'Verifying eligibility...' : 'Verify Registry & Issue Token'}
        </button>
      </form>
    </div>
  );
}
