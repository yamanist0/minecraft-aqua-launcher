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

### Overview
**Aqua Launcher** is a lightweight, desktop-first Minecraft launcher. It provides a polished interface for managing modpacks, version control, and custom loader configurations, ensuring a seamless experience for power users. It has a really easy interface to understand. Supports both offline and microsoft accounts.

### Key Features
* **Custom Modpack Management:** Isolated asset folders for per-pack organization.
* **Modrinth Integration:** Fast version resolution for compatible downloads.
* **Persistent Configs:** Intelligent RAM and JVM settings handling.
* **Modern UI/UX:** Desktop-style chrome with native drag support.
* **System Notifications:** Real-time feedback on launch status.
* **App Password Support:** Custom password for launcher to protect your data.
* **Custom Modpacks Adress Support:** Custom modpacks list support with json structure.
* **Built In Server List:** Lists over 7000 servers by player count.
* **Customizable Server List Source:** Custom servers list support with json structure.

Modpacks list is coming from a raw github json file that you can change. You can change, add and remove mods/modpacks without opening the launcher.
Modpack format is really easy to understand its just a json list that contains modrinth links or direct file download links.
Server List uses exact minecraft-mp.com data. You can aslo change the data source. 

---

### Project Structure
```text
├── main.js         # Main process & IPC handlers
├── renderer.js     # UI logic & event handling
├── preload.js      # Secure bridge
├── launcher.html   # Main layout template
├── services/       # Modpack & launcher logic
├── assets/         # Icons & branding
└── build.bat       # Windows packaging script
