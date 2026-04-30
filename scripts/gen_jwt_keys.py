"""Generate an RS256 key pair for JWT signing.

Run once and add the output to your .env file:
    python scripts/gen_jwt_keys.py
"""
from __future__ import annotations

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa


def main() -> None:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    priv_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()

    pub_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()

    priv_single = priv_pem.replace("\n", "\\n")
    pub_single = pub_pem.replace("\n", "\\n")

    print("# Add these to your .env file (or export as environment variables)\n")
    print(f'JWT_PRIVATE_KEY="{priv_single}"')
    print(f'JWT_PUBLIC_KEY="{pub_single}"')


if __name__ == "__main__":
    main()
