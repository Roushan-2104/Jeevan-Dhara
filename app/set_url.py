"""Set PUBLIC_BASE_URL in .env without printing any other value.

Run:  .venv\\Scripts\\python -m app.set_url https://your-tunnel.trycloudflare.com
"""
import re
import sys

from .config import ROOT


def main() -> None:
    if len(sys.argv) != 2 or not re.fullmatch(r"https://[A-Za-z0-9.-]+(:\d+)?/?", sys.argv[1]):
        sys.exit("Usage: python -m app.set_url https://<your-tunnel-host>")
    url = sys.argv[1].rstrip("/")
    env = ROOT / ".env"
    lines = env.read_text(encoding="utf-8").splitlines()
    out, done = [], False
    for line in lines:
        if line.startswith("PUBLIC_BASE_URL="):
            out.append(f"PUBLIC_BASE_URL={url}")
            done = True
        else:
            out.append(line)
    if not done:
        out.append(f"PUBLIC_BASE_URL={url}")
    env.write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"PUBLIC_BASE_URL set to {url}")
    print(f"Twilio sandbox webhook (POST): {url}/webhooks/twilio")


if __name__ == "__main__":
    main()
