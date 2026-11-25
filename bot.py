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
import threading
import http.client
import ssl
import concurrent.futures
import random
from datetime import datetime, timezone, timedelta

# Permanent Telegram File ID for inout_logo.png (Delivered instantly from Telegram edge RAM)
CACHED_LOGO_FILE_ID = "AgACAgQAAxkDAAIET2rbq2sGgbMD8e1JelhtRWVaYM3GAAJZDmsbtUokUvEw05b3lpqvAQADAgADeAADPQQ" 

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
ADMIN_USERNAMES = {"ninjaaj7", "samtesfa19", "friends_game_64", "habtambet64"}
if os.environ.get("TELEGRAM_ADMIN_USERNAMES"):
    for u in os.environ.get("TELEGRAM_ADMIN_USERNAMES", "").split(","):
        if u.strip():
            ADMIN_USERNAMES.add(u.strip().lstrip("@").lower())

ADMIN_PASSWORDS = {"7DoGpDwZ4zpIvotZm9p", "admin123", os.environ.get("ADMIN_PASSWORD", "").strip()} - {""}

REQUIRED_GROUP_USERNAME = os.environ.get("REQUIRED_GROUP_USERNAME", "Habtam_bet64").lstrip("@")
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

_tls = threading.local()

def _get_api_connection(timeout=25):
    conn = getattr(_tls, "api_conn", None)
    if conn is None:
        context = ssl.create_default_context()
        conn = http.client.HTTPSConnection("api.telegram.org", timeout=timeout, context=context)
        _tls.api_conn = conn
    return conn

def api_call(method, payload=None, retries=2):
    path = f"/bot{TOKEN}/{method}"
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {
        "Content-Type": "application/json",
        "Connection": "keep-alive"
    }
    if data is not None:
        headers["Content-Length"] = str(len(data))

    for attempt in range(retries + 1):
        try:
            conn = _get_api_connection(timeout=25)
            conn.request("POST" if payload is not None else "GET", path, body=data, headers=headers)
            resp = conn.getresponse()
            raw = resp.read()
            if resp.status == 200:
                return json.loads(raw.decode("utf-8"))
            else:
                try:
                    res_json = json.loads(raw.decode("utf-8"))
                    logging.warning(f"Telegram API response ({method}): HTTP {resp.status} - {res_json.get('description', '')}")
                    return res_json
                except Exception:
                    logging.warning(f"Telegram API error ({method}): HTTP {resp.status}")
                    return None
        except (http.client.RemoteDisconnected, BrokenPipeError, ConnectionResetError, http.client.CannotSendRequest, http.client.BadStatusLine, TimeoutError, OSError) as e:
            try:
                if hasattr(_tls, "api_conn") and _tls.api_conn:
                    _tls.api_conn.close()
            except Exception:
                pass
            _tls.api_conn = None
            if attempt >= retries:
                logging.error(f"API Error ({method}) after {attempt+1} attempts: {e}")
                return None
        except Exception as e:
            try:
                if hasattr(_tls, "api_conn") and _tls.api_conn:
                    _tls.api_conn.close()
            except Exception:
                pass
            _tls.api_conn = None
            logging.error(f"Unexpected API Error ({method}): {e}")
            return None

_polling_conn = None
_polling_conn_lock = threading.Lock()

def fetch_updates(offset, timeout=20):
    global _polling_conn
    path = f"/bot{TOKEN}/getUpdates"
    payload = {"offset": offset, "timeout": timeout}
    data = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json", "Connection": "keep-alive", "Content-Length": str(len(data))}
    with _polling_conn_lock:
        for attempt in range(2):
            try:
                if _polling_conn is None:
                    context = ssl.create_default_context()
                    _polling_conn = http.client.HTTPSConnection("api.telegram.org", timeout=timeout + 15, context=context)
                _polling_conn.request("POST", path, body=data, headers=headers)
                resp = _polling_conn.getresponse()
                raw = resp.read()
                if resp.status == 200:
                    return json.loads(raw.decode("utf-8"))
                else:
                    logging.warning(f"getUpdates returned HTTP {resp.status}")
                    return None
            except Exception as e:
                try:
                    if _polling_conn:
                        _polling_conn.close()
                except Exception:
                    pass
                _polling_conn = None
                if attempt == 1:
                    logging.error(f"getUpdates error: {e}")
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


# ---------------------------------------------------------
# Automated Server-Side Rain Dropper ("heg ena demboche")
# Drops Rain directly into live WebSocket channel for Aviator / Chicken Road
# ---------------------------------------------------------
AUTO_RAIN_STATE_FILE = Path(__file__).resolve().parent / "auto_rain_state.json"
PUB_SUB_URL = "https://ntfy.sh/friends_live_chat_master_v1"

def broadcast_live_rain(total_amount, players_count, each_amount, min_wager, wager_minutes):
    """Broadcasts a real Rain Drop payload directly to all connected players via WebSocket."""
    try:
        rain_id = f"rain_bot_{int(time.time()*1000)}_{random.randint(100, 999)}"
        # Format time in East Africa Time (UTC+3) for local Ethiopian time alignment
        now_eat = datetime.now(timezone(timedelta(hours=3)))
        now_str = now_eat.strftime("%H:%M:%S")
        payload = {
            "type": "rain_drop",
            "id": rain_id,
            "sender": "Habesha Bot 🤖",
            "isBot": True,
            "totalAmount": float(total_amount),
            "playersCount": int(players_count),
            "eachAmount": float(each_amount),
            "time": now_str,
            "minWager": float(min_wager),
            "wagerMinutes": int(wager_minutes),
            "wagerRuleText": f"Requirement: Wager {min_wager}+ ETB in last {wager_minutes} min",
            "createdAt": int(time.time() * 1000),
            "uid": "bot_system"
        }
        data_bytes = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            PUB_SUB_URL,
            data=data_bytes,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            ok = (resp.status == 200)
            logging.info(f"[AutoRain] Live Drop sent: {total_amount} ETB ({each_amount} ETB x {players_count} players, min wager {min_wager} ETB / {wager_minutes}m) -> HTTP {resp.status}")
            return ok
    except Exception as e:
        logging.error(f"[AutoRain] Error broadcasting live rain: {e}")
        return False

def _calc_next_random_time(tier):
    now = time.time()
    if tier == "tier10":
        # Bal 10: 2 times in 1 hour -> average 30 mins (1800s). Random jitter: 20 to 40 mins
        return now + random.uniform(1200, 2400)
    elif tier == "tier20":
        # Bal 20: 1 time in 1 hour -> average 60 mins (3600s). Random jitter: 45 to 75 mins
        return now + random.uniform(2700, 4500)
    elif tier == "tier100":
        # Bal 100: 1 time in 2 hours -> average 120 mins (7200s). Random jitter: 90 to 150 mins
        return now + random.uniform(5400, 9000)
    return now + 3600

def _load_auto_rain_state():
    try:
        if AUTO_RAIN_STATE_FILE.exists():
            with open(AUTO_RAIN_STATE_FILE, "r", encoding="utf-8") as f:
                st = json.load(f)
                if isinstance(st, dict) and "next_tier10" in st:
                    return st
    except Exception:
        pass
    now = time.time()
    st = {
        "next_tier10": now + random.uniform(30, 60),
        "next_tier20": now + random.uniform(150, 300),
        "next_tier100": now + random.uniform(500, 800)
    }
    _save_auto_rain_state(st)
    return st

def _save_auto_rain_state(state):
    try:
        with open(AUTO_RAIN_STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2)
    except Exception:
        pass

def _auto_rain_scheduler_worker():
    """Background worker daemon running on PM2 24/7, dropping rain at unpredictable intervals."""
    logging.info("[AutoRain] Scheduler daemon started.")
    time.sleep(5)  # initial brief warm-up
    while True:
        try:
            state = _load_auto_rain_state()
            now = time.time()
            changed = False

            # 1. Tier 10: 500 ETB distributed to 50 players (10 ETB each), 2 times per 1 hour
            # Rule: Wager 100 ETB in last 30 minutes
            if now >= state.get("next_tier10", 0):
                broadcast_live_rain(
                    total_amount=500.0,
                    players_count=50,
                    each_amount=10.0,
                    min_wager=100.0,
                    wager_minutes=30
                )
                state["next_tier10"] = _calc_next_random_time("tier10")
                changed = True

            # 2. Tier 20: 500 ETB distributed to 25 players (20 ETB each), 1 time per 1 hour
            # Rule: Wager 200 ETB in last 30 minutes
            if now >= state.get("next_tier20", 0):
                broadcast_live_rain(
                    total_amount=500.0,
                    players_count=25,
                    each_amount=20.0,
                    min_wager=200.0,
                    wager_minutes=30
                )
                state["next_tier20"] = _calc_next_random_time("tier20")
                changed = True

            # 3. Tier 100: 1000 ETB distributed to 10 players (100 ETB each), 1 time per 2 hours
            # Rule: Wager 500 ETB in last 10 minutes
            if now >= state.get("next_tier100", 0):
                broadcast_live_rain(
                    total_amount=1000.0,
                    players_count=10,
                    each_amount=100.0,
                    min_wager=500.0,
                    wager_minutes=10
                )
                state["next_tier100"] = _calc_next_random_time("tier100")
                changed = True

            if changed:
                _save_auto_rain_state(state)

            time.sleep(10)
        except Exception as e:
            logging.error(f"[AutoRain] Scheduler loop error: {e}")
            time.sleep(15)

KNOWN_USERS_FILE = Path(__file__).resolve().parent / "known_users.json"
WITHDRAWALS_FILE = Path(__file__).resolve().parent / "withdrawals.json"
DEPOSITS_FILE = Path(__file__).resolve().parent / "deposits.json"
AGENTS_FILE = Path(__file__).resolve().parent / "agents.json"
AGENT_TXS_FILE = Path(__file__).resolve().parent / "agent_transactions.json"

_USERS_CACHE = None
_USERS_CACHE_LOCK = threading.Lock()

def load_known_users():
    global _USERS_CACHE
    with _USERS_CACHE_LOCK:
        if _USERS_CACHE is not None:
            return dict(_USERS_CACHE)
        try:
            if KNOWN_USERS_FILE.exists():
                with open(KNOWN_USERS_FILE, "r", encoding="utf-8") as f:
                    _USERS_CACHE = json.load(f)
                    return dict(_USERS_CACHE)
        except Exception as e:
            logging.error(f"Error loading known users: {e}")
        _USERS_CACHE = {"8474256363": {"id": 8474256363, "first_name": "Admin", "username": "Ninjaaj7", "phone": "+251912345678", "registered": True, "updated": time.time()}}
        return dict(_USERS_CACHE)

def save_all_users(users):
    global _USERS_CACHE
    with _USERS_CACHE_LOCK:
        _USERS_CACHE = dict(users)
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
    user_record = dict(existing)
    
    bal_updated = existing.get("balance_updated")
    if not bal_updated:
        bal_updated = existing.get("updated") or time.time()

    user_record.update({
        "id": user_obj.get("id"),
        "first_name": user_obj.get("first_name", existing.get("first_name", "Player")),
        "last_name": user_obj.get("last_name", existing.get("last_name", "")),
        "username": user_obj.get("username", existing.get("username", "")),
        "phone": phone if phone else existing.get("phone", ""),
        "registered": bool(phone or existing.get("registered")),
        "balance": existing.get("balance", 0.0),
        "bonus_balance": existing.get("bonus_balance", 0.0),
        "balance_updated": bal_updated,
        "updated": bal_updated,
        "last_seen": time.time()
    })
    users[uid] = user_record
    save_all_users(users)
    return user_record

def get_referrer_display(referred_by, all_users=None):
    if not referred_by:
        return "ቀጥታ (Direct)"
    ref_str = str(referred_by).strip()
    if not all_users:
        all_users = load_known_users()
    ref_u = all_users.get(ref_str)
    if ref_u:
        uname = ref_u.get("username")
        fname = ref_u.get("first_name", f"Player {ref_str[-4:]}")
        tag = f"@{uname}" if uname else fname
        return f"{tag} (<code>{ref_str}</code>)"
    return f"<code>{ref_str}</code>"

def is_user_registered(chat_id):
    users = load_known_users()
    user = users.get(str(chat_id))
    return bool(user and user.get("phone"))

def get_user_webapp_url(chat_id, user=None):
    if not user:
        users = load_known_users()
        user = users.get(str(chat_id), {})
    real_bal = float(user.get("balance", 0.0) or 0.0)
    bonus_bal = float(user.get("bonus_balance", 0.0) or 0.0)
    phone = user.get("phone", "")
    full_name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() or "Player"
    username = user.get("username", "")
    clean_phone = urllib.parse.quote(phone)
    clean_name = urllib.parse.quote(full_name)
    clean_uname = urllib.parse.quote(username)
    ts = int(time.time())
    return f"{WEBAPP_URL}?phone={clean_phone}&uid={chat_id}&name={clean_name}&username={clean_uname}&bal={real_bal:.2f}&bonus={bonus_bal:.2f}&ts={ts}&v=5.0"

