use rand::Rng;

pub struct KuwoCrypto {
    cookie: String,
    key: String,
}

impl KuwoCrypto {
    pub fn new(cookie: &str, key: &str) -> Self {
        Self {
            cookie: cookie.to_string(),
            key: key.to_string(),
        }
    }

    pub fn gen_secret_header(&self) -> String {
        let header = self.create_raw_header(&self.key, &self.cookie);
        self.encrypt(&header, &self.key)
    }

    fn create_raw_header(&self, key: &str, cookie: &str) -> String {
        let search = format!("{}=", key);
        if let Some(idx) = cookie.find(&search) {
            let start = idx + search.len();
            let sub = if let Some(end) = cookie[start..].find(';') {
                &cookie[start..start + end]
            } else {
                &cookie[start..]
            };
            if let Ok(unescaped) = urlencoding::decode(sub) {
                return unescaped.into_owned();
            }
        }
        String::new()
    }

    fn create_key_hash(&self, key: &str) -> Result<f64, String> {
        if key.is_empty() {
            return Err("empty key".to_string());
        }
        let r = key.len() / 5;
        let mut digest = String::new();
        let key_chars: Vec<char> = key.chars().collect();
        for i in 1..=5 {
            if r * i < key_chars.len() {
                digest.push(key_chars[r * i]);
            }
        }
        
        let hash = digest.parse::<f64>().unwrap_or(0.0);
        if hash < 2.0 {
            return Err("hash < 2".to_string());
        }
        Ok(hash)
    }

    fn encrypt(&self, text: &str, key: &str) -> String {
        if key.is_empty() { return String::new(); }
        let mut numeric_key = String::new();
        for ch in key.chars() {
            numeric_key.push_str(&format!("{}", ch as u32));
        }

        let hash = match self.create_key_hash(&numeric_key) {
            Ok(h) => h,
            Err(_) => return String::new(),
        };

        let addend = (key.len() as f64 / 2.0).ceil();
        let modulus = 2_f64.powi(31) - 1.0;
        let salt = self.create_salt();
        let mut base_number = self.calculate_base_number(&numeric_key, salt);
        base_number = (base_number * hash + addend) % modulus;

        let mut encrypted_result = String::new();
        for ch in text.chars() {
            let char_code = ch as u32 as f64;
            let xor_val = (base_number / modulus * 255.0).floor();
            let xor_result = (char_code as u32) ^ (xor_val as u32);
            encrypted_result.push_str(&format!("{:02x}", xor_result));
            base_number = (hash * base_number + addend) % modulus;
        }

        let mut d_hex = format!("{:x}", salt as u64);
        while d_hex.len() < 8 {
            d_hex = format!("0{}", d_hex);
        }

        format!("{}{}", encrypted_result, d_hex)
    }

    fn create_salt(&self) -> f64 {
        let mut rng = rand::thread_rng();
        let r: f64 = rng.gen();
        ((r * 1000000000.0).round()) % 100000000.0
    }

    fn calculate_base_number(&self, base_number: &str, salt: f64) -> f64 {
        let mut base_str = format!("{}{}", base_number, salt as u64);
        while base_str.len() > 10 {
            let first_part = self.js_parse_int_10(&base_str[..10]);
            let second_part = self.js_parse_int_10(&base_str[10..]);
            let added_up = first_part + second_part;
            if added_up >= 1e21 {
                base_str = format!("{:e}", added_up);
            } else {
                base_str = format!("{:.0}", added_up);
            }
        }
        base_str.parse::<f64>().unwrap_or(0.0)
    }

    fn js_parse_int_10(&self, s: &str) -> f64 {
        let s = s.trim();
        if s.is_empty() { return f64::NAN; }
        let mut digits = String::new();
        for ch in s.chars() {
            if ch >= '0' && ch <= '9' {
                digits.push(ch);
            } else {
                break;
            }
        }
        if digits.is_empty() { return f64::NAN; }
        digits.parse::<f64>().unwrap_or(f64::NAN)
    }
}
