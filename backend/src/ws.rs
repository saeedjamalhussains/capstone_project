use axum::{
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    response::IntoResponse,
    Extension,
};
use futures_util::stream::StreamExt;
use futures_util::sink::SinkExt;
use std::sync::Arc;
use tokio::sync::broadcast;

pub struct WsHub {
    pub tx: broadcast::Sender<String>,
}

impl WsHub {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(1000);
        Self { tx }
    }
}

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    Extension(hub): Extension<Arc<WsHub>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, hub))
}

async fn handle_socket(socket: WebSocket, hub: Arc<WsHub>) {
    let (mut sender, mut receiver) = socket.split();
    let mut rx = hub.tx.subscribe();

    // Spawn a task to forward broadcast messages to this client
    let mut send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            if sender.send(Message::Text(msg.clone())).await.is_err() {
                break;
            }
        }
    });

    // Spawn a task to keep the connection alive / handle incoming messages (e.g. pings)
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            if let Message::Close(_) = msg {
                break;
            }
        }
    });

    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    };
}
