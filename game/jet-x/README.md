# 🚀 JetX Multiplayer Game - Production Deployment Package

ይህ ፎልደር (`deploy/`) ጨዋታውን በቀጥታ ወደ ማንኛውም Cloud Server፣ VPS (Ubuntu/Debian)፣ ወይም Docker Container deploy ለማድረግ የሚያስፈልጉትን ፋይሎች በሙሉ የያዘ ነው።

---

## 📁 የፎልደሩ ይዘት (Package Structure)

```
deploy/
├── server/                 # Express & Realtime WebSocket Backend Engine
│   ├── index.js            # Main Server Entry Point (HTTP + WS)
│   ├── game-engine.js      # Multiplayer Flight Physics, State Machine & Bots
│   └── provably-fair.js    # SHA-256 HMAC Provably Fair Verification
├── public/                 # Authentic JetX Web Client Assets
│   ├── index.html          # Responsive Mobile & Desktop Layout
│   ├── css/style.css       # Complete JetX Design System & Animations
│   ├── js/
│   │   ├── app.js          # Client UI Controller & SVG Avatars
│   │   ├── canvas.js       # Authentic Runway, Parallax Sky, "FLEW AWAY" Escape
│   │   ├── network.js      # Auto-reconnecting WebSocket Network Client
│   │   ├── sound.js        # Authentic Audio & Fanfare Engine
│   │   └── spaceman-frames.js # 58 Tarmac Astronaut Walking Animation Frames
│   └── assets/images/      # All SmartSoft CDN Textures & Sprites
├── Dockerfile              # Production Docker Image (Node.js 20 Alpine)
├── .dockerignore           # Excluded files for clean Docker builds
├── Procfile                # 1-Click Deploy for Render / Railway / Heroku
├── package.json            # Node.js dependencies
└── README.md               # Deployment Guide (ይህ ፋይል)
```

---

## 🛠️ አማራጭ 1፡ በ Docker Deploy ለማድረግ (ቀላሉ እና ፈጣኑ መንገድ)

ዶከር (Docker) በተጫነበት ማንኛውም ሰርቨር ላይ በሚከተሉት ሁለት ትዕዛዞች ማብራት ይቻላል፡

```bash
# 1. Image መገንባት
docker build -t jetx-game .

# 2. Container ማስነሳት (በ Port 3030 ወይም በፈለጉት port)
docker run -d -p 3030:3030 --restart always --name jetx-prod jetx-game
```

ከዚያ በ Browserዎ: `http://YOUR_SERVER_IP:3030` ይክፈቱ!

---

## 💻 አማራጭ 2፡ በ Linux VPS (Ubuntu / Debian) በ PM2 ማብራት

Node.js v18+ በተጫነበት ሰርቨር ላይ፡

```bash
# 1. ፎልደሩ ውስጥ መግባት
cd deploy

# 2. Dependencies መጫን
npm install --omit=dev

# 3. በ PM2 ከበስተጀርባ (background) ሁልጊዜ እንዲሰራ ማስነሳት
npm install -g pm2
pm2 start server/index.js --name "jetx-multiplayer"
pm2 save
pm2 startup
```

---

## ☁️ አማራጭ 3፡ በ Render.com / Railway.app (Free Cloud Hosting)

1. ይህን የ `deploy` ፎልደር ወደ GitHub repository ይጫኑት (Push ያድርጉት)።
2. ወደ [Render.com](https://render.com) ወይም [Railway.app](https://railway.app) ይሂዱ።
3. **New Web Service** የሚለውን ይምረጡና GitHub Repoውን ያገናኙ።
4. የሚከተሉትን ቅንብሮች ያድርጉ፡
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. **Deploy Web Service** የሚለውን ይጫኑ። በደቂቃዎች ውስጥ የራሱ ነፃ የ `https://...` ሊንክ ይሰጥዎታል!

---

## ⚙️ Environment Variables (አማራጭ)

| Variable | Default | መግለጫ |
|---|---|---|
| `PORT` | `3030` | ሰርቨሩ የሚከፈትበት port |
| `NODE_ENV` | `production` | Production environment |

---

## 🎯 የጨዋታው ቁልፍ ገጽታዎች (Verified Features)

1. **Airport Runway & Walking Crew:** ከበረራ በፊት የ hangar ህንጻዎች፣ ኤርፖርት ተርሚናል፣ ታርማክ መንገድ እና የሚራመዱ ጠፈርተኞች (Astronauts)።
2. **Circular Glowing Countdown Ring:** በበረራ መጀመሪያ የሚቆጥር የ SVG ring timer እና "Place a bet"።
3. **Multiplayer Live Players Table:** 4 columns (`User`, `Bet, ETB`, `X`, `Win, ETB`)፣ የተለያየ ቀለም እና SVG icons ያላቸው circular avatars።
4. **Authentic "FLEW AWAY" Crash:** አውሮፕላኑ ሳይፈነዳ በከፍተኛ ፍጥነት ወደ ጠፈር የሚበርበት እና "FLEW AWAY" ባጅ የሚያሳይበት ትክክለኛ የ JetX መካኒዝም።
5. **Provably Fair:** በ SHA-256 HMAC የተረጋገጠ እውነተኛ የ multiplier generator።
