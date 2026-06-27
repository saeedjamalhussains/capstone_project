use sha3::{Digest, Sha3_512};
use ed25519_dalek::{SigningKey, Verifier, VerifyingKey, Signature, Signer};
use rand::rngs::OsRng;

pub fn sha3_512(data: &[u8]) -> String {
    let mut hasher = Sha3_512::new();
    hasher.update(data);
    let result = hasher.finalize();
    result.iter().map(|b| format!("{:02x}", b)).collect()
}

pub fn generate_keypair() -> (SigningKey, VerifyingKey) {
    let mut csprng = OsRng;
    let signing_key = SigningKey::generate(&mut csprng);
    let verifying_key = VerifyingKey::from(&signing_key);
    (signing_key, verifying_key)
}

pub fn sign(signing_key: &SigningKey, message: &[u8]) -> Vec<u8> {
    signing_key.sign(message).to_bytes().to_vec()
}

pub fn verify(verifying_key_bytes: &[u8; 32], message: &[u8], signature_bytes: &[u8]) -> bool {
    let verifying_key = match VerifyingKey::from_bytes(verifying_key_bytes) {
        Ok(key) => key,
        Err(_) => return false,
    };
    
    let sig_arr: [u8; 64] = match signature_bytes.try_into() {
        Ok(arr) => arr,
        Err(_) => return false,
    };
    let signature = Signature::from_bytes(&sig_arr);
    verifying_key.verify(message, &signature).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sha3_512() {
        let hash = sha3_512(b"hello");
        assert_eq!(hash.len(), 128); // 512 bits = 64 bytes = 128 hex chars
    }

    #[test]
    fn test_signature_verification() {
        let (signing_key, verifying_key) = generate_keypair();
        let message = b"TSBTChain consensus test";
        let signature = sign(&signing_key, message);
        assert!(verify(&verifying_key.to_bytes(), message, &signature));
        assert!(!verify(&verifying_key.to_bytes(), b"tampered message", &signature));
    }
}
