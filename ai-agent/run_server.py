import os
import sys

# Configure UTF-8 for console output on Windows
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

import uvicorn

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

if __name__ == "__main__":
    port = int(os.environ.get("AI_AGENT_PORT", 8005))
    print("=" * 65)
    print("STARTING AI VASTRA WHATSAPP SALES AGENT PLATFORM")
    print("=" * 65)
    print(f"Web UI & WhatsApp Simulator: http://localhost:{port}")
    print(f"API Documentation:          http://localhost:{port}/docs")
    print(f"WhatsApp Message API:       POST http://localhost:{port}/api/v1/whatsapp/message")
    print(f"WhatsApp Cloud Webhook:     http://localhost:{port}/api/v1/whatsapp/webhook")
    print("=" * 65)
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=port,
        reload=False,
        app_dir=BASE_DIR,
    )
