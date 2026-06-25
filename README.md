<section>
  <header>
    <h1 style="font-size: 2.4rem; margin-bottom: 0.25rem;">Aqua Launcher</h1>
    <p style="font-size: 1rem; color: #cbd5e1; max-width: 52rem; line-height: 1.7;">
      A polished Electron-based Minecraft launcher with integrated modpack management, Modrinth resolution, multiplayer discovery, and a modern Windows packaging workflow.
    </p>
  </header>

  <section style="margin-top: 2rem;">
    <h2 style="font-size: 1.5rem; margin-bottom: 0.75rem;">Why Aqua Launcher?</h2>
    <div style="display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));">
      <article style="background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 1rem; padding: 1rem;">
        <h3 style="margin-bottom: 0.5rem;">Modpack-first workflow</h3>
        <p style="margin: 0; color: #cbd5e1;">Supports per-pack storage so each modpack keeps its own loader, mods, and configuration without polluting your main Minecraft folder.</p>
      </article>
      <article style="background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 1rem; padding: 1rem;">
        <h3 style="margin-bottom: 0.5rem;">Modrinth-ready resolution</h3>
        <p style="margin: 0; color: #cbd5e1;">Automatically resolves Modrinth assets and compatible versions for fast, reliable mod downloads.</p>
      </article>
      <article style="background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 1rem; padding: 1rem;">
        <h3 style="margin-bottom: 0.5rem;">Integrated server browser</h3>
        <p style="margin: 0; color: #cbd5e1;">Multiplayer server discovery with live cards, copy-to-clipboard IP support, and animated UI flow.</p>
      </article>
      <article style="background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 1rem; padding: 1rem;">
        <h3 style="margin-bottom: 0.5rem;">Windows installer support</h3>
        <p style="margin: 0; color: #cbd5e1;">Builds with Electron Builder and NSIS for a smooth Windows install experience.</p>
      </article>
    </div>
  </section>

  <section style="margin-top: 2rem;">
    <h2 style="font-size: 1.5rem; margin-bottom: 0.75rem;">Features</h2>
    <ul style="display: grid; gap: 0.75rem; padding-left: 1.25rem; color: #cbd5e1;">
      <li>Custom modpack selection with home carousel and quick install flow</li>
      <li>Per-pack storage isolation for mods, loader versions, and Minecraft versions</li>
      <li>Smooth home page transitions and staggered load animations</li>
      <li>Settings page with launcher password protection and server list configuration</li>
      <li>Built-in launch status panel, notifications toggle, and progress tracking</li>
      <li>Responsive Electron UI with custom titlebar controls and drag support</li>
    </ul>
  </section>

  <section style="margin-top: 2rem;">
    <h2 style="font-size: 1.5rem; margin-bottom: 0.75rem;">Getting Started</h2>
    <ol style="padding-left: 1.25rem; color: #cbd5e1;">
      <li>Install dependencies: <code style="background: rgba(148, 163, 184, 0.12); padding: 0.15rem 0.3rem; border-radius: 0.4rem;">npm install</code></li>
      <li>Run the launcher: <code style="background: rgba(148, 163, 184, 0.12); padding: 0.15rem 0.3rem; border-radius: 0.4rem;">npm start</code></li>
      <li>Open Settings to configure modpack catalog URLs, server list source, and RAM limits</li>
      <li>Select a modpack, install it, then click PLAY</li>
    </ol>
  </section>

  <section style="margin-top: 2rem;">
    <h2 style="font-size: 1.5rem; margin-bottom: 0.75rem;">Build for Windows</h2>
    <p style="margin: 0 0 1rem 0; color: #cbd5e1;">Package the launcher as a Windows installer using the supplied Electron Builder configuration.</p>
    <pre style="background: rgba(15, 23, 42, 0.95); border: 1px solid rgba(148, 163, 184, 0.2); padding: 1rem; border-radius: 1rem; overflow-x: auto;"><code>npm run build
# or
build.bat</code></pre>
  </section>

  <section style="margin-top: 2rem;">
    <h2 style="font-size: 1.5rem; margin-bottom: 0.75rem;">Project Layout</h2>
    <div style="display: grid; gap: 1rem;">
      <div style="background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 1rem; padding: 1rem;">
        <h3 style="margin-bottom: 0.5rem;">Core files</h3>
        <ul style="margin: 0; padding-left: 1.25rem; color: #cbd5e1;">
          <li><code>main.js</code> — Electron main process, window configuration, IPC and menu handling</li>
          <li><code>renderer.js</code> — Renderer-side UI logic, animations, view switching, and event binding</li>
          <li><code>launcher.html</code> — HTML shell for the launcher UI and page structure</li>
          <li><code>preload.js</code> — Exposes secure APIs from Electron to the renderer</li>
        </ul>
      </div>
      <div style="background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 1rem; padding: 1rem;">
        <h3 style="margin-bottom: 0.5rem;">Support files</h3>
        <ul style="margin: 0; padding-left: 1.25rem; color: #cbd5e1;">
          <li><code>services/</code> — Modpack loader, Modrinth resolver, server browser, and launcher services</li>
          <li><code>assets/</code> — Icons, background art, and launcher imagery</li>
          <li><code>build.bat</code> — Windows packaging helper script</li>
          <li><code>package.json</code> — Dependencies, scripts, and Electron Builder settings</li>
        </ul>
      </div>
    </div>
  </section>

  <section style="margin-top: 2rem;">
    <h2 style="font-size: 1.5rem; margin-bottom: 0.75rem;">Quick Tips</h2>
    <ul style="padding-left: 1.25rem; color: #cbd5e1;">
      <li>Use the home page carousel to select modpacks quickly.</li>
      <li>Enable a launcher password in Settings for extra protection.</li>
      <li>Update server list JSON URL to use your own multiplayer source.</li>
      <li>When packaging, confirm `electron-builder` is installed and your node_modules are current.</li>
    </ul>
  </section>

  <footer style="margin-top: 2rem; padding-top: 1rem; border-top: 1px solid rgba(148, 163, 184, 0.15); color: #94a3b8; font-size: 0.95rem;">
    <p style="margin: 0;">Aqua Launcher is released under the MIT License.</p>
  </footer>
</section>
