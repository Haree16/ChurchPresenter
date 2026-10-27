//! Source-address filtering for the LAN-facing remote and OSC listeners.
//!
//! Both listeners bind `0.0.0.0` so phones and show-control gear can reach them,
//! but nothing on the public internet should ever be served.

use std::net::IpAddr;

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
