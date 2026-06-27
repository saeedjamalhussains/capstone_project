use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use mongodb::{Client, Database};
use crate::tsbt::{Tsbt, TsbtStatus};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Election {
    pub id: String,
    pub title: String,
    pub candidates: Vec<String>,
    pub voter_registry: Vec<String>, // List of eligible registration IDs (e.g., student IDs)
    pub status: String,             // "Pending" | "Active" | "Completed"
    pub salt: String,               // Salt for DEI generation
}

// In-Memory Database representation for fallback
struct MemoryDb {
    elections: HashMap<String, Election>,
    tsbts: HashMap<String, Tsbt>,
}

#[derive(Clone)]
pub struct DbClient {
    mongo_db: Option<Database>,
    memory_db: Arc<Mutex<MemoryDb>>,
}

impl DbClient {
    pub async fn new() -> Self {
        // Try to connect to MongoDB with a short timeout
        let uri = std::env::var("MONGODB_URI")
            .unwrap_or_else(|_| "mongodb://localhost:27017".to_string());
        
        let client_options = mongodb::options::ClientOptions::parse(&uri).await;
        
        let mongo_db = if let Ok(mut options) = client_options {
            // Set short connection timeout for fallback convenience
            options.connect_timeout = Some(std::time::Duration::from_secs(2));
            options.server_selection_timeout = Some(std::time::Duration::from_secs(2));
            match Client::with_options(options) {
                Ok(client) => {
                    // Ping to confirm connection
                    let db = client.database("tsbtchain");
                    match db.run_command(mongodb::bson::doc! {"ping": 1}, None).await {
                        Ok(_) => {
                            println!("Successfully connected to MongoDB.");
                            Some(db)
                        }
                        Err(_) => {
                            println!("MongoDB server found but ping failed. Falling back to Memory Database.");
                            None
                        }
                    }
                }
                Err(_) => None
            }
        } else {
            println!("Could not parse MongoDB URI. Falling back to Memory Database.");
            None
        };

        Self {
            mongo_db,
            memory_db: Arc::new(Mutex::new(MemoryDb {
                elections: HashMap::new(),
                tsbts: HashMap::new(),
            })),
        }
    }

    // Elections Management
    pub async fn save_election(&self, election: Election) {
        if let Some(ref db) = self.mongo_db {
            let collection = db.collection::<Election>("elections");
            let filter = mongodb::bson::doc! { "id": &election.id };
            let options = mongodb::options::ReplaceOptions::builder().upsert(true).build();
            let _ = collection.replace_one(filter, election, options).await;
        } else {
            let mut mem = self.memory_db.lock().await;
            mem.elections.insert(election.id.clone(), election);
        }
    }

    pub async fn get_election(&self, id: &str) -> Option<Election> {
        if let Some(ref db) = self.mongo_db {
            let collection = db.collection::<Election>("elections");
            let filter = mongodb::bson::doc! { "id": id };
            collection.find_one(filter, None).await.ok().flatten()
        } else {
            let mem = self.memory_db.lock().await;
            mem.elections.get(id).cloned()
        }
    }

    pub async fn list_elections(&self) -> Vec<Election> {
        if let Some(ref db) = self.mongo_db {
            let collection = db.collection::<Election>("elections");
            if let Ok(mut cursor) = collection.find(mongodb::bson::doc! {}, None).await {
                let mut list = Vec::new();
                while let Ok(true) = cursor.advance().await {
                    if let Ok(election) = cursor.deserialize_current() {
                        list.push(election);
                    }
                }
                list
            } else {
                Vec::new()
            }
        } else {
            let mem = self.memory_db.lock().await;
            mem.elections.values().cloned().collect()
        }
    }

    // TSBT Management
    pub async fn save_tsbt(&self, tsbt: Tsbt) {
        if let Some(ref db) = self.mongo_db {
            let collection = db.collection::<Tsbt>("tsbts");
            let filter = mongodb::bson::doc! { "id": &tsbt.id };
            let options = mongodb::options::ReplaceOptions::builder().upsert(true).build();
            let _ = collection.replace_one(filter, tsbt, options).await;
        } else {
            let mut mem = self.memory_db.lock().await;
            mem.tsbts.insert(tsbt.id.clone(), tsbt);
        }
    }

    pub async fn get_tsbt(&self, id: &str) -> Option<Tsbt> {
        if let Some(ref db) = self.mongo_db {
            let collection = db.collection::<Tsbt>("tsbts");
            let filter = mongodb::bson::doc! { "id": id };
            collection.find_one(filter, None).await.ok().flatten()
        } else {
            let mem = self.memory_db.lock().await;
            mem.tsbts.get(id).cloned()
        }
    }

    pub async fn get_tsbt_by_dei(&self, dei: &str, election_id: &str) -> Option<Tsbt> {
        if let Some(ref db) = self.mongo_db {
            let collection = db.collection::<Tsbt>("tsbts");
            let filter = mongodb::bson::doc! { "dei": dei, "election_id": election_id };
            collection.find_one(filter, None).await.ok().flatten()
        } else {
            let mem = self.memory_db.lock().await;
            mem.tsbts
                .values()
                .find(|t| t.dei == dei && t.election_id == election_id)
                .cloned()
        }
    }

    pub async fn burn_tsbt(&self, id: &str) -> bool {
        if let Some(ref db) = self.mongo_db {
            let collection = db.collection::<Tsbt>("tsbts");
            let filter = mongodb::bson::doc! { "id": id };
            let update = mongodb::bson::doc! { "$set": { "status": "Burned" } };
            collection.update_one(filter, update, None).await.is_ok()
        } else {
            let mut mem = self.memory_db.lock().await;
            if let Some(tsbt) = mem.tsbts.get_mut(id) {
                tsbt.status = TsbtStatus::Burned;
                true
            } else {
                false
            }
        }
    }
}
