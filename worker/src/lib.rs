use serde::{Deserialize, Serialize};
use worker::*;

fn with_cors(mut resp: Response, origin: &str, allow_headers: &str) -> Result<Response> {
    let headers = resp.headers_mut();
    headers.set("Access-Control-Allow-Origin", origin)?;
    headers.set("Vary", "Origin")?;
    headers.set("Access-Control-Allow-Methods", "GET, OPTIONS")?;
    headers.set("Access-Control-Allow-Headers", allow_headers)?;
    Ok(resp)
}

fn cors_preflight(origin: &str, allow_headers: &str) -> Result<Response> {
    with_cors(Response::empty()?, origin, allow_headers)
}

// ── Message types exchanged over WebSocket ──────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "type", rename_all = "snake_case")]
enum Signal {
    Join { room: String, peer_id: String },
    Ping { peer_id: String },
    Pong { peers: Vec<String> },
    Offer { sdp: String, from: String, to: String },
    Answer { sdp: String, from: String, to: String },
    IceCandidate { candidate: String, sdp_mid: Option<String>, sdp_mline_index: Option<u16>, from: String, to: String },
    PeerJoined { peer_id: String },
    PeerLeft { peer_id: String },
    RoomFull,
    Error { message: String },
}

fn random_room_code(len: usize) -> String {
    uuid::Uuid::new_v4()
        .simple()
        .to_string()
        .to_uppercase()
        .chars()
        .take(len)
        .collect()
}

fn infer_room_kind(room_id: &str) -> &'static str {
    if room_id.starts_with('V') {
        return "video";
    }
    if room_id.starts_with('S') {
        return "files";
    }
    if room_id.len() == 4 && room_id.chars().all(|c| c.is_ascii_alphanumeric()) {
        return "video";
    }
    "files"
}

// ── Cloudflare Worker entry-point ────────────────────────────────────────────

#[event(fetch)]
pub async fn main(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    let is_websocket_upgrade = req
        .headers()
        .get("Upgrade")?
        .map(|v| v.eq_ignore_ascii_case("websocket"))
        .unwrap_or(false);

    let origin = req
        .headers()
        .get("Origin")?
        .unwrap_or_else(|| "*".to_string());
    let allow_headers = req
        .headers()
        .get("Access-Control-Request-Headers")?
        .unwrap_or_else(|| "Content-Type".to_string());

    if req.method() == Method::Options && !is_websocket_upgrade {
        return cors_preflight(&origin, &allow_headers);
    }

    let router = Router::new();
    let response = router
        // Health check
        .get("/health", |_, _| Response::ok("ok"))
        // Create or join a room – upgrades to WebSocket via Durable Object
        .get_async("/room/:id/ws", |req, ctx| async move {
            let room_id = ctx.param("id").unwrap().to_string();
            let namespace = ctx.env.durable_object("SIGNALING_ROOM")?;
            let stub = namespace.id_from_name(&room_id)?.get_stub()?;
            stub.fetch_with_request(req).await
        })
        .get("/room/:id/info", |_, ctx| {
            let room_id = ctx.param("id").unwrap().to_string();
            let kind = infer_room_kind(&room_id);
            Response::from_json(&serde_json::json!({ "room": room_id, "kind": kind }))
        })
        // Generate a fresh random room ID for callers who don't have one yet
        .get("/room/new", |req, _| {
            let kind = req
                .url()?
                .query_pairs()
                .find(|(k, _)| k == "kind")
                .map(|(_, v)| v.to_string())
                .unwrap_or_else(|| "video".to_string());

            let normalized_kind = if kind == "files" { "files" } else { "video" };
            let id = if normalized_kind == "files" {
                format!("S{}", random_room_code(8))
            } else {
                format!("V{}", random_room_code(4))
            };

            Response::from_json(&serde_json::json!({ "room": id, "kind": normalized_kind }))
        })
        .run(req, env)
            .await?;

            if is_websocket_upgrade {
                return Ok(response);
            }

            with_cors(response, &origin, &allow_headers)
}

// ── Durable Object: one instance per room ───────────────────────────────────

#[durable_object]
pub struct SignalingRoom {
    state: State,
}

impl DurableObject for SignalingRoom {
    fn new(state: State, _env: Env) -> Self {
        Self { state }
    }

