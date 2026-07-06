"""API key generation and hashing.

Keys are high-entropy random tokens (256 bits) -- unlike passwords, they don't need a
slow hash (bcrypt/scrypt); a plain SHA-256 of the token is standard practice (e.g.
Stripe, GitHub) since brute-forcing a 256-bit random value is infeasible regardless of
hash speed. Only the hash is ever persisted (storage/api_key_repository.py); the
plaintext key is returned to the caller exactly once, at signup time -- there is no
"look up my key" recovery path by design.
"""

from __future__ import annotations

import hashlib
import secrets

_PREFIX = "sfk_"  # "secfin key" -- lets a leaked key be recognized in logs/scans


def generate_api_key() -> str:
    return _PREFIX + secrets.token_urlsafe(32)


def hash_api_key(key: str) -> str:
    return hashlib.sha256(key.encode("utf-8")).hexdigest()
