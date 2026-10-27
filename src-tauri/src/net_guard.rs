//! Source-address filtering for the LAN-facing remote and OSC listeners.
//!
//! Both listeners bind `0.0.0.0` so phones and show-control gear can reach them,
//! but nothing on the public internet should ever be served.

use std::net::IpAddr;

/// Settings key holding the listening scope for the remote server and OSC.
pub const BIND_MODE_SETTING: &str = "network_bind_mode";

/// Where the remote server and OSC listener accept connections from.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BindMode {
    /// Only this computer (127.0.0.1).
    Local,
    /// Any device on the local network (0.0.0.0, filtered to private addresses).
    Lan,
}

impl BindMode {
    /// Parses the stored setting; anything unknown or missing means `Lan` (the historical default).
    pub fn from_setting(value: Option<&str>) -> Self {
        match value.map(|v| v.trim().to_lowercase()).as_deref() {
            Some("local") => BindMode::Local,
            _ => BindMode::Lan,
        }
    }

    pub fn as_setting(self) -> &'static str {
        match self {
            BindMode::Local => "local",
            BindMode::Lan => "lan",
        }
    }

    pub fn bind_ip(self) -> &'static str {
        match self {
            BindMode::Local => "127.0.0.1",
            BindMode::Lan => "0.0.0.0",
        }
    }
}

/// True for loopback, RFC 1918 private, link-local and IPv6 unique-local addresses.
pub fn is_lan_addr(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => v4.is_loopback() || v4.is_private() || v4.is_link_local(),
        IpAddr::V6(v6) => {
            if let Some(v4) = v6.to_ipv4_mapped() {
                return is_lan_addr(IpAddr::V4(v4));
            }
            let first = v6.segments()[0];
            v6.is_loopback()
                || (first & 0xfe00) == 0xfc00 // fc00::/7 unique local
                || (first & 0xffc0) == 0xfe80 // fe80::/10 link-local
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bind_mode_parses_settings_and_defaults_to_lan() {
        assert_eq!(BindMode::from_setting(Some("local")), BindMode::Local);
        assert_eq!(BindMode::from_setting(Some(" LOCAL ")), BindMode::Local);
        assert_eq!(BindMode::from_setting(Some("lan")), BindMode::Lan);
        for v in [None, Some(""), Some("all"), Some("0.0.0.0")] {
            assert_eq!(BindMode::from_setting(v), BindMode::Lan);
        }
    }

    #[test]
    fn bind_mode_round_trips_and_maps_to_addresses() {
        for m in [BindMode::Local, BindMode::Lan] {
            assert_eq!(BindMode::from_setting(Some(m.as_setting())), m);
        }
        assert_eq!(BindMode::Local.bind_ip(), "127.0.0.1");
        assert_eq!(BindMode::Lan.bind_ip(), "0.0.0.0");
    }

    fn ip(s: &str) -> IpAddr {
        s.parse().unwrap()
    }

    #[test]
    fn accepts_loopback_and_private_ranges() {
        for a in ["127.0.0.1", "10.1.2.3", "172.16.0.5", "172.31.255.1", "192.168.1.20", "169.254.3.4", "::1", "fd12::1", "fe80::1", "::ffff:192.168.0.9"] {
            assert!(is_lan_addr(ip(a)), "{a} should be allowed");
        }
    }

    #[test]
    fn rejects_public_addresses() {
        for a in ["8.8.8.8", "172.32.0.1", "11.0.0.1", "203.0.113.7", "2001:4860:4860::8888", "::ffff:8.8.8.8"] {
            assert!(!is_lan_addr(ip(a)), "{a} should be rejected");
        }
    }
}
