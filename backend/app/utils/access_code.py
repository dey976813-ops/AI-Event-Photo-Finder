import hashlib
import hmac
import re
import secrets

ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def generate_access_code() -> str:
    segment = lambda: "".join(secrets.choice(ALPHABET) for _ in range(4))
    return f"MV-{segment()}-{segment()}"


def hash_access_code(access_code: str) -> str:
    salt = secrets.token_bytes(16)
    derived = hashlib.scrypt(access_code.strip().upper().encode(), salt=salt, n=16384, r=8, p=1, dklen=64)
    return f"scrypt${salt.hex()}${derived.hex()}"


def verify_access_code(access_code: str, stored_hash: str | None) -> bool:
    if not access_code or not stored_hash:
        return False
    try:
        prefix, salt_hex, key_hex = stored_hash.split("$")
        if prefix != "scrypt":
            return False
        stored_key = bytes.fromhex(key_hex)
        derived = hashlib.scrypt(access_code.strip().upper().encode(), salt=bytes.fromhex(salt_hex), n=16384, r=8, p=1, dklen=len(stored_key))
        return hmac.compare_digest(derived, stored_key)
    except (ValueError, TypeError):
        return False


def is_valid_access_code_format(access_code: object) -> bool:
    return isinstance(access_code, str) and bool(re.fullmatch(r"MV-[A-Z0-9]{4}-[A-Z0-9]{4}", access_code.strip().upper()))
