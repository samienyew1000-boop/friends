# Habesha Games - Mobile Mini App UI

A high-fidelity, responsive mobile mini-app UI built for **Habesha Games** (Ethiopian gaming & betting mini-app platform).

Designed to run seamlessly inside **Telegram Mini Apps (TMA)**, mobile browsers, and desktop web previews.

![Habesha Games Preview](assets/hero_banner_1.jpg)

## ✨ Features

- **Pixel-Matched Mobile Viewport**: Optimized for 390px–430px smartphone screens with sticky headers, native frosted bottom dock navigation, and iOS-style home indicators.
- **Top Bar & Dynamic Balance**:
  - Crowned Lion Habesha Games logo.
  - Interactive balance pill with `0.00 ETB` currency, refresh spin animation, and balance visibility toggle (`👁️`).
  - "+ Deposit" action button.
- **Coupon Redemption Banner**:
  - Shimmer effect gradient card with watermark gift graphic.
  - Interactive Redeem Coupon modal with instant promo code validation and balance credit (`HABESHA100`, `VICTORY2026`, `WELCOME`).
- **Hero Carousel Banner**:
  - Features the authentic Ethiopian Habesha Games "የድል ጊዜ" (Time of Victory) banner with Jebena coffee ceremony, cash counting machine, and Birr banknotes.
  - 4-slide carousel with touch swipe gestures, left/right nav controls, and animated progress pill indicators.
- **Featured Games Grid (3 Columns)**:
  - 9 Top-rated Ethiopian games: **Aviator** (Spribe), **Fast Keno**, **JetX**, **Rocket Star**, **Aviafly**, **Fish Road**, **Chicken Road**, **Dallol Bingo**, and **Golden Plinko**.
  - Favorite star toggle with local persistence.
  - Category filters (`All`, `Crash`, `Instant`, `Favorites`).
- **Interactive Game Simulator & Sound Engine**:
  - Click any game card to launch the demo mode.
  - Embedded crash flight simulator with rising multiplier (`1.00x... 4.50x... Cash Out`).
  - Offline synthesized retro audio effects using the Web Audio API.
- **Local Ethiopian Payment Methods (Deposit Modal)**:
  - Telebirr (official logo)
  - Commercial Bank of Ethiopia (CBE Birr)
  - M-Pesa Safaricom
  - Awash Birr
  - Quick amount selectors (`50`, `100`, `200`, `500`, `1,000`, `2,500` ETB).
- **Telegram Mini App SDK**:
  - Haptic feedback support (`Telegram.WebApp.HapticFeedback`).
  - Auto-expand to full screen (`Telegram.WebApp.expand()`).
  - Dark mode header coloring.

---

## 🚀 Getting Started

### Local Preview

You can run a local preview using Python's built-in HTTP server:

```bash
# In the project directory
python -m http.server 8000
```

Then open your browser at:
```
http://localhost:8000
```

Or simply open `index.html` directly in any modern browser!

---

## 📂 Project Structure

```
friends/
├── assets/
│   ├── logo.jpg               # Crowned Lion logo
│   ├── hero_banner_1.jpg      # Habesha Games hero banner
│   ├── banner_2.jpg           # Carousel slide 2
│   ├── banner_3.jpg           # Carousel slide 3
│   ├── banner_4.jpg           # Carousel slide 4
│   ├── game_aviator.gif       # Aviator (Spribe) [Animated GIF]
│   ├── game_fast_keno.gif     # Fast Keno 80 [Animated GIF]
│   ├── game_jetx.png          # JetX
│   ├── game_rocket_star.png   # Rocket Star
│   ├── game_aviafly.png       # Aviafly
│   ├── game_fish_road.png     # Fish Road
│   ├── telebirr.png           # Telebirr payment logo
│   └── mpesa.jpg              # M-Pesa payment logo
├── index.html                 # Main mobile mini-app markup
├── app.css                    # Glassmorphism, animations, styles
├── app.js                     # Interactive logic, audio, modals, carousel
└── README.md                  # Project documentation
```

---

## 📱 Telegram Mini App Configuration

To connect this mini-app to a Telegram Bot:
1. Open [@BotFather](https://t.me/BotFather) on Telegram.
2. Select your bot or create a new one with `/newbot`.
3. Select `/newapp` to create a Web App.
4. Set the Web App URL to your hosted repository link (e.g. GitHub Pages: `https://<username>.github.io/friends/`).
5. Set the short name to launch the mini-app inside Telegram!
