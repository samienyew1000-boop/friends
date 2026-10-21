# 🚀 Mines Game - የኢንተርኔት ላይ መጫኛ ጥቅል (Production Deployment Package)

ይህ ፎልደር ድረ-ገጹን እና የጨዋታውን Engine ወደ ኢንተርኔት (Cloud Server / Hosting) ለመጫን የሚያስፈልጉትን ፋይሎች በሙሉ የያዘ ነው።

---

## 📁 የፎልደሩ ይዘት (Package Structure)

```text
deploy_package/
├── frontend/               # የፊት ለፊት ድረ-ገጽ (Static HTML/CSS/JS Assets)
│   ├── index.html
│   ├── favicon.svg
│   └── assets/ (Images, Sounds, Atlases, Scripts)
│
├── fullstack/              # ድረ-ገጹንና ሰርቨሩን በአንድ ላይ የሚያስኬድ (All-in-One Server)
│   ├── public/             # የተካተተ የድረ-ገጽ ፋይሎች
│   ├── server.js           # የተዘጋጀ ፈጣን የጨዋታ Engine
│   ├── package.json        # Dependencies
│   ├── Procfile            # ለ Render / Railway / Heroku
│   └── Dockerfile          # ለ Docker ማሰሪያ
│
└── README.md               # የመጫኛ መመሪያ
```

---

## 🌐 አማራጭ 1፡ Render / Railway ላይ በነጻ መጫን (በጣም ቀላልና ፈጣን - Recommended)

ይህ አማራጭ ድረ-ገጹንና ጨዋታውን በአንድ ላይ በነጻ የCloud ሰርቨር ላይ ያስቀምጥልዎታል፦

1. ወደ [Render.com](https://render.com) ወይም [Railway.app](https://railway.app) ይግቡ።
2. **New Web Service** ይምረጡ።
3. የ `fullstack` ፎልደርን በ GitHub Repository በኩል ያገናኙ (ወይም ፎልደሩን Upload ያድርጉ)።
4. የሚከተሉትን ቅንብሮች ያስገቡ፡
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. **Deploy** የሚለውን ይጫኑ!
6. Render በሰከንዶች ውስጥ የራሱን የድረ-ገጽ ሊንክ (ለምሳሌ `https://mines-game.onrender.com`) ይሰጥዎታል። በስልክም በኮምፒውተርም በቀጥታ ይሰራል!

---

## 🌐 አማራጭ 2፡ Frontend እና Backend ለየብቻ መጫን

### ደረጃ 1፡ Backend Server መጫን (Render / VPS)
1. የ `fullstack` ፎልደርን Render ወይም VPS ላይ ያስነሱት። (ለምሳሌ የሰርቨሩ ሊንክ `https://my-mines-server.onrender.com` ይሆናል)።

### ደረጃ 2፡ Frontend መጫን (Vercel / Netlify / cPanel)
1. ወደ [Vercel.com](https://vercel.com) ወይም [Netlify.com](https://netlify.com) ይግቡ።
2. የ `frontend` ፎልደርን drag-and-drop በማድረግ በቀጥታ ይጫኑት (ወይም በGitHub ያገናኙ)።
3. በ Environment Variables ውስጥ፡
   - **Variable Name**: `VITE_WS_ENDPOINT`
   - **Value**: የሰርቨርዎ አድራሻ (ለምሳሌ `https://my-mines-server.onrender.com`)
4. **Publish** የሚለውን ይጫኑ!

---

## 🖥️ አማራጭ 3፡ በራስዎ VPS ሰርቨር (Ubuntu/Debian) ላይ ማስኬድ

በ VPS ላይ በቀጥታ ለማስኬድ፡
```bash
# 1. ወደ fullstack ፎልደር ይግቡ
cd fullstack

# 2. አስፈላጊ የሆኑትን ጥቅሎች ይጫኑ
npm install --omit=dev

# 3. በ PM2 ሰርቨሩ እንዳይዘጋ አስነሱት
npm install -g pm2
pm2 start server.js --name "mines-game"
```
ሰርቨሩ በ Port `4000` (ወይም በ `.env` ላይ ባስቀመጡት Port) ላይ ድረ-ገጹንና ጨዋታውን በአንድ ላይ ያሰራዋል።
