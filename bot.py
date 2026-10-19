"""
Friendes Game - Telegram Bot Runner for @Friends64_BOT
Runs polling and sends interactive messages with WebApp button.
Handles Contact Sharing Phone Registration, Account Creation, Deposit & Withdrawal.
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
WITHDRAWALS_FILE = Path(__file__).resolve().parent / "withdrawals.json"

def load_known_users():
    try:
        if KNOWN_USERS_FILE.exists():
            with open(KNOWN_USERS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception as e:
        logging.error(f"Error loading known users: {e}")
    return {"8474256363": {"id": 8474256363, "first_name": "Admin", "username": "Ninjaaj7", "phone": "+251912345678", "registered": True, "updated": time.time()}}

def save_all_users(users):
    try:
        with open(KNOWN_USERS_FILE, "w", encoding="utf-8") as f:
            json.dump(users, f, indent=2, ensure_ascii=False)
    except Exception as e:
        logging.error(f"Error saving known users: {e}")

def save_known_user(user_obj, phone=None):
    if not user_obj:
        return {}
    uid = str(user_obj.get("id"))
    users = load_known_users()
    existing = users.get(uid, {})
    user_record = {
        "id": user_obj.get("id"),
        "first_name": user_obj.get("first_name", existing.get("first_name", "Player")),
        "last_name": user_obj.get("last_name", existing.get("last_name", "")),
        "username": user_obj.get("username", existing.get("username", "")),
        "phone": phone if phone else existing.get("phone", ""),
        "registered": bool(phone or existing.get("registered")),
        "balance": existing.get("balance", 0.0),
        "updated": time.time()
    }
    users[uid] = user_record
    save_all_users(users)
    return user_record

def is_user_registered(chat_id):
    users = load_known_users()
    user = users.get(str(chat_id))
    return bool(user and user.get("phone"))

def request_phone_registration(chat_id):
    """Prompt user to share their contact phone number for account creation (matching the UI screenshot)."""
    text = (
        "👋 Welcome! Please share your phone number to register:\n\n"
        "ለመመዝገብ እና የጨዋታ አካውንት ለመክፈት ከስር ያለውን <b>'📱 Share Phone Number'</b> የሚለውን ይጫኑ:"
    )
    keyboard = {
        "keyboard": [
            [
                {
                    "text": "📱 Share Phone Number",
                    "request_contact": True
                }
            ]
        ],
        "resize_keyboard": True,
        "one_time_keyboard": True
    }
    return api_call("sendMessage", {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "reply_markup": keyboard
    })

def send_text_message(chat_id, text, reply_markup=None):
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }
    if reply_markup:
        payload["reply_markup"] = reply_markup
    return api_call("sendMessage", payload)

def broadcast_message(text, target_chat_ids=None):
    users = load_known_users()
    targets = target_chat_ids if target_chat_ids else list(users.keys())
    sent = 0
    failed = 0
    for cid in targets:
        try:
            res = send_text_message(cid, text)
            if res and res.get("ok"):
                sent += 1
            else:
                failed += 1
            time.sleep(0.04)
        except Exception:
            failed += 1
    return sent, failed

def get_user_webapp_url(chat_id, user=None):
    if not user:
        users = load_known_users()
        user = users.get(str(chat_id), {})
    phone = user.get("phone", "")
    full_name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() or "Player"
    clean_phone = urllib.parse.quote(phone)
    clean_name = urllib.parse.quote(full_name)
    return f"{WEBAPP_URL}?phone={clean_phone}&uid={chat_id}&name={clean_name}"

def send_welcome(chat_id, user=None):
    if not user:
        users = load_known_users()
        user = users.get(str(chat_id), {})

    first_name = user.get("first_name", "Player")
    phone = user.get("phone", "")
    full_name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() or first_name
    app_url = get_user_webapp_url(chat_id, user)
    admin_url = f"{ADMIN_URL}?uid={chat_id}"

    welcome_text = (
        f"🦁 <b>እንኳን ወደ Friendes Game በደህና መጡ!</b>\n"
        f"<b>Welcome, {full_name}!</b>\n\n"
        f"👤 <b>Account ID:</b> <code>{chat_id}</code>\n"
        f"📱 <b>Phone:</b> <code>{phone or 'Not Registered'}</code>\n\n"
        f"🎮 <b>Featured Games:</b>\n"
        f"• ✈️ <b>Aviator</b> · 🎱 <b>Fast Keno</b> · 🐔 <b>Chicken Road</b>\n"
        f"• 🐠 <b>Fish Road</b> · 🔢 <b>Friendes Bingo</b> · ⭐ <b>Bingo Star</b>\n"
        f"• 📈 <b>Infinity</b> (1s Candlestick Trading)\n\n"
        f"💰 <b>Payment Methods (Deposit & Withdraw):</b>\n"
        f"• <b>Telebirr</b> (Instant)\n"
        f"• <b>CBE Birr</b> (Commercial Bank of Ethiopia)\n"
        f"• <b>M-Pesa</b> & <b>Awash Bank</b>\n\n"
        f"🎁 Use promo code <code>HABESHA100</code> to claim +100 ETB!\n\n"
        f"Tap the button below to launch the Mini App:"
    )

    inline_keyboard = [
        [
            {
                "text": "🎮 Play Friendes Game (Open Mini App)",
                "web_app": {"url": app_url}
            }
        ],
        [
            {
                "text": "💳 Deposit (ገንዘብ ማስገቢያ)",
                "callback_data": "deposit"
            },
            {
                "text": "💸 Withdraw (ገንዘብ ማውጫ)",
                "callback_data": "withdraw"
            }
        ]
    ]

    if is_admin(chat_id):
        inline_keyboard.append([
            {
                "text": "🛡️ Admin Control Center",
                "web_app": {"url": admin_url}
            }
        ])
    else:
        inline_keyboard.append([
            {
                "text": "👥 Channel & Community",
                "url": "https://t.me/Friends64_BOT"
            },
            {
                "text": "🎧 24/7 Support",
                "url": "https://t.me/Friends64_BOT"
            }
        ])

    keyboard = {"inline_keyboard": inline_keyboard}

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

def send_deposit_info(chat_id, user):
    phone = user.get("phone", "")
    full_name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() or "Player"
    app_url = get_user_webapp_url(chat_id, user)

    text = (
        f"💳 <b>ገንዘብ ማስገቢያ (Deposit ETB)</b>\n\n"
        f"👤 <b>Account Name:</b> {full_name}\n"
        f"📱 <b>Registered Phone:</b> <code>{phone}</code>\n"
        f"🆔 <b>Account ID:</b> <code>{chat_id}</code>\n\n"
        f"💰 <b>Official Payment Accounts:</b>\n"
        f"• <b>Telebirr:</b> <code>0981247219</code> (Friendes Game)\n"
        f"• <b>CBE Birr:</b> <code>0981247219</code> (Friendes Game)\n\n"
        f"📌 <b>መመሪያ፦</b>\n"
        f"1. በተመዘገበው ስልክዎ (<code>{phone}</code>) ወደ ቴሌብር ቁጥራችን ያስተላልፉ።\n"
        f"2. ከላኩ በኋላ የደረሰኝ ቁጥሩን (Transaction ID) እዚህ ይላኩልን ወይም ከስር ያለውን ቁልፍ በመጫን በ Mini App ውስጥ በቀጥታ ይሙሉ:"
    )
    keyboard = {
        "inline_keyboard": [
            [{"text": "💳 Open Deposit in Mini App", "web_app": {"url": app_url}}],
            [{"text": "🎮 Return to Games", "web_app": {"url": app_url}}]
        ]
    }
    return api_call("sendMessage", {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "reply_markup": keyboard
    })

def send_withdraw_info(chat_id, user):
    phone = user.get("phone", "")
    full_name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() or "Player"
    app_url = get_user_webapp_url(chat_id, user)

    text = (
        f"💸 <b>ገንዘብ ማውጫ (Withdraw ETB)</b>\n\n"
        f"👤 <b>Account Name:</b> {full_name}\n"
        f"📱 <b>Payout Phone:</b> <code>{phone}</code>\n"
        f"🆔 <b>Account ID:</b> <code>{chat_id}</code>\n\n"
        f"📌 <b>ገንዘብ ለማውጣት፦</b>\n"
        f"<code>/withdraw [የብር መጠን]</code> ብለው ይላኩ\n"
        f"ምሳሌ፦ <code>/withdraw 500</code>\n\n"
        f"ገንዘቡ በቀጥታ ወደ ተመዘገበው ስልክዎ (<code>{phone}</code>) በቴሌብር ይላክሎታል። አነስተኛው የማውጣት መጠን 50 ETB ነው።"
    )
    keyboard = {
        "inline_keyboard": [
            [{"text": "🎮 Open Mini App", "web_app": {"url": app_url}}]
        ]
    }
    return api_call("sendMessage", {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "reply_markup": keyboard
    })

def handle_withdraw_request(chat_id, user, amount_str):
    try:
        amt = float(amount_str)
        if amt < 50:
            return api_call("sendMessage", {
                "chat_id": chat_id,
                "text": "⚠️ አነስተኛው የማውጣት መጠን <b>50 ETB</b> ነው። እባክዎ ከ 50 ETB በላይ ይጥቀሱ።",
                "parse_mode": "HTML"
            })
    except ValueError:
        return api_call("sendMessage", {
            "chat_id": chat_id,
            "text": "⚠️ እባክዎ ትክክለኛ የብር መጠን ይጥቀሱ።\nምሳሌ፦ <code>/withdraw 500</code>",
            "parse_mode": "HTML"
        })

    phone = user.get("phone", "")
    full_name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() or "Player"
    now_str = time.strftime("%Y-%m-%d %H:%M:%S")

    w_list = []
    if WITHDRAWALS_FILE.exists():
        try:
            with open(WITHDRAWALS_FILE, "r", encoding="utf-8") as f:
                w_list = json.load(f)
        except Exception:
            w_list = []

    req_id = f"WD-{int(time.time())}"
    w_list.append({
        "id": req_id,
        "chat_id": chat_id,
        "name": full_name,
        "phone": phone,
        "amount": amt,
        "status": "pending",
        "created_at": now_str
    })
    try:
        with open(WITHDRAWALS_FILE, "w", encoding="utf-8") as f:
            json.dump(w_list, f, indent=2, ensure_ascii=False)
    except Exception as e:
        logging.error(f"Error saving withdrawal: {e}")

    # Notify admins
    for admin_id in ADMIN_USER_IDS:
        api_call("sendMessage", {
            "chat_id": admin_id,
            "text": (
                f"🚨 <b>አዲስ የገንዘብ ማውጣት ጥያቄ (New Withdrawal Request)!</b>\n\n"
                f"🆔 <b>Ref:</b> <code>{req_id}</code>\n"
                f"👤 <b>ተጫዋች:</b> {full_name} (@{user.get('username','')})\n"
                f"📱 <b>ስልክ:</b> <code>{phone}</code>\n"
                f"🆔 <b>Player ID:</b> <code>{chat_id}</code>\n"
                f"💰 <b>መጠን:</b> <b>{amt:.2f} ETB</b>\n"
                f"⏰ <b>ሰዓት:</b> {now_str}"
            ),
            "parse_mode": "HTML"
        })

    # Confirm to player
    return api_call("sendMessage", {
        "chat_id": chat_id,
        "text": (
            f"✅ <b>የማውጣት ጥያቄዎ በተሳካ ሁኔታ ተመዝግቧል!</b>\n\n"
            f"🆔 <b>የጥያቄ ቁጥር:</b> <code>{req_id}</code>\n"
            f"💰 <b>የተጠየቀው መጠን:</b> <b>{amt:.2f} ETB</b>\n"
            f"📱 <b>የሚላክበት ስልክ:</b> <code>{phone}</code>\n"
            f"⏳ <b>ሁኔታ:</b> በመጠባበቅ ላይ (Pending)\n\n"
            f"አድሚኑ ጥያቄውን ተመልክቶ በጥቂት ደቂቃዎች ውስጥ በቴሌብር ወደ ስልክዎ ያስተላልፋል!"
        ),
        "parse_mode": "HTML"
    })

def send_account_info(chat_id, user):
    phone = user.get("phone", "")
    full_name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() or "Player"
    app_url = get_user_webapp_url(chat_id, user)
    text = (
        f"👤 <b>የአካውንት መረጃ (Account Profile)</b>\n\n"
        f"• <b>ስም:</b> {full_name}\n"
        f"• <b>ስልክ ቁጥር:</b> <code>{phone or 'Not Registered'}</code>\n"
        f"• <b>Account ID:</b> <code>{chat_id}</code>\n"
        f"• <b>ሁኔታ:</b> <span class='status'>Verified Player ✓</span>\n\n"
        f"ዴፖዚት እና ዊዝድሮው በቀጥታ ከተመዘገበው ስልክዎ ጋር የተሳሰረ ነው።"
    )
    keyboard = {
        "inline_keyboard": [
            [{"text": "🎮 Open Mini App", "web_app": {"url": app_url}}],
            [{"text": "💳 Deposit", "callback_data": "deposit"}, {"text": "💸 Withdraw", "callback_data": "withdraw"}]
        ]
    }
    return api_call("sendMessage", {
        "chat_id": chat_id,
        "text": text,
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
            {"command": "start", "description": "🎮 Start & Register Account"},
            {"command": "deposit", "description": "💳 Deposit Funds (Telebirr/CBE)"},
            {"command": "withdraw", "description": "💸 Withdraw to Registered Phone"},
            {"command": "account", "description": "👤 View My Account Profile"},
            {"command": "admin", "description": "🛡️ Open Admin Control Center"}
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

                    # Handle Callback Queries (Inline button clicks)
                    callback_query = update.get("callback_query")
                    if callback_query:
                        cb_id = callback_query.get("id")
                        cb_data = callback_query.get("data", "")
                        cb_msg = callback_query.get("message", {})
                        cb_chat_id = cb_msg.get("chat", {}).get("id")
                        cb_user = load_known_users().get(str(cb_chat_id), {})

                        api_call("answerCallbackQuery", {"callback_query_id": cb_id})

                        if not is_user_registered(cb_chat_id):
                            request_phone_registration(cb_chat_id)
                        elif cb_data == "deposit":
                            send_deposit_info(cb_chat_id, cb_user)
                        elif cb_data == "withdraw":
                            send_withdraw_info(cb_chat_id, cb_user)
                        continue

                    msg = update.get("message")
                    if not msg:
                        continue

                    chat_id = msg["chat"]["id"]
                    first_name = msg["from"].get("first_name", "Player")
                    text = msg.get("text", "").strip()
                    web_app_data = msg.get("web_app_data")
                    contact = msg.get("contact")

                    # Handle Contact Sharing (Registration)
                    if contact:
                        raw_phone = contact.get("phone_number", "").strip()
                        phone = raw_phone
                        if not phone.startswith("+"):
                            if phone.startswith("251"):
                                phone = "+" + phone
                            elif phone.startswith("0"):
                                phone = "+251" + phone[1:]
                            else:
                                phone = "+251" + phone

                        c_first = contact.get("first_name") or msg["from"].get("first_name", "Player")
                        c_last = contact.get("last_name") or msg["from"].get("last_name", "")
                        user_obj = {
                            "id": chat_id,
                            "first_name": c_first,
                            "last_name": c_last,
                            "username": msg["from"].get("username", "")
                        }
                        user = save_known_user(user_obj, phone=phone)
                        full_name = f"{c_first} {c_last}".strip()

                        # Confirm registration & remove reply keyboard
                        confirm_text = (
                            f"✅ <b>ምዝገባዎ በተሳካ ሁኔታ ተጠናቋል!</b>\n"
                            f"<b>Account Successfully Created!</b>\n\n"
                            f"👤 <b>Player Name:</b> {full_name}\n"
                            f"📱 <b>Registered Phone:</b> <code>{phone}</code>\n"
                            f"🆔 <b>Account ID:</b> <code>{chat_id}</code>\n"
                            f"💰 <b>Real Balance:</b> 0.00 ETB\n\n"
                            f"አካውንትዎ ተከፍቷል! አሁን ዴፖዚት በማድረግ ጨዋታዎችን መጫወት እና በቀጥታ ወደ ስልክዎ ማውጣት ይችላሉ።"
                        )
                        api_call("sendMessage", {
                            "chat_id": chat_id,
                            "text": confirm_text,
                            "parse_mode": "HTML",
                            "reply_markup": {"remove_keyboard": True}
                        })

                        # Notify admins
                        for admin_id in ADMIN_USER_IDS:
                            if str(admin_id) != str(chat_id):
                                api_call("sendMessage", {
                                    "chat_id": admin_id,
                                    "text": (
                                        f"🎉 <b>አዲስ ተጫዋች ተመዝግቧል (New Player Registered)!</b>\n\n"
                                        f"👤 <b>ስም:</b> {full_name} (@{msg['from'].get('username','')})\n"
                                        f"📱 <b>ስልክ:</b> <code>{phone}</code>\n"
                                        f"🆔 <b>ID:</b> <code>{chat_id}</code>"
                                    ),
                                    "parse_mode": "HTML"
                                })

                        send_welcome(chat_id, user)
                        continue

                    # Save user basic profile in registry
                    user = save_known_user(msg.get("from"))

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

                    # Commands handling
                    if text.startswith("/start"):
                        # If user has not shared phone yet, require phone registration first
                        if not is_user_registered(chat_id):
                            request_phone_registration(chat_id)
                        else:
                            send_welcome(chat_id, user)

                    elif text.startswith("/admin") and is_admin(chat_id):
                        send_admin_menu(chat_id)

                    elif text.startswith("/deposit"):
                        if not is_user_registered(chat_id):
                            request_phone_registration(chat_id)
                        else:
                            send_deposit_info(chat_id, user)

                    elif text.startswith("/withdraw"):
                        if not is_user_registered(chat_id):
                            request_phone_registration(chat_id)
                        else:
                            parts = text.split(" ", 1)
                            if len(parts) > 1 and parts[1].strip():
                                handle_withdraw_request(chat_id, user, parts[1].strip())
                            else:
                                send_withdraw_info(chat_id, user)

                    elif text.startswith("/account"):
                        if not is_user_registered(chat_id):
                            request_phone_registration(chat_id)
                        else:
                            send_account_info(chat_id, user)

                    elif text.startswith("/broadcast ") and is_admin(chat_id):
                        broadcast_text = text.split(" ", 1)[1].strip()
                        if not broadcast_text:
                            send_text_message(chat_id, "Usage: /broadcast <message>")
                        else:
                            sent, failed = broadcast_message(broadcast_text)
                            send_text_message(chat_id, f"📢 Broadcast delivered to {sent} user(s) (Failed: {failed}).")

                    elif text.startswith("/send ") and is_admin(chat_id):
                        parts = text.split(" ", 2)
                        if len(parts) < 3:
                            send_text_message(chat_id, "Usage: /send <chat_id> <message>")
                        else:
                            target_chat_id, message = parts[1], parts[2]
                            result = send_text_message(target_chat_id, message)
                            send_text_message(chat_id, "✅ Message sent." if result and result.get("ok") else "❌ Telegram could not deliver that message.")

                    else:
                        # If user is not registered, ask to share phone
                        if not is_user_registered(chat_id):
                            request_phone_registration(chat_id)
                        else:
                            # If user sends payment transaction note or receipt message
                            lower = text.lower()
                            if any(k in lower for k in ["telebirr", "cbe", "trans", "tx", "ብር", "etb", "deposit", "ክፍያ", "09"]):
                                full_name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() or "Player"
                                for admin_id in ADMIN_USER_IDS:
                                    api_call("sendMessage", {
                                        "chat_id": admin_id,
                                        "text": (
                                            f"📩 <b>አዲስ የክፍያ መልእክት (Player Payment Message)!</b>\n\n"
                                            f"👤 <b>ተጫዋች:</b> {full_name} (@{msg['from'].get('username','')})\n"
                                            f"📱 <b>ስልክ:</b> <code>{user.get('phone','')}</code>\n"
                                            f"🆔 <b>ID:</b> <code>{chat_id}</code>\n"
                                            f"📝 <b>መልእክት:</b>\n{text}"
                                        ),
                                        "parse_mode": "HTML"
                                    })
                                send_text_message(chat_id, "✅ <b>የክፍያ መረጃዎ ለአስተዳዳሪው ተላልፏል!</b>\nአድሚኑ ደረሰኙን አረጋግጦ በጥቂት ደቂቃዎች ውስጥ ወደ ሂሳብዎ ይጨምራል። እናመሰግናለን!")
                            else:
                                send_welcome(chat_id, user)

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
