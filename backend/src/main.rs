mod crypto;
mod identity;
mod tsbt;
mod blockchain;
mod pbft;
mod db;
mod ws;

use axum::{
    routing::{get, post},
    Router, Json, Extension,
    extract::Path,
    http::StatusCode,
};
use tower_http::cors::CorsLayer;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{broadcast, Mutex};
use crate::crypto::{generate_keypair, sha3_512};
use crate::identity::generate_dei;
use crate::tsbt::{Tsbt, TsbtStatus};
use crate::blockchain::{Blockchain, Transaction, Block};
use crate::pbft::{ValidatorNode, PbftEvent};
use crate::db::{DbClient, Election};
use crate::ws::{WsHub, ws_handler};

// Global App State
struct AppState {
    db: DbClient,
    ws_hub: Arc<WsHub>,
    authority_signing_key: ed25519_dalek::SigningKey,
    authority_verifying_key_bytes: [u8; 32],
    validators: Vec<Arc<ValidatorNode>>,
}

#[derive(Deserialize)]
struct CreateElectionInput {
    title: String,
    candidates: Vec<String>,
    voter_registry: Vec<String>,
}

#[derive(Deserialize)]
struct AuthInput {
    voter_id: String,
}

#[derive(Serialize)]
struct AuthResponse {
    dei: String,
    tsbt: Tsbt,
    authority_pubkey: String,
}

#[derive(Deserialize)]
struct VoteInput {
    dei: String,
    tsbt_id: String,
    vote_commitment: String,
}

#[derive(Serialize)]
struct VoteResponse {
    tx_id: String,
    receipt: String,
    block_index: u64,
}

#[derive(Serialize)]
struct NodeStatus {
    node_id: u8,
    port: u16,
    is_online: bool,
}

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    println!("Starting TSBTChain Backend Server...");

    // Setup global WebSocket broadcast hub
    let ws_hub = Arc::new(WsHub::new());

    // Setup internal PBFT event channel
    let (event_tx, _event_rx) = broadcast::channel::<PbftEvent>(1000);

    // Initialize Database (with fallback)
    let db = DbClient::new().await;

    // Generate authority keypair (used to sign TSBT credentials)
    let (auth_signing, auth_verifying) = generate_keypair();
    let auth_verifying_bytes = auth_verifying.to_bytes();

    // Initialize 4 Validator Nodes with their own keys
    let mut validator_pubkeys = HashMap::new();
    let mut validator_keys = Vec::new();
    
    for i in 0..4 {
        let (sig_key, pub_key) = generate_keypair();
        validator_pubkeys.insert(i, pub_key.to_bytes());
        validator_keys.push(sig_key);
    }

    let mut peer_addresses = HashMap::new();
    peer_addresses.insert(0, "127.0.0.1:8000".to_string());
    peer_addresses.insert(1, "127.0.0.1:8001".to_string());
    peer_addresses.insert(2, "127.0.0.1:8002".to_string());
    peer_addresses.insert(3, "127.0.0.1:8003".to_string());

    // Shared blockchain ledger
    let blockchain = Arc::new(Mutex::new(Blockchain::new()));

    let mut validators = Vec::new();
    for i in 0..4 {
        let node = Arc::new(ValidatorNode::new(
            i,
            8000 + i as u16,
            validator_keys[i as usize].clone(),
            validator_pubkeys.clone(),
            blockchain.clone(),
            peer_addresses.clone(),
            event_tx.clone(),
        ));
        validators.push(node);
    }

    // Spin up TCP servers for validators
    for node in validators.iter().cloned() {
        tokio::spawn(node.run_tcp_server());
    }

    // Forward internal PBFT events to the WebSocket clients
    let ws_hub_clone = ws_hub.clone();
    let mut event_rx_forward = event_tx.subscribe();
    tokio::spawn(async move {
        while let Ok(event) = event_rx_forward.recv().await {
            if let Ok(json_str) = serde_json::to_string(&event) {
                let _ = ws_hub_clone.tx.send(json_str);
            }
        }
    });

    let state = Arc::new(AppState {
        db,
        ws_hub,
        authority_signing_key: auth_signing,
        authority_verifying_key_bytes: auth_verifying_bytes,
        validators,
    });

    // Axum Router
    let app = Router::new()
        .route("/ws", get(ws_handler))
        .route("/api/elections", get(list_elections).post(create_election))
        .route("/api/elections/:id", get(get_election))
        .route("/api/elections/:id/auth", post(authenticate_voter))
        .route("/api/elections/:id/vote", post(cast_vote))
        .route("/api/blockchain", get(get_blockchain))
        .route("/api/nodes/status", get(get_nodes_status))
        .route("/api/nodes/:id/toggle", post(toggle_node))
        .route("/api/audit/:receipt", get(audit_receipt))
        .layer(CorsLayer::permissive())
        .layer(Extension(state.ws_hub.clone()))
        .layer(Extension(state));

    let listener = tokio::net::TcpListener::bind("127.0.0.1:5000").await.unwrap();
    println!("API Server listening on http://localhost:5000");
    axum::serve(listener, app).await.unwrap();
}