    async fn fetch(&self, req: Request) -> Result<Response> {
        let upgrade = req.headers().get("Upgrade")?;
        if upgrade.as_deref() != Some("websocket") {
            return Response::error("Expected WebSocket upgrade", 426);
        }

        // Pull peer_id from query string: ?peer_id=<uuid>
        let url = req.url()?;
        let peer_id = url
            .query_pairs()
            .find(|(k, _)| k == "peer_id")
            .map(|(_, v)| v.to_string())
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

        let WebSocketPair { client, server } = WebSocketPair::new()?;

        // Read current occupants from storage
        let mut occupants: Vec<(String, WebSocket)> = self
            .state
            .get_websockets()
            .into_iter()
            .map(|ws| {
                let pid = ws.deserialize_attachment::<String>()
                    .ok()
                    .flatten()
                    .filter(|s| !s.is_empty())
                    .or_else(|| self.state.get_tags(&ws).first().cloned())
                    .unwrap_or_default();
                (pid, ws)
            })
            .collect();

        // Refresh/reconnect support: if this peer_id already exists, evict stale socket(s)
        // so a browser refresh does not leave the room stuck as "full".
        let mut kept: Vec<(String, WebSocket)> = Vec::with_capacity(occupants.len());
        for (pid, ws) in occupants.drain(..) {
            if pid == peer_id {
                let _ = ws.close(Some(4001), Some("Replaced by reconnect"));
                continue;
            }
            kept.push((pid, ws));
        }
        occupants = kept;

        if occupants.len() >= 2 {
            let msg = serde_json::to_string(&Signal::RoomFull).unwrap();
            server.send_with_str(&msg)?;
            server.close(Some(4000), Some("Room full"))?;
            return Response::from_websocket(client);
        }

        // Notify existing peer that a new peer arrived
        for (existing_pid, existing_ws) in &occupants {
            let msg = serde_json::to_string(&Signal::PeerJoined { peer_id: peer_id.clone() }).unwrap();
            let _ = existing_ws.send_with_str(&msg);
            // Also tell newcomer about the existing peer
            let msg2 = serde_json::to_string(&Signal::PeerJoined { peer_id: existing_pid.clone() }).unwrap();
            let _ = server.send_with_str(&msg2);
        }

        // Register with hibernation API so the DO can sleep between messages
        self.state.accept_websocket_with_tags(&server, &[&peer_id]);

        // Persist peer metadata on the websocket after accepting via hibernation API.
        server.serialize_attachment(&peer_id)?;

        Response::from_websocket(client)
    }

    async fn websocket_message(&self, _ws: WebSocket, message: WebSocketIncomingMessage) -> Result<()> {
        let ws = _ws;

        let text = match message {
            WebSocketIncomingMessage::String(s) => s,
            _ => return Ok(()),
        };

        let signal: Signal = match serde_json::from_str(&text) {
            Ok(s) => s,
            Err(_) => return Ok(()),
        };

        if matches!(signal, Signal::Ping { .. }) {
            let peers: Vec<String> = self
                .state
                .get_websockets()
                .into_iter()
                .map(|socket| {
                    socket.deserialize_attachment::<String>()
                        .ok()
                        .flatten()
                        .filter(|s| !s.is_empty())
                        .or_else(|| self.state.get_tags(&socket).first().cloned())
                        .unwrap_or_default()
                })
                .filter(|pid| !pid.is_empty())
                .collect();

            let ack = serde_json::to_string(&Signal::Pong { peers }).unwrap();
            let _ = ws.send_with_str(&ack);
            return Ok(());
        }

        // For relay signals (Offer / Answer / IceCandidate) forward to the target peer
        let (target_id, relay_text) = match &signal {
            Signal::Offer { to, .. } => (to.clone(), text.clone()),
            Signal::Answer { to, .. } => (to.clone(), text.clone()),
            Signal::IceCandidate { to, .. } => (to.clone(), text.clone()),
            _ => return Ok(()),
        };

        let targets = self.state.get_websockets_with_tag(&target_id);
        for target_ws in targets {
            let _ = target_ws.send_with_str(&relay_text);
        }

        Ok(())
    }

    async fn websocket_close(&self, ws: WebSocket, _code: usize, _reason: String, _was_clean: bool) -> Result<()> {
        let peer_id = ws
            .deserialize_attachment::<String>()
            .ok()
            .flatten()
            .unwrap_or_default();

        // get_websockets() returns only still-active sockets; the closing one is excluded
        let leave_msg = serde_json::to_string(&Signal::PeerLeft { peer_id }).unwrap();
        for other in self.state.get_websockets() {
            let _ = other.send_with_str(&leave_msg);
        }
        Ok(())
    }
}
