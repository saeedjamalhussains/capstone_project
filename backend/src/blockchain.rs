use serde::{Deserialize, Serialize};
use crate::crypto::{sha3_512, verify};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Transaction {
    pub tx_id: String,
    pub dei: String,
    pub tsbt_id: String,
    pub vote_commitment: String, // Encrypted or plain anonymized vote
    pub receipt: String,          // Cryptographic audit receipt
    pub timestamp: i64,
}

impl Transaction {
    pub fn new(dei: String, tsbt_id: String, vote_commitment: String) -> Self {
        let timestamp = chrono::Utc::now().timestamp();
        let payload = format!("{}:{}:{}:{}", dei, tsbt_id, vote_commitment, timestamp);
        let tx_id = format!("TX-{}", &sha3_512(payload.as_bytes())[..16].to_uppercase());
        let receipt = sha3_512(format!("{}:{}", tx_id, vote_commitment).as_bytes());
        
        Self {
            tx_id,
            dei,
            tsbt_id,
            vote_commitment,
            receipt,
            timestamp,
        }
    }

    pub fn hash(&self) -> String {
        let serialized = serde_json::to_string(self).unwrap();
        sha3_512(serialized.as_bytes())
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Block {
    pub index: u64,
    pub timestamp: i64,
    pub transactions: Vec<Transaction>,
    pub prev_hash: String,
    pub hash: String,
    pub validator_signatures: Vec<(u8, Vec<u8>)>, // Node ID and Ed25519 signature
}

impl Block {
    pub fn new(index: u64, transactions: Vec<Transaction>, prev_hash: String) -> Self {
        let timestamp = chrono::Utc::now().timestamp();
        let mut block = Self {
            index,
            timestamp,
            transactions,
            prev_hash,
            hash: "".to_string(),
            validator_signatures: Vec::new(),
        };
        block.hash = block.calculate_hash();
        block
    }

    pub fn calculate_hash(&self) -> String {
        let mut input = format!("{}:{}:{}", self.index, self.timestamp, self.prev_hash);
        for tx in &self.transactions {
            input.push_str(&tx.hash());
        }
        sha3_512(input.as_bytes())
    }

    pub fn verify_signatures(&self, validator_keys: &std::collections::HashMap<u8, [u8; 32]>) -> bool {
        // Need at least 2f+1 signatures. For N=4, f=1, so we need at least 3 signatures
        if self.validator_signatures.len() < 3 {
            return false;
        }
        let block_hash_bytes = self.hash.as_bytes();
        for &(node_id, ref sig) in &self.validator_signatures {
            if let Some(pubkey) = validator_keys.get(&node_id) {
                if !verify(pubkey, block_hash_bytes, sig) {
                    return false;
                }
            } else {
                return false;
            }
        }
        true
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Blockchain {
    pub chain: Vec<Block>,
}

impl Blockchain {
    pub fn new() -> Self {
        let genesis_block = Block::new(0, vec![], "0".repeat(128));
        Self {
            chain: vec![genesis_block],
        }
    }

    pub fn last_block(&self) -> &Block {
        self.chain.last().unwrap()
    }

    pub fn add_block(&mut self, block: Block) -> bool {
        // Validate block
        if block.index != self.last_block().index + 1 {
            return false;
        }
        if block.prev_hash != self.last_block().hash {
            return false;
        }
        if block.hash != block.calculate_hash() {
            return false;
        }
        self.chain.push(block);
        true
    }

    pub fn is_chain_valid(&self) -> bool {
        for i in 1..self.chain.len() {
            let current = &self.chain[i];
            let prev = &self.chain[i - 1];
            if current.prev_hash != prev.hash {
                return false;
            }
            if current.hash != current.calculate_hash() {
                return false;
            }
        }
        true
    }
}