// ROUTE HANDLERS

async fn create_election(
    Extension(state): Extension<Arc<AppState>>,
    Json(payload): Json<CreateElectionInput>,
) -> impl axum::response::IntoResponse {
    let unique_seed = format!("{}:{}", payload.title, chrono::Utc::now().timestamp_millis());
    let election_id = format!("EL-{}", &sha3_512(unique_seed.as_bytes())[..8].to_uppercase());
    let salt = format!("SALT-{}", &sha3_512(format!("salt:{}", unique_seed).as_bytes())[..8]);
    
    let election = Election {
        id: election_id.clone(),
        title: payload.title,
        candidates: payload.candidates,
        voter_registry: payload.voter_registry,
        status: "Active".to_string(),
        salt,
    };
    
    state.db.save_election(election.clone()).await;
    (StatusCode::CREATED, Json(election))
}

async fn list_elections(
    Extension(state): Extension<Arc<AppState>>,
) -> impl axum::response::IntoResponse {
    let list = state.db.list_elections().await;
    Json(list)
}

async fn get_election(
    Path(id): Path<String>,
    Extension(state): Extension<Arc<AppState>>,
) -> Result<impl axum::response::IntoResponse, StatusCode> {
    match state.db.get_election(&id).await {
        Some(el) => Ok(Json(el)),
        None => Err(StatusCode::NOT_FOUND),
    }
}

async fn authenticate_voter(
    Path(election_id): Path<String>,
    Extension(state): Extension<Arc<AppState>>,
    Json(payload): Json<AuthInput>,
) -> Result<impl axum::response::IntoResponse, (StatusCode, String)> {
    // 1. Verify Election Exists
    let election = state.db.get_election(&election_id).await
        .ok_or((StatusCode::NOT_FOUND, "Election not found".to_string()))?;

    // 2. Verify Voter Eligibility
    if !election.voter_registry.contains(&payload.voter_id) {
        return Err((StatusCode::FORBIDDEN, "Voter is not registered/eligible".to_string()));
    }

    // 3. Generate DEI (Dynamic Election Identity)
    let dei = generate_dei(&payload.voter_id, &election_id, &election.salt);

    // 4. Check for Existing TSBT for this DEI
    if let Some(existing_tsbt) = state.db.get_tsbt_by_dei(&dei, &election_id).await {
        if existing_tsbt.status == TsbtStatus::Burned {
            return Err((StatusCode::BAD_REQUEST, "Vote already cast. Credential burned.".to_string()));
        }
        return Ok(Json(AuthResponse {
            dei,
            tsbt: existing_tsbt,
            authority_pubkey: state.authority_verifying_key_bytes.iter().map(|b| format!("{:02x}", b)).collect::<String>(),
        }));
    }

    // 5. Issue Time-Bound Soulbound Token (valid for 1 hour)
    let tsbt = Tsbt::new(
        dei.clone(),
        election_id,
        3600, // 1 hour expiration
        &state.authority_signing_key,
    );

    state.db.save_tsbt(tsbt.clone()).await;

    Ok(Json(AuthResponse {
        dei,
        tsbt,
        authority_pubkey: state.authority_verifying_key_bytes.iter().map(|b| format!("{:02x}", b)).collect::<String>(),
    }))
}

