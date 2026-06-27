use serde::{Deserialize, Serialize};
use crate::crypto::{sha3_512, sign, verify};
use ed25519_dalek::SigningKey;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum TsbtStatus {
    Active,
    Burned,
    Expired,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Tsbt {
    pub id: String,
    pub dei: String,
    pub election_id: String,
    pub issued_at: i64,
    pub expires_at: i64,
    pub status: TsbtStatus,
    pub signature: Vec<u8>, // Signature of the token by the authority
}

impl Tsbt {
    pub fn new(
        dei: String,
        election_id: String,
        duration_secs: i64,
        authority_key: &SigningKey,
    ) -> Self {
        let now = chrono::Utc::now().timestamp();
        let expires_at = now + duration_secs;
        let id = format!("TSBT-{}", sha3_512(format!("{}:{}:{}", dei, election_id, now).as_bytes())[..16].to_uppercase());
        
        let mut tsbt = Self {
            id,
            dei,
            election_id,
            issued_at: now,
            expires_at,
            status: TsbtStatus::Active,
            signature: Vec::new(),
        };
        
        // Sign the core payload
        let payload = tsbt.signing_payload();
        tsbt.signature = sign(authority_key, &payload);
        tsbt
    }

    pub fn signing_payload(&self) -> Vec<u8> {
        format!("{}:{}:{}:{}:{}", self.id, self.dei, self.election_id, self.issued_at, self.expires_at).into_bytes()
    }

    pub fn verify_signature(&self, authority_pubkey: &[u8; 32]) -> bool {
        verify(authority_pubkey, &self.signing_payload(), &self.signature)
    }

    pub fn is_valid(&self, current_time: i64) -> bool {
        self.status == TsbtStatus::Active && current_time < self.expires_at
    }
}
