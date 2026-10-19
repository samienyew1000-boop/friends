"""
Friendes Game - Telegram Bot Runner for @Friends64_BOT
Runs polling and sends interactive messages with WebApp button.
Handles Contact Sharing Phone Registration, Persistent Custom Ethiopian Gaming Keyboard,
Deposit, Withdraw, Referrals, and Account Profile.
"""

import os
import sys
import time
import json
import logging
import urllib.request
import urllib.parse
from pathlib import Path
import re

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

# Telegram Web Apps strictly require HTTPS URLs
if not WEBAPP_URL.startswith("https://"):
    WEBAPP_URL = "https://samienyew1000-boop.github.io/friends/"
if not ADMIN_URL.startswith("https://"):
    ADMIN_URL = "https://samienyew1000-boop.github.io/friends/admin/"

ADMIN_USER_IDS = {
    value.strip() for value in os.environ.get("TELEGRAM_ADMIN_USER_IDS", "").split(",") if value.strip()
}
ADMIN_USER_IDS.add("8474256363")
ADMIN_USER_IDS.add("5663531258")  # samTesfa19 ID from logs
ADMIN_USERNAMES = {"ninjaaj7", "samtesfa19"}
if os.environ.get("TELEGRAM_ADMIN_USERNAMES"):
    for u in os.environ.get("TELEGRAM_ADMIN_USERNAMES", "").split(","):
        if u.strip():
            ADMIN_USERNAMES.add(u.strip().lstrip("@").lower())

ADMIN_PASSWORDS = {"7DoGpDwZ4zpIvotZm9p", "admin123", os.environ.get("ADMIN_PASSWORD", "").strip()} - {""}

REQUIRED_GROUP_USERNAME = os.environ.get("REQUIRED_GROUP_USERNAME", "friendsgame1").lstrip("@")
REQUIRED_GROUP_ID = int(os.environ.get("REQUIRED_GROUP_ID", "-1001332933972"))
REQUIRED_GROUP_URL = os.environ.get("REQUIRED_GROUP_URL", f"https://t.me/{REQUIRED_GROUP_USERNAME}")

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
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8", errors="ignore")
        logging.error(f"API Error ({method}): HTTP {e.code} - {err_msg}")
        return None
    except Exception as e:
        logging.error(f"API Error ({method}): {e}")
        return None

def is_admin(user_id=None, username=None):
    if user_id and str(user_id) in ADMIN_USER_IDS:
        return True
    if username:
        clean_user = str(username).strip().lstrip("@").lower()
        if clean_user in ADMIN_USERNAMES:
            if user_id:
                ADMIN_USER_IDS.add(str(user_id))
            return True
    return False

KNOWN_USERS_FILE = Path(__file__).resolve().parent / "known_users.json"
WITHDRAWALS_FILE = Path(__file__).resolve().parent / "withdrawals.json"
DEPOSITS_FILE = Path(__file__).resolve().parent / "deposits.json"

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

def get_user_webapp_url(chat_id, user=None):
    if not user:
        users = load_known_users()
        user = users.get(str(chat_id), {})
    phone = user.get("phone", "")
    full_name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() or "Player"
    bal = float(user.get("balance", 0.0))
    clean_phone = urllib.parse.quote(phone)
    clean_name = urllib.parse.quote(full_name)
    return f"{WEBAPP_URL}?phone={clean_phone}&uid={chat_id}&name={clean_name}&balance={bal:.2f}"

def get_main_reply_keyboard(chat_id, user=None):
    """
    Persistent Custom Ethiopian Gaming Keyboard exactly matching user requirements:
    Row 1: [ 🎮 ቢንጎ ተጫወት ]  [ 🎁 ፕሮሞ ኮድ ]
    Row 2: [ 💰 ገቢ ለማድረግ ]  [ 💸 ወጪ ለማድረግ ]
    Row 3: [ 🔗 ጋብዝ & አግኝ ]  [ 👤 ፕሮፋይል & ሂሳብ ]
    Row 4: [ 🆘 እርዳታ ]      [ 🌐 ቋንቋ / Language ]
    Row 5: [ 📢 አጀንት ፕሮሞተር ]
    """
    app_url = get_user_webapp_url(chat_id, user)
    return {
        "keyboard": [
            [
                {"text": "🎮 ቢንጎ ተጫወት", "web_app": {"url": app_url}},
                {"text": "🎁 ፕሮሞ ኮድ"}
            ],
            [
                {"text": "💰 ገቢ ለማድረግ"},
                {"text": "💸 ወጪ ለማድረግ"}
            ],
            [
                {"text": "🔗 ጋብዝ & አግኝ"},
                {"text": "👤 ፕሮፋይል & ሂሳብ"}
            ],
            [
                {"text": "🆘 እርዳታ"},
                {"text": "🌐 ቋንቋ / Language"}
            ],
            [
                {"text": "📢 አጀንት ፕሮሞተር"}
            ]
        ],
        "resize_keyboard": True,
        "is_persistent": True
    }

