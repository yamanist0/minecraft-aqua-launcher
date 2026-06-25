<div align="center">
  <img src="assets/icon.svg" width="100" />
  <h1>Aqua Launcher</h1>
  <p><strong>Lightweight & Polished Minecraft Launcher built with Electron.</strong></p>
  
  <br>
  
  <img src="https://img.shields.io/badge/Electron-20232a.svg?style=for-the-badge&logo=electron&logoColor=61DAFB" />
  <img src="https://img.shields.io/badge/Node.js-339933.svg?style=for-the-badge&logo=node.js&logoColor=white" />
  <img src="https://img.shields.io/badge/Minecraft-5C722D.svg?style=for-the-badge&logo=minecraft&logoColor=white" />
  <img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" />
</div>

---

### 📋 Overview
**Aqua Launcher** is a lightweight, desktop-first Minecraft launcher. It provides a polished interface for managing modpacks, version control, and custom loader configurations, ensuring a seamless experience for power users.

### 🚀 Key Features
* **Custom Modpack Management:** Isolated asset folders for per-pack organization.
* **Modrinth Integration:** Fast version resolution for compatible downloads.
* **Persistent Configs:** Intelligent RAM and JVM settings handling.
* **Modern UI/UX:** Desktop-style chrome with native drag support.
* **System Notifications:** Real-time feedback on launch status.

---

### 📂 Project Structure
```text
├── main.js         # Main process & IPC handlers
├── renderer.js     # UI logic & event handling
├── preload.js      # Secure bridge
├── launcher.html   # Main layout template
├── services/       # Modpack & launcher logic
├── assets/         # Icons & branding
└── build.bat       # Windows packaging script
