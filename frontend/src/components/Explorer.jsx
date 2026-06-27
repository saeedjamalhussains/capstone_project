import React, { useState, useEffect } from 'react';
import { Search, Database, Layers, CheckCircle2, Shield, Clock, HelpCircle, FileSearch } from 'lucide-react';

export default function Explorer({ backendUrl }) {
  const [blockchain, setBlockchain] = useState(null);
  const [expandedBlockIndex, setExpandedBlockIndex] = useState(null);
  const [receiptQuery, setReceiptQuery] = useState('');
  const [auditResult, setAuditResult] = useState(null);
  const [auditError, setAuditError] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchBlockchain = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/blockchain`);
      if (res.ok) {
        const data = await res.json();
        setBlockchain(data);
      }
    } catch (err) {
      console.error("Failed to fetch blockchain data", err);
    }
  };

  useEffect(() => {
    fetchBlockchain();
    // Poll blockchain every 5 seconds
    const interval = setInterval(fetchBlockchain, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleAudit = async (e) => {
    e.preventDefault();
    if (!receiptQuery) return;

    setLoading(true);
    setAuditResult(null);
    setAuditError(false);

    try {
      const res = await fetch(`${backendUrl}/api/audit/${receiptQuery.trim()}`);
      if (res.ok) {
        const data = await res.json();
        setAuditResult(data);
      } else {
        setAuditError(true);
      }
    } catch (err) {
      setAuditError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* LEFT & CENTER: Block Explorer */}
      <div className="lg:col-span-2 space-y-6">
        <h2 className="text-2xl font-bold flex items-center gap-2 text-indigo-400">
          <Layers className="w-6 h-6" /> Immutable Ledger Explorer
        </h2>

        <div className="space-y-4">
          {!blockchain || !blockchain.chain || blockchain.chain.length === 0 ? (
            <div className="glass-panel p-8 text-center text-slate-500 rounded-2xl">
              Loading ledger data...
            </div>
          ) : (
            blockchain.chain.map((block) => {
              const isExpanded = expandedBlockIndex === block.index;
              const date = new Date(block.timestamp * 1000).toLocaleString();

              return (
                <div
                  key={block.index}
                  className={`glass-panel rounded-2xl border transition-all ${
                    isExpanded ? 'border-indigo-500/30 bg-slate-900/40' : 'border-slate-800/80 hover:border-slate-700/50'
                  }`}
                >
                  {/* Block Header Summary */}
                  <div
                    onClick={() => setExpandedBlockIndex(isExpanded ? null : block.index)}
                    className="p-5 flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center font-bold text-indigo-400">
                        #{block.index}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-200">
                          {block.index === 0 ? 'Genesis Block' : `Block containing ${block.transactions.length} Vote(s)`}
                        </div>
                        <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3.5 h-3.5" /> {date}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] font-mono bg-slate-950 px-2.5 py-1 rounded-md text-slate-400 border border-slate-900">
                        {block.hash.substring(0, 8)}...
                      </span>
                    </div>
                  </div>

                  {/* Expanded Block Details */}
                  {isExpanded && (
                    <div className="px-5 pb-5 pt-3 border-t border-slate-800/50 space-y-4 text-xs">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <div className="text-[10px] text-slate-500 font-bold tracking-wider mb-1">PREVIOUS BLOCK HASH</div>
                          <code className="block bg-slate-950 p-2 rounded-lg font-mono text-[10px] text-slate-400 break-all border border-slate-900">
                            {block.prev_hash}
                          </code>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500 font-bold tracking-wider mb-1">CURRENT BLOCK HASH</div>
                          <code className="block bg-slate-950 p-2 rounded-lg font-mono text-[10px] text-indigo-300 break-all border border-indigo-950">
                            {block.hash}
                          </code>
                        </div>
                      </div>

                      {/* PBFT Consensus Signatures */}
                      {block.index > 0 && (
                        <div>
                          <div className="text-[10px] text-slate-500 font-bold tracking-wider mb-1.5">PBFT VALIDATOR MULTISIGNATURES ({block.validator_signatures.length}/4)</div>
                          <div className="space-y-1.5">
                            {block.validator_signatures.map(([nodeId, sig], idx) => {
                              const sigHex = Array.isArray(sig) 
                                ? sig.map(b => b.toString(16).padStart(2, '0')).join('') 
                                : String(sig);
                              return (
                                <div key={idx} className="flex items-center gap-2 bg-slate-950/60 p-2 rounded-lg border border-slate-900">
                                  <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                  <span className="font-semibold text-[10px] text-slate-400">Node {nodeId}:</span>
                                  <code className="text-[9px] text-slate-500 font-mono truncate">{sigHex}</code>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Block Transactions */}
                      <div>
                        <div className="text-[10px] text-slate-500 font-bold tracking-wider mb-2">VOTE TRANSACTION ENTRIES</div>
                        {block.transactions.length === 0 ? (
                          <div className="text-slate-600 italic py-2">No transactions in this block.</div>
                        ) : (
                          block.transactions.map((tx, idx) => (
                            <div key={idx} className="bg-slate-950/80 border border-slate-900 p-4 rounded-xl space-y-2 mb-2">
                              <div className="flex justify-between items-center text-[10px]">
                                <span className="font-mono text-indigo-400">{tx.tx_id}</span>
                                <span className="text-slate-500">{new Date(tx.timestamp * 1000).toLocaleTimeString()}</span>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10px] pt-1">
                                <div>
                                  <span className="text-slate-500 block">DEI (Anonymous Identity)</span>
                                  <code className="text-slate-300 font-mono break-all">{tx.dei.substring(0, 24)}...</code>
                                </div>
                                <div>
                                  <span className="text-slate-500 block">Burned TSBC Credential</span>
                                  <code className="text-slate-300 font-mono">{tx.tsbt_id}</code>
                                </div>
                              </div>

                              <div className="pt-2 border-t border-slate-900/60 grid grid-cols-1 md:grid-cols-2 gap-2 text-[10px]">
                                <div>
                                  <span className="text-slate-500 block">Vote Commitment</span>
                                  <span className="text-emerald-400 font-semibold">{tx.vote_commitment}</span>
                                </div>
                                <div>
                                  <span className="text-slate-500 block">Cryptographic Audit Receipt</span>
                                  <code className="text-slate-400 font-mono break-all">{tx.receipt.substring(0, 20)}...</code>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT: Audit Receipts */}
      <div className="space-y-6">
        <h2 className="text-2xl font-bold flex items-center gap-2 text-indigo-400">
          <FileSearch className="w-6 h-6" /> Voter Receipt Auditor
        </h2>

        <div className="glass-panel p-6 rounded-2xl space-y-4">
          <p className="text-slate-400 text-xs leading-relaxed">
            Verify that your anonymous vote was successfully included in the ledger database. Paste your SHA3-512 receipt hash below to query the blockchain nodes.
          </p>

          <form onSubmit={handleAudit} className="space-y-3">
            <div className="relative">
              <input
                type="text"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-4 pr-10 py-2.5 text-white text-xs focus:outline-none focus:border-indigo-500 font-mono transition-colors"
                placeholder="Paste receipt hash (SHA3-512)..."
                value={receiptQuery}
                onChange={(e) => setReceiptQuery(e.target.value)}
                required
              />
              <button type="submit" className="absolute right-2 top-1.5 p-1.5 text-slate-400 hover:text-slate-200 transition-colors">
                <Search className="w-4 h-4" />
              </button>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold py-2.5 rounded-xl border border-slate-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Searching nodes...' : 'Verify Cryptographic Receipt'}
            </button>
          </form>

          {/* Audit Result Display */}
          {auditResult && (
            <div className="p-4 bg-emerald-950/30 border border-emerald-500/20 text-emerald-300 rounded-xl space-y-3 text-xs animate-fadeIn">
              <div className="flex items-center gap-2 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>RECEIPT VERIFIED VALID</span>
              </div>
              <div className="space-y-1 text-[11px] text-slate-400">
                <div><strong className="text-slate-300">Block Index:</strong> #{auditResult.block_index}</div>
                <div><strong className="text-slate-300">Transaction ID:</strong> {auditResult.tx_id}</div>
                <div className="truncate"><strong className="text-slate-300">DEI Hash:</strong> {auditResult.dei.substring(0, 16)}...</div>
                <div><strong className="text-slate-300">TSBT Credential:</strong> {auditResult.tsbt_id}</div>
              </div>
              <p className="text-[10px] text-slate-500 leading-normal border-t border-emerald-500/10 pt-2">
                This verification proves that the ballot carrying this cryptographic receipt is recorded on the blockchain and has been signed by the consensus validators.
              </p>
            </div>
          )}

          {auditError && (
            <div className="p-4 bg-rose-950/30 border border-rose-500/20 text-rose-300 rounded-xl text-xs flex gap-2">
              <Shield className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <strong>Audit Failed:</strong> Receipt hash not found on the blockchain ledger. Check the hash or wait for block consensus to complete.
              </div>
            </div>
          )}
        </div>

        {/* Informational Panel */}
        <div className="glass-panel p-6 rounded-2xl bg-indigo-950/5">
          <h3 className="text-sm font-bold text-indigo-400 mb-2 flex items-center gap-1.5">
            <HelpCircle className="w-4 h-4" /> Receipt Verification Math
          </h3>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            The receipt is generated by hashing the unique transaction identifier combined with your secret vote selection: `SHA3-512(TxID + Candidate)`. Because it is a one-way cryptographic hash, observers cannot reverse-engineer your selection, yet you can prove your vote was counted by demonstrating the receipt is immutably stored in the ledger.
          </p>
        </div>
      </div>
    </div>
  );
}