def check_user_membership(user_id):
    """
    Checks if a user is a member/admin/creator of the required group @friendsgame1.
    Returns: (is_member: bool, reason: str)
    """
    if is_admin(user_id=user_id):
        return True, "admin"

    for target in (f"@{REQUIRED_GROUP_USERNAME}", REQUIRED_GROUP_ID):
        try:
            res = api_call("getChatMember", {
                "chat_id": target,
                "user_id": int(user_id)
            })
            if res and res.get("ok"):
                status = res.get("result", {}).get("status", "")
                if status in ("creator", "administrator", "member", "restricted"):
                    return True, "member"
                elif status in ("left", "kicked"):
                    return False, "left"
        except Exception as e:
            logging.warning(f"Error checking chat member on {target}: {e}")

    err_desc = (res.get("description", "") if res else "").lower()
    logging.warning(f"getChatMember check for user {user_id}: {err_desc}")
    if "admin" in err_desc:
        return False, "bot_needs_admin"
    return False, "not_member"

def send_channel_join_prompt(chat_id):
    """Prompt unregistered user that joining the official group is mandatory."""
    text = (
        "📢 <b>እንኳን ወደ Friendes Game በደህና መጡ!</b>\n\n"
        "የጨዋታ አካውንትዎን ለመመዝገብ እና ቦቱን ለመጠቀም መጀመሪያ ይፋዊውን የቴሌግራም ግሩፓችንን መቀላቀል (Join) ግዴታ ነው::\n\n"
        f"1️⃣ ከታች ያለውን <b>'📢 ግሩፑን ተቀላቀል (Join Group)'</b> የሚለውን ተጭነው {REQUIRED_GROUP_URL} ይቀላቀሉ\n"
        "2️⃣ ግሩፑን ከተቀላቀሉ በኋላ <b>'✅ ተቀላቅያለሁ አረጋግጥ'</b> የሚለውን ይጫኑ:"
    )
    keyboard = {
        "inline_keyboard": [
            [
                {"text": "📢 ግሩፑን ተቀላቀል (Join Group)", "url": REQUIRED_GROUP_URL}
            ],
            [
                {"text": "✅ ተቀላቅያለሁ አረጋግጥ (Verify)", "callback_data": "check_channel_join"}
            ]
        ]
    }
    return api_call("sendMessage", {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "reply_markup": keyboard
    })

def ensure_user_registered_or_prompt(chat_id):
    """
    Check if the user is registered.
    If not, enforce group membership first, then contact registration.
    Returns True if user is fully registered with phone.
    """
    if is_user_registered(chat_id):
        return True

    is_member, reason = check_user_membership(chat_id)
    if not is_member:
        send_channel_join_prompt(chat_id)
        return False

    request_phone_registration(chat_id)
    return False

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

def send_registration_success(chat_id, user):
    """Send congratulations and photo matching the screenshot, attaching the persistent keyboard."""
    username = user.get("username")
    display_user = f"@{username}" if username else user.get("first_name", "Player")

    # 1. Congratulatory text
    msg1 = f"እንኳን ደስ አለዎት {display_user}! ምዝገባው ተጠናቋል። አሁን መጫወት ይችላሉ::"
    api_call("sendMessage", {
        "chat_id": chat_id,
        "text": msg1,
        "parse_mode": "HTML"
    })

    # 2. Card with photo and account balances
    caption = (
        f"ሰላም {display_user}!\n"
        f"የጨዋታ ሂሳብ: 0 ETB\n"
        f"የአሸናፊነት ሂሳብ: 0 ETB"
    )
    photo_url = WEBAPP_URL.rstrip("/") + "/assets/inout_logo.png"
    main_kb = get_main_reply_keyboard(chat_id, user)

    res = api_call("sendPhoto", {
        "chat_id": chat_id,
        "photo": photo_url,
        "caption": caption,
        "parse_mode": "HTML",
        "reply_markup": main_kb
    })
    if not res or not res.get("ok"):
        api_call("sendMessage", {
            "chat_id": chat_id,
            "text": caption,
            "parse_mode": "HTML",
            "reply_markup": main_kb
        })

def send_welcome(chat_id, user=None):
    if not user:
        users = load_known_users()
        user = users.get(str(chat_id), {})

    first_name = user.get("first_name", "Player")
    username = user.get("username")
    display_user = f"@{username}" if username else first_name
    main_kb = get_main_reply_keyboard(chat_id, user)

    caption = (
        f"ሰላም {display_user}!\n"
        f"የጨዋታ ሂሳብ: 0 ETB\n"
        f"የአሸናፊነት ሂሳብ: 0 ETB"
    )

    photo_url = WEBAPP_URL.rstrip("/") + "/assets/inout_logo.png"
    photo_res = api_call("sendPhoto", {
        "chat_id": chat_id,
        "photo": photo_url,
        "caption": caption,
        "parse_mode": "HTML",
        "reply_markup": main_kb
    })
    if not photo_res or not photo_res.get("ok"):
        api_call("sendMessage", {
            "chat_id": chat_id,
            "text": caption,
            "parse_mode": "HTML",
            "reply_markup": main_kb
        })