def get_main_reply_keyboard(chat_id, user=None):
    """
    Persistent Custom Gaming Keyboard matching Image 2:
    Row 1: [ Play Games 🎮 ] [ /start ]
    Row 2: [ Deposit 💰 ] [ Withdraw 💰 ]
    Row 3: [ Transfer ↔️ ] [ My Profile 👤 ]
    Row 4: [ Transactions 📜 ] [ Balance 💰 ]
    Row 5: [ Join Group ↗️ ] [ Contact Us ]
    Row 6: [ Refer & Earn 🎁 ]
    """
    app_url = get_user_webapp_url(chat_id, user)
    return {
        "keyboard": [
            [
                {"text": "Play Games 🎮", "web_app": {"url": app_url}},
                {"text": "/start"}
            ],
            [
                {"text": "Deposit 💰"},
                {"text": "Withdraw 💰"}
            ],
            [
                {"text": "Transfer ↔️"},
                {"text": "My Profile 👤"}
            ],
            [
                {"text": "Transactions 📜"},
                {"text": "Balance 💰"}
            ],
            [
                {"text": "Join Group ↗️"},
                {"text": "Contact Us"}
            ],
            [
                {"text": "Refer & Earn 🎁"}
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
    If not, enforce contact registration immediately.
    Returns True if user is fully registered with phone.
    """
    if is_user_registered(chat_id):
        return True

    request_phone_registration(chat_id)
    return False

def request_phone_registration(chat_id):
    """Prompt user to share their contact phone number for account creation."""
    text = (
        "👋 <b>Welcome to Friendes Game!</b>\n\n"
        "ለመመዝገብ እና የጨዋታ አካውንት ለመክፈት ከስር ያለውን <b>'📱 Share Phone Number'</b> የሚለውን ይጫኑ፦\n\n"
        "Please share your phone number to register and start playing:"
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
        "is_persistent": True
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
    msg1 = f"🎉 Welcome {display_user}! Registration complete. You can now play and win real cash!"
    api_call("sendMessage", {
        "chat_id": chat_id,
        "text": msg1,
        "parse_mode": "HTML"
    })

    # 2. Card with photo and welcome
    caption = (
        f"👋 Welcome {display_user}!\n"
        f"🎮 <b>ወደ ሀብታም ቤቲንግ (Habtam Bet) በደህና መጡ!</b>\n\n"
        f"👇 ከታች ያለውን <b>'Play Games 🎮'</b> በተን በመጫን ወደ ጨዋታው ይግቡና ያሸንፉ!\n\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"🛠 <b>እንደዚህ አይነት የካሲኖ ጨዋታዎችን እና የቤቲንግ ዌብሳይት ማሰራት ለምትፈልጉ (Casino & Betting Development):</b>\n"
        f"📞 Contact 1: <code>+251939292694</code>\n"
        f"📞 Contact 2: <code>+251972450776</code>\n"
        f"✈️ Telegram: <a href=\"https://t.me/HABTAMBET64\">@HABTAMBET64</a>\n"
        f"📢 Channel: https://t.me/Habtam_bet64"
    )
    photo_url = WEBAPP_URL.rstrip("/") + "/assets/inout_logo.png"
    main_kb = get_main_reply_keyboard(chat_id, user)
    app_url = get_user_webapp_url(chat_id, user)

    inline_kb = {
        "inline_keyboard": [
            [
                {
                    "text": "🎮 Play Games | አሁኑኑ ይጫወቱ",
                    "web_app": {"url": app_url}
                }
            ],
            [
                {"text": "Deposit 💰", "callback_data": "deposit"},
                {"text": "Withdraw 💰", "callback_data": "withdraw"}
            ]
        ]
    }

    global CACHED_LOGO_FILE_ID
    # Sync user's custom webapp URL in background thread (non-blocking)
    def _sync_reg_menu():
        try:
            api_call("setChatMenuButton", {
                "chat_id": chat_id,
                "menu_button": {
                    "type": "web_app",
                    "text": "🎮 Play Games",
                    "web_app": {"url": app_url}
                }
            })
        except Exception:
            pass
    threading.Thread(target=_sync_reg_menu, daemon=True).start()

    photo_target = CACHED_LOGO_FILE_ID or photo_url
    res = api_call("sendPhoto", {
        "chat_id": chat_id,
        "photo": photo_target,
        "caption": caption,
        "parse_mode": "HTML",
        "reply_markup": inline_kb
    })
    if not res or not res.get("ok"):
        res = api_call("sendPhoto", {
            "chat_id": chat_id,
            "photo": photo_url,
            "caption": caption,
            "parse_mode": "HTML",
            "reply_markup": inline_kb
        })
        if res and res.get("ok"):
            w_mid = res.get("result", {}).get("message_id")
            if w_mid:
                users_up = load_known_users()
                if str(chat_id) in users_up:
                    users_up[str(chat_id)]["welcome_msg_id"] = w_mid
                    save_all_users(users_up)
            photos = res.get("result", {}).get("photo", [])
            if photos:
                CACHED_LOGO_FILE_ID = photos[-1]["file_id"]
        else:
            api_call("sendMessage", {
                "chat_id": chat_id,
                "text": caption,
                "parse_mode": "HTML",
                "reply_markup": inline_kb
            })
    else:
        w_mid = res.get("result", {}).get("message_id")
        if w_mid:
            users_up = load_known_users()
            if str(chat_id) in users_up:
                users_up[str(chat_id)]["welcome_msg_id"] = w_mid
                save_all_users(users_up)

    # Also attach the bottom persistent reply keyboard
    api_call("sendMessage", {
        "chat_id": chat_id,
        "text": "👇 <i>Tap below to play games or manage your account:</i>",
        "parse_mode": "HTML",
        "reply_markup": main_kb
    })

def fetch_live_cloud_balance(chat_id, user):
    """Fetch the latest live gameplay balance from the local server or cloud relay."""
    try:
        last_dep = float(user.get("last_deposit_time") or 0)
        now = time.time()
        cur_bal = round(float(user.get("balance", 0.0)), 2)
        cur_bonus = round(float(user.get("bonus_balance", 0.0)), 2)
        # Protect very recent deposit approvals (within 8s) from in-flight race condition
        if now - last_dep < 8:
            return cur_bal

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "X-Telegram-User-Id": str(chat_id),
            "X-Telegram-User-Name": user.get("username", "") or "",
            "Accept": "application/json"
        }

        data = None
        for base_url in ["http://127.0.0.1:3005", "https://konjobetcom.et/bingo"]:
            try:
                req = urllib.request.Request(f"{base_url}/api/me?_t={int(now)}", headers=headers)
                timeout_sec = 1.5 if "127.0.0.1" in base_url else 3.5
                with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    if data and "balance" in data and isinstance(data["balance"], (int, float)):
                        break
            except Exception:
                continue

        if data and "balance" in data and isinstance(data["balance"], (int, float)):
            cloud_bal = round(float(data["balance"]), 2)
            cloud_bonus = round(float(data.get("bonus_balance", 0.0) or 0.0), 2)

            changed = False
            if abs(cloud_bal - cur_bal) >= 0.01:
                cur_bal = cloud_bal
                changed = True
            if abs(cloud_bonus - cur_bonus) >= 0.01:
                cur_bonus = cloud_bonus
                changed = True

            if changed:
                users_all = load_known_users()
                uid_str = str(chat_id)
                if uid_str in users_all:
                    users_all[uid_str]["balance"] = cur_bal
                    users_all[uid_str]["bonus_balance"] = cur_bonus
                    users_all[uid_str]["balance_updated"] = time.time()
                    save_all_users(users_all)
                user["balance"] = cur_bal
                user["bonus_balance"] = cur_bonus
            return cur_bal
    except Exception as e:
        logging.warning(f"[FetchBalance] Exception for {chat_id}: {e}")
    return float(user.get("balance", 0.0))

def push_balance_to_cloud(chat_id, new_balance, username="", bonus_balance=None):
    """Push a balance update to local / cloud relay so gameplay sessions see the correct balance."""
    try:
        if bonus_balance is None:
            try:
                u_data = load_known_users().get(str(chat_id), {})
                bonus_balance = float(u_data.get("bonus_balance", 0.0))
            except Exception:
                bonus_balance = 0.0

        payload = json.dumps({
            "user_id": str(chat_id),
            "username": username or "",
            "balance": round(float(new_balance), 2),
            "bonus_balance": round(float(bonus_balance), 2),
            "admin_authorized": True
        }).encode("utf-8")

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Content-Type": "application/json",
            "X-Telegram-User-Id": str(chat_id),
            "X-Telegram-User-Name": username or "",
            "Accept": "application/json"
        }

        for base_url in ["http://127.0.0.1:3005", "https://konjobetcom.et/bingo"]:
            try:
                req = urllib.request.Request(
                    f"{base_url}/api/admin/user/update",
                    data=payload,
                    headers=headers,
                    method="POST"
                )
                timeout_sec = 1.5 if "127.0.0.1" in base_url else 3.5
                with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
                    if resp.status == 200:
                        logging.info(f"[CloudPush] ({base_url}) user={chat_id} bal={new_balance:.2f} -> success")
                        return True
            except Exception:
                continue
    except Exception as e:
        logging.warning(f"[CloudPush] Failed for user={chat_id}: {e}")
        return False
    return False

def update_live_welcome_message(chat_id, user):
    """Refreshes the welcome message caption & button without confusing static balances."""
    username = user.get("username")
    display_user = f"@{username}" if username else user.get("first_name", "Player")
    app_url = get_user_webapp_url(chat_id, user)

    msg_id = user.get("welcome_msg_id")
    if msg_id:
        caption = (
            f"👋 Welcome {display_user}!\n"
            f"🎮 <b>ወደ ሀብታም ቤቲንግ (Habtam Bet) በደህና መጡ!</b>\n\n"
            f"👇 ከታች ያለውን <b>'Play Games 🎮'</b> በተን በመጫን ወደ ጨዋታው ይግቡና ያሸንፉ!\n\n"
            f"━━━━━━━━━━━━━━━━━━━━\n"
            f"🛠 <b>እንደዚህ አይነት የካሲኖ ጨዋታዎችን እና የቤቲንግ ዌብሳይት ማሰራት ለምትፈልጉ (Casino & Betting Development):</b>\n"
            f"📞 Contact 1: <code>+251939292694</code>\n"
            f"📞 Contact 2: <code>+251972450776</code>\n"
            f"✈️ Telegram: <a href=\"https://t.me/HABTAMBET64\">@HABTAMBET64</a>\n"
            f"📢 Channel: https://t.me/Habtam_bet64"
        )

        inline_kb = {
            "inline_keyboard": [
                [
                    {
                        "text": "🎮 Play Games | አሁኑኑ ይጫወቱ",
                        "web_app": {"url": app_url}
                    }
                ],
                [
                    {"text": "Deposit 💰", "callback_data": "deposit"},
                    {"text": "Withdraw 💰", "callback_data": "withdraw"}
                ]
            ]
        }

        try:
            api_call("editMessageCaption", {
                "chat_id": chat_id,
                "message_id": msg_id,
                "caption": caption,
                "parse_mode": "HTML",
                "reply_markup": inline_kb
            })
        except Exception as ex:
            logging.warning(f"Failed to edit welcome caption: {ex}")

    # Also update 'Balance 💰' message if user has one open in chat
    if not user.get("balance_msg_id"):
        try:
            fresh_users = load_known_users()
            u_f = fresh_users.get(str(chat_id))
            if u_f and u_f.get("balance_msg_id"):
                user["balance_msg_id"] = u_f["balance_msg_id"]
        except Exception:
            pass
    bal_mid = user.get("balance_msg_id")
    if bal_mid:
        bal_text = (
            f"💰 <b>Your Account Balance | የሂሳብ መጠን</b>\n\n"
            f"🆔 <b>Player ID:</b> <code>{chat_id}</code>\n"
            f"👤 <b>Player:</b> {display_user}\n\n"
            f"📌 <i>ትክክለኛውን እና የቀጥታ ሂሳብዎን (Live Balance) በጨዋታው ውስጥ በቀጥታ ይመልከቱ።</i>\n\n"
            f"👇 ከታች ያለውን <b>'Play Games 🎮'</b> በመጫን ሂሳብዎን ማየትና መጫወት ይችላሉ፦\n\n"
            f"• Tap <b>'Deposit 💰'</b> to add funds via Telebirr / Safaricom\n"
            f"• Tap <b>'Withdraw 💰'</b> to cash out Real Balance"
        )
        bal_kb = {
            "inline_keyboard": [
                [{"text": "🎮 Open Game & Check Balance | ሂሳብዎን ይመልከቱ", "web_app": {"url": app_url}}],
                [
                    {"text": "Deposit 💰", "callback_data": "deposit"},
                    {"text": "Withdraw 💰", "callback_data": "withdraw"}
                ]
            ]
        }
        try:
            api_call("editMessageText", {
                "chat_id": chat_id,
                "message_id": bal_mid,
                "text": bal_text,
                "parse_mode": "HTML",
                "reply_markup": bal_kb
            })
        except Exception:
            pass

def send_welcome(chat_id, user=None):
    if not user:
        users = load_known_users()
        user = users.get(str(chat_id), {})

    first_name = user.get("first_name", "Player")
    username = user.get("username")
    display_user = f"@{username}" if username else first_name
    main_kb = get_main_reply_keyboard(chat_id, user)
    app_url = get_user_webapp_url(chat_id, user)

    global CACHED_LOGO_FILE_ID
    # Sync user's custom webapp URL in background thread (non-blocking)
    def _sync_welcome_menu():
        try:
            api_call("setChatMenuButton", {
                "chat_id": chat_id,
                "menu_button": {
                    "type": "web_app",
                    "text": "🎮 Play Games",
                    "web_app": {"url": app_url}
                }
            })
        except Exception:
            pass
    threading.Thread(target=_sync_welcome_menu, daemon=True).start()

    caption = (
        f"👋 Welcome {display_user}!\n"
        f"🎮 <b>ወደ ሀብታም ቤቲንግ (Habtam Bet) በደህና መጡ!</b>\n\n"
        f"👇 ከታች ያለውን <b>'Play Games 🎮'</b> በተን በመጫን ወደ ጨዋታው ይግቡና ያሸንፉ!\n\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"🛠 <b>እንደዚህ አይነት የካሲኖ ጨዋታዎችን እና የቤቲንግ ዌብሳይት ማሰራት ለምትፈልጉ (Casino & Betting Development):</b>\n"
        f"📞 Contact 1: <code>+251939292694</code>\n"
        f"📞 Contact 2: <code>+251972450776</code>\n"
        f"✈️ Telegram: <a href=\"https://t.me/HABTAMBET64\">@HABTAMBET64</a>\n"
        f"📢 Channel: https://t.me/Habtam_bet64"
    )

    photo_url = WEBAPP_URL.rstrip("/") + "/assets/inout_logo.png"
    photo_target = CACHED_LOGO_FILE_ID or photo_url
    inline_kb = {
        "inline_keyboard": [
            [
                {
                    "text": "🎮 Play Games | አሁኑኑ ይጫወቱ",
                    "web_app": {"url": app_url}
                }
            ],
            [
                {"text": "Deposit 💰", "callback_data": "deposit"},
                {"text": "Withdraw 💰", "callback_data": "withdraw"}
            ]
        ]
    }

    photo_res = api_call("sendPhoto", {
        "chat_id": chat_id,
        "photo": photo_target,
        "caption": caption,
        "parse_mode": "HTML",
        "reply_markup": inline_kb
    })
    if not photo_res or not photo_res.get("ok"):
        photo_res = api_call("sendPhoto", {
            "chat_id": chat_id,
            "photo": photo_url,
            "caption": caption,
            "parse_mode": "HTML",
            "reply_markup": inline_kb
        })
        if photo_res and photo_res.get("ok"):
            w_mid = photo_res.get("result", {}).get("message_id")
            if w_mid:
                users_up = load_known_users()
                uid_str = str(chat_id)
                if uid_str in users_up:
                    users_up[uid_str]["welcome_msg_id"] = w_mid
                    save_all_users(users_up)
                user["welcome_msg_id"] = w_mid
            photos = photo_res.get("result", {}).get("photo", [])
            if photos:
                CACHED_LOGO_FILE_ID = photos[-1]["file_id"]
        else:
            api_call("sendMessage", {
                "chat_id": chat_id,
                "text": caption,
                "parse_mode": "HTML",
                "reply_markup": inline_kb
            })
    else:
        w_mid = photo_res.get("result", {}).get("message_id")
        if w_mid:
            users_up = load_known_users()
            uid_str = str(chat_id)
            if uid_str in users_up:
                users_up[uid_str]["welcome_msg_id"] = w_mid
                save_all_users(users_up)
            user["welcome_msg_id"] = w_mid

    # Also attach the bottom persistent reply keyboard
    api_call("sendMessage", {
        "chat_id": chat_id,
        "text": "👇 <i>Tap below to play games or manage your account:</i>",
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
        f"• <b>Telebirr:</b> <code>0928233032</code> (Abirham)\n"
        f"• <b>Safaricom (M-Pesa):</b> <code>+251717482251</code> (Abirham)\n\n"
        f"📌 <b>መመሪያ፦</b>\n"
        f"1. በተመዘገበው ስልክዎ (<code>{phone}</code>) ወደ ቴሌብር ወይም ሳፋሪኮም ይላኩ።\n"
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

MIN_WITHDRAWAL_AMOUNT = 200.0

def save_withdrawals(withdrawals):
    try:
        with open(WITHDRAWALS_FILE, "w", encoding="utf-8") as f:
            json.dump(withdrawals, f, indent=2, ensure_ascii=False)
    except Exception as e:
        logging.error(f"Error saving withdrawals: {e}")

def send_withdraw_info(chat_id, user):
    phone = user.get("phone", "")
    full_name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() or "Player"
    app_url = get_user_webapp_url(chat_id, user)
    real_bal = fetch_live_cloud_balance(chat_id, user)
    users = load_known_users()
    if str(chat_id) in users:
        user = users[str(chat_id)]
        real_bal = float(user.get("balance", real_bal))

    if real_bal < MIN_WITHDRAWAL_AMOUNT:
        text = (
            f"⚠️ <b>በቂ ገንዘብ የለዎትም!</b>\n\n"
            f"ዝቅተኛው ወጪ ማድረግ የሚችሉት መጠን <b>{MIN_WITHDRAWAL_AMOUNT:.0f} ETB</b> ነው።\n"
            f"💵 የእርስዎ Real Balance: <b>{real_bal:.2f} ETB</b>\n\n"
            f"ገንዘብ ለማውጣት ቢያንስ {MIN_WITHDRAWAL_AMOUNT:.0f} ብር ያስፈልግዎታል። እባክዎ ጨዋታዎችን በመጫወት ያሸንፉ!"
        )
        inline_keyboard = {
            "inline_keyboard": [
                [{"text": "🎮 ጨዋታዎችን ይጫወቱ (Play Games)", "web_app": {"url": app_url}}],
                [{"text": "💬 Contact Support (@HABTAMBET64)", "url": "https://t.me/HABTAMBET64"}]
            ]
        }
        return api_call("sendMessage", {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "HTML",
            "reply_markup": inline_keyboard
        })

    # User has >= 200 ETB: save awaiting state
    users = load_known_users()
    uid_str = str(chat_id)
    if uid_str in users:
        users[uid_str]["awaiting_action"] = "withdraw"
        save_all_users(users)

    text = (
        f"💸 <b>ወጪ ለማድረግ (Withdraw Funds)</b>\n\n"
        f"👤 <b>የተጠቃሚ ስም:</b> {full_name}\n"
        f"💵 <b>የእርስዎ Real Balance:</b> <b>{real_bal:.2f} ETB</b>\n"
        f"📱 <b>ገንዘብ የሚላክበት ስልክ (Telebirr):</b> <code>{phone}</code>\n"
        f"🆔 <b>የተጫዋች ID:</b> <code>{chat_id}</code>\n\n"
        f"📌 <b>መመሪያ፦</b>\n"
        f"ማውጣት የሚፈልጉትን የብር መጠን ይላኩ።\n"
        f"ምሳሌ፦ <code>/withdraw 200</code> ወይም በቀጥታ ቁጥሩን <code>200</code> ብለው ይላኩ።\n\n"
        f"<i>(ዝቅተኛው ወጪ ማድረግ የሚችሉት መጠን {MIN_WITHDRAWAL_AMOUNT:.0f} ETB ነው)</i>"
    )

    quick_row = []
    if real_bal >= 200:
        quick_row.append({"text": "200 ETB", "callback_data": "quick_wd:200"})
    if real_bal >= 500:
        quick_row.append({"text": "500 ETB", "callback_data": "quick_wd:500"})
    if real_bal >= 1000:
        quick_row.append({"text": "1,000 ETB", "callback_data": "quick_wd:1000"})

    inline_rows = []
    if quick_row:
        inline_rows.append(quick_row)
    if real_bal > 200 and int(real_bal) not in [200, 500, 1000]:
        inline_rows.append([{"text": f"ሙሉውን ወጪ አድርግ ({int(real_bal)} ETB)", "callback_data": f"quick_wd:{int(real_bal)}"}])
    inline_rows.append([{"text": "💬 Contact Support (@HABTAMBET64)", "url": "https://t.me/HABTAMBET64"}])

    return api_call("sendMessage", {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "reply_markup": {"inline_keyboard": inline_rows}
    })

def handle_withdraw_request(chat_id, user, amount_str):
    try:
        amt = float(str(amount_str).replace("ETB", "").replace("ብር", "").strip())
    except (ValueError, TypeError):
        return api_call("sendMessage", {
            "chat_id": chat_id,
            "text": f"⚠️ እባክዎ ትክክለኛ የብር መጠን ይጥቀሱ።\nምሳሌ፦ <code>/withdraw 200</code> ወይም <code>200</code>",
            "parse_mode": "HTML",
            "reply_markup": get_main_reply_keyboard(chat_id, user)
        })

    real_bal = fetch_live_cloud_balance(chat_id, user)
    users = load_known_users()
    if str(chat_id) in users:
        user = users[str(chat_id)]
        real_bal = float(user.get("balance", real_bal))

    if real_bal < MIN_WITHDRAWAL_AMOUNT:
        return api_call("sendMessage", {
            "chat_id": chat_id,
            "text": (
                f"⚠️ <b>በቂ ገንዘብ የለዎትም!</b>\n\n"
                f"ዝቅተኛው ወጪ ማድረግ የሚችሉት መጠን <b>{MIN_WITHDRAWAL_AMOUNT:.0f} ETB</b> ነው።\n"
                f"💵 የእርስዎ Real Balance: <b>{real_bal:.2f} ETB</b>\n\n"
                f"እባክዎ ጨዋታዎችን በመጫወት ያሸንፉ!"
            ),
            "parse_mode": "HTML",
            "reply_markup": get_main_reply_keyboard(chat_id, user)
        })

    if amt < MIN_WITHDRAWAL_AMOUNT:
        return api_call("sendMessage", {
            "chat_id": chat_id,
            "text": f"⚠️ <b>ዝቅተኛው ወጪ ማድረግ የሚችሉት መጠን {MIN_WITHDRAWAL_AMOUNT:.0f} ብር ነው!</b>\n\nእባክዎ {MIN_WITHDRAWAL_AMOUNT:.0f} ETB ወይም ከዚያ በላይ ይጥቀሱ።\nምሳሌ፦ <code>/withdraw 200</code> ወይም በቀጥታ <code>200</code>",
            "parse_mode": "HTML",
            "reply_markup": get_main_reply_keyboard(chat_id, user)
        })

    if amt > real_bal:
        return api_call("sendMessage", {
            "chat_id": chat_id,
            "text": (
                f"⚠️ <b>በቂ ገንዘብ የለዎትም!</b>\n\n"
                f"የጠየቁት መጠን: <b>{amt:.2f} ETB</b>\n"
                f"💵 የእርስዎ Real Balance: <b>{real_bal:.2f} ETB</b>\n\n"
                f"እባክዎ በሂሳብዎ ውስጥ ካለው መጠን እኩል ወይም ያነሰ ይጥቀሱ (ዝቅተኛው {MIN_WITHDRAWAL_AMOUNT:.0f} ETB)።"
            ),
            "parse_mode": "HTML",
            "reply_markup": get_main_reply_keyboard(chat_id, user)
        })

    phone = user.get("phone", "")
    full_name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() or "Player"
    now_str = time.strftime("%Y-%m-%d %H:%M:%S")

    # Deduct balance immediately & reset awaiting status
    users = load_known_users()
    uid_str = str(chat_id)
    new_bal = round(real_bal - amt, 2)
    if uid_str in users:
        users[uid_str]["balance"] = new_bal
        users[uid_str]["balance_updated"] = time.time()
        users[uid_str]["updated"] = time.time()
        users[uid_str].pop("awaiting_action", None)
        save_all_users(users)
    user["balance"] = new_bal
    user.pop("awaiting_action", None)

    # Push deducted balance to cloud relay so sync worker doesn't restore the old value
    push_balance_to_cloud(chat_id, new_bal, user.get("username", ""))
    update_live_welcome_message(chat_id, user)
    try:
        api_call("setChatMenuButton", {
            "chat_id": chat_id,
            "menu_button": {
                "type": "web_app",
                "text": "🎮 Play Games",
                "web_app": {"url": get_user_webapp_url(chat_id, user)}
            }
        })
    except Exception:
        pass

    # Save to withdrawals.json
    withdrawals = load_withdrawals()
    req_id = f"WD-{int(time.time())}"
    wd_record = {
        "id": req_id,
        "chat_id": int(chat_id),
        "name": full_name,
        "username": user.get("username", ""),
        "phone": phone,
        "amount": amt,
        "status": "pending",
        "deducted": True,
        "created_at": now_str
    }
    withdrawals.append(wd_record)
    save_withdrawals(withdrawals)
    threading.Thread(target=sync_bot_ledger_to_cloud, daemon=True).start()

    ref_raw = user.get("referred_by")
    ref_disp = get_referrer_display(ref_raw)

    # 1. Notify Player with pending message, 10 minutes notice & Contact Support button
    player_text = (
        f"✅ <b>የወጪ ጥያቄዎ በተሳካ ሁኔታ ተመዝግቧል!</b>\n\n"
        f"🆔 <b>የጥያቄ ቁጥር:</b> <code>{req_id}</code>\n"
        f"💰 <b>የተጠየቀው መጠን:</b> <b>{amt:.2f} ETB</b>\n"
        f"📱 <b>የሚላክበት ስልክ:</b> <code>{phone}</code>\n"
        f"⏳ <b>ሁኔታ:</b> በመጠባበቅ ላይ (Pending)\n\n"
        f"⚡ <b>ብር በ 10 ደቂቃ ውስጥ ወደ ቴሌብር አካውንትዎ ገቢ ይደረግልዎታል!</b>\n\n"
        f"💵 <b>የቀሪ ሂሳብዎ:</b> <b>{new_bal:.2f} ETB</b>\n\n"
        f"ማንኛውም ጥያቄ ካለዎት ድጋፍ ሰጪያችንን ማነጋገር ይችላሉ፦"
    )
    inline_kb = {
        "inline_keyboard": [
            [{"text": "💬 Contact Support (@HABTAMBET64)", "url": "https://t.me/HABTAMBET64"}]
        ]
    }
    api_call("sendMessage", {
        "chat_id": chat_id,
        "text": player_text,
        "parse_mode": "HTML",
        "reply_markup": inline_kb
    })

    # 2. Notify Admins with interactive Approve / Reject buttons
    admin_text = (
        f"🚨 <b>አዲስ የወጪ ጥያቄ (New Withdrawal Request)!</b>\n\n"
        f"🆔 <b>Ref:</b> <code>{req_id}</code>\n"
        f"👤 <b>ተጠቃሚ:</b> {full_name} (@{user.get('username', '')})\n"
        f"📱 <b>ስልክ (Telebirr):</b> <code>{phone}</code>\n"
        f"🆔 <b>Player ID:</b> <code>{chat_id}</code>\n"
        f"🔗 <b>መገኛ (Referred By):</b> {ref_disp}\n"
        f"💰 <b>መጠን:</b> <b>{amt:.2f} ETB</b>\n"
        f"⏰ <b>ሰዓት:</b> {now_str}\n\n"
        f"ብር ወደ <code>{phone}</code> በቴሌብር ከላኩ በኋላ <b>'Approve'</b> ይጫኑ፦"
    )
    admin_kb = {
        "inline_keyboard": [
            [
                {"text": f"✅ Approve ({amt:.0f} ETB)", "callback_data": f"with_approve:{chat_id}:{amt}:{req_id}"},
                {"text": "❌ Reject (Refund)", "callback_data": f"with_reject:{chat_id}:{amt}:{req_id}"}
            ]
        ]
    }
    for admin_id in ADMIN_USER_IDS:
        api_call("sendMessage", {
            "chat_id": admin_id,
            "text": admin_text,
            "parse_mode": "HTML",
            "reply_markup": admin_kb
        })

    return True

def approve_withdrawal(req_id, admin_id, explicit_chat_id=None, explicit_amount=None, message_text=""):
    withdrawals = load_withdrawals()
    target = None
    for w in withdrawals:
        if w.get("id") == req_id:
            target = w
            break

    if not target:
        target = {
            "id": req_id,
            "status": "pending",
            "amount": float(explicit_amount) if explicit_amount else MIN_WITHDRAWAL_AMOUNT,
            "chat_id": int(explicit_chat_id) if explicit_chat_id else None,
            "deducted": False
        }
        withdrawals.append(target)

    if target.get("status") == "approved":
        return False, "ቀድሞ ጸድቋል (Already approved)"

    chat_id = target.get("chat_id") or explicit_chat_id
    amt = float(target.get("amount") or explicit_amount or MIN_WITHDRAWAL_AMOUNT)
    phone = target.get("phone", "")
    already_deducted = target.get("deducted", False)

    target["status"] = "approved"
    target["approved_by"] = admin_id
    target["approved_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
    target["deducted"] = True
    save_withdrawals(withdrawals)
    threading.Thread(target=sync_bot_ledger_to_cloud, daemon=True).start()

    # Deduct balance if not previously deducted (e.g. from Mini App) & sync to cloud
    new_bal = 0.0
    if chat_id:
        users = load_known_users()
        uid_str = str(chat_id)
        if uid_str in users:
            u = users[uid_str]
            if not already_deducted:
                cur_bal = float(u.get("balance", 0.0))
                new_bal = round(max(0.0, cur_bal - amt), 2)
                users[uid_str]["balance"] = new_bal
                users[uid_str]["balance_updated"] = time.time()
                users[uid_str]["updated"] = time.time()
                save_all_users(users)
                u["balance"] = new_bal
            else:
                new_bal = float(u.get("balance", 0.0))

            push_balance_to_cloud(chat_id, new_bal, u.get("username", ""))
            update_live_welcome_message(chat_id, u)
            try:
                api_call("setChatMenuButton", {
                    "chat_id": chat_id,
                    "menu_button": {
                        "type": "web_app",
                        "text": "🎮 Play Games",
                        "web_app": {"url": get_user_webapp_url(chat_id, u)}
                    }
                })
            except Exception:
                pass

        if not phone:
            phone = users.get(uid_str, {}).get("phone", "")

        api_call("sendMessage", {
            "chat_id": chat_id,
            "text": (
                f"✅ <b>ገንዘብዎ ገቢ ሆኗል! (Withdrawal Completed)</b>\n\n"
                f"የጠየቁት <b>{amt:.2f} ETB</b> ወደ ስልክ ቁጥርዎ <code>{phone}</code> በቴሌብር በተሳካ ሁኔታ ገቢ ተደርጓል!\n\n"
                f"🧾 <b>Ref ID:</b> <code>{req_id}</code>\n"
                f"💵 <b>የቀሪ ሂሳብዎ:</b> <b>{new_bal:.2f} ETB</b>\n\n"
                f"🎮 Friendes Gameን ስለመረጡ እናመሰግናለን!"
            ),
            "parse_mode": "HTML",
            "reply_markup": get_main_reply_keyboard(chat_id, users.get(uid_str, {}))
        })

    return True, f"Approved! -{amt:.2f} ETB (Balance: {new_bal:.2f} ETB)"

def reject_withdrawal(req_id, admin_id, explicit_chat_id=None, explicit_amount=None, message_text=""):
    withdrawals = load_withdrawals()
    target = None
    for w in withdrawals:
        if w.get("id") == req_id:
            target = w
            break

    if target and target.get("status") in ("approved", "rejected"):
        return False, f"ጥያቄው ቀድሞ {target.get('status')} ሆኗል!"

    chat_id = (target.get("chat_id") if target else None) or explicit_chat_id
    amt = float((target.get("amount") if target else None) or explicit_amount or MIN_WITHDRAWAL_AMOUNT)
    was_deducted = target.get("deducted", True) if target else True

    if target:
        target["status"] = "rejected"
        target["rejected_by"] = admin_id
        target["rejected_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
        save_withdrawals(withdrawals)
        threading.Thread(target=sync_bot_ledger_to_cloud, daemon=True).start()

    # Refund amount back to user balance if it was deducted
    new_bal = 0.0
    if chat_id and was_deducted:
        users = load_known_users()
        uid_str = str(chat_id)
        if uid_str in users:
            new_bal = round(users[uid_str].get("balance", 0.0) + amt, 2)
            users[uid_str]["balance"] = new_bal
            users[uid_str]["balance_updated"] = time.time()
            users[uid_str]["updated"] = time.time()
            save_all_users(users)
            push_balance_to_cloud(chat_id, new_bal, users[uid_str].get("username", ""))
            update_live_welcome_message(chat_id, users[uid_str])
            try:
                api_call("setChatMenuButton", {
                    "chat_id": chat_id,
                    "menu_button": {
                        "type": "web_app",
                        "text": "🎮 Play Games",
                        "web_app": {"url": get_user_webapp_url(chat_id, users[uid_str])}
                    }
                })
            except Exception:
                pass

        api_call("sendMessage", {
            "chat_id": chat_id,
            "text": (
                f"❌ <b>የወጪ ጥያቄዎ ተሰርዟል!</b>\n\n"
                f"የጠየቁት <b>{amt:.2f} ETB</b> ወደ ጌም ሂሳብዎ (Real Balance) ተመልሷል (Refunded)።\n"
                f"💵 የአሁኑ Real Balance: <b>{new_bal:.2f} ETB</b>\n\n"
                f"ለበለጠ መረጃ ድጋፍ ሰጪያችንን ማነጋገር ይችላሉ፦"
            ),
            "parse_mode": "HTML",
            "reply_markup": {
                "inline_keyboard": [
                    [{"text": "💬 Contact Support (@HABTAMBET64)", "url": "https://t.me/HABTAMBET64"}]
                ]
            }
        })

    return True, f"Rejected & Refunded {amt:.2f} ETB to user {chat_id}"

def load_deposits():
    if DEPOSITS_FILE.exists():
        try:
            with open(DEPOSITS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []

def load_withdrawals():
    if WITHDRAWALS_FILE.exists():
        try:
            with open(WITHDRAWALS_FILE, "r", encoding="utf-8") as f:
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

def sync_bot_ledger_to_cloud():
    """
    Syncs deposits, withdrawals, and user referral mapping to cloud
    so Admin Control Center (admin.js) has real-time player acquisition
    and transaction ledger data.
    """
    try:
        users = load_known_users()
        deposits = load_deposits()
        withdrawals = load_withdrawals()

        players_summary = {}
        for uid_str, u in users.items():
            ref_raw = u.get("referred_by")
            ref_disp = get_referrer_display(ref_raw, users) if ref_raw else "ቀጥታ (Direct)"
            players_summary[str(uid_str)] = {
                "id": str(uid_str),
                "first_name": u.get("first_name", f"Player {str(uid_str)[-4:]}"),
                "username": u.get("username", ""),
                "phone": u.get("phone", ""),
                "balance": float(u.get("balance", 0.0)),
                "bonus_balance": float(u.get("bonus_balance", 0.0)),
                "referred_by": str(ref_raw) if ref_raw else "",
                "referrer_name": ref_disp,
                "created_at": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(float(u.get("updated") or u.get("balance_updated") or time.time())))
            }

        normalized_txs = []
        for d in deposits:
            uid = str(d.get("user_id") or d.get("chat_id") or "")
            u_info = players_summary.get(uid, {})
            d_id = str(d.get("id") or d.get("tx_id") or "")
            ref_display = u_info.get("referrer_name", "ቀጥታ (Direct)")
            status = d.get("status", "pending")
            normalized_txs.append({
                "id": f"DEP-{d_id[-6:]}" if len(d_id) >= 6 else f"DEP-{d_id}",
                "txId": d.get("tx_id") or d_id,
                "player": d.get("name") or u_info.get("first_name", "Player"),
                "username": d.get("username") or u_info.get("username", ""),
                "playerId": f"TG-{uid}" if uid else "Local",
                "user_id": uid,
                "phone": d.get("phone") or u_info.get("phone", ""),
                "type": "deposit",
                "method": d.get("method") or "Telebirr",
                "amount": float(d.get("amount", 0.0)),
                "status": status,
                "time": d.get("date") or d.get("created_at") or "Recent",
                "referred_by": u_info.get("referred_by", ""),
                "referrer_name": ref_display
            })

        for w in withdrawals:
            uid = str(w.get("user_id") or w.get("chat_id") or "")
            u_info = players_summary.get(uid, {})
            w_id = str(w.get("id") or "")
            ref_display = u_info.get("referrer_name", "ቀጥታ (Direct)")
            status = w.get("status", "pending")
            normalized_txs.append({
                "id": f"WTH-{w_id[-6:]}" if len(w_id) >= 6 else f"WTH-{w_id}",
                "txId": w.get("account_number") or w_id,
                "player": w.get("name") or u_info.get("first_name", "Player"),
                "username": w.get("username") or u_info.get("username", ""),
                "playerId": f"TG-{uid}" if uid else "Local",
                "user_id": uid,
                "phone": w.get("phone") or u_info.get("phone", ""),
                "type": "withdraw",
                "method": w.get("method") or "Telebirr",
                "amount": float(w.get("amount", 0.0)),
                "status": status,
                "time": w.get("date") or w.get("created_at") or "Recent",
                "referred_by": u_info.get("referred_by", ""),
                "referrer_name": ref_display
            })

        normalized_txs.reverse()

        payload = json.dumps({
            "friends_bot_transactions": normalized_txs,
            "friends_bot_players": players_summary
        }).encode("utf-8")

        for b_url in ["http://127.0.0.1:3005", "https://konjobetcom.et/bingo"]:
            try:
                req = urllib.request.Request(
                    f"{b_url}/api/admin/settings/update",
                    data=payload,
                    headers={
                        "User-Agent": "Mozilla/5.0",
                        "Content-Type": "application/json"
                    },
                    method="POST"
                )
                with urllib.request.urlopen(req, timeout=3.0) as resp:
                    if resp.status == 200:
                        break
            except Exception:
                pass
    except Exception as ex:
        logging.warning(f"[SyncBotLedger] Error syncing ledger to cloud: {ex}")

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
    threading.Thread(target=sync_bot_ledger_to_cloud, daemon=True).start()

    ref_raw = user.get("referred_by")
    ref_disp = get_referrer_display(ref_raw)

    kb = {
        "inline_keyboard": [
            [
                {"text": "✅ አጽድቅ (Approve)", "callback_data": f"dep_approve:{chat_id}:{int(amount)}:{req_id}"},
                {"text": "❌ ሰርዝ (Reject)", "callback_data": f"dep_reject:{chat_id}:{int(amount)}:{req_id}"}
            ]
        ]
    }
    admin_text = (
        f"🚨 <b>አዲስ የገቢ ጥያቄ (New Deposit Request)!</b>\n\n"
        f"🆔 <b>Ref:</b> <code>{req_id}</code>\n"
        f"🧾 <b>Tx ID:</b> <code>{tx_id}</code>\n"
        f"👤 <b>ተጫዋች:</b> {full_name} (@{username})\n"
        f"🆔 <b>User ID:</b> <code>{chat_id}</code>\n"
        f"📱 <b>ስልክ:</b> <code>{phone}</code>\n"
        f"🔗 <b>መገኛ (Referred By):</b> {ref_disp}\n"
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

    # Resolve chat_id: prioritize explicit callback data if provided
    if explicit_chat_id and int(explicit_chat_id) > 0:
        target["chat_id"] = int(explicit_chat_id)
    elif not target.get("chat_id"):
        if message_text:
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
                            # EXCLUDE company receiver and admin phone numbers so deposits aren't credited to admin!
                            admin_phones = [
                                "0928233032", "+251928233032", "251928233032", "928233032",
                                "0717482251", "+251717482251", "251717482251", "717482251"
                            ]
                            all_users = load_known_users()
                            for uid_k, udata in all_users.items():
                                try:
                                    if int(uid_k) in ADMIN_USER_IDS:
                                        p = udata.get("phone", "").replace(" ", "")
                                        if p:
                                            admin_phones.append(p)
                                except Exception:
                                    pass
                            clean_ph = ph.replace(" ", "").replace("+", "")
                            is_admin_phone = any(ap.replace("+", "") in clean_ph or clean_ph in ap.replace("+", "") for ap in admin_phones)
                            if not is_admin_phone:
                                for uid_k, udata in all_users.items():
                                    try:
                                        if int(uid_k) not in ADMIN_USER_IDS:
                                            if udata.get("phone", "").replace(" ", "") == ph or udata.get("phone", "").endswith(ph[-9:]):
                                                target["chat_id"] = int(uid_k)
                                                break
                                    except Exception:
                                        pass

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
    threading.Thread(target=sync_bot_ledger_to_cloud, daemon=True).start()

    chat_id = target.get("chat_id")
    amt = float(target.get("amount", 100.0))
    if not chat_id:
        return False, "⚠️ የተጠቃሚው አካውንት (Chat ID) አልተገኘም! እባክዎ ተጠቃሚው ቦቱን /start ብሎ እንዲመዘገብ ያድርጉ።"

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

    # Query live cloud balance in case user has played and won on cloud
    current_known_bal = float(users[uid_str].get("balance", 0.0))
    cloud_bal = None
    try:
        req = urllib.request.Request(
            "http://127.0.0.1:3005/api/me",
            headers={
                "User-Agent": "Mozilla/5.0",
                "X-Telegram-User-Id": str(chat_id),
                "X-Telegram-User-Name": users[uid_str].get("username", "") or ""
            }
        )
        with urllib.request.urlopen(req, timeout=1.5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data and "balance" in data and isinstance(data["balance"], (int, float)):
                cloud_bal = round(float(data["balance"]), 2)
    except Exception:
        try:
            req = urllib.request.Request(
                "https://konjobetcom.et/bingo/api/me",
                headers={
                    "User-Agent": "Mozilla/5.0",
                    "X-Telegram-User-Id": str(chat_id),
                    "X-Telegram-User-Name": users[uid_str].get("username", "") or ""
                }
            )
            with urllib.request.urlopen(req, timeout=2.5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if data and "balance" in data and isinstance(data["balance"], (int, float)):
                    cloud_bal = round(float(data["balance"]), 2)
        except Exception:
            pass

    base_bal = current_known_bal
    if cloud_bal is not None and cloud_bal > base_bal:
        base_bal = cloud_bal

    new_balance = round(base_bal + amt, 2)
    users[uid_str]["balance"] = new_balance
    users[uid_str]["last_deposit_time"] = time.time()
    users[uid_str]["balance_updated"] = time.time()
    users[uid_str]["updated"] = time.time()
    save_all_users(users)

    # Push new balance to cloud relay immediately so the sync worker doesn't overwrite it
    push_balance_to_cloud(chat_id, new_balance, users[uid_str].get("username", ""))
    update_live_welcome_message(chat_id, users[uid_str])

    play_url = get_user_webapp_url(chat_id, users[uid_str])
    api_call("setChatMenuButton", {
        "chat_id": chat_id,
        "menu_button": {
            "type": "web_app",
            "text": "🎮 Play Games",
            "web_app": {"url": play_url}
        }
    })
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
    threading.Thread(target=sync_bot_ledger_to_cloud, daemon=True).start()

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

    text = (
        f"👤 <b>የተጫዋች ፕሮፋይል (Player Profile)</b>\n\n"
        f"• <b>ስም:</b> {full_name}\n"
        f"• <b>የተጠቃሚ ስም:</b> {display_user}\n"
        f"• <b>ስልክ ቁጥር:</b> <code>{phone or 'Not Registered'}</code>\n"
        f"• <b>የተጫዋች መለያ (ID):</b> <code>{chat_id}</code>\n"
        f"• 🎮 <b>የአካውንት ሂሳብ (Balance):</b> በጨዋታው ውስጥ በቀጥታ ይመልከቱ\n"
        f"• <b>የአካውንት ሁኔታ:</b> የተረጋገጠ ተጫዋች ✓\n\n"
        f"ገቢ እና ወጪ ለማድረግ ወይም ለመጫወት ከታች ያሉትን ቁልፎች ይጠቀሙ።"
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
        f"ጓደኞችዎን ይጋብዙ እና በእያንዳንዱ በሚያስመዘግቡት ሰው የ <b>+3 ETB</b> ጉርሻ ያግኙ!\n\n"
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
    text = (
        "📞 <b>Contact Us & 24/7 Support | የደንበኞች አገልግሎት</b>\n\n"
        "Need assistance with deposits, withdrawals, or gaming? We are available 24/7!\n\n"
        "👤 <b>Customer Support:</b> <a href=\"https://t.me/HABTAMBET64\">@HABTAMBET64</a>\n"
        "🤖 <b>Official Bot:</b> <a href=\"https://t.me/Friends64_BOT\">@Friends64_BOT</a>\n"
        "📱 <b>Phone 1:</b> <code>+251939292694</code>\n"
        "📱 <b>Phone 2:</b> <code>+251972450776</code>\n"
        "📢 <b>Official Channel:</b> https://t.me/Habtam_bet64"
    )
    inline_kb = {
        "inline_keyboard": [
            [{"text": "💬 Customer Support (@HABTAMBET64)", "url": "https://t.me/HABTAMBET64"}],
            [{"text": "📢 Official Channel (Habtam Bet)", "url": "https://t.me/Habtam_bet64"}],
            [{"text": "🤖 Official Bot (@Friends64_BOT)", "url": "https://t.me/Friends64_BOT"}]
        ]
    }
    return api_call("sendMessage", {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "reply_markup": inline_kb
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

def send_balance_info(chat_id, user):
    fresh_bal = fetch_live_cloud_balance(chat_id, user)
    users = load_known_users()
    if str(chat_id) in users:
        user = users[str(chat_id)]
    app_url = get_user_webapp_url(chat_id, user)
    username = user.get("username")
    display_user = f"@{username}" if username else user.get("first_name", "Player")
    text = (
        f"💰 <b>Your Account Balance | የሂሳብ መጠን</b>\n\n"
        f"🆔 <b>Player ID:</b> <code>{chat_id}</code>\n"
        f"👤 <b>Player:</b> {display_user}\n\n"
        f"📌 <i>ትክክለኛውን እና የቀጥታ ሂሳብዎን (Live Balance) በጨዋታው ውስጥ ይመልከቱ።</i>\n\n"
        f"👇 ከታች ያለውን <b>'Play Games 🎮'</b> በመጫን ሂሳብዎን ማየትና መጫወት ይችላሉ፦\n\n"
        f"• Tap <b>'Deposit 💰'</b> to add funds via Telebirr / Safaricom\n"
        f"• Tap <b>'Withdraw 💰'</b> to cash out Real Balance"
    )
    inline_kb = {
        "inline_keyboard": [
            [{"text": "🎮 Open Game & Check Balance | ሂሳብዎን ይመልከቱ", "web_app": {"url": app_url}}],
            [
                {"text": "Deposit 💰", "callback_data": "deposit"},
                {"text": "Withdraw 💰", "callback_data": "withdraw"}
            ]
        ]
    }
    res = api_call("sendMessage", {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "reply_markup": inline_kb
    })
    if res and res.get("ok"):
        b_mid = res.get("result", {}).get("message_id")
        if b_mid:
            users_up = load_known_users()
            uid_str = str(chat_id)
            if uid_str in users_up:
                users_up[uid_str]["balance_msg_id"] = b_mid
                save_all_users(users_up)
            user["balance_msg_id"] = b_mid
    return res

def send_transactions_info(chat_id, user):
    deposits = load_deposits()
    withdrawals = load_withdrawals()
    uid = str(chat_id)

    user_deps = [d for d in deposits if str(d.get("chat_id")) == uid]
    user_withs = [w for w in withdrawals if str(w.get("chat_id")) == uid]

    lines = ["📜 <b>Recent Transactions | የቅርብ ጊዜ ግብይቶች</b>\n"]
    if not user_deps and not user_withs:
        lines.append("<i>No transactions recorded yet.</i>\n\nTap <b>'Deposit 💰'</b> to make your first deposit!")
    else:
        if user_deps:
            lines.append("<b>📥 Deposits:</b>")
            for d in user_deps[-4:]:
                st = d.get("status", "pending")
                icon = "✅" if st == "approved" else ("❌" if st == "rejected" else "⏳")
                amt = float(d.get("amount", 0.0))
                time_str = d.get("time", "")
                lines.append(f"{icon} +{amt:.2f} ETB ({st.upper()}) - <i>{time_str}</i>")
            lines.append("")

        if user_withs:
            lines.append("<b>📤 Withdrawals:</b>")
            for w in user_withs[-4:]:
                st = w.get("status", "pending")
                icon = "✅" if st == "approved" else ("❌" if st == "rejected" else "⏳")
                amt = float(w.get("amount", 0.0))
                time_str = w.get("created_at", "")
                lines.append(f"{icon} -{amt:.2f} ETB ({st.upper()}) - <i>{time_str}</i>")

    main_kb = get_main_reply_keyboard(chat_id, user)
    return api_call("sendMessage", {
        "chat_id": chat_id,
        "text": "\n".join(lines),
        "parse_mode": "HTML",
        "reply_markup": main_kb
    })

def send_transfer_info(chat_id, user):
    bal = float(user.get("balance", 0.0))
    main_kb = get_main_reply_keyboard(chat_id, user)
    text = (
        f"↔️ <b>Fund Transfer | የሂሳብ ማስተላለፊያ</b>\n\n"
        f"💵 Available Balance: <b>{bal:.2f} ETB</b>\n\n"
        f"Transfer balance directly to another player!\n\n"
        f"👉 <b>Usage:</b>\n"
        f"<code>/transfer &lt;User_ID or Phone&gt; &lt;Amount&gt;</code>\n\n"
        f"<b>Example:</b>\n"
        f"<code>/transfer 123456789 100</code>\n"
        f"<code>/transfer 0912345678 150</code>\n\n"
        f"<i>Minimum transfer is 10 ETB. Funds are credited instantly with 0 fee.</i>"
    )
    return api_call("sendMessage", {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "reply_markup": main_kb
    })

def handle_transfer(chat_id, user, target_str, amount_str):
    main_kb = get_main_reply_keyboard(chat_id, user)
    try:
        amt = float(amount_str)
        if amt < 10:
            return api_call("sendMessage", {
                "chat_id": chat_id,
                "text": "⚠️ Minimum transfer amount is <b>10 ETB</b>.",
                "parse_mode": "HTML",
                "reply_markup": main_kb
            })
    except ValueError:
        return api_call("sendMessage", {
            "chat_id": chat_id,
            "text": "⚠️ Invalid amount. Example: <code>/transfer 123456789 100</code>",
            "parse_mode": "HTML",
            "reply_markup": main_kb
        })

    sender_bal = float(user.get("balance", 0.0))
    if sender_bal < amt:
        return api_call("sendMessage", {
            "chat_id": chat_id,
            "text": f"⚠️ Insufficient balance! Your balance is <b>{sender_bal:.2f} ETB</b>.",
            "parse_mode": "HTML",
            "reply_markup": main_kb
        })

    users = load_known_users()
    target_clean = target_str.strip().lstrip("@")
    recipient_uid = None
    recipient_user = None

    for uid, u in users.items():
        if uid == target_clean:
            recipient_uid = uid
            recipient_user = u
            break
        if u.get("phone") and target_clean in u.get("phone"):
            recipient_uid = uid
            recipient_user = u
            break
        if u.get("username") and u.get("username").lower() == target_clean.lower():
            recipient_uid = uid
            recipient_user = u
            break

    if not recipient_user or recipient_uid == str(chat_id):
        return api_call("sendMessage", {
            "chat_id": chat_id,
            "text": f"❌ Recipient <code>{target_str}</code> not found or cannot transfer to yourself.\nMake sure they have registered in @Friends64_BOT.",
            "parse_mode": "HTML",
            "reply_markup": main_kb
        })

    # Execute transfer
    users[str(chat_id)]["balance"] = round(sender_bal - amt, 2)
    users[str(chat_id)]["balance_updated"] = time.time()
    users[str(chat_id)]["updated"] = time.time()
    rec_bal = float(recipient_user.get("balance", 0.0))
    users[recipient_uid]["balance"] = round(rec_bal + amt, 2)
    users[recipient_uid]["balance_updated"] = time.time()
    users[recipient_uid]["updated"] = time.time()
    save_all_users(users)

    # Notify sender
    new_sender_bal = users[str(chat_id)]["balance"]
    rec_name = recipient_user.get("first_name", "Player")
    api_call("sendMessage", {
        "chat_id": chat_id,
        "text": f"✅ <b>Transfer Successful!</b>\n\nSent <b>{amt:.2f} ETB</b> to <b>{rec_name}</b> (<code>{recipient_uid}</code>).\nYour new balance: <b>{new_sender_bal:.2f} ETB</b>",
        "parse_mode": "HTML",
        "reply_markup": get_main_reply_keyboard(chat_id, users[str(chat_id)])
    })

    # Notify recipient
    sender_name = user.get("first_name", "A player")
    api_call("sendMessage", {
        "chat_id": int(recipient_uid),
        "text": f"🎁 <b>You Received Funds!</b>\n\n<b>{sender_name}</b> transferred <b>+{amt:.2f} ETB</b> to your account.\nYour new balance: <b>{users[recipient_uid]['balance']:.2f} ETB</b>",
        "parse_mode": "HTML",
        "reply_markup": get_main_reply_keyboard(int(recipient_uid), users[recipient_uid])
    })

def send_join_group_info(chat_id, user):
    main_kb = get_main_reply_keyboard(chat_id, user)
    text = (
        f"📢 <b>Join Our Official Community!</b>\n\n"
        f"Join our official Telegram community group <b>@{REQUIRED_GROUP_USERNAME}</b> to get:\n"
        f"• Daily exclusive promo codes 🎁\n"
        f"• Big winner payout proofs 🏆\n"
        f"• Game strategies and tips 💡\n"
        f"• 24/7 community discussion and support!\n\n"
        f"👉 Tap the button below to join:"
    )
    inline_kb = {
        "inline_keyboard": [
            [{"text": f"🚀 Join @{REQUIRED_GROUP_USERNAME} ↗️", "url": REQUIRED_GROUP_URL}]
        ]
    }
    return api_call("sendMessage", {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "reply_markup": inline_kb
    })

def send_contact_us_info(chat_id, user):
    main_kb = get_main_reply_keyboard(chat_id, user)
    text = (
        "📞 <b>Contact Us & 24/7 Support | የደንበኞች አገልግሎት</b>\n\n"
        "Need assistance with deposits, withdrawals, or gaming? We are available 24/7!\n\n"
        "👤 <b>Customer Support:</b> <a href=\"https://t.me/HABTAMBET64\">@HABTAMBET64</a>\n"
        "🤖 <b>Official Bot:</b> <a href=\"https://t.me/Friends64_BOT\">@Friends64_BOT</a>\n"
        "📱 <b>Phone 1:</b> <code>+251939292694</code>\n"
        "📱 <b>Phone 2:</b> <code>+251972450776</code>\n"
        "📢 <b>Official Channel:</b> https://t.me/Habtam_bet64"
    )
    inline_kb = {
        "inline_keyboard": [
            [{"text": "💬 Customer Support (@HABTAMBET64)", "url": "https://t.me/HABTAMBET64"}],
            [{"text": "📢 Official Channel (Habtam Bet)", "url": "https://t.me/Habtam_bet64"}],
            [{"text": "🤖 Official Bot (@Friends64_BOT)", "url": "https://t.me/Friends64_BOT"}]
        ]
    }
    return api_call("sendMessage", {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "reply_markup": inline_kb
    })

def handle_admin_player_lookup(admin_chat_id, query):
    q = query.strip().lstrip("@").lower()
    users = load_known_users()
    matched_uid = None
    matched_user = None

    if q in users:
        matched_uid = q
        matched_user = users[q]
    else:
        for uid, u in users.items():
            u_name = (u.get("username") or "").lower()
            u_phone = (u.get("phone") or "").replace("+251", "0").replace(" ", "")
            clean_q = q.replace("+251", "0").replace(" ", "")
            if u_name == q or (clean_q and clean_q in u_phone):
                matched_uid = uid
                matched_user = u
                break

    if not matched_user:
        send_text_message(admin_chat_id, f"❌ ተጫዋች አልተገኘም (Player not found): <code>{query}</code>")
        return

    first_name = matched_user.get("first_name", "Player")
    last_name = matched_user.get("last_name", "")
    full_name = f"{first_name} {last_name}".strip()
    u_name = matched_user.get("username", "")
    phone = matched_user.get("phone", "አልተመዘገበም")
    bal = float(matched_user.get("balance", 0.0))
    bonus = float(matched_user.get("bonus_balance", 0.0))

    ref_raw = matched_user.get("referred_by")
    ref_display = get_referrer_display(ref_raw, users)

    referred_count = sum(1 for u in users.values() if str(u.get("referred_by")) == str(matched_uid))

    deposits = load_deposits()
    withdrawals = load_withdrawals()
    p_deps = [d for d in deposits if str(d.get("user_id") or d.get("chat_id")) == str(matched_uid)]
    p_withs = [w for w in withdrawals if str(w.get("user_id") or w.get("chat_id")) == str(matched_uid)]

    total_dep_amt = sum(float(d.get("amount", 0.0)) for d in p_deps if d.get("status") in ("completed", "approved"))
    total_with_amt = sum(float(w.get("amount", 0.0)) for w in p_withs if w.get("status") in ("completed", "approved"))

    msg = (
        f"👤 <b>የተጫዋች መረጃ (Player Profile)</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"🆔 <b>Player ID:</b> <code>{matched_uid}</code>\n"
        f"👤 <b>ስም:</b> {full_name} (@{u_name if u_name else 'None'})\n"
        f"📱 <b>ስልክ:</b> <code>{phone}</code>\n"
        f"💰 <b>Real Balance:</b> <b>{bal:.2f} ETB</b>\n"
        f"🎁 <b>Bonus Balance:</b> <b>{bonus:.2f} ETB</b>\n\n"
        f"🔗 <b>መገኛ (Referred By):</b> {ref_display}\n"
        f"👥 <b>የጋበዟቸው ተጫዋቾች:</b> <b>{referred_count}</b>\n\n"
        f"📊 <b>የግብይት ታሪክ (Transactions Summary):</b>\n"
        f"• የገቢ ጥያቄዎች: {len(p_deps)} (ድምር: {total_dep_amt:.2f} ETB)\n"
        f"• የወጪ ጥያቄዎች: {len(p_withs)} (ድምር: {total_with_amt:.2f} ETB)\n"
    )

    recent_txs = []
    for d in p_deps[-3:]:
        recent_txs.append(f"📥 Deposit: {float(d.get('amount', 0)):.2f} ETB ({d.get('status', 'pending')}) - {d.get('date', d.get('created_at', ''))}")
    for w in p_withs[-3:]:
        recent_txs.append(f"📤 Withdrawal: {float(w.get('amount', 0)):.2f} ETB ({w.get('status', 'pending')}) - {w.get('date', w.get('created_at', ''))}")

    if recent_txs:
        msg += "\n🕒 <b>የቅርብ ጊዜ እንቅስቃሴዎች:</b>\n" + "\n".join(f"• {tx}" for tx in recent_txs)

    send_text_message(admin_chat_id, msg)

def handle_admin_tx_list(admin_chat_id):
    users = load_known_users()
    deposits = load_deposits()
    withdrawals = load_withdrawals()

    all_tx = []
    for d in deposits:
        uid = str(d.get("user_id") or d.get("chat_id") or "")
        u = users.get(uid, {})
        ref = get_referrer_display(u.get("referred_by"), users)
        all_tx.append({
            "type": "📥 Deposit",
            "id": d.get("tx_id") or d.get("id"),
            "user": d.get("name") or u.get("first_name", "Player"),
            "uid": uid,
            "ref": ref,
            "amt": float(d.get("amount", 0.0)),
            "status": d.get("status", "pending"),
            "time": d.get("date") or d.get("created_at") or "Recent"
        })
    for w in withdrawals:
        uid = str(w.get("user_id") or w.get("chat_id") or "")
        u = users.get(uid, {})
        ref = get_referrer_display(u.get("referred_by"), users)
        all_tx.append({
            "type": "📤 Withdraw",
            "id": w.get("id"),
            "user": w.get("name") or u.get("first_name", "Player"),
            "uid": uid,
            "ref": ref,
            "amt": float(w.get("amount", 0.0)),
            "status": w.get("status", "pending"),
            "time": w.get("date") or w.get("created_at") or "Recent"
        })

    all_tx.reverse()
    latest_8 = all_tx[:8]

    if not latest_8:
        send_text_message(admin_chat_id, "ℹ️ ምንም ግብይት አልተገኘም (No transactions).")
        return

    msg = "📊 <b>የቅርብ ጊዜ ግብይቶች (Latest Transactions & Referrals)</b>\n━━━━━━━━━━━━━━━━━━━━\n\n"
    for t in latest_8:
        msg += (
            f"{t['type']} <b>{t['amt']:.2f} ETB</b> ({t['status']})\n"
            f"👤 {t['user']} (<code>{t['uid']}</code>)\n"
            f"🔗 መገኛ: {t['ref']}\n"
            f"🧾 Ref: <code>{t['id']}</code> • {t['time']}\n\n"
        )
    send_text_message(admin_chat_id, msg)

# ==============================================================================
# AGENT MANAGEMENT & DASHBOARD ENGINE
# ==============================================================================

def load_agents():
    if AGENTS_FILE.exists():
        try:
            with open(AGENTS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_agents(agents_data):
    try:
        with open(AGENTS_FILE, "w", encoding="utf-8") as f:
            json.dump(agents_data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        logging.error(f"Error saving agents: {e}")

def load_agent_transactions():
    if AGENT_TXS_FILE.exists():
        try:
            with open(AGENT_TXS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []

def save_agent_transactions(tx_data):
    try:
        with open(AGENT_TXS_FILE, "w", encoding="utf-8") as f:
            json.dump(tx_data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        logging.error(f"Error saving agent transactions: {e}")

def is_agent(chat_id):
    agents = load_agents()
    ag = agents.get(str(chat_id))
    return bool(ag and ag.get("status", "active") == "active")

def get_agent_record(chat_id):
    agents = load_agents()
    return agents.get(str(chat_id))

def normalize_agent_phone(phone_str):
    if not phone_str:
        return ""
    p = str(phone_str).strip().replace(" ", "").replace("-", "")
    if p.startswith("+251"):
        p = "0" + p[4:]
    elif p.startswith("251"):
        p = "0" + p[3:]
    return p

def find_player_by_query(query_str):
    if not query_str:
        return None, None
    q = str(query_str).strip()
    q_norm = normalize_agent_phone(q)
    users = load_known_users()
    
    # 1. Direct ID match
    if q in users:
        return q, users[q]
        
    # 2. Match by phone or username
    for uid, udata in users.items():
        u_phone = normalize_agent_phone(udata.get("phone", ""))
        if q_norm and u_phone and (u_phone == q_norm or q_norm in u_phone):
            return uid, udata
        u_name = (udata.get("username") or "").lower().lstrip("@")
        clean_q = q.lower().lstrip("@")
        if clean_q and u_name and u_name == clean_q:
            return uid, udata
            
    return None, None

def execute_agent_deposit(agent_id, player_uid, amount, agent_name=""):
    agents = load_agents()
    agent = agents.get(str(agent_id))
    if not agent or agent.get("status") != "active":
        return False, "ወኪሉ አልተገኘም ወይም ንቁ አይደለም!"
    
    ag_bal = float(agent.get("balance", 0.0))
    if ag_bal < amount:
        return False, f"የወኪል ካፒታል በቂ አይደለም! ያለዎት ቀሪ: {ag_bal:.2f} ETB"
    
    users = load_known_users()
    player = users.get(str(player_uid))
    if not player:
        return False, "ተጫዋቹ አልተገኘም!"
    
    # Atomic transaction
    agent["balance"] = round(ag_bal - amount, 2)
    save_agents(agents)
    
    p_bal = float(player.get("balance", 0.0))
    new_p_bal = round(p_bal + amount, 2)
    player["balance"] = new_p_bal
    player["updated"] = time.time()
    player["balance_updated"] = time.time()
    save_all_users(users)
    
    push_balance_to_cloud(player_uid, new_p_bal, player.get("username", ""))
    update_live_welcome_message(player_uid, player)
    
    # Record transaction
    txs = load_agent_transactions()
    tx_id = f"AGD-{int(time.time())}-{random.randint(1000, 9999)}"
    tx_entry = {
        "id": tx_id,
        "type": "deposit",
        "agent_id": str(agent_id),
        "agent_name": agent.get("name", agent_name or "Agent"),
        "player_id": str(player_uid),
        "player_phone": player.get("phone", ""),
        "player_name": f"{player.get('first_name', '')} {player.get('last_name', '')}".strip() or player.get("username", "Player"),
        "amount": amount,
        "agent_balance_after": agent["balance"],
        "player_balance_after": new_p_bal,
        "timestamp": time.time(),
        "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "status": "completed"
    }
    txs.insert(0, tx_entry)
    save_agent_transactions(txs)
    
    # Notify player instantly via Telegram
    try:
        api_call("sendMessage", {
            "chat_id": int(player_uid),
            "text": (
                f"✅ <b>ገንዘብ በወኪል ገቢ ተደርጓል (Agent Deposit)!</b>\n\n"
                f"💰 <b>የተጨመረው መጠን:</b> <b>+{amount:.2f} ETB</b>\n"
                f"💵 <b>አዲሱ Real Balance:</b> <b>{new_p_bal:.2f} ETB</b>\n"
                f"🏢 <b>ወኪል:</b> {agent.get('name', 'Official Agent')}\n"
                f"🔖 <b>መለያ (Ref):</b> <code>{tx_id}</code>\n\n"
                f"መልካም እድል! አሁኑኑ ይጫወቱ! 🎮"
            ),
            "parse_mode": "HTML",
            "reply_markup": {
                "inline_keyboard": [
                    [{"text": f"🎮 Play Games ({new_p_bal:.2f} ETB)", "web_app": {"url": get_user_webapp_url(player_uid, player)}}]
                ]
            }
        })
    except Exception as ex:
        logging.warning(f"Failed to alert player {player_uid} of agent deposit: {ex}")
        
    return True, tx_entry

def execute_agent_withdraw(agent_id, player_uid, amount, agent_name=""):
    agents = load_agents()
    agent = agents.get(str(agent_id))
    if not agent or agent.get("status") != "active":
        return False, "ወኪሉ አልተገኘም ወይም ንቁ አይደለም!"
    
    users = load_known_users()
    player = users.get(str(player_uid))
    if not player:
        return False, "ተጫዋቹ አልተገኘም!"
    
    p_bal = float(player.get("balance", 0.0))
    if p_bal < amount:
        return False, f"የተጫዋቹ Real Balance በቂ አይደለም! ያለቸው ሂሳብ: {p_bal:.2f} ETB"
    
    # Deduct from player, credit agent (agent gives cash to player)
    new_p_bal = round(p_bal - amount, 2)
    player["balance"] = new_p_bal
    player["updated"] = time.time()
    player["balance_updated"] = time.time()
    save_all_users(users)
    
    agent["balance"] = round(float(agent.get("balance", 0.0)) + amount, 2)
    save_agents(agents)
    
    push_balance_to_cloud(player_uid, new_p_bal, player.get("username", ""))
    update_live_welcome_message(player_uid, player)
    
    # Record transaction
    txs = load_agent_transactions()
    tx_id = f"AGW-{int(time.time())}-{random.randint(1000, 9999)}"
    tx_entry = {
        "id": tx_id,
        "type": "withdraw",
        "agent_id": str(agent_id),
        "agent_name": agent.get("name", agent_name or "Agent"),
        "player_id": str(player_uid),
        "player_phone": player.get("phone", ""),
        "player_name": f"{player.get('first_name', '')} {player.get('last_name', '')}".strip() or player.get("username", "Player"),
        "amount": amount,
        "agent_balance_after": agent["balance"],
        "player_balance_after": new_p_bal,
        "timestamp": time.time(),
        "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "status": "completed"
    }
    txs.insert(0, tx_entry)
    save_agent_transactions(txs)
    
    # Notify player instantly via Telegram
    try:
        api_call("sendMessage", {
            "chat_id": int(player_uid),
            "text": (
                f"💸 <b>ገንዘብ በወኪል ወጪ ተደርጓል (Agent Payout)!</b>\n\n"
                f"🔻 <b>የወጣው መጠን:</b> <b>-{amount:.2f} ETB</b>\n"
                f"💵 <b>ቀሪ Real Balance:</b> <b>{new_p_bal:.2f} ETB</b>\n"
                f"🏢 <b>ወኪል:</b> {agent.get('name', 'Official Agent')}\n"
                f"🔖 <b>መለያ (Ref):</b> <code>{tx_id}</code>\n\n"
                f"ጥሬ ገንዘብዎን ከወኪሉ መቀበልዎን ያረጋግጡ!"
            ),
            "parse_mode": "HTML"
        })
    except Exception as ex:
        logging.warning(f"Failed to alert player {player_uid} of agent withdraw: {ex}")
        
    return True, tx_entry

def send_agent_dashboard(chat_id, user=None):
    agent = get_agent_record(chat_id)
    if not agent or agent.get("status") != "active":
        if is_admin(chat_id, (user or {}).get("username", "")):
            agents = load_agents()
            if str(chat_id) not in agents:
                agents[str(chat_id)] = {
                    "id": str(chat_id),
                    "name": "Super Admin Agent",
                    "phone": (user or {}).get("phone", "+251717482251"),
                    "balance": 10000.0,
                    "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                    "status": "active"
                }
                save_agents(agents)
            agent = agents[str(chat_id)]
        else:
            return api_call("sendMessage", {
                "chat_id": chat_id,
                "text": (
                    "⚠️ <b>ይህ ገጽ ለተፈቀደላቸው ወኪሎች (Agents) ብቻ የተወሰነ ነው!</b>\n\n"
                    "የ Friendes Game ይፋዊ ወኪል በመሆን በካፒታል ገቢ እና ወጪ ማስተናገድ ከፈለጉ አድሚንን ያነጋግሩ፦\n"
                    "👉 @HABTAMBET64"
                ),
                "parse_mode": "HTML"
            })
            
    ag_bal = float(agent.get("balance", 0.0))
    ag_name = agent.get("name", "Habtam Bet Agent")
    ag_phone = agent.get("phone", "N/A")
    
    today_str = time.strftime("%Y-%m-%d")
    txs = load_agent_transactions()
    today_deps = sum(t["amount"] for t in txs if t.get("agent_id") == str(chat_id) and t.get("type") == "deposit" and t.get("created_at", "").startswith(today_str))
    today_wds = sum(t["amount"] for t in txs if t.get("agent_id") == str(chat_id) and t.get("type") == "withdraw" and t.get("created_at", "").startswith(today_str))
    
    agent_app_url = f"{WEBAPP_URL.rstrip('/')}/agent/index.html?agent_id={chat_id}&v=1.0"
    
    text = (
        f"💼 <b>የወኪል ዳሽቦርድ | Agent Dashboard</b>\n\n"
        f"👤 <b>ወኪል:</b> <b>{ag_name}</b>\n"
        f"📱 <b>ስልክ:</b> <code>{ag_phone}</code>\n"
        f"🆔 <b>Agent ID:</b> <code>{chat_id}</code>\n\n"
        f"💰 <b>የስራ ካፒታል (Agent Balance):</b> <b>{ag_bal:.2f} ETB</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"📊 <b>የዛሬ ግብይት (Today):</b>\n"
        f"• የተደረገ ገቢ (Deposits): <b>+{today_deps:.2f} ETB</b>\n"
        f"• የተከፈለ ወጪ (Withdrawals): <b>-{today_wds:.2f} ETB</b>\n\n"
        f"🔍 <b>ተጫዋች ለመፈለግ:</b> የተጫዋቹን <b>ስልክ ቁጥር (ምሳሌ 0912345678)</b> ወይም <b>Telegram ID</b> በቀጥታ በዚህ ቻት ይላኩ!"
    )
    
    kb = {
        "inline_keyboard": [
            [
                {
                    "text": "🚀 Open Agent WebApp (ዳሽቦርድ ክፈት)",
                    "web_app": {"url": agent_app_url}
                }
            ],
            [
                {
                    "text": "📜 የግብይት ታሪክ (Recent Txs)",
                    "callback_data": "agent_view_txs"
                },
                {
                    "text": "🔄 Refresh Balance",
                    "callback_data": "agent_refresh_bal"
                }
            ]
        ]
    }
    
    return api_call("sendMessage", {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "reply_markup": kb
    })

def send_agent_player_card(agent_chat_id, player_uid, player_data):
    p_bal = fetch_live_cloud_balance(player_uid, player_data)
    users = load_known_users()
    if str(player_uid) in users:
        player_data = users[str(player_uid)]
        p_bal = float(player_data.get("balance", p_bal))
    p_name = f"{player_data.get('first_name', '')} {player_data.get('last_name', '')}".strip() or player_data.get("username", "Player")
    p_phone = player_data.get("phone", "N/A")
    p_bonus = float(player_data.get("bonus_balance", 0.0))
    
    agent = get_agent_record(agent_chat_id)
    ag_bal = float(agent.get("balance", 0.0)) if agent else 0.0
    
    text = (
        f"👤 <b>ተጫዋች ተገኝቷል | Player Found</b>\n\n"
        f"• <b>ስም:</b> <b>{p_name}</b>\n"
        f"• 📱 <b>ስልክ:</b> <code>{p_phone}</code>\n"
        f"• 🆔 <b>Player ID:</b> <code>{player_uid}</code>\n"
        f"• 💵 <b>Real Balance:</b> <b>{p_bal:.2f} ETB</b>\n"
        f"• 🎁 <b>Bonus Balance:</b> {p_bonus:.2f} ETB\n\n"
        f"💼 <i>የእርስዎ የካፒታል መጠን፦ {ag_bal:.2f} ETB</i>\n\n"
        f"ምን ማድረግ ይፈልጋሉ?"
    )
    
    kb = {
        "inline_keyboard": [
            [
                {"text": "🟢 Deposit (ገቢ አድርግ)", "callback_data": f"ag_mode:dep:{player_uid}"},
                {"text": "🔴 Withdraw (ወጪ ክፈል)", "callback_data": f"ag_mode:wd:{player_uid}"}
            ],
            [
                {"text": "💼 Back to Dashboard", "callback_data": "agent_refresh_bal"}
            ]
        ]
    }
    
    return api_call("sendMessage", {
        "chat_id": agent_chat_id,
        "text": text,
        "parse_mode": "HTML",
        "reply_markup": kb
    })

def send_agent_amount_selector(agent_chat_id, player_uid, mode):
    users = load_known_users()
    player = users.get(str(player_uid), {})
    p_bal = fetch_live_cloud_balance(player_uid, player)
    users = load_known_users()
    if str(player_uid) in users:
        player = users[str(player_uid)]
        p_bal = float(player.get("balance", p_bal))
    p_name = player.get("first_name", "Player")
    
    agent = get_agent_record(agent_chat_id)
    ag_bal = float(agent.get("balance", 0.0)) if agent else 0.0
    
    mode_text = "🟢 Deposit (ገቢ ማድረጊያ)" if mode == "dep" else "🔴 Withdraw (ወጪ መክፈያ)"
    
    text = (
        f"{mode_text}\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"👤 <b>ተጫዋች:</b> {p_name} (ID: <code>{player_uid}</code>)\n"
        f"💵 <b>የተጫዋች ባላንስ:</b> <b>{p_bal:.2f} ETB</b>\n"
        f"💼 <b>የእርስዎ ካፒታል:</b> <b>{ag_bal:.2f} ETB</b>\n\n"
        f"መጠኑን ይምረጡ ወይም ሌላ መጠን ለመጻፍ <b>'✏️ ሌላ መጠን'</b> ይጫኑ:"
    )
    
    amounts = [50, 100, 200, 500, 1000, 2000]
    kb_rows = []
    for i in range(0, len(amounts), 3):
        row = []
        for amt in amounts[i:i+3]:
            row.append({
                "text": f"{amt} ETB",
                "callback_data": f"ag_exec:{mode}:{player_uid}:{amt}"
            })
        kb_rows.append(row)
        
    kb_rows.append([
        {"text": "✏️ ሌላ መጠን ጻፍ (Custom)", "callback_data": f"ag_prompt:{mode}:{player_uid}"},
        {"text": "🔙 ተመለስ", "callback_data": "agent_refresh_bal"}
    ])
    
    return api_call("sendMessage", {
        "chat_id": agent_chat_id,
        "text": text,
        "parse_mode": "HTML",
        "reply_markup": {"inline_keyboard": kb_rows}
    })

def send_admin_menu(chat_id):
    admin_web_url = f"{ADMIN_URL}?auth=admin"
    admin_text = (
        "🛡️ <b>Friendes Game | Admin Control Center</b>\n\n"
        "Welcome to the Operator Dashboard. From here you can manage:\n"
        "• 🎮 <b>Games & Margins</b> - Set house edge & toggle games online/paused\n"
        "• ♙ <b>Players Directory</b> - Monitor player balances, referral sources & export CSV\n"
        "• ✈️ <b>Bot Messages</b> - Queue Telegram announcements & broadcasts\n"
        "• ▤ <b>Financial Records</b> - Inspect Telebirr, CBE & game transactions\n"
        "• 📊 <b>/tx</b> - View recent transactions with player referral origins\n"
        "• 👤 <b>/player &lt;id/phone/user&gt;</b> - Lookup player profile & transactions\n"
        "• 🔄 <b>/sync_ledger</b> - Manually push bot ledger to Web Admin\n"
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
                    "text": "📊 Transactions & Referrals",
                    "callback_data": "admin_view_txs"
                },
                {
                    "text": "🔄 Sync Cloud Ledger",
                    "callback_data": "admin_sync_ledger"
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

def handle_single_update(update):
    try:


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
                    return

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
                return

            if cb_data.startswith("with_approve:") or cb_data.startswith("with_reject:"):
                action, rest = cb_data.split(":", 1)
                caller_id = cb_from.get("id")
                caller_username = cb_from.get("username", "")

                if not is_admin(caller_id, caller_username):
                    api_call("answerCallbackQuery", {
                        "callback_query_id": cb_id,
                        "text": "❌ የተፈቀደለት አድሚን ብቻ ነው ማጽደቅ የሚችለው!",
                        "show_alert": True
                    })
                    return

                w_parts = rest.split(":")
                explicit_uid = None
                explicit_amt = None
                if len(w_parts) == 3:
                    try:
                        if w_parts[0] and w_parts[0] != "0":
                            explicit_uid = int(w_parts[0])
                        explicit_amt = float(w_parts[1])
                    except Exception:
                        pass
                    req_id = w_parts[2]
                else:
                    req_id = rest

                orig_text = cb_msg.get("text", "")
                admin_tag = f"@{caller_username}" if caller_username else f"ID {caller_id}"
                if action == "with_approve":
                    ok, info = approve_withdrawal(
                        req_id,
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
                        api_call("editMessageText", {
                            "chat_id": cb_chat_id,
                            "message_id": cb_msg.get("message_id"),
                            "text": orig_text + f"\n\n<b>✅ APPROVED by {admin_tag}</b>\n<i>(ገንዘቡ ለተጠቃሚው ተልኮ ተረጋግጧል)</i>",
                            "parse_mode": "HTML"
                        })
                    else:
                        api_call("answerCallbackQuery", {
                            "callback_query_id": cb_id,
                            "text": f"⚠️ {info}",
                            "show_alert": True
                        })
                else:
                    ok, info = reject_withdrawal(
                        req_id,
                        caller_id,
                        explicit_chat_id=explicit_uid,
                        explicit_amount=explicit_amt,
                        message_text=orig_text
                    )
                    if ok:
                        api_call("answerCallbackQuery", {
                            "callback_query_id": cb_id,
                            "text": f"❌ {info}"
                        })
                        api_call("editMessageText", {
                            "chat_id": cb_chat_id,
                            "message_id": cb_msg.get("message_id"),
                            "text": orig_text + f"\n\n<b>❌ REJECTED & REFUNDED by {admin_tag}</b>",
                            "parse_mode": "HTML"
                        })
                    else:
                        api_call("answerCallbackQuery", {
                            "callback_query_id": cb_id,
                            "text": f"⚠️ {info}",
                            "show_alert": True
                        })
                return

            if cb_data.startswith("quick_wd:"):
                amt_val = cb_data.split(":", 1)[1]
                api_call("answerCallbackQuery", {"callback_query_id": cb_id})
                if ensure_user_registered_or_prompt(cb_chat_id):
                    handle_withdraw_request(cb_chat_id, cb_user, amt_val)
                return

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
                return

            if cb_data == "admin_view_txs":
                caller_id = cb_from.get("id")
                caller_username = cb_from.get("username", "")
                if is_admin(caller_id, caller_username):
                    api_call("answerCallbackQuery", {"callback_query_id": cb_id})
                    handle_admin_tx_list(cb_chat_id)
                else:
                    api_call("answerCallbackQuery", {"callback_query_id": cb_id, "text": "❌ Unauthorized", "show_alert": True})
                return

            if cb_data == "admin_sync_ledger":
                caller_id = cb_from.get("id")
                caller_username = cb_from.get("username", "")
                if is_admin(caller_id, caller_username):
                    api_call("answerCallbackQuery", {"callback_query_id": cb_id, "text": "🔄 Syncing ledger to cloud..."})
                    threading.Thread(target=sync_bot_ledger_to_cloud, daemon=True).start()
                    send_text_message(cb_chat_id, "✅ Bot ledger sync dispatched to cloud!")
                else:
                    api_call("answerCallbackQuery", {"callback_query_id": cb_id, "text": "❌ Unauthorized", "show_alert": True})
                return

            if cb_data == "agent_view_txs":
                api_call("answerCallbackQuery", {"callback_query_id": cb_id})
                txs = load_agent_transactions()
                ag_txs = [t for t in txs if str(t.get("agent_id")) == str(cb_chat_id)][:10]
                if not ag_txs:
                    send_text_message(cb_chat_id, "ℹ️ እስካሁን ምንም የወኪል ግብይት አልተደረገም (No agent transactions yet).")
                else:
                    msg = "📜 <b>የቅርብ ጊዜ የወኪል ግብይቶች (Recent Agent Transactions)</b>\n━━━━━━━━━━━━━━━━━━━━\n\n"
                    for t in ag_txs:
                        icon = "🟢 ገቢ (Deposit)" if t["type"] == "deposit" else "🔴 ወጪ (Withdrawal)"
                        msg += (
                            f"{icon}: <b>{t['amount']:.2f} ETB</b>\n"
                            f"👤 ተጫዋች: {t.get('player_name', 'Player')} (<code>{t.get('player_phone') or t.get('player_id')}</code>)\n"
                            f"💼 ቀሪ ካፒታል: <b>{t.get('agent_balance_after', 0):.2f} ETB</b>\n"
                            f"🧾 Ref: <code>{t['id']}</code> • {t.get('created_at', '')}\n\n"
                        )
                    send_text_message(cb_chat_id, msg)
                return

            if cb_data == "agent_refresh_bal":
                api_call("answerCallbackQuery", {"callback_query_id": cb_id, "text": "🔄 Refreshing balance..."})
                send_agent_dashboard(cb_chat_id, cb_user)
                return

            if cb_data.startswith("ag_mode:"):
                # Format: ag_mode:dep:UID or ag_mode:wd:UID
                api_call("answerCallbackQuery", {"callback_query_id": cb_id})
                parts = cb_data.split(":")
                if len(parts) >= 3:
                    mode, p_uid = parts[1], parts[2]
                    send_agent_amount_selector(cb_chat_id, p_uid, mode)
                return

            if cb_data.startswith("ag_exec:"):
                # Format: ag_exec:dep:UID:AMT or ag_exec:wd:UID:AMT
                api_call("answerCallbackQuery", {"callback_query_id": cb_id, "text": "⏳ Processing transaction..."})
                parts = cb_data.split(":")
                if len(parts) >= 4:
                    mode, p_uid, amt_str = parts[1], parts[2], parts[3]
                    amt = float(amt_str)
                    if mode == "dep":
                        ok, res = execute_agent_deposit(cb_chat_id, p_uid, amt, agent_name=cb_user.get("first_name", ""))
                        if ok:
                            send_text_message(cb_chat_id, (
                                f"✅ <b>የወኪል ገቢ ተሳክቷል (Deposit Successful)!</b>\n\n"
                                f"👤 <b>ተጫዋች:</b> {res['player_name']} (<code>{res['player_id']}</code>)\n"
                                f"📱 <b>ስልክ:</b> <code>{res['player_phone']}</code>\n"
                                f"💰 <b>የገባ መጠን:</b> <b>+{amt:.2f} ETB</b>\n"
                                f"💼 <b>ቀሪ የካፒታል መጠን:</b> <b>{res['agent_balance_after']:.2f} ETB</b>\n"
                                f"💵 <b>የተጫዋች አዲሱ ባላንስ:</b> <b>{res['player_balance_after']:.2f} ETB</b>\n"
                                f"🧾 <b>Ref ID:</b> <code>{res['id']}</code>"
                            ))
                        else:
                            send_text_message(cb_chat_id, f"❌ <b>ስህተት:</b> {res}")
                    elif mode == "wd":
                        ok, res = execute_agent_withdraw(cb_chat_id, p_uid, amt, agent_name=cb_user.get("first_name", ""))
                        if ok:
                            send_text_message(cb_chat_id, (
                                f"✅ <b>የወኪል ወጪ ክፍያ ተሳክቷል (Payout Successful)!</b>\n\n"
                                f"👤 <b>ተጫዋች:</b> {res['player_name']} (<code>{res['player_id']}</code>)\n"
                                f"📱 <b>ስልክ:</b> <code>{res['player_phone']}</code>\n"
                                f"💸 <b>የወጣ መጠን:</b> <b>-{amt:.2f} ETB</b>\n"
                                f"💼 <b>አዲሱ የካፒታል መጠን:</b> <b>{res['agent_balance_after']:.2f} ETB</b>\n"
                                f"💵 <b>የተጫዋች ቀሪ ባላንስ:</b> <b>{res['player_balance_after']:.2f} ETB</b>\n"
                                f"🧾 <b>Ref ID:</b> <code>{res['id']}</code>\n\n"
                                f"⚠️ እባክዎ ጥሬ ገንዘቡን ለተጫዋቹ መስጠትዎን ያረጋግጡ!"
                            ))
                        else:
                            send_text_message(cb_chat_id, f"❌ <b>ስህተት:</b> {res}")
                return

            if cb_data.startswith("ag_prompt:"):
                # Format: ag_prompt:dep:UID or ag_prompt:wd:UID
                api_call("answerCallbackQuery", {"callback_query_id": cb_id})
                parts = cb_data.split(":")
                if len(parts) >= 3:
                    mode, p_uid = parts[1], parts[2]
                    users = load_known_users()
                    if str(cb_chat_id) in users:
                        users[str(cb_chat_id)]["awaiting_agent_target"] = f"{mode}:{p_uid}"
                        save_all_users(users)
                    prompt_act = "ገቢ ለማድረግ (Deposit)" if mode == "dep" else "ወጪ ለመክፈል (Withdraw)"
                    send_text_message(cb_chat_id, f"✏️ እባክዎ ለተጫዋቹ {prompt_act} የሚፈልጉትን የገንዘብ መጠን በቁጥር ብቻ ይላኩ (ምሳሌ፦ <code>150</code> ወይም <code>350.50</code>):")
                return

            api_call("answerCallbackQuery", {"callback_query_id": cb_id})

            if not ensure_user_registered_or_prompt(cb_chat_id):
                return
            elif cb_data == "deposit":
                send_deposit_info(cb_chat_id, cb_user)
            elif cb_data == "withdraw":
                send_withdraw_info(cb_chat_id, cb_user)
            return

        msg = update.get("message")
        if not msg:
            return

        chat_id = msg["chat"]["id"]
        from_user = msg.get("from") or {}
        first_name = from_user.get("first_name", "Player")
        username = from_user.get("username", "")
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

            # Award referral bonus if this user was referred by someone
            referred_by = user.get("referred_by")
            if referred_by and not user.get("referral_rewarded"):
                ref_str = str(referred_by)
                if ref_str != str(chat_id):
                    all_users = load_known_users()
                    if ref_str in all_users:
                        ref_user = all_users[ref_str]
                        cur_bonus = float(ref_user.get("bonus_balance", 0.0))
                        ref_user["bonus_balance"] = round(cur_bonus + 3.0, 2)
                        all_users[str(chat_id)]["referral_rewarded"] = True
                        save_all_users(all_users)
                        user["referral_rewarded"] = True
                        push_balance_to_cloud(int(ref_str), float(ref_user.get("balance", 0.0)), ref_user.get("username", ""), bonus_balance=ref_user["bonus_balance"])
                        update_live_welcome_message(int(ref_str), ref_user)
                        api_call("sendMessage", {
                            "chat_id": int(ref_str),
                            "text": (
                                f"🎁 <b>የሪፈራል ጉርሻ (Referral Bonus)!</b>\n\n"
                                f"ጓደኛዎ <b>{full_name}</b> በተጋባዥ ሊንክዎ ስለተመዘገበ/ች የ <b>+3.00 ETB</b> ጉርሻ ወደ Bonus Balance ገቢ ተደርጓል!\n\n"
                                f"🎁 <b>የቦነስ ሂሳብዎ (Bonus Balance):</b> <b>{ref_user['bonus_balance']:.2f} ETB</b>\n"
                                f"💵 <b>እውነተኛ ሂሳብዎ (Real Balance):</b> <b>{float(ref_user.get('balance', 0.0)):.2f} ETB</b>\n\n"
                                f"<i>📌 ማስታወሻ፦ ቦነስ ባላንስ መጫወቻ ብቻ ሲሆን፣ በቦነስ ሲያሸንፉ አሸናፊው በቀጥታ ወደ Real Balance ገቢ ይደረጋል!</i>"
                            ),
                            "parse_mode": "HTML"
                        })

            # Notify admins
            ref_raw = user.get("referred_by")
            ref_disp = get_referrer_display(ref_raw)
            for admin_id in ADMIN_USER_IDS:
                if str(admin_id) != str(chat_id):
                    api_call("sendMessage", {
                        "chat_id": admin_id,
                        "text": (
                            f"🎉 <b>አዲስ ተጫዋች ተመዝግቧል (New Player Registered)!</b>\n\n"
                            f"👤 <b>ስም:</b> {full_name} (@{msg['from'].get('username','')})\n"
                            f"📱 <b>ስልክ:</b> <code>{phone}</code>\n"
                            f"🆔 <b>ID:</b> <code>{chat_id}</code>\n"
                            f"🔗 <b>መገኛ (Referred By):</b> {ref_disp}"
                        ),
                        "parse_mode": "HTML"
                    })
            threading.Thread(target=sync_bot_ledger_to_cloud, daemon=True).start()

            # Send congratulations and attach persistent keyboard
            send_registration_success(chat_id, user)
            return

        # Save user basic profile in registry
        user = save_known_user(msg.get("from"))
        if username and username.lower() in ADMIN_USERNAMES:
            ADMIN_USER_IDS.add(str(chat_id))

        logging.info(f"Received message: '{text}' from {first_name} (ID: {chat_id})")

        # Silent real-time wallet synchronization from WebApp games
        if text.startswith("/sync_wallet"):
            parts = text.split()
            if len(parts) >= 4:
                target_uid = parts[1].strip()
                if str(chat_id) == target_uid:
                    try:
                        s_real = max(0.0, float(parts[2]))
                        s_bonus = max(0.0, float(parts[3]))
                        users = load_known_users()
                        if target_uid in users:
                            users[target_uid]["balance"] = round(s_real, 2)
                            users[target_uid]["bonus_balance"] = round(s_bonus, 2)
                            users[target_uid]["updated"] = time.time()
                            save_all_users(users)
                            logging.info(f"Successfully synced wallet for user {chat_id}: real={s_real:.2f}, bonus={s_bonus:.2f}")
                    except Exception as ex:
                        logging.error(f"Error parsing /sync_wallet: {ex}")

            # Instantly delete the service message so chat remains completely spotless
            try:
                msg_id = msg.get("message_id")
                if msg_id:
                    api_call("deleteMessage", {
                        "chat_id": chat_id,
                        "message_id": msg_id
                    })
            except Exception:
                pass
            return

        # Handle WebApp data sent from Admin Control Center or Game Mini App
        if web_app_data:
            data_raw = web_app_data.get("data", "")
            logging.info(f"Received WebApp data: {data_raw}")
            try:
                payload = json.loads(data_raw)
                action = payload.get("action")
                if action == "sync_balance":
                    s_real = max(0.0, float(payload.get("balance", 0.0)))
                    s_bonus = max(0.0, float(payload.get("bonus_balance", 0.0)))
                    users = load_known_users()
                    uid_str = str(chat_id)
                    if uid_str in users:
                        cur_bot_bal = float(users[uid_str].get("balance", 0.0))
                        last_dep = float(users[uid_str].get("last_deposit_time", 0.0))

                        # CRITICAL GUARD 1: If WebApp sent 0.0 but bot has positive balance, NEVER wipe it out!
                        if s_real == 0.0 and cur_bot_bal > 0:
                            logging.warning(f"[SyncGuard] Prevented zeroing out {chat_id}: bot={cur_bot_bal:.2f}, webapp sent 0.0")
                            push_balance_to_cloud(chat_id, cur_bot_bal, users[uid_str].get("username", ""))
                            update_live_welcome_message(chat_id, users[uid_str])
                            return

                        # CRITICAL GUARD 2: Protect very recent deposit approvals (within 15s) from in-flight race condition
                        if cur_bot_bal > s_real and (time.time() - last_dep < 15):
                            logging.warning(f"[SyncGuard] Preserved recent deposit for {chat_id}: bot={cur_bot_bal:.2f}, webapp sent {s_real:.2f}")
                            push_balance_to_cloud(chat_id, cur_bot_bal, users[uid_str].get("username", ""))
                            update_live_welcome_message(chat_id, users[uid_str])
                            return

                        users[uid_str]["balance"] = round(s_real, 2)
                        users[uid_str]["bonus_balance"] = round(s_bonus, 2)
                        users[uid_str]["updated"] = time.time()
                        save_all_users(users)
                        user = users[uid_str]
                    push_balance_to_cloud(chat_id, s_real, user.get("username", ""))
                    update_live_welcome_message(chat_id, user)
                    return
                elif action in ("broadcast", "send"):
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
                    return
                elif action == "agent_deposit":
                    p_id = str(payload.get("player_id", "")).strip()
                    amt = float(payload.get("amount", 0.0))
                    if amt <= 0:
                        send_text_message(chat_id, "⚠️ የተሳሳተ የገንዘብ መጠን!")
                        return
                    ok, res = execute_agent_deposit(chat_id, p_id, amt, agent_name=user.get("first_name", ""))
                    if ok:
                        send_text_message(chat_id, (
                            f"✅ <b>የወኪል ገቢ ተሳክቷል (Deposit Successful)!</b>\n\n"
                            f"👤 <b>ተጫዋች:</b> {res['player_name']} (<code>{res['player_id']}</code>)\n"
                            f"📱 <b>ስልክ:</b> <code>{res['player_phone']}</code>\n"
                            f"💰 <b>የገባ መጠን:</b> <b>+{amt:.2f} ETB</b>\n"
                            f"💼 <b>ቀሪ የካፒታል መጠን:</b> <b>{res['agent_balance_after']:.2f} ETB</b>\n"
                            f"💵 <b>የተጫዋች አዲሱ ባላንስ:</b> <b>{res['player_balance_after']:.2f} ETB</b>\n"
                            f"🧾 <b>Ref ID:</b> <code>{res['id']}</code>"
                        ))
                    else:
                        send_text_message(chat_id, f"❌ <b>ስህተት:</b> {res}")
                    return
                elif action == "agent_withdraw":
                    p_id = str(payload.get("player_id", "")).strip()
                    amt = float(payload.get("amount", 0.0))
                    if amt <= 0:
                        send_text_message(chat_id, "⚠️ የተሳሳተ የገንዘብ መጠን!")
                        return
                    ok, res = execute_agent_withdraw(chat_id, p_id, amt, agent_name=user.get("first_name", ""))
                    if ok:
                        send_text_message(chat_id, (
                            f"✅ <b>የወኪል ወጪ ክፍያ ተሳክቷል (Payout Successful)!</b>\n\n"
                            f"👤 <b>ተጫዋች:</b> {res['player_name']} (<code>{res['player_id']}</code>)\n"
                            f"📱 <b>ስልክ:</b> <code>{res['player_phone']}</code>\n"
                            f"💸 <b>የወጣ መጠን:</b> <b>-{amt:.2f} ETB</b>\n"
                            f"💼 <b>አዲሱ የካፒታል መጠን:</b> <b>{res['agent_balance_after']:.2f} ETB</b>\n"
                            f"💵 <b>የተጫዋች ቀሪ ባላንስ:</b> <b>{res['player_balance_after']:.2f} ETB</b>\n"
                            f"🧾 <b>Ref ID:</b> <code>{res['id']}</code>\n\n"
                            f"⚠️ እባክዎ ጥሬ ገንዘቡን ለተጫዋቹ መስጠትዎን ያረጋግጡ!"
                        ))
                    else:
                        send_text_message(chat_id, f"❌ <b>ስህተት:</b> {res}")
                    return
            except Exception as ex:
                logging.error(f"Error handling web_app_data: {ex}")

        # Capture referral or game sync parameter if present in /start
        if text.startswith("/start"):
            parts = text.split()
            if len(parts) > 1:
                raw_param = parts[1].strip()
                if raw_param.startswith("sync_"):
                    # Format: sync_<real>_<bonus>
                    sync_parts = raw_param.split("_")
                    if len(sync_parts) >= 3:
                        try:
                            s_real = max(0.0, float(sync_parts[1]))
                            s_bonus = max(0.0, float(sync_parts[2]))
                            users_all = load_known_users()
                            uid_str = str(chat_id)
                            if uid_str in users_all:
                                users_all[uid_str]["balance"] = round(s_real, 2)
                                users_all[uid_str]["bonus_balance"] = round(s_bonus, 2)
                                users_all[uid_str]["balance_updated"] = time.time()
                                users_all[uid_str]["updated"] = time.time()
                                save_all_users(users_all)
                                user = users_all[uid_str]
                                logging.info(f"Updated live balance via /start sync for {chat_id}: real={s_real}, bonus={s_bonus}")
                        except Exception as ex:
                            logging.error(f"Error parsing /start sync: {ex}")
                else:
                    ref_id = raw_param.replace("ref_", "").strip()
                    if ref_id and ref_id.isdigit() and ref_id != str(chat_id):
                        users_all = load_known_users()
                        cur_u = users_all.get(str(chat_id), {})
                        if not cur_u.get("registered") and not cur_u.get("referred_by"):
                            cur_u["referred_by"] = ref_id
                            users_all[str(chat_id)] = cur_u
                            save_all_users(users_all)
                            logging.info(f"User {chat_id} set referred_by={ref_id}")

        # Admin Rain Testing and Status Commands ("heg ena demboche")
        if text.startswith("/testrain"):
            if not is_admin(chat_id, username):
                api_call("sendMessage", {
                    "chat_id": chat_id,
                    "text": "❌ ይህ ትዕዛዝ ለአድሚን ብቻ የተፈቀደ ነው!"
                })
                return
            parts = text.split()
            tier_val = parts[1] if len(parts) > 1 else "10"
            if tier_val == "100":
                ok = broadcast_live_rain(1000.0, 10, 100.0, 500.0, 10)
                msg_txt = "🌧️ <b>Bal 100 Rain Drop Broadcasted!</b>\n1000.00 ETB for 10 players (100.00 ETB each)\nRule: Wager 500+ ETB in last 10 mins"
            elif tier_val == "20":
                ok = broadcast_live_rain(500.0, 25, 20.0, 200.0, 30)
                msg_txt = "🌧️ <b>Bal 20 Rain Drop Broadcasted!</b>\n500.00 ETB for 25 players (20.00 ETB each)\nRule: Wager 200+ ETB in last 30 mins"
            else:
                ok = broadcast_live_rain(500.0, 50, 10.0, 100.0, 30)
                msg_txt = "🌧️ <b>Bal 10 Rain Drop Broadcasted!</b>\n500.00 ETB for 50 players (10.00 ETB each)\nRule: Wager 100+ ETB in last 30 mins"
            api_call("sendMessage", {
                "chat_id": chat_id,
                "text": msg_txt + f"\n\n📡 WebSockets Live: {'✅ Delivered' if ok else '⚠️ Failed'}",
                "parse_mode": "HTML"
            })
            return

        if text.startswith("/rainstatus"):
            state = _load_auto_rain_state()
            now = time.time()
            rem10 = max(0, int(state.get("next_tier10", 0) - now))
            rem20 = max(0, int(state.get("next_tier20", 0) - now))
            rem100 = max(0, int(state.get("next_tier100", 0) - now))
            status_text = (
                "🌧️ <b>Habtam Bet - Auto Rain Drop Status</b>\n\n"
                f"💧 <b>Bal 10 (500 ETB / 50 players, 10 ETB each):</b>\n"
                f"• ቀጣይ ዝናብ: ከ {rem10//60} ደቂቃ {rem10%60} ሰከንድ በኋላ\n"
                f"• ህግ: ባለፉት 30 ደቂቃ 100+ ETB መጫወት\n"
                f"• ድግግሞሽ: በ1 ሰዓት 2 ጊዜ (ያልታወቀ ሰዓት)\n\n"
                f"💧 <b>Bal 20 (500 ETB / 25 players, 20 ETB each):</b>\n"
                f"• ቀጣይ ዝናብ: ከ {rem20//60} ደቂቃ {rem20%60} ሰከንድ በኋላ\n"
                f"• ህግ: ባለፉት 30 ደቂቃ 200+ ETB መጫወት\n"
                f"• ድግግሞሽ: በ1 ሰዓት 1 ጊዜ (ያልታወቀ ሰዓት)\n\n"
                f"💧 <b>Bal 100 (1000 ETB / 10 players, 100 ETB each):</b>\n"
                f"• ቀጣይ ዝናብ: ከ {rem100//60} ደቂቃ {rem100%60} ሰከንድ በኋላ\n"
                f"• ህግ: ባለፉት 10 ደቂቃ 500+ ETB መጫወት\n"
                f"• ድግግሞሽ: በ2 ሰዓት 1 ጊዜ (ያልታወቀ ሰዓት)\n"
            )
            api_call("sendMessage", {
                "chat_id": chat_id,
                "text": status_text,
                "parse_mode": "HTML"
            })
            return

        # If user is not registered, force phone registration prompt on EVERY interaction (start, buttons, or text)
        if not is_user_registered(chat_id) and not text.lower().startswith("/admin"):
            request_phone_registration(chat_id)
            return

        # If user is registered and sends /start (or opens bot with any start link):
        if text.startswith("/start") or text in ("/start", "🔄 /start", "/start 🔄", "Restart", "restart"):
            send_welcome(chat_id, user)
            return

        # --- Custom Keyboard Choices (matching Image 2 + legacy Image 1 compatibility) ---
        if text in ("Play Games 🎮", "🎮 ቢንጎ ተጫወት", "🎮 አሁን ተጫወት", "/play"):
            if not ensure_user_registered_or_prompt(chat_id):
                return
            app_url = get_user_webapp_url(chat_id, user)
            api_call("sendMessage", {
                "chat_id": chat_id,
                "text": "🎮 <b>Tap below to launch Friendes Games:</b>\n\nጨዋታዎችን ለመክፈት ከታች ያለውን ቁልፍ ይጫኑ፦",
                "parse_mode": "HTML",
                "reply_markup": {
                    "inline_keyboard": [
                        [{"text": "🚀 Open Mini App (Play Now)", "web_app": {"url": app_url}}]
                    ]
                }
            })
        elif text in ("Deposit 💰", "💰 ገቢ ለማድረግ") or text.startswith("/deposit"):
            if not ensure_user_registered_or_prompt(chat_id):
                return
            send_deposit_info(chat_id, user)
        elif text in ("Withdraw 💰", "💸 ወጪ ለማድረግ") or text.startswith("/withdraw"):
            if not ensure_user_registered_or_prompt(chat_id):
                return
            parts = text.split(" ", 1)
            if len(parts) > 1 and parts[1].strip():
                handle_withdraw_request(chat_id, user, parts[1].strip())
            else:
                send_withdraw_info(chat_id, user)
        elif text in ("Transfer ↔️", "/transfer") or text.startswith("/transfer"):
            if not ensure_user_registered_or_prompt(chat_id):
                return
            parts = text.split()
            if len(parts) >= 3:
                handle_transfer(chat_id, user, parts[1], parts[2])
            else:
                send_transfer_info(chat_id, user)
        elif text in ("My Profile 👤", "👤 ፕሮፋይል & ሂሳብ", "/profile", "/account"):
            if not ensure_user_registered_or_prompt(chat_id):
                return
            send_profile_info(chat_id, user)
        elif text in ("Transactions 📜", "/transactions", "/history"):
            if not ensure_user_registered_or_prompt(chat_id):
                return
            send_transactions_info(chat_id, user)
        elif text in ("Balance 💰", "/balance"):
            if not ensure_user_registered_or_prompt(chat_id):
                return
            send_balance_info(chat_id, user)
        elif text in ("Join Group ↗️", "Join Group", "/group"):
            send_join_group_info(chat_id, user)
        elif text in ("Contact Us", "Contact Us ↗️", "🆘 እርዳታ", "/contact", "/help"):
            send_contact_us_info(chat_id, user)
        elif text in ("Refer & Earn 🎁", "🎁 ፕሮሞ ኮድ", "🔗 ጋብዝ & አግኝ", "/referral", "/promo"):
            if not ensure_user_registered_or_prompt(chat_id):
                return
            send_referral_info(chat_id, user)
        elif text in ("🌐 ቋንቋ / Language", "/language"):
            send_language_info(chat_id, user)
        elif text in ("📢 አጀንት ፕሮሞተር", "/agent"):
            send_agent_info(chat_id, user)

        # --- Standard Bot Commands ---
        elif text.startswith("/start") or text in ("/start", "🔄 /start", "/start 🔄"):
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
                        "ይህ ክፍል ለተፈቀደላቸው አድሚኖች (@HABTAMBET64, @samTesfa19) ብቻ የተወሰነ ነው።\n"
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

        elif (text.lower().startswith("/player") or text.lower().startswith("/user")) and is_admin(chat_id, username):
            parts = text.split(" ", 1)
            if len(parts) < 2 or not parts[1].strip():
                send_text_message(chat_id, "ℹ️ <b>አጠቃቀም:</b> <code>/player &lt;User ID, @username ወይም ስልክ&gt;</code>")
            else:
                handle_admin_player_lookup(chat_id, parts[1].strip())

        elif text.lower() in ("/tx", "/transactions", "/txs") and is_admin(chat_id, username):
            handle_admin_tx_list(chat_id)

        elif text.lower().startswith("/sync_ledger") and is_admin(chat_id, username):
            send_text_message(chat_id, "⏳ Syncing all bot transactions and player referrals to cloud...")
            threading.Thread(target=sync_bot_ledger_to_cloud, daemon=True).start()
            send_text_message(chat_id, "✅ Sync request dispatched to cloud!")

        elif text.lower() in ("/dashboard", "/agent"):
            send_agent_dashboard(chat_id, user)

        elif text.lower().startswith("/fund_agent") and is_admin(chat_id, username):
            parts = text.split()
            if len(parts) < 3:
                send_text_message(chat_id, "ℹ️ <b>አጠቃቀም:</b> <code>/fund_agent &lt;Phone/AgentID&gt; &lt;Amount&gt;</code>")
            else:
                target_q = parts[1].strip()
                try:
                    fund_amt = float(parts[2].strip())
                    if fund_amt <= 0:
                        raise ValueError()
                except ValueError:
                    send_text_message(chat_id, "⚠️ የተሳሳተ የገንዘብ መጠን!")
                    return
                
                agents = load_agents()
                matched_ag_id = None
                if target_q in agents:
                    matched_ag_id = target_q
                else:
                    norm_q = normalize_agent_phone(target_q)
                    for a_id, a_data in agents.items():
                        if norm_q and (normalize_agent_phone(a_data.get("phone", "")) == norm_q or norm_q in a_id):
                            matched_ag_id = a_id
                            break
                            
                if not matched_ag_id:
                    send_text_message(chat_id, f"❌ ወኪል <code>{target_q}</code> አልተገኘም! መጀመሪያ በ <code>/add_agent</code> ይመዝግቡ።")
                else:
                    cur_ag_bal = float(agents[matched_ag_id].get("balance", 0.0))
                    new_ag_bal = round(cur_ag_bal + fund_amt, 2)
                    agents[matched_ag_id]["balance"] = new_ag_bal
                    save_agents(agents)
                    ag_name = agents[matched_ag_id].get("name", "Agent")
                    send_text_message(chat_id, (
                        f"✅ <b>የወኪል የስራ ካፒታል ገቢ ተደርጓል!</b>\n\n"
                        f"👤 <b>ወኪል:</b> {ag_name} (<code>{matched_ag_id}</code>)\n"
                        f"💰 <b>የተጨመረው ካፒታል:</b> <b>+{fund_amt:.2f} ETB</b>\n"
                        f"💵 <b>አዲሱ የወኪል ባላንስ:</b> <b>{new_ag_bal:.2f} ETB</b>"
                    ))
                    try:
                        api_call("sendMessage", {
                            "chat_id": int(matched_ag_id),
                            "text": (
                                f"🎉 <b>የስራ ካፒታል ገቢ ተደርጓል! (Capital Funded)</b>\n\n"
                                f"በአድሚን <b>+{fund_amt:.2f} ETB</b> የስራ ካፒታል ወደ አካውንትዎ ገቢ ተደርጓል!\n"
                                f"💼 <b>አዲሱ የስራ ካፒታልዎ:</b> <b>{new_ag_bal:.2f} ETB</b>\n\n"
                                f"ተጫዋቾችን ለማስተናገድ /dashboard ይጫኑ።"
                            ),
                            "parse_mode": "HTML"
                        })
                    except Exception:
                        pass

        elif text.lower().startswith("/deduct_agent") and is_admin(chat_id, username):
            parts = text.split()
            if len(parts) < 3:
                send_text_message(chat_id, "ℹ️ <b>አጠቃቀም:</b> <code>/deduct_agent &lt;Phone/AgentID&gt; &lt;Amount&gt;</code>")
            else:
                target_q = parts[1].strip()
                try:
                    ded_amt = float(parts[2].strip())
                    if ded_amt <= 0:
                        raise ValueError()
                except ValueError:
                    send_text_message(chat_id, "⚠️ የተሳሳተ የገንዘብ መጠን!")
                    return
                
                agents = load_agents()
                matched_ag_id = None
                if target_q in agents:
                    matched_ag_id = target_q
                else:
                    norm_q = normalize_agent_phone(target_q)
                    for a_id, a_data in agents.items():
                        if norm_q and (normalize_agent_phone(a_data.get("phone", "")) == norm_q or norm_q in a_id):
                            matched_ag_id = a_id
                            break
                            
                if not matched_ag_id:
                    send_text_message(chat_id, f"❌ ወኪል <code>{target_q}</code> አልተገኘም!")
                else:
                    cur_ag_bal = float(agents[matched_ag_id].get("balance", 0.0))
                    new_ag_bal = max(0.0, round(cur_ag_bal - ded_amt, 2))
                    agents[matched_ag_id]["balance"] = new_ag_bal
                    save_agents(agents)
                    send_text_message(chat_id, f"✅ ከወኪል <b>-{ded_amt:.2f} ETB</b> ተቀንሷል። አዲሱ ባላንስ፦ <b>{new_ag_bal:.2f} ETB</b>")

        elif text.lower().startswith("/add_agent") and is_admin(chat_id, username):
            parts = text.split(" ", 2)
            if len(parts) < 2:
                send_text_message(chat_id, "ℹ️ <b>አጠቃቀም:</b> <code>/add_agent &lt;Phone/User ID&gt; [የወኪሉ ስም]</code>")
            else:
                target_q = parts[1].strip()
                ag_custom_name = parts[2].strip() if len(parts) >= 3 else ""
                
                p_uid, p_data = find_player_by_query(target_q)
                agent_uid = p_uid or target_q
                agent_phone = (p_data or {}).get("phone", target_q)
                agent_name = ag_custom_name or (f"{p_data.get('first_name', '')} {p_data.get('last_name', '')}".strip() if p_data else f"Agent {str(agent_uid)[-4:]}")
                
                agents = load_agents()
                agents[str(agent_uid)] = {
                    "id": str(agent_uid),
                    "name": agent_name,
                    "phone": agent_phone,
                    "balance": float(agents.get(str(agent_uid), {}).get("balance", 0.0)),
                    "status": "active",
                    "created_at": time.strftime("%Y-%m-%d %H:%M:%S")
                }
                save_agents(agents)
                send_text_message(chat_id, (
                    f"✅ <b>ወኪል በተሳካ ሁኔታ ተመዝግቧል!</b>\n\n"
                    f"👤 <b>ስም:</b> <b>{agent_name}</b>\n"
                    f"📱 <b>ስልክ:</b> <code>{agent_phone}</code>\n"
                    f"🆔 <b>Agent ID:</b> <code>{agent_uid}</code>\n"
                    f"💰 <b>የስራ ካፒታል:</b> <b>{agents[str(agent_uid)]['balance']:.2f} ETB</b>\n\n"
                    f"ካፒታል ለመሙላት፦ <code>/fund_agent {agent_uid} &lt;amount&gt;</code>"
                ))
                try:
                    api_call("sendMessage", {
                        "chat_id": int(agent_uid),
                        "text": (
                            f"🎉 <b>እንኳን ደስ አለዎት! የ Friendes Game ይፋዊ ወኪል (Agent) ሆነዋል!</b>\n\n"
                            f"👤 <b>የወኪል ስም:</b> {agent_name}\n"
                            f"የወኪል ዳሽቦርድዎን ለመክፈትና ተጫዋቾችን ለማስተናገድ ከታች ያለውን ትዕዛዝ ይጠቀሙ፦\n"
                            f"👉 /dashboard"
                        ),
                        "parse_mode": "HTML"
                    })
                except Exception:
                    pass

        elif text.lower().startswith("/remove_agent") and is_admin(chat_id, username):
            parts = text.split()
            if len(parts) < 2:
                send_text_message(chat_id, "ℹ️ <b>አጠቃቀም:</b> <code>/remove_agent &lt;Phone/AgentID&gt;</code>")
            else:
                target_q = parts[1].strip()
                agents = load_agents()
                matched_ag_id = None
                if target_q in agents:
                    matched_ag_id = target_q
                else:
                    norm_q = normalize_agent_phone(target_q)
                    for a_id, a_data in agents.items():
                        if norm_q and (normalize_agent_phone(a_data.get("phone", "")) == norm_q or norm_q in a_id):
                            matched_ag_id = a_id
                            break
                if matched_ag_id and matched_ag_id in agents:
                    agents[matched_ag_id]["status"] = "inactive"
                    save_agents(agents)
                    send_text_message(chat_id, f"✅ ወኪል <code>{matched_ag_id}</code> ከወኪልነት ተሰርዟል (Deactivated).")
                else:
                    send_text_message(chat_id, f"❌ ወኪል <code>{target_q}</code> አልተገኘም!")

        elif text.lower() in ("/agents", "/agent_list") and is_admin(chat_id, username):
            agents = load_agents()
            if not agents:
                send_text_message(chat_id, "ℹ️ እስካሁን የተመዘገበ ወኪል የለም። በ <code>/add_agent</code> ይመዝግቡ።")
            else:
                msg = "👥 <b>የተመዘገቡ ወኪሎች ዝርዝር (Agents Directory)</b>\n━━━━━━━━━━━━━━━━━━━━\n\n"
                for a_id, a_data in agents.items():
                    stat_icon = "🟢" if a_data.get("status") == "active" else "🔴"
                    msg += (
                        f"{stat_icon} <b>{a_data.get('name', 'Agent')}</b>\n"
                        f"📱 ስልክ: <code>{a_data.get('phone', 'N/A')}</code> | ID: <code>{a_id}</code>\n"
                        f"💰 ካፒታል: <b>{float(a_data.get('balance', 0.0)):.2f} ETB</b>\n"
                        f"📅 የተመዘገበበት: {a_data.get('created_at', 'N/A')}\n\n"
                    )
                msg += "💡 ካፒታል ለመሙላት፦ <code>/fund_agent &lt;ID/Phone&gt; &lt;Amount&gt;</code>"
                send_text_message(chat_id, msg)

        else:
            if not is_user_registered(chat_id):
                request_phone_registration(chat_id)
            else:
                clean_num = text.strip().replace("ETB", "").replace("ብር", "").strip()

                # Check if agent is responding to a custom amount prompt
                if is_agent(chat_id) and user.get("awaiting_agent_target"):
                    target_info = user.pop("awaiting_agent_target")
                    users_up = load_known_users()
                    if str(chat_id) in users_up:
                        users_up[str(chat_id)].pop("awaiting_agent_target", None)
                        save_all_users(users_up)
                    try:
                        amt_val = float(clean_num)
                        if amt_val <= 0:
                            raise ValueError()
                        mode, p_uid = target_info.split(":")
                        if mode == "dep":
                            ok, res = execute_agent_deposit(chat_id, p_uid, amt_val, agent_name=user.get("first_name", ""))
                            if ok:
                                send_text_message(chat_id, (
                                    f"✅ <b>የወኪል ገቢ ተሳክቷል!</b>\n\n"
                                    f"👤 ተጫዋች: {res['player_name']} (<code>{res['player_id']}</code>)\n"
                                    f"💰 የተጨመረው: <b>+{amt_val:.2f} ETB</b>\n"
                                    f"💼 ቀሪ ካፒታል: <b>{res['agent_balance_after']:.2f} ETB</b>\n"
                                    f"💵 የተጫዋች አዲሱ ባላንስ: <b>{res['player_balance_after']:.2f} ETB</b>"
                                ))
                            else:
                                send_text_message(chat_id, f"❌ ስህተት: {res}")
                        elif mode == "wd":
                            ok, res = execute_agent_withdraw(chat_id, p_uid, amt_val, agent_name=user.get("first_name", ""))
                            if ok:
                                send_text_message(chat_id, (
                                    f"✅ <b>የወኪል ወጪ ክፍያ ተሳክቷል!</b>\n\n"
                                    f"👤 ተጫዋች: {res['player_name']} (<code>{res['player_id']}</code>)\n"
                                    f"💸 የወጣው: <b>-{amt_val:.2f} ETB</b>\n"
                                    f"💼 አዲሱ ካፒታል: <b>{res['agent_balance_after']:.2f} ETB</b>\n"
                                    f"💵 የተጫዋች ቀሪ ባላንስ: <b>{res['player_balance_after']:.2f} ETB</b>"
                                ))
                            else:
                                send_text_message(chat_id, f"❌ ስህተት: {res}")
                        return
                    except ValueError:
                        send_text_message(chat_id, "⚠️ የተሳሳተ የገንዘብ መጠን! ቁጥር ብቻ ያስገቡ።")
                        return

                # Check if agent typed a phone number or numeric user ID to search for a player
                if is_agent(chat_id) and (re.search(r"(\+251|0)[97]\d{8}", text.strip()) or (text.strip().isdigit() and len(text.strip()) >= 7)):
                    p_uid, p_data = find_player_by_query(text.strip())
                    if p_uid and p_data:
                        send_agent_player_card(chat_id, p_uid, p_data)
                        return
                    else:
                        send_text_message(chat_id, f"❌ በ <code>{text.strip()}</code> የተመዘገበ ተጫዋች አልተገኘም!")
                        return
                if user.get("awaiting_action") == "withdraw" and re.match(r"^\d+(\.\d+)?$", clean_num):
                    handle_withdraw_request(chat_id, user, clean_num)
                    return

                lower = text.lower()
                # Only treat as deposit submission if text looks like a real transaction ID or payment confirmation
                is_tx = bool(
                    re.search(r"\b(TX|FT|MP|TRX|REF)[\w\d]{6,}\b", text, re.IGNORECASE) or
                    (any(k in lower for k in ["telebirr", "safaricom", "mpesa", "cbe", "ክፍያ", "ደረሰኝ"]) and any(k in lower for k in ["ብር", "etb", "transferred", "credited", "tx"]))
                )
                if is_tx:
                    clean_tx = text.strip().replace("\n", " ")
                    handle_deposit_submission(chat_id, user, clean_tx, amount=100.0, method="Telebirr / Safaricom")
                elif re.match(r"^\d+(\.\d+)?$", clean_num) and float(clean_num) >= 50:
                    handle_withdraw_request(chat_id, user, clean_num)
                else:
                    send_welcome(chat_id, user)
    except Exception as e:
        logging.error(f"Error handling update {update.get('update_id')}: {e}")


def main():
    logging.info("Starting Friendes Game Telegram Bot runner...")
    offset = 0

    # Start background initialization (commands menu, descriptions, menu button sync)
    def _background_init():
        try:
            api_call("setMyCommands", {
                "commands": [
                    {"command": "start", "description": "🎮 Start & Register Account"},
                    {"command": "deposit", "description": "💰 Deposit Funds (Telebirr/Safaricom)"},
                    {"command": "withdraw", "description": "💸 Withdraw to Registered Phone"},
                    {"command": "profile", "description": "👤 View My Account Profile"}
                ]
            })
            api_call("setMyDescription", {
                "description": (
                    "Welcome to Friendes Game!\n"
                    "Play Aviator, JetX, Mines, Slots, Betting and others to win real cash!\n"
                    "እንደዚህ አይነት የካሲኖ ጨዋታዎችን እና የቤቲንግ ዌብሳይት ማሰራት ለምትፈልጉ (Casino & Betting Development):\n"
                    "Contact 1: +251939292694\n"
                    "Contact 2: +251972450776\n"
                    "Telegram: @HABTAMBET64\n"
                    "Channel: https://t.me/Habtam_bet64"
                )
            })
            api_call("setMyShortDescription", {
                "short_description": "Play Aviator, JetX, Betting & win cash! 🛠 Casino Development: +251939292694 / +251972450776"
            })
            known = load_known_users()
            for uid, udata in known.items():
                if udata.get("registered") or udata.get("phone"):
                    user_app_url = get_user_webapp_url(uid, udata)
                    api_call("setChatMenuButton", {
                        "chat_id": int(uid),
                        "menu_button": {
                            "type": "web_app",
                            "text": "🎮 Play Games",
                            "web_app": {"url": user_app_url}
                        }
                    })
        except Exception as e:
            logging.warning(f"Error during bot background init: {e}")

    threading.Thread(target=_background_init, daemon=True).start()

    def _live_cloud_balance_sync_worker():
        """
        Periodically syncs recent active players' balances from local/cloud state into known_users.
        """
        while True:
            try:
                time.sleep(3)
                known = load_known_users()
                now = time.time()
                active_users = [
                    (uid, udata) for uid, udata in known.items()
                    if (now - float(udata.get("updated") or udata.get("last_seen") or 0)) < 3600
                ]
                for uid, udata in active_users:
                    try:
                        fetch_live_cloud_balance(int(uid), udata)
                    except Exception:
                        pass
            except Exception:
                time.sleep(3)

    def _ledger_cloud_sync_worker():
        try:
            sync_bot_ledger_to_cloud()
        except Exception:
            pass
        while True:
            try:
                time.sleep(25)
                sync_bot_ledger_to_cloud()
            except Exception:
                time.sleep(25)

    threading.Thread(target=_live_cloud_balance_sync_worker, daemon=True).start()
    threading.Thread(target=_auto_rain_scheduler_worker, daemon=True).start()
    threading.Thread(target=_ledger_cloud_sync_worker, daemon=True).start()

    executor = concurrent.futures.ThreadPoolExecutor(max_workers=8, thread_name_prefix="BotWorker")
    last_heartbeat = time.time()
    while True:
        try:
            if time.time() - last_heartbeat > 60:
                logging.info(f"Bot active, polling updates (offset: {offset})...")
                last_heartbeat = time.time()

            updates = fetch_updates(offset, timeout=20)
            if updates and updates.get("ok"):
                res_list = updates.get("result", [])
                for update in res_list:
                    offset = max(offset, update["update_id"] + 1)
                    executor.submit(handle_single_update, update)
            else:
                time.sleep(1)
        except KeyboardInterrupt:
            logging.info("Bot stopped.")
            break
        except BaseException as e:
            logging.error(f"Polling loop exception (will retry in 3s): {e}")
            time.sleep(3)

if __name__ == "__main__":
    main()
