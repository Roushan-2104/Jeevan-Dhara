import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

_tmp = tempfile.mkdtemp(prefix="jd-test-")
os.environ["DB_PATH"] = str(Path(_tmp) / "test.db")
os.environ["MEDIA_DIR"] = str(Path(_tmp) / "media")
os.environ["TMP_DIR"] = str(Path(_tmp) / "tmp")
os.environ["SECRET_KEY"] = "test-secret-key-not-for-production"
os.environ["GNANI_API_KEY"] = ""
os.environ["GROQ_API_KEY"] = ""
os.environ["TWILIO_ACCOUNT_SID"] = ""
os.environ["TWILIO_AUTH_TOKEN"] = "test-twilio-token"

from app import seed  # noqa: E402

seed.seed(force=True)