def send_deposit_info(chat_id, user):
    phone = user.get("phone", "")
    full_name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() or "Player"
    app_url = get_user_webapp_url(chat_id, user)
    main_kb = get_main_reply_keyboard(chat_id, user)

    text = (
        f"💰 <b>ገቢ ለማድረግ (Deposit Funds)</b>\n\n"
        f"👤 <b>የተጠቃሚ ስም:</b> {full_name}\n"
        f"📱 <b>የተመዘገበ ስልክ:</b> <code>{phone}</code>\n"
        f"🆔 <b>የተጫዋች ID:</b> <code>{chat_id}</code>\n\n"
        f"🏦 <b>ይፋዊ የክፍያ ቁጥሮች:</b>\n"
        f"• <b>Telebirr:</b> <code>0981247219</code> (Friendes Game)\n"
        f"• <b>CBE Birr:</b> <code>0981247219</code> (Friendes Game)\n\n"
        f"📌 <b>መመሪያ፦</b>\n"
        f"1. በተመዘገበው ስልክዎ (<code>{phone}</code>) ወደ ላይኛው ቴሌብር/ሲቢኢ ብር ይላኩ።\n"
        f"2. ከላኩ በኋላ የደረሰኝ ቁጥሩን (Transaction ID) እዚህ ይላኩልን ወይም ከስር ያለውን ሊንክ ተጭነው በዌብአፑ ውስጥ በቀጥታ ይሙሉ:"
    )
    inline_keyboard = {
        "inline_keyboard": [
            [{"text": "💳 Open Deposit in Mini App", "web_app": {"url": app_url}}]
        ]
    }
    return api_call("sendMessage", {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "reply_markup": inline_keyboard
    })

def send_withdraw_info(chat_id, user):
    phone = user.get("phone", "")
    full_name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() or "Player"
    app_url = get_user_webapp_url(chat_id, user)

    text = (
        f"💸 <b>ወጪ ለማድረግ (Withdraw Funds)</b>\n\n"
        f"👤 <b>የተጠቃሚ ስም:</b> {full_name}\n"
        f"📱 <b>ገንዘብ የሚላክበት ስልክ:</b> <code>{phone}</code>\n"
        f"🆔 <b>የተጫዋች ID:</b> <code>{chat_id}</code>\n\n"
        f"📌 <b>ገንዘብ ለማውጣት፦</b>\n"
        f"<code>/withdraw [የብር መጠን]</code> ብለው ይላኩ\n"
        f"ምሳሌ፦ <code>/withdraw 500</code>\n\n"
        f"ገንዘቡ በቀጥታ ወደ ተመዘገበው ስልክዎ (<code>{phone}</code>) በቴሌብር ይላክሎታል። አነስተኛው የማውጣት መጠን 50 ETB ነው።"
    )
    inline_keyboard = {
        "inline_keyboard": [
            [{"text": "💸 Open Withdraw in Mini App", "web_app": {"url": app_url}}]
        ]
    }
    return api_call("sendMessage", {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "reply_markup": inline_keyboard
    })

def handle_withdraw_request(chat_id, user, amount_str):
    try:
        amt = float(amount_str)
        if amt < 50:
            return api_call("sendMessage", {
                "chat_id": chat_id,
                "text": "⚠️ አነስተኛው የማውጣት መጠን <b>50 ETB</b> ነው። እባክዎ ከ 50 ETB በላይ ይጥቀሱ።",
                "parse_mode": "HTML",
                "reply_markup": get_main_reply_keyboard(chat_id, user)
            })
    except ValueError:
        return api_call("sendMessage", {
            "chat_id": chat_id,
            "text": "⚠️ እባክዎ ትክክለኛ የብር መጠን ይጥቀሱ።\nምሳሌ፦ <code>/withdraw 500</code>",
            "parse_mode": "HTML",
            "reply_markup": get_main_reply_keyboard(chat_id, user)
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
        "parse_mode": "HTML",
        "reply_markup": get_main_reply_keyboard(chat_id, user)
    })

