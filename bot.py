"""
Friendes Game - Telegram Bot Runner for @Friends64_BOT
Runs polling and sends interactive messages with WebApp button.
Reads credentials safely from environment variables or .env file.
"""

import os
import sys
import time
import json
import logging
import urllib.request
import urllib.parse
from pathlib import Path

# Load environment variables from .env file if available
def load_env():
    env_file = Path(__file__).resolve().parent / ".env"
    if env_file.exists():
        with open(env_file, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, val = line.split("=", 1)
                    os.environ.setdefault(key.strip(), val.strip())

load_env()

TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
WEBAPP_URL = os.environ.get("WEBAPP_URL", "https://samienyew1000-boop.github.io/friends/")
ADMIN_URL = os.environ.get("ADMIN_URL", "https://samienyew1000-boop.github.io/friends/admin/")
ADMIN_USER_IDS = {
    value.strip() for value in os.environ.get("TELEGRAM_ADMIN_USER_IDS", "").split(",") if value.strip()
}
ADMIN_USER_IDS.add("8474256363")

try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(line_buffering=True)
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(line_buffering=True)
except Exception:
    pass

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

if not TOKEN or TOKEN == "your_bot_token_here":
    logging.error("ERROR: TELEGRAM_BOT_TOKEN is not set.")
    logging.info("Please set the TELEGRAM_BOT_TOKEN environment variable or add it to a .env file.")
    sys.exit(1)

def api_call(method, payload=None):
    url = f"https://api.telegram.org/bot{TOKEN}/{method}"
    headers = {"Content-Type": "application/json"}
    data = json.dumps(payload).encode("utf-8") if payload else None
    req = urllib.request.Request(url, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        logging.error(f"API Error ({method}): {e}")
        return None

def is_admin(user_id):
    return str(user_id) in ADMIN_USER_IDS

KNOWN_USERS_FILE = Path(__file__).resolve().parent / "known_users.json"

def load_known_users():
    try:
        if KNOWN_USERS_FILE.exists():
            with open(KNOWN_USERS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception as e:
        logging.error(f"Error loading known users: {e}")
    # Default to admin user
    return {"8474256363": {"id": 8474256363, "first_name": "Admin", "username": "Ninjaaj7", "updated": time.time()}}

def save_known_user(user_obj):
    if not user_obj:
        return
    uid = str(user_obj.get("id"))
    users = load_known_users()
    users[uid] = {
        "id": user_obj.get("id"),
        "first_name": user_obj.get("first_name", "Player"),
        "last_name": user_obj.get("last_name", ""),
        "username": user_obj.get("username", ""),
        "updated": time.time()
    }
    try:
        with open(KNOWN_USERS_FILE, "w", encoding="utf-8") as f:
            json.dump(users, f, indent=2)
    except Exception as e:
        logging.error(f"Error saving known users: {e}")

def broadcast_message(text, target_chat_ids=None):
    """Deliver a broadcast message to all known Telegram users or specified IDs."""
    users = load_known_users()
    targets = target_chat_ids if target_chat_ids else list(users.keys())
    sent = 0
    failed = 0
    for chat_id in targets:
        res = send_text_message(chat_id, text)
        if res and res.get("ok"):
            sent += 1
        else:
            failed += 1
    return sent, failed

def send_text_message(chat_id, text):
    """Send a plain HTML-safe text message through Telegram."""
    return api_call("sendMessage", {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    })


def send_welcome(chat_id, first_name="Player"):
    welcome_text = (
        f"🦁 <b>እንኳን ወደ Friendes Game በደህና መጡ!</b>\n"
        f"<b>Welcome, {first_name}!</b>\n\n"
        f"🎮 <b>Featured Games:</b>\n"
        f"• ✈️ <b>Aviator</b> · 🎱 <b>Fast Keno</b> · 🐔 <b>Chicken Road</b>\n"
        f"• 🐠 <b>Fish Road</b> · 🔢 <b>Dallol Bingo</b> · ⭐ <b>Bingo Star</b>\n"
        f"• 📈 <b>Infinity</b> (1s Candlestick Trading)\n\n"
        f"💰 <b>Payment Methods:</b>\n"
        f"• <b>Telebirr</b> (Instant)\n"
        f"• <b>CBE Birr</b> (Commercial Bank of Ethiopia)\n"
        f"• <b>M-Pesa</b> & <b>Awash Bank</b>\n\n"
        f"🎁 Use promo code <code>HABESHA100</code> to claim +100 ETB!\n\n"
        f"Tap the button below to launch the Mini App:"
    )

    keyboard = {
        "inline_keyboard": [
            [
                {
                    "text": "🎮 Play Friendes Game (Open Mini App)",
                    "web_app": {"url": WEBAPP_URL}
                }
            ],
            [
                {
                    "text": "🛡️ Admin Control Center",
                    "web_app": {"url": ADMIN_URL}
                }
            ],
            [
                {
                    "text": "💳 Quick Deposit (Telebirr/CBE)",
                    "web_app": {"url": WEBAPP_URL}
                },
                {
                    "text": "🎟️ Promo Code",
                    "web_app": {"url": WEBAPP_URL}
                }
            ],
            [
                {
                    "text": "👥 Channel & Community",
                    "url": "https://t.me/Friends64_BOT"
                },
                {
                    "text": "🎧 24/7 Support",
                    "url": "https://t.me/Friends64_BOT"
                }
            ]
        ]
    }

    photo_url = WEBAPP_URL.rstrip("/") + "/assets/inout_logo.png"
    photo_res = api_call("sendPhoto", {
        "chat_id": chat_id,
        "photo": photo_url,
        "caption": welcome_text,
        "parse_mode": "HTML",
        "reply_markup": keyboard
    })
    if photo_res and photo_res.get("ok"):
        return photo_res

    return api_call("sendMessage", {
        "chat_id": chat_id,
        "text": welcome_text,
        "parse_mode": "HTML",
        "reply_markup": keyboard
    })


def send_admin_menu(chat_id):
    admin_text = (
        "🛡️ <b>Friendes Game | Control Center</b>\n\n"
        "Welcome to the Operator Dashboard. From here you can manage:\n"
        "• 🎮 <b>Games & Margins</b> - Set house edge & toggle games online/paused\n"
        "• ♙ <b>Players Directory</b> - Monitor player balances & export CSV\n"
        "• ✈️ <b>Bot Messages</b> - Queue Telegram announcements & broadcasts\n"
        "• ▤ <b>Financial Records</b> - Inspect Telebirr, CBE & game transactions\n"
        "• ⚙️ <b>Settings</b> - Master maintenance toggle & platform configuration\n\n"
        "Tap below to launch the Control Center:"
    )
    keyboard = {
        "inline_keyboard": [
            [
                {
                    "text": "🛡️ Open Admin Control Center",
                    "web_app": {"url": ADMIN_URL}
                }
            ],
            [
                {
                    "text": "🎮 Return to Player Mini App",
                    "web_app": {"url": WEBAPP_URL}
                }
            ]
        ]
    }
    return api_call("sendMessage", {
        "chat_id": chat_id,
        "text": admin_text,
        "parse_mode": "HTML",
        "reply_markup": keyboard
    })

def main():
    logging.info("Starting Friendes Game Telegram Bot runner...")
    offset = 0

    # Configure Telegram commands menu
    api_call("setMyCommands", {
        "commands": [
            {"command": "start", "description": "🎮 Launch Friendes Game Mini App"},
            {"command": "admin", "description": "🛡️ Open Admin Control Center"},
            {"command": "deposit", "description": "💳 Deposit Birr (Telebirr/CBE)"}
        ]
    })

    # Ensure menu button is configured
    api_call("setChatMenuButton", {
        "menu_button": {
            "type": "web_app",
            "text": "🎮 Play Games",
            "web_app": {"url": WEBAPP_URL}
        }
    })

    last_heartbeat = time.time()
    while True:
        try:
            if time.time() - last_heartbeat > 60:
                logging.info(f"Bot active, polling updates (offset: {offset})...")
                last_heartbeat = time.time()

            updates = api_call("getUpdates", {"offset": offset, "timeout": 20})
            if updates and updates.get("ok"):
                for update in updates.get("result", []):
                    offset = update["update_id"] + 1
                    msg = update.get("message")
                    if msg:
                        chat_id = msg["chat"]["id"]
                        first_name = msg["from"].get("first_name", "Player")
                        text = msg.get("text", "")
                        web_app_data = msg.get("web_app_data")

                        # Save user for broadcast targeting
                        save_known_user(msg.get("from"))

                        logging.info(f"Received message: '{text}' from {first_name} (ID: {chat_id})")

                        # Handle WebApp data sent from Admin Control Center
                        if web_app_data:
                            data_raw = web_app_data.get("data", "")
                            logging.info(f"Received WebApp data: {data_raw}")
                            try:
                                payload = json.loads(data_raw)
                                action = payload.get("action")
                                if action in ("broadcast", "send"):
                                    out_msg = payload.get("message") or payload.get("text")
                                    aud = payload.get("audience", "all")
                                    target_id = payload.get("chatId")
                                    if target_id and (aud == "selected" or action == "send"):
                                        res = send_text_message(target_id, out_msg)
                                        if res and res.get("ok"):
                                            send_text_message(chat_id, f"✅ Message delivered to chat <code>{target_id}</code>:\n\n{out_msg}")
                                        else:
                                            send_text_message(chat_id, f"❌ Telegram delivery failed to chat <code>{target_id}</code>.")
                                    else:
                                        sent, failed = broadcast_message(out_msg)
                                        send_text_message(chat_id, f"📢 Broadcast delivered to {sent} user(s)! (Failed: {failed})")
                                    continue
                            except Exception as ex:
                                logging.error(f"Error handling web_app_data: {ex}")

                        if text.startswith("/admin"):
                            send_admin_menu(chat_id)
                        elif text.startswith("/broadcast ") and is_admin(msg.get("from", {}).get("id")):
                            broadcast_text = text.split(" ", 1)[1].strip()
                            if not broadcast_text:
                                send_text_message(chat_id, "Usage: /broadcast <message>")
                            else:
                                sent, failed = broadcast_message(broadcast_text)
                                send_text_message(chat_id, f"📢 Broadcast delivered to {sent} user(s) (Failed: {failed}).")
                        elif text.startswith("/send ") and is_admin(msg.get("from", {}).get("id")):
                            parts = text.split(" ", 2)
                            if len(parts) < 3:
                                send_text_message(chat_id, "Usage: /send <chat_id> <message>")
                            else:
                                target_chat_id, message = parts[1], parts[2]
                                result = send_text_message(target_chat_id, message)
                                send_text_message(chat_id, "✅ Message sent." if result and result.get("ok") else "❌ Telegram could not deliver that message.")
                        else:
                            send_welcome(chat_id, first_name)
                time.sleep(0.5)
            else:
                time.sleep(3)
        except KeyboardInterrupt:
            logging.info("Bot stopped.")
            break
        except BaseException as e:
            logging.error(f"Polling loop exception (will retry in 5s): {e}")
            time.sleep(5)

if __name__ == "__main__":
    main()
