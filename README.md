<!-- Improved compatibility of back to top link: See: https://github.com/othneildrew/Best-README-Template/pull/73 -->
<a id="readme-top"></a>

[![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![Unlicense License][license-shield]][license-url]

<br />
<div align="center">
  <img src="assets/icon.svg" alt="Aqua Launcher Logo" width="120" height="120">

  <h3 align="center">Aqua Launcher</h3>

  <p align="center">
    A premium, high-performance Minecraft launcher powered by Electron.
    <br />
    <a href="#about-the-project"><strong>Explore the architecture »</strong></a>
    <br />
    <br />
    <a href="#getting-started">Getting Started</a>
    &middot;
    <a href="#usage">Usage Guidelines</a>
    &middot;
    <a href="#page-architecture">Page Previews</a>
  </p>
</div>

<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#built-with">Built With</a></li>
        <li><a href="#core-mechanics">Core Mechanics</a></li>
      </ul>
    </li>
    <li>
      <a href="#page-architecture">Page Architecture</a>
      <ul>
        <li><a href="#home-menu">Home Menu</a></li>
        <li><a href="#modpacks-menu">Modpacks Menu</a></li>
        <li><a href="#multiplayer-menu">Multiplayer Menu</a></li>
        <li><a href="#settings-menu">Settings Menu</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
      </ul>
    </li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
  </ol>
</details>

## About The Project

[![Aqua Launcher Overview Screenshot][product-screenshot]](https://github.com/yamanist0/minecraft-aqua-launcher)

Aqua Launcher A custom, standalone and highly optimised Minecraft launcher made with Electron & web technologies, designed to replace current launchers by deeply integrating with all world modpack repositories, isolating its own local storage & being buttery smooth to navigate.

Whereas other launchers litter your root Minecraft install with files, Aqua Launcher is designed to leverage isolated environment deployments per modpack instance to provide a clean separation of save states, mod files, Minecraft configuration files, and any other mod dependencies. Aqua Launcher employs heavy use of caching, and dynamically manipulated DOM to simulate the feeling of native application performance, and uses custom proxies to circumvent API rate limitations imposed on CurseForge and Modrinth.

### Built With

* [![Electron][Electron-badge]][Electron-url]
* [![TailwindCSS][Tailwind-badge]][Tailwind-url]
* [![Node.js][Node-badge]][Node-url]

### Core Mechanics

The idea at the heart of Aqua Launcher: a modular, asynchronous interaction pattern between the background Node process and the Chromium sandbox.

**Inter-Process Communication:** The pre-loaded scripts coordinate protected streams between the front-end UI and core framework, exposing only essential file-system and networking directives to the render layer.
**Authentication:** Includes dedicated module for official Microsoft Xbox Live handshakes for reliable acquisition of authorization tokens and encrypted offline space.
**Dynamic Resolution:** Modrinth & CurseForge resource management is made possible through Cloudflare Worker proxies designed to sanitize REST input and overcome rigid CORS requirements, permitting clients to resolve manifest types on the fly and stream content to a local download core.
**Liquid Animations:** Strictly utilizes Tailwind utility toggles directly tied into the CSS class names, ensuring non-blocking scale, opacity, and transform operations within the main navigation flow and prevent nasty re-flow reflow bugs.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Page Architecture
Aqua Launcher separate content from hardware into standard HTML partition blocks in the one environment and dynamically rendered the frames to reduce overhead with hardware loading. The below will a detail observation of application pages.

### Home Menu

[![Home Menu Screenshot][home-screenshot]](https://github.com/yamanist0/minecraft-aqua-launcher)

The Home Menu functions as the client's remote command center. Asynchronous loops will be spun up to hit both local persistent profiles and separate remote APIs for the creation of the discovery panels post-login.

* **Modpack Explorer Carousel:** Showcases prioritized content items immediately in addition to a horizontal flex container. Cards display a proactive structural cover reveal system for mitigating a reflow when unadulterated stream information resolves.
* **Live Server Highlights:** Brings live servers together through stream analysis with native JSON consumption and directly injecting public connections to establish immediate direct play quick-select.
* **News Aggregator:** Harvests the latest patch data on game changes, core system enhancements and social communications whether regionally cached or remotely sourced on two identical timeline columns.
* **Persistent State Navigation:** The identical session parameter information including ram usage parameters are permanently stored into the principal variables on exit for the minimal touch bottom command line.

### Modpacks Menu

[![Modpacks Menu Screenshot][modpacks-screenshot]](https://github.com/yamanist0/minecraft-aqua-launcher)

Module which manages the actual fetch of custom engine states, and the locale-based rendering and index-mapping of these custom engine states.

* **Four-Tier Architecture:** Seamless tab logic iteratively cycles the application query across Installed Archives, Custom Catalogs, Modrinth Repositories, and the external CurseForge ecosystem.
* **Intelligent File Scaffolding:** Utilises custom unpack procedures leveraging adm-zip to process both .mrpack architecture arrays and standard zips equally on the node.
* **Search and Filter Dynamics:** An input sensing protocol tied to native debouncing identifies exhaustion. This triggers secured backend calls producing faceted category information without impact on rigid application state.
* **State Masking:** Unidentified, remote library nodes inject transmissive data flags. States are seamlessly transitionated into bounded conditions directing file operations through to installation ending.

### Multiplayer Menu

[![Multiplayer Menu Screenshot][multiplayer-screenshot]](https://github.com/yamanist0/minecraft-aqua-launcher)

A specially implemented IP registry for Optimized Discovery Grid parsing can be automatically configured to parse external hub references.

* Asynchronously pings remote Java Edition servers beyond each interval, rendering server densities and playercounts on interactive cards.
* Automatically records each individual network node's onClick event and writes each of its associated IP address into your OS clipbaord, displaying localized toast messages on click.
* Automatically mathematically slices long network arrays to allow them to dynamically load as much lessDOM is stored in memory at any one time.

### Settings Menu

[![Settings Menu Screenshot][settings-screenshot]](https://github.com/yamanist0/minecraft-aqua-launcher)

This is a secured area where the logic governing how the backend node daemon processes commands is highly regulated and has rigid controls placed on it.

* **Access to Authentication Gate Control:** Bound by an animated screen gate requiring secondary authentication prior to entrance (if configured).
* **Access to Proxy Binding Configuration:** Sends direct override requests pertaining to CurseForge domain fetch proxies, maintains the usage of your preferred alternative infrastructure through this capability.
* **Access to Java Virtual Machine Arbiters:** Sends direct unconstrained string arguments that bind directly to sub process initiation modules, facilitating control over deep systems ranging from external hardware acceleration settings to raw native garbage compilation.
* **Access to Volatile Memory Controls:** Realtime arbitrary range bindings that are directly tethered to your master system file (settings.json), modifying arbitrary boundary conditions prior to processes are spawned.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Getting Started

To operate or compile the Aqua Launcher base locally, initialize the Node development ecosystem parameters over your terminal.

### Prerequisites

You must execute commands utilizing native NPM standards.
* npm
  ```sh
  npm install npm@latest -g
  ```

### Installation

1. Set your Cloudflare Worker endpoints that relate to your CurseForge parameters (native instances use default placeholder values inside settings).
2. Clone the core repository locally.
   ```sh
   git clone https://github.com/yamanist0/minecraft-aqua-launcher.git
   ```
3. Parse master requirements and fetch modules using standard npm conventions.
   ```sh
   npm install
   ```
4. Sub-launch the development build wrapper.
   ```sh
   npm start
   ```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Usage

Aqua Launcher relies completely onto `launcher-service.js` logic handlers which maintain overarching application isolation schemas. 

1. **Authentication Sequences:** Enable offline parameter bypass or query standard tokens through Microsoft directly in house, no need to be redirecting in the browser with strings.
2. **Dynamic Dependency Selection:** Throw modals in the mix that would be capable of parsing out Vanilla parameters with respective Forge and Fabric arrays in the arrays independently via targeted meta networks so we can be avoiding standard chromium rendering visibility conflicts over top of the absolute position of any element layout we need.
3. **Execution Sequences:** Command strings via direct localized meta checks run specifically across .minecraft/versions architectures loops. Running through our isolated local directory mappings instead of anything breaking the native save locations.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Roadmap

- [x] Microsoft backend authorizations to map to Xbox live directly.
- [x] Internal modpack abstraction merging of network endpoints on the local files.
- [x] Internal rendering state triggers for rendering a rigid skeletonmaskingloop to localfiles.
- [x] Integrated and fine tuned controls replacing framework class with scale behavior dynamically.
- [ ] Infinite scroll parsing logic against the chronical notification list.
- [ ] integrated Java installing to provide a fallback to JVM mismatches.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Contributing

1. Fork the Environment Sequence
2. Establish your Feature Tracking Context (`git checkout -b feature/Optimization`)
3. Committing Local Branches (`git commit -m 'Implement optimized routing arrays'`)
4. Direct Stream Overrides (`git push origin feature/Optimization`)
5. Finalize Pull Configurations

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## License

Distributed locally identifying as standard MIT architectures.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Contact

Project Link: [https://github.com/yamanist0/minecraft-aqua-launcher](https://github.com/yamanist0/minecraft-aqua-launcher)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

[contributors-shield]: https://img.shields.io/github/contributors/yamanist0/minecraft-aqua-launcher.svg?style=for-the-badge
[contributors-url]: https://github.com/yamanist0/minecraft-aqua-launcher/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/yamanist0/minecraft-aqua-launcher.svg?style=for-the-badge
[forks-url]: https://github.com/yamanist0/minecraft-aqua-launcher/network/members
[stars-shield]: https://img.shields.io/github/stars/yamanist0/minecraft-aqua-launcher.svg?style=for-the-badge
[stars-url]: https://github.com/yamanist0/minecraft-aqua-launcher/stargazers
[issues-shield]: https://img.shields.io/github/issues/yamanist0/minecraft-aqua-launcher.svg?style=for-the-badge
[issues-url]: https://github.com/yamanist0/minecraft-aqua-launcher/issues
[license-shield]: https://img.shields.io/github/license/yamanist0/minecraft-aqua-launcher.svg?style=for-the-badge
[license-url]: https://github.com/yamanist0/minecraft-aqua-launcher/blob/main/LICENSE
[product-screenshot]: images/screenshot.png
[home-screenshot]: images/home-screenshot.png
[modpacks-screenshot]: images/modpacks-screenshot.png
[multiplayer-screenshot]: images/multiplayer-screenshot.png
[settings-screenshot]: images/settings-screenshot.png
[Electron-badge]: https://img.shields.io/badge/Electron-191970?style=for-the-badge&logo=Electron&logoColor=white
[Electron-url]: https://www.electronjs.org/
[Tailwind-badge]: https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white
[Tailwind-url]: https://tailwindcss.com/
[Node-badge]: https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white
[Node-url]: https://nodejs.org/ 
