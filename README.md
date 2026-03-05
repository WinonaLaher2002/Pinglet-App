# 💬 Pinglet

> *Connect in a Ping.* 💕

A cozy, cute chat application built with vanilla HTML, CSS, and JavaScript — powered by **Firebase** and packaged as a **desktop app with Electron**. Pinglet transforms everyday conversations into warm, delightful moments with its soft aesthetic and heartfelt design.

---

## 🌸 What is Pinglet?

Pinglet (a portmanteau of "ping" + "-let") means **"a tiny, cute message"** — and that's exactly what this app is all about. Designed for people who want their digital conversations to feel as warm and personal as handwritten notes, Pinglet brings cozy vibes to every chat.

---

## ✨ Features

### 🎨 Beautiful Design
- Soft glassmorphism UI with blurred backgrounds and translucent cards
- 10 switchable color themes: **Whitey, Warm, Mink, Gween, Mlue, Meowllow, Murmle, Mrown, Shockoy, Darky**
- Floating emoji animations in the background
- Responsive portrait layout (430×860) locked to a natural phone ratio

### 💬 Chat Experience
- Real-time messaging via Firebase Firestore
- One-on-one and **group chats**
- Leave & rejoin group chats by name
- Add members to existing groups
- Typing indicator with bouncing dots (demo mode)
- Auto-scrolling to newest messages
- Link previews (toggleable)

### 📸 Media Sharing
- Send **photos and videos** directly in chat
- Instant local preview while uploading (optimistic UI)
- Upload progress bar during media transfers
- Media hosted on **Cloudinary**
- Tap images to open in a fullscreen lightbox

### 🎨 Chat Customization
- **Font size slider** (13px – 22px)
- **3 bubble styles**: Rounded, Soft, Sharp
- **6 chat wallpapers**: Default, Stars, Sakura, Mint, Lavender, Sunset

### 👤 Profiles
- Upload a custom profile photo (stored on Cloudinary)
- Profile photo syncs across all active conversations in real time
- Username displayed in chat headers and message sender labels

### 🔒 Account & Safety
- Firebase Email/Password authentication
- Block users (hidden from chat list, cannot be opened)
- Delete a one-on-one conversation from your account
- Demo/offline mode with local simulated replies when Firebase is unavailable

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|------------|
| UI | Vanilla HTML5, CSS3 (custom properties + glassmorphism) |
| Logic | Vanilla JavaScript (ES Modules via dynamic import) |
| Font | [Gaegu](https://fonts.google.com/specimen/Gaegu) (Google Fonts) |
| Realtime DB | Firebase Firestore v10 |
| Auth | Firebase Authentication (Email/Password) |
| Media Storage | Cloudinary (unsigned upload preset) |
| Desktop | Electron (portrait-locked window, cross-platform icons) |

---

## 🚀 Getting Started

### Prerequisites
- Node.js 16+
- npm or yarn
- A Firebase project with Firestore + Email/Password Auth enabled
- A Cloudinary account with an **unsigned upload preset**

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/pinglet.git
   cd pinglet
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Firebase**

   Open `scripts.js` and replace the `firebaseConfig` object with your own project credentials:
   ```js
   const firebaseConfig = {
     apiKey: "YOUR_API_KEY",
     authDomain: "YOUR_PROJECT.firebaseapp.com",
     projectId: "YOUR_PROJECT_ID",
     storageBucket: "YOUR_PROJECT.firebasestorage.app",
     messagingSenderId: "YOUR_SENDER_ID",
     appId: "YOUR_APP_ID"
   };
   ```

4. **Configure Cloudinary**

   In `scripts.js`, set your Cloudinary credentials:
   ```js
   const CLOUDINARY_CLOUD_NAME = 'your_cloud_name';
   const CLOUDINARY_UPLOAD_PRESET = 'your_unsigned_preset';
   ```

5. **Run in the browser**

   Simply open `index.html` in your browser, or serve it locally:
   ```bash
   npx serve .
   ```

6. **Run as a desktop app**
   ```bash
   npm run electron
   # or
   npx electron .
   ```

---

## 📂 Project Structure

```
pinglet/
├── assets/
│   ├── header.png        # Pinglet logo
│   ├── icon.ico          # Windows app icon
│   ├── icon.icns         # macOS app icon
│   └── icon.png          # Linux / fallback icon
├── index.html            # Main UI (all screens)
├── styles.css            # Themes, components, animations
├── scripts.js            # All app logic (Firebase, chat, settings)
├── main.js               # Electron main process
├── preload.js            # Electron preload (optional, for security)
├── package.json
└── README.md
```

---

## 🖥 Electron Details

Pinglet runs as a **portrait-locked desktop window** (430×860) using Electron. Key behaviors:

- `autoHideMenuBar: true` — clean, app-like feel
- `setAspectRatio()` — maintains phone proportions on resize
- Platform-aware icons: `.ico` on Windows, `.icns` on macOS, `.png` on Linux
- macOS dock icon is set programmatically on launch
- Window re-creates on macOS when the dock icon is clicked (standard macOS behavior)

---

## 🌈 Color Themes

| Theme | Key | Vibe |
|-------|-----|------|
| Whitey | `default` | Neutral warm gray |
| Warm | `warm` | Peachy sunset tones |
| Mink | `mink` | Soft dusty rose 🌸 |
| Gween | `green` | Earthy olive & lime |
| Mlue | `mlue` | Sky & aqua |
| Meowllow | `yellow` | Sunny golden hour |
| Murmle | `purple` | Dreamy violet |
| Mrown | `brown` | Dark mocha (dark mode-ish) |
| Shockoy | `shockoy` | Teal & emerald |
| Darky | `black` | True dark mode 🌙 |

---

## 🔮 Roadmap

- [ ] Push notifications
- [ ] Message reactions (hearts, stars)
- [ ] Read receipts (double-check marks)
- [ ] Voice messages
- [ ] Message search
- [ ] Seasonal wallpaper packs
- [ ] End-to-end encryption
- [ ] Export / backup chat history

---

## 🤝 Contributing

Contributions are welcome as long as they preserve Pinglet's cozy, user-first philosophy!

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes with care and attention to the aesthetic
4. Commit: `git commit -m 'Add your feature'`
5. Push: `git push origin feature/your-feature`
6. Open a Pull Request with a description of what you built

**Guidelines:** Keep soft colors, smooth animations, readable code, and mobile-first thinking.

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 📞 Contact

- **Developer:** Winona B. Laher
- **Email:** laherwinonab@gmail.com
- **Portfolio:** [winonablaherportfolio.42web.io](https://winona-s-portfolio.vercel.app/)

---

<div align="center">

**Made with 💖 by someone who believes every message should spark joy**

*Pinglet v1.0 — Where every ping feels special* ✨

[⬆ Back to Top](#-pinglet)

</div>
