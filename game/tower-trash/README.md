# Tower Dash - የጨዋታው ማሰማሪያ ጥቅል (Deployment Packages)

ይህ ፎልደር ምንም ዓይነት `node_modules` ወይም ከባድ ፋይሎች የሌሉበት፣ በቀጥታ ኢንተርኔት ላይ deploy ለማድረግ የተዘጋጀ ንፁህ ማህደር ነው።

---

## 📦 የማሰማሪያ አማራጮች (Deployment Options)

### አማራጭ 1፡ FullStack_App_Single_Server (ይህ ይመረጣል - Recommended ⭐)
**አንድ ላይ ፍሮንት-ኤንድ እና ባክ-ኤንድ ሰርቨርን በአንድ ፖርት የሚያሰማራ ሙሉ ፓኬጅ**
- **ምን ይዟል?**
  - `dist/` — የተጠናቀረ የባክ-ኤንድ ኖድ ሰርቨር (Express + Socket.IO + Game Logic)
  - `public/` — የተጠናቀረ ፍሮንት-ኤንድ ጨዋታ (Vite + React HTML, CSS, JS, Audio, Images)
  - `package.json` — ለፕሮዳክሽን የሚያስፈልጉ ጥቂት ዲፔንደንሲዎች ብቻ
  - `Dockerfile` እና `docker-compose.yml` — ለዶከር ማሰማሪያ
  - `FullStack_App_Single_Server.zip` — በቀጥታ አፕሎድ የሚደረግ ዚፕ ፋይል
- **የት deploy ይደረጋል?**
  - **Render.com** (Web Service — በጣም ቀላልና ነፃ)
  - **Railway.app** (1-click deploy)
  - **Koyeb.com**
  - **Fly.io** ወይም **DigitalOcean App Platform**
  - **ማንኛውም VPS / Cloud Server** (Ubuntu / Debian / CentOS በ Docker ወይም PM2)

#### 🚀 በ Render / Railway / VPS ላይ እንዴት deploy ይደረጋል?
1. ዚፑን ይክፈቱ ወይም ፎልደሩን ወደ GitHub ፑሽ ያድርጉ።
2. በ **Render.com** ላይ **New Web Service** የሚለውን ይጫኑ።
3. የማስጀመሪያ ትእዛዞች (Commands):
   - **Build Command**: `npm install --omit=dev`
   - **Start Command**: `npm start`
4. ጨዋታው በራሱ ሊንክ (URL) በቀጥታ መስራት ይጀምራል!

---

### አማራጭ 2፡ Frontend_Static_Only
**የፍሮንት-ኤንድ ጨዋታውን ብቻ ለብቻ በ Static Hosting ለማሰማራት**
- **ምን ይዟል?**
  - `index.html`
  - `assets/` (ምስሎች፣ ድምጾች፣ የጨዋታው ኮድ)
  - `vercel.json` (ለ Vercel ማሰማሪያ)
  - `_redirects` (ለ Netlify / Cloudflare Pages ማሰማሪያ)
  - `Frontend_Static_Only.zip` — በቀጥታ ድራግ እና ድሮፕ የሚደረግ ዚፕ
- **የት deploy ይደረጋል?**
  - **Vercel** (Drag & Drop ወይም Git)
  - **Netlify** (Drag & Drop folder)
  - **Cloudflare Pages**
  - **cPanel File Manager** (በቀጥታ `public_html` ውስጥ በመዘርጋት)

---

## ⚡ ማስታወሻ
- በሁለቱም ማህደሮች ውስጥ ምንም ዓይነት `node_modules` የለም።
- የፍሮንት-ኤንድ ሶኬት ኮኔክሽን `window.location.origin` በመጠቀም በራስ-ሰር ከአስተናጋጁ ሰርቨር ጋር ይገናኛል።