async fn cast_vote(
    Path(election_id): Path<String>,
    Extension(state): Extension<Arc<AppState>>,
    Json(payload): Json<VoteInput>,
) -> Result<impl axum::response::IntoResponse, (StatusCode, String)> {
    // 1. Verify TSBT Credential
    let tsbt = state.db.get_tsbt(&payload.tsbt_id).await
        .ok_or((StatusCode::BAD_REQUEST, "Credential not found".to_string()))?;

    if tsbt.dei != payload.dei || tsbt.election_id != election_id {
        return Err((StatusCode::BAD_REQUEST, "Credential identity mismatch".to_string()));
    }

    if tsbt.status != TsbtStatus::Active {
        return Err((StatusCode::BAD_REQUEST, "Credential has already been burned or expired".to_string()));
    }

    let now = chrono::Utc::now().timestamp();
    if now >= tsbt.expires_at {
        return Err((StatusCode::BAD_REQUEST, "Credential has expired".to_string()));
    }

    // Verify cryptographic signature on the TSBT
    if !tsbt.verify_signature(&state.authority_verifying_key_bytes) {
        return Err((StatusCode::BAD_REQUEST, "Invalid credential signature".to_string()));
    }

    // Atomic Burn & Vote Proposal:
    // Mark TSBT burned instantly in database
    if !state.db.burn_tsbt(&payload.tsbt_id).await {
        return Err((StatusCode::INTERNAL_SERVER_ERROR, "Failed to burn credential".to_string()));
    }

    // Create block transaction
    let transaction = Transaction::new(payload.dei, payload.tsbt_id, payload.vote_commitment);
    let tx_id = transaction.tx_id.clone();
    let receipt = transaction.receipt.clone();

    // 2. Submit transaction to Primary Node (Node 0) for consensus
    let primary_node = &state.validators[0];
    
    // Subscribe to COMMITTED events so we can reply after block finality
    let mut rx = state.validators[0].event_tx.subscribe();

    let proposed_block = primary_node.propose_block(vec![transaction]).await;
    if proposed_block.is_none() {
        return Err((StatusCode::SERVICE_UNAVAILABLE, "PBFT Primary Node is offline".to_string()));
    }

    // Wait for the block to be committed
    let timeout = tokio::time::sleep(std::time::Duration::from_secs(10));
    tokio::pin!(timeout);

    loop {
        tokio::select! {
            Ok(event) = rx.recv() => {
                if event.event_type == "COMMITTED" {
                    if let Ok(block) = serde_json::from_str::<Block>(&event.message) {
                        if block.transactions.iter().any(|tx| tx.tx_id == tx_id) {
                            return Ok(Json(VoteResponse {
                                tx_id,
                                receipt,
                                block_index: block.index,
                            }));
                        }
                    }
                }
            }
            _ = &mut timeout => {
                return Err((StatusCode::GATEWAY_TIMEOUT, "Consensus timed out. Nodes may be offline.".to_string()));
            }
        }
    }
}

async fn get_blockchain(
    Extension(state): Extension<Arc<AppState>>,
) -> impl axum::response::IntoResponse {
    let chain = state.validators[0].blockchain.lock().await.clone();
    Json(chain)
}

async fn get_nodes_status(
    Extension(state): Extension<Arc<AppState>>,
) -> impl axum::response::IntoResponse {
    let mut status_list = Vec::new();
    for node in &state.validators {
        let is_online = *node.is_online.lock().await;
        status_list.push(NodeStatus {
            node_id: node.node_id,
            port: node.port,
            is_online,
        });
    }
    Json(status_list)
}

async fn toggle_node(
    Path(id): Path<u8>,
    Extension(state): Extension<Arc<AppState>>,
) -> Result<impl axum::response::IntoResponse, StatusCode> {
    if id >= 4 {
        return Err(StatusCode::NOT_FOUND);
    }
    let node = &state.validators[id as usize];
    let mut is_online = node.is_online.lock().await;
    *is_online = !*is_online;
    
    // Broadcast status event
    let status_str = if *is_online { "ONLINE" } else { "OFFLINE" };
    let _ = node.event_tx.send(PbftEvent {
        from_node: Some(node.node_id),
        to_node: None,
        event_type: "STATUS".to_string(),
        message: format!("Node {} went {}", node.node_id, status_str),
        timestamp: chrono::Utc::now().timestamp_millis(),
    });

    Ok(Json(HashMap::from([("is_online", *is_online)])))
}

async fn audit_receipt(
    Path(receipt): Path<String>,
    Extension(state): Extension<Arc<AppState>>,
) -> Result<impl axum::response::IntoResponse, StatusCode> {
    let chain = state.validators[0].blockchain.lock().await;
    for block in &chain.chain {
        for tx in &block.transactions {
            if tx.receipt == receipt {
                return Ok(Json(HashMap::from([
                    ("tx_id", tx.tx_id.clone()),
                    ("dei", tx.dei.clone()),
                    ("tsbt_id", tx.tsbt_id.clone()),
                    ("timestamp", tx.timestamp.to_string()),
                    ("block_index", block.index.to_string()),
                    ("status", "VALID".to_string()),
                ])));
            }
        }
    }
    Err(StatusCode::NOT_FOUND)
}
