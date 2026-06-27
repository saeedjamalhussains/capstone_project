use crate::crypto::sha3_512;

pub fn generate_dei(voter_id: &str, election_id: &str, salt: &str) -> String {
    let input = format!("{}:{}:{}", voter_id, election_id, salt);
    sha3_512(input.as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dei_generation() {
        let voter = "STUDENT001";
        let election = "EL-123";
        let salt = "SALT-456";
        
        let dei1 = generate_dei(voter, election, salt);
        let dei2 = generate_dei(voter, election, salt);
        let dei_other = generate_dei("STUDENT002", election, salt);

        assert_eq!(dei1, dei2); // Should be deterministic
        assert_ne!(dei1, dei_other); // Should be unique per voter
    }
}