def load_deposits():
    if DEPOSITS_FILE.exists():
        try:
            with open(DEPOSITS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []

def save_deposits(deposits):
    try:
        with open(DEPOSITS_FILE, "w", encoding="utf-8") as f:
            json.dump(deposits, f, indent=2, ensure_ascii=False)
    except Exception as e:
        logging.error(f"Error saving deposits: {e}")

def handle_deposit_submission(chat_id, user, tx_id, amount=100.0, method="Telebirr"):
    now_str = time.strftime("%Y-%m-%d %H:%M:%S")
    deposits = load_deposits()
    req_id = f"TX-{int(time.time())}"
    full_name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() or "Player"
    phone = user.get("phone", "")
    username = user.get("username", "")

    record = {
        "id": req_id,
        "tx_id": str(tx_id).strip(),
        "chat_id": chat_id,
        "name": full_name,
        "username": username,
        "phone": phone,
        "amount": float(amount),
        "method": method,
        "status": "pending",
        "created_at": now_str
    }
    deposits.append(record)
    save_deposits(deposits)

    kb = {
        "inline_keyboard": [
            [
                {"text": "✅ አጽድቅ (Approve)", "callback_data": f"dep_approve:{req_id}"},
                {"text": "❌ ሰርዝ (Reject)", "callback_data": f"dep_reject:{req_id}"}
            ]
        ]
    }
    admin_text = (
        f"🚨 <b>አዲስ የገቢ ጥያቄ (New Deposit Request)!</b>\n\n"
        f"🆔 <b>Ref:</b> <code>{req_id}</code>\n"
        f"🧾 <b>Tx ID:</b> <code>{tx_id}</code>\n"
        f"👤 <b>ተጫዋች:</b> {full_name} (@{username})\n"
        f"📱 <b>ስልክ:</b> <code>{phone}</code>\n"
        f"🏦 <b>ዘዴ:</b> {method}\n"
        f"💰 <b>መጠን:</b> <b>{amount:.2f} ETB</b>\n"
        f"⏰ <b>ሰዓት:</b> {now_str}"
    )
    for admin_id in ADMIN_USER_IDS:
        api_call("sendMessage", {
            "chat_id": admin_id,
            "text": admin_text,
            "parse_mode": "HTML",
            "reply_markup": kb
        })

    return api_call("sendMessage", {
        "chat_id": chat_id,
        "text": (
            f"✅ <b>የገቢ ጥያቄዎ በተሳካ ሁኔታ ተመዝግቧል!</b>\n\n"
            f"🆔 <b>የጥያቄ ቁጥር:</b> <code>{req_id}</code>\n"
            f"🧾 <b>የደረሰኝ ቁጥር (Tx ID):</b> <code>{tx_id}</code>\n"
            f"💰 <b>የተመዘገበው መጠን:</b> <b>{amount:.2f} ETB</b>\n"
            f"⏳ <b>ሁኔታ:</b> በመጠባበቅ ላይ (Pending Approval)\n\n"
            f"አድሚን የደረሰኝ ቁጥሩን አረጋግጦ በጥቂት ደቂቃዎች ውስጥ ወደ ሂሳብዎ ይጨምራል። እናመሰግናለን!"
        ),
        "parse_mode": "HTML",
        "reply_markup": get_main_reply_keyboard(chat_id, user)
    })

def approve_deposit(dep_id, admin_id, explicit_chat_id=None, explicit_amount=None, message_text=""):
    deposits = load_deposits()
    target = None
    for d in deposits:
        if d.get("id") == dep_id or d.get("tx_id") == dep_id:
            target = d
            break

    if not target:
        target = {
            "id": dep_id,
            "tx_id": dep_id,
            "status": "pending",
            "amount": float(explicit_amount) if explicit_amount else 100.0,
            "chat_id": int(explicit_chat_id) if explicit_chat_id else None
        }
        deposits.append(target)

    if target.get("status") == "completed":
        return False, "ቀድሞ ጸድቋል (Already approved)"

    # Resolve chat_id if missing
    if not target.get("chat_id"):
        if explicit_chat_id:
            target["chat_id"] = int(explicit_chat_id)
        elif message_text:
            m_uid = re.search(r"User\s*ID:\s*(\d+)", message_text, re.IGNORECASE)
            if m_uid:
                target["chat_id"] = int(m_uid.group(1))
            else:
                m_cid = re.search(r"Chat\s*ID:\s*(\d+)", message_text, re.IGNORECASE)
                if m_cid:
                    target["chat_id"] = int(m_cid.group(1))
                else:
                    m_user = re.search(r"@([A-Za-z0-9_]+)", message_text)
                    if m_user:
                        uname = m_user.group(1).lower()
                        all_users = load_known_users()
                        for uid_k, udata in all_users.items():
                            if udata.get("username", "").lower() == uname:
                                target["chat_id"] = int(uid_k)
                                break
                    if not target.get("chat_id"):
                        m_ph = re.search(r"(\+?251\d{9}|09\d{8}|07\d{8})", message_text)
                        if m_ph:
                            ph = m_ph.group(1)
                            all_users = load_known_users()
                            for uid_k, udata in all_users.items():
                                if udata.get("phone", "").replace(" ", "") == ph or udata.get("phone", "").endswith(ph[-9:]):
                                    target["chat_id"] = int(uid_k)
                                    break

    # Resolve amount if explicit or from text
    if explicit_amount and float(explicit_amount) > 0:
        target["amount"] = float(explicit_amount)
    elif message_text and (not target.get("amount") or target.get("amount") <= 0):
        m_amt = re.search(r"(\d+(?:\.\d+)?)\s*ETB", message_text, re.IGNORECASE)
        if m_amt:
            target["amount"] = float(m_amt.group(1))

    target["status"] = "completed"
    target["approved_by"] = admin_id
    target["approved_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
    save_deposits(deposits)

    chat_id = target.get("chat_id")
    amt = float(target.get("amount", 100.0))
    new_balance = amt
    if chat_id:
        users = load_known_users()
        uid_str = str(chat_id)
        if uid_str not in users:
            users[uid_str] = {
                "id": int(chat_id),
                "first_name": target.get("name", "Player"),
                "username": target.get("username", ""),
                "phone": target.get("phone", ""),
                "registered": True,
                "balance": 0.0,
                "updated": time.time()
            }
        new_balance = round(users[uid_str].get("balance", 0.0) + amt, 2)
        users[uid_str]["balance"] = new_balance
        users[uid_str]["updated"] = time.time()
        save_all_users(users)

        play_url = get_user_webapp_url(chat_id, users[uid_str])
        api_call("sendMessage", {
            "chat_id": chat_id,
            "text": (
                f"🎉 <b>እንኳን ደስ አለዎት!</b>\n\n"
                f"የ <b>{amt:.2f} ETB</b> የገቢ ክፍያዎ በአድሚን ተረጋግጦ ጸድቋል (Approved)!\n"
                f"🧾 <b>Tx ID:</b> <code>{target.get('tx_id')}</code>\n"
                f"💰 <b>የአሁኑ የጨዋታ ሂሳብዎ:</b> <b>{new_balance:.2f} ETB</b>\n\n"
                f"ገንዘቡ ወደ ሂሳብዎ ገብቷል። አሁን ከታች ያለውን ቁልፍ ተጭነው መጫወት ይችላሉ። መልካም እድል! 🍀"
            ),
            "parse_mode": "HTML",
            "reply_markup": {
                "inline_keyboard": [
                    [{"text": "🎮 አሁን ይጫወቱ (Play Now)", "web_app": {"url": play_url}}]
                ]
            }
        })
    return True, f"Approved! +{amt:.2f} ETB (Balance: {new_balance:.2f} ETB)"

def reject_deposit(dep_id, admin_id, explicit_chat_id=None, explicit_amount=None, message_text=""):
    deposits = load_deposits()
    target = None
    for d in deposits:
        if d.get("id") == dep_id or d.get("tx_id") == dep_id:
            target = d
            break

    if not target:
        target = {
            "id": dep_id,
            "tx_id": dep_id,
            "status": "pending",
            "amount": float(explicit_amount) if explicit_amount else 0.0,
            "chat_id": int(explicit_chat_id) if explicit_chat_id else None
        }
        deposits.append(target)

    if target.get("status") == "rejected":
        return False, "ቀድሞ ተሰርዟል (Already rejected)"

    if not target.get("chat_id"):
        if explicit_chat_id:
            target["chat_id"] = int(explicit_chat_id)
        elif message_text:
            m_uid = re.search(r"User\s*ID:\s*(\d+)", message_text, re.IGNORECASE)
            if m_uid:
                target["chat_id"] = int(m_uid.group(1))
            else:
                m_cid = re.search(r"Chat\s*ID:\s*(\d+)", message_text, re.IGNORECASE)
                if m_cid:
                    target["chat_id"] = int(m_cid.group(1))
                else:
                    m_user = re.search(r"@([A-Za-z0-9_]+)", message_text)
                    if m_user:
                        uname = m_user.group(1).lower()
                        all_users = load_known_users()
                        for uid_k, udata in all_users.items():
                            if udata.get("username", "").lower() == uname:
                                target["chat_id"] = int(uid_k)
                                break

    target["status"] = "rejected"
    target["rejected_by"] = admin_id
    target["rejected_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
    save_deposits(deposits)

    chat_id = target.get("chat_id")
    if chat_id:
        api_call("sendMessage", {
            "chat_id": chat_id,
            "text": (
                f"⚠️ <b>የገቢ ጥያቄዎ ውድቅ ተደርጓል (Cancelled/Rejected)</b>\n\n"
                f"🧾 <b>Tx ID:</b> <code>{target.get('tx_id')}</code>\n\n"
                f"ያስገቡት የደረሰኝ ቁጥር አልተገኘም ወይም ትክክል አይደለም። እባክዎ ትክክለኛውን ደረሰኝ በማረጋገጥ በድጋሚ ይሞክሩ ወይም እርዳታ ያነጋግሩ።"
            ),
            "parse_mode": "HTML"
        })
    return True, "Rejected"

def send_profile_info(chat_id, user):
    phone = user.get("phone", "")
    full_name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() or "Player"
    username = user.get("username")
    display_user = f"@{username}" if username else "Not set"
    main_kb = get_main_reply_keyboard(chat_id, user)
    bal = float(user.get("balance", 0.0))

    text = (
        f"👤 <b>የተጫዋች ፕሮፋይል እና ሂሳብ (Profile & Balance)</b>\n\n"
        f"• <b>ስም:</b> {full_name}\n"
        f"• <b>የተጠቃሚ ስም:</b> {display_user}\n"
        f"• <b>ስልክ ቁጥር:</b> <code>{phone or 'Not Registered'}</code>\n"
        f"• <b>የተጫዋች መለያ (ID):</b> <code>{chat_id}</code>\n"
        f"• <b>የጨዋታ ሂሳብ:</b> <b>{bal:.2f} ETB</b>\n"
        f"• <b>የአሸናፊነት ሂሳብ:</b> 0.00 ETB\n"
        f"• <b>የአካውንት ሁኔታ:</b> የተረጋገጠ ተጫዋች ✓\n\n"
        f"ገቢ እና ወጪ ለማድረግ ከታች ያሉትን ቁልፎች ይጠቀሙ።"
    )
    return api_call("sendMessage", {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "reply_markup": main_kb
    })

def send_promo_info(chat_id, user):
    main_kb = get_main_reply_keyboard(chat_id, user)
    text = (
        f"🎁 <b>ፕሮሞ ኮድ (Promo Code)</b>\n\n"
        f"የቦነስ ኮድዎን በመጠቀም ተጨማሪ ነፃ የጨዋታ ብር ያግኙ!\n\n"
        f"የአሁኑ ይፋዊ ኮድ፦ <code>HABESHA100</code> (+100 ETB)\n\n"
        f"📌 <b>አጠቃቀም፦</b>\n"
        f"ኮዱን በጨዋታው Mini App ውስጥ በ <b>Promo / Coupon</b> ገጽ ላይ ያስገቡ።"
    )
    return api_call("sendMessage", {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "reply_markup": main_kb
    })

def send_referral_info(chat_id, user):
    main_kb = get_main_reply_keyboard(chat_id, user)
    ref_link = f"https://t.me/Friends64_BOT?start=ref_{chat_id}"
    text = (
        f"🔗 <b>ጋብዝ እና አግኝ (Invite & Earn)</b>\n\n"
        f"ጓደኞችዎን ይጋብዙ እና በእያንዳንዱ በሚያስመዘግቡት ሰው የ <b>+25 ETB</b> ጉርሻ ያግኙ!\n\n"
        f"📌 <b>የእርስዎ የመጋበዣ ሊንክ (Referral Link)፦</b>\n"
        f"<code>{ref_link}</code>\n\n"
        f"ይህን ሊንክ ኮፒ በማድረግ ለጓደኞችዎ እና በግሩፖች ላይ ያጋሩ!"
    )
    return api_call("sendMessage", {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "reply_markup": main_kb
    })

def send_help_info(chat_id, user):
    main_kb = get_main_reply_keyboard(chat_id, user)
    text = (
        f"🆘 <b>እርዳታ እና ድጋፍ (Help & 24/7 Support)</b>\n\n"
        f"ማንኛውም ጥያቄ ወይም ችግር ካጋጠመዎት የደንበኞች አገልግሎት ሰራተኞቻችንን 24/7 ማግኘት ይችላሉ፦\n\n"
        f"• <b>ቴሌግራም ድጋፍ:</b> @Friends64_BOT\n"
        f"• <b>የስልክ መስመር:</b> <code>+251 981 247 219</code>\n"
        f"• <b>ሰዓት:</b> 24 ሰዓት ክፍት ነው\n\n"
        f"በፍጥነት ምላሽ እንሰጣለን!"
    )
    return api_call("sendMessage", {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "reply_markup": main_kb
    })

def send_language_info(chat_id, user):
    main_kb = get_main_reply_keyboard(chat_id, user)
    text = (
        f"🌐 <b>ቋንቋ ይምረጡ / Choose Language</b>\n\n"
        f"• <b>አማርኛ</b> (አሁን የተመረጠ)\n"
        f"• <b>English</b>\n\n"
        f"የቦቱ እና የጨዋታው ቋንቋ በነባሪነት በአማርኛ እና በእንግሊዝኛ የተዘጋጀ ነው።"
    )
    return api_call("sendMessage", {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "reply_markup": main_kb
    })

def send_agent_info(chat_id, user):
    main_kb = get_main_reply_keyboard(chat_id, user)
    text = (
        f"📢 <b>የአጀንት እና ፕሮሞተር ፕሮግራም (Agent & Promoter)</b>\n\n"
        f"የ Friendes Game ይፋዊ አጀንት ወይም ፕሮሞተር በመሆን በሳምንት እስከ <b>20,000+ ETB</b> በኮሚሽን ያግኙ!\n\n"
        f"💼 <b>ጥቅማጥቅሞች:</b>\n"
        f"• ከፍተኛ ሳምንታዊ ኮሚሽን\n"
        f"• ፈጣን የክፍያ አሰጣጥ\n"
        f"• ለስራ የሚያስፈልጉ ባነሮች እና ማስታወቂያዎች\n\n"
        f"ለበለጠ መረጃ እና ለመጀመር ያናግሩን፦\n"
        f"👉 @Friends64_BOT"
    )
    return api_call("sendMessage", {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "reply_markup": main_kb
    })

def send_admin_menu(chat_id):
    admin_web_url = f"{ADMIN_URL}?auth=admin"
    admin_text = (
        "🛡️ <b>Friendes Game | Admin Control Center</b>\n\n"
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
                    "web_app": {"url": admin_web_url}
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

    # Configure Telegram commands menu (Keeps admin command hidden from public view)
    api_call("setMyCommands", {
        "commands": [
            {"command": "start", "description": "🎮 Start & Register Account"},
            {"command": "deposit", "description": "💰 Deposit Funds (Telebirr/CBE)"},
            {"command": "withdraw", "description": "💸 Withdraw to Registered Phone"},
            {"command": "profile", "description": "👤 View My Account Profile"}
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
                        cb_from = callback_query.get("from", {})
                        cb_user = load_known_users().get(str(cb_chat_id), {})

                        if cb_data.startswith("dep_approve:") or cb_data.startswith("dep_reject:"):
                            action, rest = cb_data.split(":", 1)
                            caller_id = cb_from.get("id")
                            caller_username = cb_from.get("username", "")

                            if not is_admin(caller_id, caller_username):
                                api_call("answerCallbackQuery", {
                                    "callback_query_id": cb_id,
                                    "text": "❌ የተፈቀደለት አድሚን ብቻ ነው ማጽደቅ የሚችለው!",
                                    "show_alert": True
                                })
                                continue

                            # Support format: <uid>:<amt>:<dep_id> or <dep_id>
                            dep_parts = rest.split(":")
                            explicit_uid = None
                            explicit_amt = None
                            if len(dep_parts) == 3:
                                try:
                                    if dep_parts[0] and dep_parts[0] != "0":
                                        explicit_uid = int(dep_parts[0])
                                    explicit_amt = float(dep_parts[1])
                                except Exception:
                                    pass
                                dep_id = dep_parts[2]
                            else:
                                dep_id = rest

                            orig_text = cb_msg.get("text", "")
                            if action == "dep_approve":
                                ok, info = approve_deposit(
                                    dep_id,
                                    caller_id,
                                    explicit_chat_id=explicit_uid,
                                    explicit_amount=explicit_amt,
                                    message_text=orig_text
                                )
                                if ok:
                                    api_call("answerCallbackQuery", {
                                        "callback_query_id": cb_id,
                                        "text": f"✅ {info}"
                                    })
                                    admin_tag = f"@{caller_username}" if caller_username else f"ID {caller_id}"
                                    api_call("editMessageText", {
                                        "chat_id": cb_chat_id,
                                        "message_id": cb_msg.get("message_id"),
                                        "text": orig_text + f"\n\n<b>✅ APPROVED by {admin_tag}</b>\n<i>({info})</i>",
                                        "parse_mode": "HTML"
                                    })
                                else:
                                    api_call("answerCallbackQuery", {
                                        "callback_query_id": cb_id,
                                        "text": f"⚠️ {info}",
                                        "show_alert": True
                                    })
                            else:
                                ok, info = reject_deposit(
                                    dep_id,
                                    caller_id,
                                    explicit_chat_id=explicit_uid,
                                    explicit_amount=explicit_amt,
                                    message_text=orig_text
                                )
                                if ok:
                                    api_call("answerCallbackQuery", {
                                        "callback_query_id": cb_id,
                                        "text": f"❌ ገቢ {dep_id} ተሰርዟል!"
                                    })
                                    admin_tag = f"@{caller_username}" if caller_username else f"ID {caller_id}"
                                    api_call("editMessageText", {
                                        "chat_id": cb_chat_id,
                                        "message_id": cb_msg.get("message_id"),
                                        "text": orig_text + f"\n\n<b>❌ CANCELLED/REJECTED by {admin_tag}</b>",
                                        "parse_mode": "HTML"
                                    })
                                else:
                                    api_call("answerCallbackQuery", {
                                        "callback_query_id": cb_id,
                                        "text": f"⚠️ {info}",
                                        "show_alert": True
                                    })
                            continue

                        if cb_data == "check_channel_join":
                            is_member, reason = check_user_membership(cb_chat_id)
                            if is_member:
                                api_call("answerCallbackQuery", {
                                    "callback_query_id": cb_id,
                                    "text": "✅ ግሩፑን መቀላቀልዎ ተረጋግጧል! አሁን ስልክዎን ያጋሩ።",
                                    "show_alert": False
                                })
                                if not is_user_registered(cb_chat_id):
                                    request_phone_registration(cb_chat_id)
                                else:
                                    send_welcome(cb_chat_id, cb_user)
                            else:
                                if reason == "bot_needs_admin":
                                    api_call("answerCallbackQuery", {
                                        "callback_query_id": cb_id,
                                        "text": "⚠️ እባክዎ መጀመሪያ ግሩፑን (@friendsgame1) ይቀላቀሉ! (እንዲሁም ቦቱ ግሩፑ ውስጥ አድሚን መሆን አለበት)",
                                        "show_alert": True
                                    })
                                else:
                                    api_call("answerCallbackQuery", {
                                        "callback_query_id": cb_id,
                                        "text": "⚠️ እስካሁን ግሩፑን አልተቀላቀሉም! እባክዎ መጀመሪያ ግሩፑን ይቀላቀሉ።",
                                        "show_alert": True
                                    })
                                send_channel_join_prompt(cb_chat_id)
                            continue

                        api_call("answerCallbackQuery", {"callback_query_id": cb_id})

                        if not ensure_user_registered_or_prompt(cb_chat_id):
                            continue
                        elif cb_data == "deposit":
                            send_deposit_info(cb_chat_id, cb_user)
                        elif cb_data == "withdraw":
                            send_withdraw_info(cb_chat_id, cb_user)
                        continue

                    msg = update.get("message")
                    if not msg:
                        continue

                    chat_id = msg["chat"]["id"]
                    from_user = msg.get("from") or {}
                    first_name = from_user.get("first_name", "Player")
                    username = from_user.get("username", "")
                    text = msg.get("text", "").strip()
                    web_app_data = msg.get("web_app_data")
                    contact = msg.get("contact")

                    # Handle Contact Sharing (Registration)
                    if contact:
                        # First verify mandatory group membership
                        is_member, reason = check_user_membership(chat_id)
                        if not is_member:
                            api_call("sendMessage", {
                                "chat_id": chat_id,
                                "text": (
                                    "⚠️ <b>ምዝገባውን ለማጠናቀቅ መጀመሪያ ይፋዊ ግሩፓችንን መቀላቀል አለብዎት!</b>\n\n"
                                    f"እባክዎ መጀመሪያ ከስር ያለውን ሊንክ ተጭነው {REQUIRED_GROUP_URL} ይቀላቀሉ፤ ከተቀላቀሉ በኋላ ስልክዎን በድጋሚ ያጋሩ::"
                                ),
                                "parse_mode": "HTML"
                            })
                            send_channel_join_prompt(chat_id)
                            continue

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

                        # Send congratulations and attach persistent keyboard
                        send_registration_success(chat_id, user)
                        continue

                    # Save user basic profile in registry
                    user = save_known_user(msg.get("from"))
                    if username and username.lower() in ADMIN_USERNAMES:
                        ADMIN_USER_IDS.add(str(chat_id))

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

                    # --- Custom Keyboard Choices ---
                    if text in ("🎮 ቢንጎ ተጫወት", "🎮 አሁን ተጫወት"):
                        if not ensure_user_registered_or_prompt(chat_id):
                            continue
                        app_url = get_user_webapp_url(chat_id, user)
                        api_call("sendMessage", {
                            "chat_id": chat_id,
                            "text": "🎮 <b>ቢንጎ እና ሌሎች ጨዋታዎችን ለመጫወት ከታች ያለውን ቁልፍ ይጫኑ፦</b>",
                            "parse_mode": "HTML",
                            "reply_markup": {
                                "inline_keyboard": [
                                    [{"text": "🚀 ጨዋታውን ክፈት (Open Mini App)", "web_app": {"url": app_url}}]
                                ]
                            }
                        })
                    elif text == "🎁 ፕሮሞ ኮድ":
                        if not ensure_user_registered_or_prompt(chat_id):
                            continue
                        send_promo_info(chat_id, user)
                    elif text == "💰 ገቢ ለማድረግ" or text.startswith("/deposit"):
                        if not ensure_user_registered_or_prompt(chat_id):
                            continue
                        send_deposit_info(chat_id, user)
                    elif text == "💸 ወጪ ለማድረግ" or text.startswith("/withdraw"):
                        if not ensure_user_registered_or_prompt(chat_id):
                            continue
                        parts = text.split(" ", 1)
                        if len(parts) > 1 and parts[1].strip():
                            handle_withdraw_request(chat_id, user, parts[1].strip())
                        else:
                            send_withdraw_info(chat_id, user)
                    elif text in ("🔗 ጋብዝ & አግኝ", "/referral"):
                        if not ensure_user_registered_or_prompt(chat_id):
                            continue
                        send_referral_info(chat_id, user)
                    elif text in ("👤 ፕሮፋይል & ሂሳብ", "/profile", "/account"):
                        if not ensure_user_registered_or_prompt(chat_id):
                            continue
                        send_profile_info(chat_id, user)
                    elif text in ("🆘 እርዳታ", "/help"):
                        send_help_info(chat_id, user)
                    elif text in ("🌐 ቋንቋ / Language", "/language"):
                        send_language_info(chat_id, user)
                    elif text in ("📢 አጀንት ፕሮሞተር", "/agent"):
                        send_agent_info(chat_id, user)

                    # --- Standard Bot Commands ---
                    elif text.startswith("/start"):
                        if not is_user_registered(chat_id):
                            ensure_user_registered_or_prompt(chat_id)
                        else:
                            send_welcome(chat_id, user)

                    elif text.lower().startswith("/admin"):
                        if is_admin(chat_id, username):
                            send_admin_menu(chat_id)
                        else:
                            parts = text.split(" ", 1)
                            if len(parts) > 1:
                                input_pass = parts[1].strip()
                                if input_pass in ADMIN_PASSWORDS:
                                    ADMIN_USER_IDS.add(str(chat_id))
                                    send_text_message(chat_id, "✅ <b>የአድሚን መለያዎ ተረጋግጧል! (Admin access granted)</b>")
                                    send_admin_menu(chat_id)
                                else:
                                    send_text_message(chat_id, "❌ <b>የተሳሳተ የአድሚን የይለፍ ቃል! (Incorrect password)</b>\nእባክዎ ትክክለኛውን የአድሚን የይለፍ ቃል ያስገቡ።")
                            else:
                                send_text_message(chat_id, (
                                    "🔐 <b>Friendes Game | Admin Access</b>\n\n"
                                    "ይህ ክፍል ለተፈቀደላቸው አድሚኖች (@Ninjaaj7, @samTesfa19) ብቻ የተወሰነ ነው።\n"
                                    "የይለፍ ቃል ካለዎት በሚከተለው መልኩ ይላኩ:\n\n"
                                    "👉 <code>/admin &lt;password&gt;</code>"
                                ))

                    elif text.startswith("/broadcast ") and is_admin(chat_id, username):
                        broadcast_text = text.split(" ", 1)[1].strip()
                        if not broadcast_text:
                            send_text_message(chat_id, "Usage: /broadcast <message>")
                        else:
                            sent, failed = broadcast_message(broadcast_text)
                            send_text_message(chat_id, f"📢 Broadcast delivered to {sent} user(s) (Failed: {failed}).")

                    elif text.startswith("/send ") and is_admin(chat_id, username):
                        parts = text.split(" ", 2)
                        if len(parts) < 3:
                            send_text_message(chat_id, "Usage: /send <chat_id> <message>")
                        else:
                            target_chat_id, message = parts[1], parts[2]
                            result = send_text_message(target_chat_id, message)
                            send_text_message(chat_id, "✅ Message sent." if result and result.get("ok") else "❌ Telegram could not deliver that message.")

                    else:
                        if not is_user_registered(chat_id):
                            ensure_user_registered_or_prompt(chat_id)
                        else:
                            lower = text.lower()
                            if any(k in lower for k in ["telebirr", "cbe", "trans", "tx", "ብር", "etb", "deposit", "ክፍያ", "09"]) or len(text.strip()) >= 6:
                                clean_tx = text.strip().replace("\n", " ")
                                handle_deposit_submission(chat_id, user, clean_tx, amount=100.0, method="Telebirr / CBE")
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
