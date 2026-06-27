use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::net::{TcpListener, TcpStream};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::broadcast::Sender;
use crate::blockchain::{Block, Blockchain, Transaction};
use crate::crypto::{sign, verify};
use ed25519_dalek::SigningKey;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum PbftMessage {
    PrePrepare {
        view: u64,
        sequence: u64,
        block: Block,
    },
    Prepare {
        view: u64,
        sequence: u64,
        block_hash: String,
        node_id: u8,
        signature: Vec<u8>,
    },
    Commit {
        view: u64,
        sequence: u64,
        block_hash: String,
        node_id: u8,
        signature: Vec<u8>,
    },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PbftEvent {
    pub from_node: Option<u8>,
    pub to_node: Option<u8>,
    pub event_type: String, // "PRE-PREPARE", "PREPARE", "COMMIT", "COMMITTED", "LOG", "STATUS"
    pub message: String,
    pub timestamp: i64,
}

pub struct ValidatorNode {
    pub node_id: u8,
    pub port: u16,
    pub is_online: Arc<Mutex<bool>>,
    pub signing_key: SigningKey,
    pub validator_pubkeys: HashMap<u8, [u8; 32]>,
    pub blockchain: Arc<Mutex<Blockchain>>,
    pub peer_addresses: HashMap<u8, String>,
    pub prepare_votes: Arc<Mutex<HashMap<String, HashSet<u8>>>>,
    pub commit_votes: Arc<Mutex<HashMap<String, HashSet<u8>>>>,
    pub prepared_blocks: Arc<Mutex<HashSet<String>>>,
    pub committed_blocks: Arc<Mutex<HashSet<String>>>,
    pub active_proposals: Arc<Mutex<HashMap<String, Block>>>,
    pub event_tx: Sender<PbftEvent>,
}

impl ValidatorNode {
    pub fn new(
        node_id: u8,
        port: u16,
        signing_key: SigningKey,
        validator_pubkeys: HashMap<u8, [u8; 32]>,
        blockchain: Arc<Mutex<Blockchain>>,
        peer_addresses: HashMap<u8, String>,
        event_tx: Sender<PbftEvent>,
    ) -> Self {
        Self {
            node_id,
            port,
            is_online: Arc::new(Mutex::new(true)),
            signing_key,
            validator_pubkeys,
            blockchain,
            peer_addresses,
            prepare_votes: Arc::new(Mutex::new(HashMap::new())),
            commit_votes: Arc::new(Mutex::new(HashMap::new())),
            prepared_blocks: Arc::new(Mutex::new(HashSet::new())),
            committed_blocks: Arc::new(Mutex::new(HashSet::new())),
            active_proposals: Arc::new(Mutex::new(HashMap::new())),
            event_tx,
        }
    }

    pub async fn log(&self, msg: String) {
        let _ = self.event_tx.send(PbftEvent {
            from_node: Some(self.node_id),
            to_node: None,
            event_type: "LOG".to_string(),
            message: msg,
            timestamp: chrono::Utc::now().timestamp_millis(),
        });
    }

    pub async fn send_event(&self, to: u8, event_type: &str, msg: &str) {
        let _ = self.event_tx.send(PbftEvent {
            from_node: Some(self.node_id),
            to_node: Some(to),
            event_type: event_type.to_string(),
            message: msg.to_string(),
            timestamp: chrono::Utc::now().timestamp_millis(),
        });
    }

    pub async fn run_tcp_server(self: Arc<Self>) {
        let address = format!("127.0.0.1:{}", self.port);
        let listener = TcpListener::bind(&address).await.unwrap();
        self.log(format!("Validator node started on {}", address)).await;

        loop {
            match listener.accept().await {
                Ok((mut socket, _)) => {
                    let node = self.clone();
                    tokio::spawn(async move {
                        if !*node.is_online.lock().await {
                            return;
                        }
                        // Read length-prefixed message: 4-byte u32 BE length header + payload
                        let mut len_buf = [0u8; 4];
                        if socket.read_exact(&mut len_buf).await.is_err() {
                            return;
                        }
                        let msg_len = u32::from_be_bytes(len_buf) as usize;
                        if msg_len == 0 || msg_len > 1_048_576 {
                            return; // Reject empty or oversized messages (>1MB)
                        }
                        let mut buffer = vec![0u8; msg_len];
                        if socket.read_exact(&mut buffer).await.is_err() {
                            return;
                        }
                        if let Ok(msg) = serde_json::from_slice::<PbftMessage>(&buffer) {
                            node.handle_message(msg).await;
                        }
                    });
                }
                Err(e) => {
                    println!("Error accepting connection on node {}: {:?}", self.node_id, e);
                }
            }
        }
    }

    pub async fn handle_message(&self, msg: PbftMessage) {
        if !*self.is_online.lock().await {
            return;
        }

        match msg {
            PbftMessage::PrePrepare { view, sequence, block } => {
                self.log(format!("Received PrePrepare from Primary (Node 0) for Block #{}", block.index)).await;
                
                // Validate Block
                let is_valid = {
                    let chain = self.blockchain.lock().await;
                    block.index == chain.last_block().index + 1 && block.prev_hash == chain.last_block().hash
                };

                if is_valid {
                    let block_hash = block.hash.clone();
                    self.active_proposals.lock().await.insert(block_hash.clone(), block.clone());

                    // Vote Prepare
                    let sig = sign(&self.signing_key, block_hash.as_bytes());
                    let prepare_msg = PbftMessage::Prepare {
                        view,
                        sequence,
                        block_hash: block_hash.clone(),
                        node_id: self.node_id,
                        signature: sig,
                    };
                    self.broadcast_message(prepare_msg, "PREPARE", &format!("Prepare for Block #{}", block.index)).await;
                } else {
                    self.log(format!("Invalid Block proposal #{} received. Rejecting.", block.index)).await;
                }
            }

            PbftMessage::Prepare { view, sequence, block_hash, node_id, signature } => {
                // Verify signature
                let pubkey = match self.validator_pubkeys.get(&node_id) {
                    Some(key) => key,
                    None => return,
                };

                if verify(pubkey, block_hash.as_bytes(), &signature) {
                    let mut prepares = self.prepare_votes.lock().await;
                    let votes = prepares.entry(block_hash.clone()).or_insert_with(HashSet::new);
                    votes.insert(node_id);

                    self.log(format!("Prepare vote received from Node {} (Total: {})", node_id, votes.len())).await;

                    // Check for 2f + 1 prepares (including itself if proposed or received pre-prepare)
                    // With N=4, f=1, 2f + 1 = 3 prepares.
                    let mut prepared_blocks = self.prepared_blocks.lock().await;
                    if votes.len() >= 2 && !prepared_blocks.contains(&block_hash) {
                        prepared_blocks.insert(block_hash.clone());
                        self.log(format!("Consensus prepared reached for block {}. Broadcasting COMMIT.", &block_hash[..8])).await;
                        
                        let sig = sign(&self.signing_key, block_hash.as_bytes());
                        let commit_msg = PbftMessage::Commit {
                            view,
                            sequence,
                            block_hash: block_hash.clone(),
                            node_id: self.node_id,
                            signature: sig,
                        };
                        self.broadcast_message(commit_msg, "COMMIT", "Committed vote").await;
                    }
                }
            }

            PbftMessage::Commit { view: _, sequence: _, block_hash, node_id, signature } => {
                let pubkey = match self.validator_pubkeys.get(&node_id) {
                    Some(key) => key,
                    None => return,
                };

                if verify(pubkey, block_hash.as_bytes(), &signature) {
                    let mut commits = self.commit_votes.lock().await;
                    let votes = commits.entry(block_hash.clone()).or_insert_with(HashSet::new);
                    votes.insert(node_id);

                    // Add signature to proposal if not already present
                    let mut proposals = self.active_proposals.lock().await;
                    if let Some(block) = proposals.get_mut(&block_hash) {
                        if !block.validator_signatures.iter().any(|(nid, _)| *nid == node_id) {
                            block.validator_signatures.push((node_id, signature));
                        }
                    }

                    self.log(format!("Commit vote received from Node {} (Total: {})", node_id, votes.len())).await;

                    let mut committed_blocks = self.committed_blocks.lock().await;
                    if votes.len() >= 3 && !committed_blocks.contains(&block_hash) {
                        committed_blocks.insert(block_hash.clone());
                        
                        // Execute and commit to local blockchain
                        if let Some(block) = proposals.remove(&block_hash) {
                            let mut chain = self.blockchain.lock().await;
                            if chain.add_block(block.clone()) {
                                self.log(format!("SUCCESS: Block #{} committed to ledger!", block.index)).await;
                                let _ = self.event_tx.send(PbftEvent {
                                    from_node: Some(self.node_id),
                                    to_node: None,
                                    event_type: "COMMITTED".to_string(),
                                    message: serde_json::to_string(&block).unwrap(),
                                    timestamp: chrono::Utc::now().timestamp_millis(),
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    pub async fn propose_block(&self, transactions: Vec<Transaction>) -> Option<Block> {
        if self.node_id != 0 {
            self.log("Only primary (Node 0) can propose blocks!".to_string()).await;
            return None;
        }

        if !*self.is_online.lock().await {
            self.log("Primary is offline, proposal aborted".to_string()).await;
            return None;
        }

        let (index, prev_hash) = {
            let chain = self.blockchain.lock().await;
            let last = chain.last_block();
            (last.index + 1, last.hash.clone())
        };

        let block = Block::new(index, transactions, prev_hash);
        let block_hash = block.hash.clone();
        
        self.active_proposals.lock().await.insert(block_hash.clone(), block.clone());
        self.log(format!("Primary proposing Block #{} with hash {}", index, &block_hash[..8])).await;

        // Primary automatically signs its own proposal
        let sig = sign(&self.signing_key, block_hash.as_bytes());
        self.active_proposals.lock().await.get_mut(&block_hash).unwrap().validator_signatures.push((0, sig));

        // Add self prepare vote
        self.prepare_votes.lock().await.entry(block_hash.clone()).or_insert_with(HashSet::new).insert(0);

        let preprepare = PbftMessage::PrePrepare {
            view: 0,
            sequence: index,
            block: block.clone(),
        };

        self.broadcast_message(preprepare, "PRE-PREPARE", &format!("Propose Block #{}", index)).await;
        Some(block)
    }

    pub async fn broadcast_message(&self, msg: PbftMessage, event_type: &str, log_desc: &str) {
        let serialized = serde_json::to_vec(&msg).unwrap();
        
        for (&peer_id, addr) in &self.peer_addresses {
            if peer_id == self.node_id { continue; }
            
            let peer_addr = addr.clone();
            let serialized_clone = serialized.clone();
            let node_id = self.node_id;
            let self_ref = self.event_tx.clone();
            let type_str = event_type.to_string();
            let desc_str = log_desc.to_string();

            tokio::spawn(async move {
                // Attempt to send TCP packet
                match TcpStream::connect(&peer_addr).await {
                    Ok(mut stream) => {
                        // Send length-prefixed message: 4-byte u32 BE header + payload
                        let len_bytes = (serialized_clone.len() as u32).to_be_bytes();
                        let _ = stream.write_all(&len_bytes).await;
                        let _ = stream.write_all(&serialized_clone).await;
                        let _ = self_ref.send(PbftEvent {
                            from_node: Some(node_id),
                            to_node: Some(peer_id),
                            event_type: type_str,
                            message: desc_str,
                            timestamp: chrono::Utc::now().timestamp_millis(),
                        });
                    }
                    Err(_) => {
                        // Peer node is likely offline
                    }
                }
            });
        }
    }
}
