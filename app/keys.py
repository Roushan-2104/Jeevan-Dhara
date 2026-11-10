"""Print fresh SECRET_KEY and FERNET_KEY values to paste into .env."""
import secrets

from cryptography.fernet import Fernet

print(f"SECRET_KEY={secrets.token_urlsafe(48)}")
print(f"FERNET_KEY={Fernet.generate_key().decode()}")
