const state = {
  loader: 'fabric',
  mcVersion: '1.20.4',
  loaderVersion: null,
  memory: 8,
  account: null,
  launching: false,
  versions: [],
  activeModpack: null,
  installedModpacks: {},
  settings: null,
  mpPage: 1,
  mpTotalPages: 1,
  homeModpacks: [],
  homeServers: [],
  homeDataLoaded: false,
  homeDataLoading: false,
  mpTab: 'installed',
  mpSearchQuery: '',
  mrPage: 1,
  cfPage: 1,
  mpServerSearchQuery: '',
};

const PROGRESS_LABELS = {
  assets: 'Downloading assets',
  'assets-copy': 'Copying assets',
  natives: 'Downloading natives',
  classes: 'Downloading libraries',
  'classes-custom': 'Downloading libraries',
  'classes-maven-custom': 'Downloading libraries',
  'version-jar': 'Downloading Minecraft',
  'asset-json': 'Preparing assets',
  'client-package': 'Extracting files',
  forge: 'Installing Forge',
};

const downloadProgress = {
  phase: '',
  percent: 0,
  lastUiUpdate: 0,
};

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function serverDomId(ip) {
  return ip.replace(/[^a-zA-Z0-9]/g, '-');
}

function scrollCarousel(id, direction = 1) {
  const container = $(id);
  if (!container) return;
  const amount = container.clientWidth || 400;
  container.scrollBy({ left: amount * direction, behavior: 'smooth' });
}

function scrollViewToTop(id) {
  const view = $(id);
  if (!view) return;
  requestAnimationFrame(() => {
    view.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
  });
}

function scrollActiveModpackPanelIntoView() {
  const panel = $('active-modpack-panel');
  const container = $('view-home-content');
  if (!panel || panel.classList.contains('hidden') || !container) return;
  requestAnimationFrame(() => {
    const offset = panel.offsetTop - 24;
    container.scrollTo({ top: Math.max(offset, 0), left: 0, behavior: 'smooth' });
  });
}

function revealStaggered(container, delayStep = 40, initialDelay = 30) {
  if (!container) return;
  const items = Array.from(container.children);
  items.forEach((item, index) => {
    item.classList.add('stagger-card');
    item.style.transitionDelay = `${initialDelay + index * delayStep}ms`;
    item.classList.remove('visible');
    window.setTimeout(() => item.classList.add('visible'), initialDelay + index * delayStep);
  });
}

function revealSlideLeft(container, delayStep = 40, initialDelay = 30) {
  if (!container) return;
  const items = Array.from(container.children);
  if (!items.length) return;
  items.forEach((item, index) => {
    item.classList.add('slide-card');
    item.classList.remove('visible');
    item.style.transitionDelay = `${initialDelay + index * delayStep}ms`;
  });

  window.requestAnimationFrame(() => {
    items.forEach((item, index) => {
      window.setTimeout(() => item.classList.add('visible'), initialDelay + index * delayStep);
    });
  });
}

/**
 * Fade-in and slide-up all static `.page-ui` elements inside `viewId`.
 * Call this after switching to a view. Elements are reset first so
 * they replay the animation on every navigation.
 */
function revealPageUI(viewId, baseDelay = 30, stepDelay = 40) {
  const view = $(viewId);
  if (!view) return;
  const items = Array.from(view.querySelectorAll('.page-ui'));
  items.forEach(el => {
    el.classList.remove('visible');
  });
  requestAnimationFrame(() => {
    items.forEach((el, idx) => {
      const delay = baseDelay + idx * stepDelay;
      el.style.transitionDelay = `${delay}ms`;
      window.setTimeout(() => el.classList.add('visible'), delay);
    });
  });
}

function renderHomeModpackCarousel(modpacks) {
  const container = $('home-modpack-scroller');
  if (!container) return;
  container.innerHTML = '';

  if (!modpacks.length) {
    container.innerHTML = '<div class="glass-card rounded-2xl p-6 min-w-[260px] text-on-surface-variant">No modpacks available. Check settings or refresh.</div>';
    return;
  }

  for (let i = 0; i < modpacks.length; i += 1) {
    const pack = modpacks[i];
    const sourceStr = pack.source ? pack.source.toUpperCase() : 'UNKNOWN';
    const card = document.createElement('div');
    card.className = 'glass-card rounded-2xl p-3 min-w-[220px] max-w-[240px] min-h-[140px] flex flex-col justify-between gap-2 hover:bg-white/10 transition-all cursor-pointer border border-white/10 slide-card';
    card.innerHTML = `
      <div class="flex-1">
        <h3 class="font-headline-md text-lg font-bold text-on-surface mb-1 line-clamp-2">${escapeHtml(pack.name || pack.title || pack.folder)}</h3>
        <p class="text-[12px] text-on-surface-variant leading-snug line-clamp-3" title="${escapeHtml(pack.description || '')}">${escapeHtml(pack.description || 'No description available.')}</p>
      </div>
      <div class="flex flex-col gap-1 mt-auto text-[10px]">
        <div class="flex justify-between items-center bg-white/5 p-1 px-2 rounded">
           <span class="text-primary font-bold uppercase tracking-widest text-[9px]">${escapeHtml(sourceStr)}</span>
        </div>
      </div>
    `;
    card.style.transitionDelay = `${i * 45 + 50}ms`;
    window.setTimeout(() => card.classList.add('visible'), i * 45 + 50);
    card.onclick = () => {
      const loaderParts = (pack.modLoaders && pack.modLoaders[0]) ? pack.modLoaders[0].split('-') : [];
      const loader = loaderParts.length ? loaderParts[0] : (pack.loader || 'fabric').toLowerCase();
      const mcVersion = pack.mcVersion || pack.minecraftVersion || 'Latest';
      
      if (pack.source === 'installed' || pack.source === 'catalog') {
          state.activeModpack = pack;
          state.loader = loader;
          if (mcVersion !== 'Latest') state.mcVersion = mcVersion;
          if (loaderParts.length > 1) {
              state.loaderVersion = loaderParts.slice(1).join('-');
          } else if (pack.loaderVersion) {
              state.loaderVersion = pack.loaderVersion;
          }

          setLoaderTab(state.loader);
          updateVersionUI();
          updateActiveModpackUI();
          setStatus('Modpack Selected', `Ready to play ${pack.name}`);
          scrollViewToTop('view-home-content');
      } else {
          $('nav-modpacks').click();
          setMpTab(pack.source);
          if (pack.source === 'modrinth') {
              openModpackVersionModal('modrinth', pack.project_id || pack.slug, pack.name, pack.icon_url, pack.description);
          } else {
              openModpackVersionModal('curseforge', pack.id, pack.name, pack.logo?.url, pack.summary);
          }
      }
    };
    container.appendChild(card);
  }

  const viewAllCard = document.createElement('div');
  viewAllCard.className = 'glass-card rounded-2xl p-4 min-w-[220px] max-w-[240px] flex flex-col items-center justify-center gap-2 hover:bg-white/10 transition-all cursor-pointer border border-white/10 slide-card text-center';
  viewAllCard.innerHTML = `
      <div class="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-2">
         <span class="material-symbols-outlined text-[32px] text-primary">arrow_forward</span>
      </div>
      <h3 class="font-headline-md text-lg font-bold text-on-surface">View All Packs</h3>
      <p class="text-[12px] text-on-surface-variant">See all available modpacks</p>
  `;
  viewAllCard.onclick = () => {
      $('nav-modpacks').click();
      setMpTab('installed');
  };
  container.appendChild(viewAllCard);
}

function renderHomeServerCarousel(servers) {
  const container = $('home-server-scroller');
  if (!container) return;
  container.innerHTML = '';

  if (!servers.length) {
    container.innerHTML = '<div class="glass-card rounded-2xl p-6 min-w-[260px] text-on-surface-variant">No servers available. Check settings or refresh.</div>';
    return;
  }

  for (let i = 0; i < servers.length; i += 1) {
    const server = servers[i];
    const card = document.createElement('div');
    card.className = 'glass-card rounded-2xl p-3 min-w-[220px] max-w-[240px] min-h-[80px] max-h-[200px] flex flex-col justify-between gap-1 hover:bg-white/10 transition-all cursor-pointer border border-white/10 slide-card';
    card.innerHTML = `
      <div>
        <h3 class="font-headline-md text-lg font-bold text-on-surface mb-1 truncate" title="${escapeHtml(server.name)}">${escapeHtml(server.name)}</h3>
        <p class="text-[10px] text-on-surface-variant uppercase tracking-[0.12em] mb-2">${escapeHtml(server.ip)}</p>
        <p class="text-[12px] text-on-surface-variant leading-snug line-clamp-3" title="${escapeHtml(server.description || '')}">${escapeHtml(server.description || 'No server description available.')}</p>
      </div>
      <div class="grid grid-cols-2 gap-2 mt-2 text-[10px] text-on-surface-variant">
        <div class="px-2 py-0.5 rounded-2xl bg-white/5 flex flex-col items-start gap-0.5 w-full">
          <span class="leading-tight text-[10px]">Players</span>
          <span class="font-bold text-on-surface leading-tight text-[12px] block w-full truncate">${escapeHtml(server.players || 'N/A')}</span>
        </div>
        <div class="px-2 py-0.5 rounded-2xl bg-white/5 flex flex-col items-start gap-0.5 w-full">
          <span class="leading-tight text-[10px]">Version</span>
          <span class="font-bold text-on-surface leading-tight text-[12px] block w-full truncate">${escapeHtml(server.version || 'N/A')}</span>
        </div>
      </div>
    `;
    card.style.transitionDelay = `${i * 45 + 50}ms`;
    window.setTimeout(() => card.classList.add('visible'), i * 45 + 50);
    card.onclick = () => {
      navigator.clipboard.writeText(server.ip).then(() => {
        setStatus('Server IP Copied', `${server.ip} copied to clipboard!`, 'running');
      });
    };
    container.appendChild(card);
  }

  const viewAllCard = document.createElement('div');
  viewAllCard.className = 'glass-card rounded-2xl p-4 min-w-[220px] max-w-[240px] flex flex-col items-center justify-center gap-2 hover:bg-white/10 transition-all cursor-pointer border border-white/10 slide-card text-center';
  viewAllCard.innerHTML = `
      <div class="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-2">
         <span class="material-symbols-outlined text-[32px] text-primary">arrow_forward</span>
      </div>
      <h3 class="font-headline-md text-lg font-bold text-on-surface">View All Servers</h3>
      <p class="text-[12px] text-on-surface-variant">See all multiplayer servers</p>
  `;
  viewAllCard.onclick = () => {
      $('nav-multiplayer')?.click();
  };
  container.appendChild(viewAllCard);
}

function showHomeLoading(section, loading) {
  const loader = $(`home-${section}-loading`);
  const scroller = $(`home-${section}-scroller`);
  const prev = $(`home-${section}-prev`);
  const next = $(`home-${section}-next`);

  // Always hide the old spinner — skeleton cards replace it
  if (loader) loader.classList.add('hidden');
  // Scroller is always visible (skeleton cards shown during load, real cards after)
  if (scroller) scroller.classList.remove('hidden');
  // Hide nav arrows while loading
  if (prev) prev.classList.toggle('hidden', loading);
  if (next) next.classList.toggle('hidden', loading);
}

function renderSkeletonHomeCards(grid, count = 10) {
  if (!grid) return;
  grid.innerHTML = '';
  for (let i = 0; i < count; i++) {
     const card = document.createElement('div');
     card.className = 'glass-card rounded-2xl p-3 min-w-[220px] max-w-[240px] min-h-[140px] flex flex-col animate-pulse bg-white/5 border border-white/5 slide-card visible';
     card.innerHTML = `
        <div class="h-6 w-3/4 bg-white/10 rounded mb-2"></div>
        <div class="h-3 w-5/6 bg-white/5 rounded"></div>
        <div class="h-3 w-full bg-white/5 rounded mt-2"></div>
        <div class="h-3 w-4/6 bg-white/5 rounded mt-2"></div>
        <div class="h-4 w-1/3 bg-white/10 rounded mt-auto"></div>
     `;
     card.style.transitionDelay = `${i * 30}ms`;
     grid.appendChild(card);
  }
}

function renderSkeletonHomeNews(grid, count = 3) {
  if (!grid) return;
  grid.innerHTML = '';
  for (let i = 0; i < count; i++) {
     const card = document.createElement('div');
     card.className = 'glass-card rounded-2xl p-4 flex flex-col md:flex-row gap-4 animate-pulse bg-white/5 border border-white/5 slide-card visible';
     card.innerHTML = `
        <div class="w-full md:w-1/3 h-44 bg-white/10 rounded-md"></div>
        <div class="flex-1 flex flex-col">
           <div class="h-6 w-1/2 bg-white/10 rounded mb-4"></div>
           <div class="h-4 w-full bg-white/5 rounded mb-2"></div>
           <div class="h-4 w-5/6 bg-white/5 rounded mb-2"></div>
           <div class="h-4 w-4/6 bg-white/5 rounded mb-2"></div>
        </div>
     `;
     card.style.transitionDelay = `${i * 30}ms`;
     grid.appendChild(card);
  }
}

async function loadHomeModpackCarousel() {
  console.debug('loadHomeModpackCarousel: start');
  showHomeLoading('modpack', true);
  renderSkeletonHomeCards($('home-modpack-scroller'), 7);
  try {
    let combined = [];

    // 1. Installed
    const installed = Object.values(state.installedModpacks || {});
    combined.push(...installed.map(p => ({ ...p, source: 'installed' })));

    // 2. Catalog
    try {
      const urls = state.settings?.modpackUrls || ['https://raw.githubusercontent.com/Yaman-the-coder/aqua-launcher/refs/heads/main/modpacks.json'];
      for (const u of urls) {
        const res = await fetch(u);
        if (res.ok) {
          const p = await res.json();
          if (Array.isArray(p)) {
              combined.push(...p.map(x => ({ ...x, source: 'catalog' })));
          }
        }
      }
    } catch (e) {
      console.error('Failed fetching home catalog:', e);
    }

    // 3. CurseForge (Search popular empty query)
    try {
      const proxyBaseUrl = state.settings?.curseforgeProxyUrl;
      const cfData = await window.launcherAPI.searchCurseForge('', proxyBaseUrl || '');
      if (cfData && cfData.data) {
          combined.push(...cfData.data.map(x => ({ 
             ...x, 
             source: 'curseforge',
             name: x.name,
             description: x.summary,
             loader: 'forge',
             mcVersion: 'Latest',
             version: 'Latest'
          })));
      }
    } catch (e) {}

    // 4. Modrinth (Search popular empty query)
    try {
      const mrData = await window.launcherAPI.searchModrinth('', []);
      if (mrData && mrData.hits) {
          combined.push(...mrData.hits.map(x => ({ 
             ...x, 
             source: 'modrinth',
             name: x.title,
             description: x.description,
             loader: 'fabric',
             mcVersion: 'Latest',
             version: 'Latest'
          })));
      }
    } catch (e) {}

    // Deduplicate and trim to max 20
    const seen = new Set();
    const finalPacks = [];
    for (const p of combined) {
       const key = String(p.name || p.title || p.folder).toLowerCase();
       if (!key) continue;
       if (!seen.has(key)) {
          seen.add(key);
          finalPacks.push(p);
       }
       if (finalPacks.length >= 20) break;
    }

    state.homeModpacks = finalPacks;
    renderHomeModpackCarousel(finalPacks);
    revealStaggered($('home-modpack-scroller'), 35, 60);
  } catch (error) {
    console.error('Home modpack carousel failed', error);
    renderHomeModpackCarousel([]);
  } finally {
    showHomeLoading('modpack', false);
  }
}

async function loadHomeServerCarousel() {
  console.debug('loadHomeServerCarousel: start');
  showHomeLoading('server', true);
  renderSkeletonHomeCards($('home-server-scroller'), 7);
  try {
    const pageData = await window.launcherAPI.getServersPage(1, state.settings?.serverListUrl);
    const servers = Array.isArray(pageData?.servers) ? pageData.servers : [];
    state.homeServers = servers;
    renderHomeServerCarousel(state.homeServers);
    revealStaggered($('home-server-scroller'), 35, 60);
    console.debug('loadHomeServerCarousel: done, items=', servers.length);
  } catch (error) {
    console.error('Home server carousel failed', error);
    renderHomeServerCarousel([]);
  } finally {
    showHomeLoading('server', false);
  }
}

async function loadHomeData() {
  if (state.homeDataLoaded || state.homeDataLoading) return;
  state.homeDataLoading = true;
  try {
    await Promise.all([loadHomeModpackCarousel(), loadHomeServerCarousel(), loadHomeNews()]);
    state.homeDataLoaded = true;
  } finally {
    state.homeDataLoading = false;
  }
}

// News rendering: vertical infinite list with mixed layouts
function renderHomeNewsAppend(items) {
  const container = $('home-news-list');
  if (!container) return;

  let i = 0;
  let cardIndex = container.children.length;
  while (i < items.length) {
    const it = items[i];
    const next = items[i + 1];
    const next2 = items[i + 2];

    const desc = String(it.description || '');
    const isLong = desc.length > 220 || (it.title && it.title.length > 120);

    // helper to get image
    const getImage = (o) => (o && (o.image || o.thumbnail || o.imageUrl || o.img)) || '';

    if (isLong) {
      // full-width horizontal feature
      const card = document.createElement('div');
      card.className = 'glass-card rounded-2xl p-4 flex flex-col md:flex-row gap-4 hover:bg-white/5 transition-all cursor-pointer border border-white/10';
      card.innerHTML = `
        <div class="w-full md:w-1/3 h-44 overflow-hidden rounded-md bg-black/20">
          <img src="${escapeHtml(getImage(it))}" alt="${escapeHtml(it.title||'') }" class="w-full h-full object-cover" onerror="this.src='https://via.placeholder.com/640x360?text=News'" />
        </div>
        <div class="flex-1">
          <h3 class="font-bold text-lg mb-2">${escapeHtml(it.title)}</h3>
          <p class="text-sm text-on-surface-variant leading-relaxed">${escapeHtml(it.description || '')}</p>
        </div>
      `;
        card.onclick = () => { if (it.url) window.open(it.url, '_blank'); };
      card.classList.add('slide-card');
      card.style.transitionDelay = `${cardIndex * 35 + 40}ms`;
      window.setTimeout(() => card.classList.add('visible'), cardIndex * 35 + 40);
      cardIndex += 1;
      container.appendChild(card);
      i += 1;
      continue;
    }

    // If we have at least 3 short items, render a 3-up row
    const nextShort = next && String(next.description || '').length <= 220;
    const next2Short = next2 && String(next2.description || '').length <= 220;
    if (nextShort && next2Short) {
      const row = document.createElement('div');
      row.className = 'flex flex-col md:flex-row gap-4';
      for (let j = 0; j < 3 && i + j < items.length; j++) {
        const it2 = items[i + j];
        const img = getImage(it2);
        const card = document.createElement('div');
        card.className = 'glass-card rounded-2xl p-3 flex-1 hover:bg-white/5 transition-all cursor-pointer border border-white/10';
        card.innerHTML = `
          <div class="h-28 w-full overflow-hidden rounded-md bg-black/20 mb-2">
            <img src="${escapeHtml(img)}" alt="${escapeHtml(it2.title||'')}" class="w-full h-full object-cover" onerror="this.src='https://via.placeholder.com/320x180?text=News'" />
          </div>
          <h4 class="font-bold text-sm mb-1">${escapeHtml(it2.title)}</h4>
          <p class="text-xs text-on-surface-variant line-clamp-3">${escapeHtml(it2.description || '')}</p>
        `;
        card.onclick = () => { if (it2.url) window.open(it2.url, '_blank'); };
        row.appendChild(card);
      }
      row.classList.add('slide-card');
      row.style.transitionDelay = `${cardIndex * 35 + 40}ms`;
      window.setTimeout(() => row.classList.add('visible'), cardIndex * 35 + 40);
      cardIndex += 1;
      container.appendChild(row);
      i += 3;
      continue;
    }

    // Composite row: one large + two stacked small (if possible)
    if (next && next2) {
      // pick side randomly
      const sideLeft = Math.random() < 0.5;
      const row = document.createElement('div');
      row.className = 'flex gap-4';

      const main = document.createElement('div');
      main.className = 'glass-card rounded-2xl p-4 flex-1 hover:bg-white/5 transition-all cursor-pointer border border-white/10';
      main.innerHTML = `
        <div class="h-44 w-full overflow-hidden rounded-md bg-black/20 mb-2">
          <img src="${escapeHtml(getImage(it))}" alt="${escapeHtml(it.title||'') }" class="w-full h-full object-cover" onerror="this.src='https://via.placeholder.com/640x360?text=News'" />
        </div>
        <h3 class="font-bold text-lg mb-1">${escapeHtml(it.title)}</h3>
        <p class="text-sm text-on-surface-variant line-clamp-4">${escapeHtml(it.description || '')}</p>
      `;
      main.onclick = () => { if (it.url) window.open(it.url, '_blank'); };

      const side = document.createElement('div');
      side.className = 'flex flex-col gap-4 w-1/3';
      [next, next2].forEach((s) => {
        const small = document.createElement('div');
        small.className = 'glass-card rounded-2xl p-3 h-1/2 hover:bg-white/5 transition-all cursor-pointer border border-white/10';
        small.innerHTML = `
          <div class="h-20 w-full overflow-hidden rounded-md bg-black/20 mb-2">
            <img src="${escapeHtml(getImage(s))}" alt="${escapeHtml(s.title||'')}" class="w-full h-full object-cover" onerror="this.src='https://via.placeholder.com/320x180?text=News'" />
          </div>
          <h5 class="font-bold text-sm mb-1">${escapeHtml(s.title)}</h5>
        `;
        small.onclick = () => { if (s.url) window.open(s.url, '_blank'); };
        side.appendChild(small);
      });

      if (sideLeft) {
        row.appendChild(side);
        row.appendChild(main);
      } else {
        row.appendChild(main);
        row.appendChild(side);
      }

      row.classList.add('slide-card');
      row.style.transitionDelay = `${cardIndex * 35 + 40}ms`;
      window.setTimeout(() => row.classList.add('visible'), cardIndex * 35 + 40);
      cardIndex += 1;
      container.appendChild(row);
      i += 3;
      continue;
    }

    // Fallback single small card
    const img = getImage(it);
    const card = document.createElement('div');
    card.className = 'glass-card rounded-2xl p-3 hover:bg-white/5 transition-all cursor-pointer border border-white/10';
    card.innerHTML = `
      <div class="h-28 w-full overflow-hidden rounded-md bg-black/20 mb-2">
        <img src="${escapeHtml(img)}" alt="${escapeHtml(it.title||'')}" class="w-full h-full object-cover" onerror="this.src='https://via.placeholder.com/320x180?text=News'" />
      </div>
      <h4 class="font-bold text-sm mb-1">${escapeHtml(it.title)}</h4>
      <p class="text-xs text-on-surface-variant line-clamp-3">${escapeHtml(it.description || '')}</p>
    `;
    card.onclick = () => { if (it.url) window.open(it.url, '_blank'); };
    card.classList.add('slide-card');
    card.style.transitionDelay = `${cardIndex * 35 + 40}ms`;
    window.setTimeout(() => card.classList.add('visible'), cardIndex * 35 + 40);
    cardIndex += 1;
    container.appendChild(card);
    i += 1;
  }
}

// Infinite news loader state
state.homeNewsPage = 1;
state.homeNewsLoading = false;
state.homeNewsEnded = false;

async function fetchNewsPage(page) {
  try {
    const data = await window.launcherAPI.getNews(page);
    return (data && data.result && data.result.results) || (data && data.results) || (data && data.items) || [];
  } catch (e) {
    console.error('fetchNewsPage failed', e);
    return [];
  }
}

async function loadHomeNews() {
  // initialize once
  const container = $('home-news-list');
  if (!container) return;
  state.homeNewsPage = 1;
  state.homeNewsLoading = false;
  state.homeNewsEnded = false;
  renderSkeletonHomeNews(container, 3);

  const loader = $('home-news-loading');
  const sentinel = $('home-news-sentinel');

  async function loadMore() {
    if (state.homeNewsLoading || state.homeNewsEnded) return;
    state.homeNewsLoading = true;
    if (loader) loader.classList.remove('hidden');
    try {
      const items = await fetchNewsPage(state.homeNewsPage);
      if (!items || !items.length) {
        state.homeNewsEnded = true;
        if (observer) observer.disconnect();
        return;
      }
      if (state.homeNewsPage === 1) {
        container.innerHTML = '';
      }
      renderHomeNewsAppend(items);
      state.homeNewsPage += 1;
    } catch (e) {
      console.error('loadMore news failed', e);
    } finally {
      state.homeNewsLoading = false;
      if (loader) loader.classList.add('hidden');
    }
  }

  // load first page
  await loadMore();

  // set up intersection observer on sentinel inside the same scroll root
  const root = $('view-home-content') || null;
  const options = { root: root, rootMargin: '600px' };
  const observer = new IntersectionObserver((entries) => {
    for (const ent of entries) {
      if (ent.isIntersecting) {
        loadMore();
      }
    }
  }, options);
  if (sentinel) observer.observe(sentinel);
}

function updateServerPlayersUI({ page, ip, players, online, live, version }) {
  if (page !== state.mpPage) return;

  const domId = serverDomId(ip);
  const playersEl = $(`srv-players-${domId}`);
  const versionEl = $(`srv-version-${domId}`);
  const offlineEl = $(`srv-offline-${domId}`);

  if (playersEl) {
    playersEl.textContent = players;
    const container = playersEl.parentElement;
    if (container) {
      container.classList.toggle('opacity-60', !live);
      container.classList.toggle('text-primary', live && online);
      container.classList.toggle('text-on-surface-variant', !live || !online);
      container.title = live ? 'Live player count' : 'Cached player count';
    }
  }

  if (versionEl && version) {
    versionEl.textContent = version;
  }

  if (offlineEl) {
    offlineEl.classList.toggle('hidden', !(live && !online));
  }
}

function resetDownloadProgress() {
  console.log('resetting progress', downloadProgress);
  downloadProgress.phase = '';
  downloadProgress.percent = 0;
  downloadProgress.lastUiUpdate = 0;
  $('status-progress-wrap')?.classList.add('hidden');
  const bar = $('status-progress-bar');
  if (bar) bar.style.width = '0%';
  const detail = $('status-progress-detail');
  if (detail) detail.textContent = '';
}

function formatProgressLabel(type) {
  return PROGRESS_LABELS[type] || 'Preparing files';
}

function handleDownloadProgress(data) {
  if (!data?.type || !data.total) return;

  const task = data.task ?? 0;
  const percent = Math.min(100, Math.round((task / data.total) * 100));
  const phase = data.type;
  const now = Date.now();
  const phaseChanged = phase !== downloadProgress.phase;
  const percentChanged = percent !== downloadProgress.percent;
  const throttled = now - downloadProgress.lastUiUpdate < 120;

  if (!phaseChanged && !percentChanged) return;
  if (!phaseChanged && throttled) return;

  downloadProgress.phase = phase;
  downloadProgress.percent = percent;
  downloadProgress.lastUiUpdate = now;

  const label = formatProgressLabel(phase);
  setStatus('Launching...', `${label} — ${percent}%`, 'busy');

  const wrap = $('status-progress-wrap');
  const bar = $('status-progress-bar');
  const detail = $('status-progress-detail');
  if (wrap && bar && detail) {
    wrap.classList.remove('hidden');
    bar.style.width = `${percent}%`;
    detail.textContent = `${label} (${task.toLocaleString()} / ${data.total.toLocaleString()})`;
  }
}

function setStatus(title, message, stateName = 'idle') {
  $('status-title').textContent = title;
  $('status-message').textContent = message;
  $('status-panel').dataset.state = stateName;
}

function setPlayEnabled(enabled) {
  $('btn-play').disabled = !enabled;
  $('btn-play').classList.toggle('opacity-50', !enabled);
  $('btn-play').classList.toggle('cursor-not-allowed', !enabled);
}

function updateAccountUI() {
  const account = state.account;
  const name = account?.username || 'Not signed in';
  const avatarUrl = account
    ? `https://mc-heads.net/avatar/${encodeURIComponent(account.username)}/32`
    : '';

  $('account-name').textContent = name;
  $('footer-username').textContent = name;
  $('account-type').textContent = account
    ? account.type === 'msa'
      ? 'Microsoft Account'
      : account.type === 'offline'
        ? 'Offline Mode'
        : 'Mojang Account'
    : 'Click to sign in';

  const avatar = $('account-avatar');
  const placeholder = $('account-placeholder');
  if (avatarUrl) {
    avatar.src = avatarUrl;
    avatar.classList.remove('hidden');
    placeholder?.classList.add('hidden');
  } else {
    avatar.src = '';
    avatar.classList.add('hidden');
    placeholder?.classList.remove('hidden');
  }

  setPlayEnabled(Boolean(account) && !state.launching);
}

async function updateVersionUI() {
  let preview = null;
  try {
    preview = await window.launcherAPI.previewVersion({
      loader: state.loader,
      mcVersion: state.mcVersion,
      loaderVersion: state.loaderVersion,
    });
  } catch (e) {
    console.error('previewVersion failed', e);
    return;
  }

  if (!preview) return;
  state.loaderVersion = preview.loaderVersion;

  const labelEl = $('version-label');
  const badgeEl = $('version-badge');
  const unavailableEl = $('version-unavailable');

  if (labelEl) labelEl.textContent = preview.label || '';
  if (badgeEl) badgeEl.classList.toggle('hidden', !preview.available);
  if (unavailableEl) unavailableEl.classList.toggle('hidden', preview.available);
  
  saveVersionSelection();
}

async function loadVersions() {
  state.versions = await window.launcherAPI.getVersions();
  const select = $('mc-version-select');
  select.innerHTML = '';

  if (!state.versions.length) {
    select.innerHTML = '<option disabled>No Minecraft versions available</option>';
    return;
  }

  for (const version of state.versions.slice(0, 40)) {
    const option = document.createElement('option');
    option.className = 'bg-surface text-on-surface';
    option.value = version;
    option.textContent = version;
    if (version === state.mcVersion) option.selected = true;
    select.appendChild(option);
  }

  if (!state.versions.includes(state.mcVersion) && state.versions.length) {
    state.mcVersion = state.versions[0];
    select.value = state.mcVersion;
  }
}

function openModal(id) {
  const el = $(id);
  if (!el) return;
  el.classList.remove('hidden');
  el.classList.add('flex');
  void el.offsetWidth;
  el.classList.add('open');
}

function closeModal(id) {
  const el = $(id);
  if (!el) return;
  el.classList.remove('open');
  setTimeout(() => {
    if (!el.classList.contains('open')) {
        el.classList.add('hidden');
        el.classList.remove('flex');
    }
  }, 250);
}

function setLoaderTab(loader) {
  const isSwitching = state.loader !== loader;
  state.loader = loader;
  if (isSwitching) {
    state.loaderVersion = null;
  }

  document.querySelectorAll('[data-loader-tab]').forEach((tab) => {
    const active = tab.dataset.loaderTab === loader;
    tab.classList.toggle('border-primary', active);
    tab.classList.toggle('text-primary', active);
    tab.classList.toggle('bg-primary/10', active);
    tab.classList.toggle('font-bold', active);
    tab.classList.toggle('scale-[1.03]', active);
    tab.classList.toggle('shadow-[0_0_12px_rgba(75,142,255,0.3)]', active);
    tab.classList.toggle('opacity-100', active);

    tab.classList.toggle('border-transparent', !active);
    tab.classList.toggle('text-on-surface-variant', !active);
    tab.classList.toggle('scale-100', !active);
    tab.classList.toggle('opacity-50', !active);
    tab.classList.toggle('hover:opacity-80', !active);
    tab.classList.toggle('bg-white/5', !active);
  });

  $('loader-version-row').classList.toggle('hidden', loader === 'vanilla');
  updateVersionUI();
}

async function refreshLoaderVersions() {
  if (state.loader === 'vanilla') return;

  const versions = await window.launcherAPI.getLoaderVersions(
    state.mcVersion,
    state.loader,
  );
  const select = $('loader-version-select');
  select.innerHTML = '';

  if (!versions.length) {
    select.innerHTML = '<option disabled selected>No loader versions available</option>';
    state.loaderVersion = null;
    return;
  }

  for (const version of versions.slice(0, 20)) {
    const option = document.createElement('option');
    option.className = 'bg-surface text-on-surface';
    option.value = version;
    option.textContent = version;
    select.appendChild(option);
  }

  const currentVersion = state.loaderVersion;
  if (currentVersion && versions.includes(currentVersion)) {
    select.value = currentVersion;
  } else {
    state.loaderVersion = versions[0] || null;
    if (state.loaderVersion) select.value = state.loaderVersion;
  }
}

function bindEvents() {
  document.querySelectorAll('.modal-backdrop').forEach(modal => {
     modal.addEventListener('click', (e) => {
        const panel = modal.querySelector('div');
        if (!panel) return;
        
        const rect = panel.getBoundingClientRect();
        const buffer = 100;
        
        if (e.clientX < rect.left - buffer || 
            e.clientX > rect.right + buffer || 
            e.clientY < rect.top - buffer || 
            e.clientY > rect.bottom + buffer) {
            
            if (modal.id) closeModal(modal.id);
        }
     });
  });

  const ramSlider = $('ram-slider');
  if (ramSlider) {
    ramSlider.addEventListener('input', (e) => {
      state.memory = Number(e.target.value);
      $('ram-label').textContent = `${state.memory}GB`;
    });
    ramSlider.addEventListener('change', async (e) => {
      state.memory = Number(e.target.value);
      $('ram-label').textContent = `${state.memory}GB`;
      state.settings = state.settings || {};
      state.settings.memory = state.memory;
      try {
        await window.launcherAPI.saveSettings(state.settings);
        setStatus('Memory Saved', `${state.memory}GB memory allocation remembered.`);
      } catch (error) {
        console.error('Failed to save memory setting', error);
      }
    });
  }

  $('account-card').addEventListener('click', () => openModal('account-modal'));
  $('version-card').addEventListener('click', async () => {
    openModal('version-modal');
    setLoaderTab(state.loader);

    // Lock selects to loading state
    const mcSelect = $('mc-version-select');
    const loaderSelect = $('loader-version-select');
    if (mcSelect) {
      mcSelect.disabled = true;
      mcSelect.innerHTML = '<option>Loading...</option>';
    }
    if (loaderSelect) {
      loaderSelect.disabled = true;
      loaderSelect.innerHTML = '<option>Loading...</option>';
    }

    await loadVersions();
    await refreshLoaderVersions();

    if (mcSelect) mcSelect.disabled = false;
    if (loaderSelect) loaderSelect.disabled = false;
  });

  $('btn-play').addEventListener('click', async () => {
    if (!state.account || state.launching) return;
    
    if (state.activeModpack) {
      const pack = state.activeModpack;
      // Search all manifest entries by name match OR direct key match
      const findInstalled = () => {
          // Direct key match
          if (state.installedModpacks[pack.name]) return state.installedModpacks[pack.name];
          // Search by name field across all entries (for modrinth/curseforge packs stored under unique IDs)
          for (const [key, val] of Object.entries(state.installedModpacks)) {
              if (val.name && val.name === pack.name) return val;
          }
          return null;
      };
      const installedPack = findInstalled();
      
      // Only trigger old JSON download for catalog/json type packs that aren't installed
      const isNewPlatformPack = pack.type === 'modrinth' || pack.type === 'curseforge' || pack.source === 'modrinth' || pack.source === 'curseforge';
      if (!installedPack && !isNewPlatformPack) {
         try {
            state.launching = true;
            setPlayEnabled(false);
            $('active-pack-progress-container').classList.remove('hidden');
            await window.launcherAPI.downloadModpack(pack.name, pack);
            
            state.installedModpacks = await window.launcherAPI.getInstalledModpacks();
            updateActiveModpackUI();
            $('active-pack-progress-container').classList.add('hidden');
         } catch(e) {
            console.error(e);
            setStatus('Download Failed', e.message, 'error');
            state.launching = false;
            setPlayEnabled(true);
            $('active-pack-progress-container').classList.add('hidden');
            return;
         }
      }
    }

    state.launching = true;
    resetDownloadProgress();
    setPlayEnabled(false);
    setStatus('Launching...', 'Preparing game files...', 'busy');

    try {
      await window.launcherAPI.launch({
        loader: state.loader,
        mcVersion: state.mcVersion,
        memory: state.memory,
        fabricLoaderVersion:
          state.loader === 'fabric' ? state.loaderVersion : undefined,
        forgeVersion: state.loader === 'forge' ? state.loaderVersion : undefined,
        javaArgs: state.settings.javaArgs || undefined,
      });
    } catch (error) {
      resetDownloadProgress();
      setStatus('Launch failed', error.message || 'Unknown error', 'error');
      state.launching = false;
      setPlayEnabled(Boolean(state.account));
    }
  });

  $('btn-ms-login').addEventListener('click', async () => {
    $('btn-ms-login').disabled = true;
    try {
      state.account = await window.launcherAPI.loginMicrosoft();
      updateAccountUI();
      closeModal('account-modal');
      setStatus('Ready to launch', 'Signed in with Microsoft account.');
    } catch (error) {
      setStatus('Sign in failed', error.message || 'Could not sign in', 'error');
    } finally {
      $('btn-ms-login').disabled = false;
    }
  });

  $('btn-offline-login').addEventListener('click', async () => {
    const username = $('offline-username').value.trim();
    if (!username) return;

    try {
      state.account = await window.launcherAPI.loginOffline(username);
      updateAccountUI();
      closeModal('account-modal');
      setStatus('Ready to launch', `Playing as ${username} (offline).`);
    } catch (error) {
      setStatus('Sign in failed', error.message || 'Could not sign in', 'error');
    }
  });

  $('btn-logout').addEventListener('click', async () => {
    await window.launcherAPI.logout();
    state.account = null;
    updateAccountUI();
    closeModal('account-modal');
    setStatus('Not signed in', 'Sign in to launch Minecraft.');
  });

  $('mc-version-select').addEventListener('change', async (e) => {
    state.mcVersion = e.target.value;
    state.loaderVersion = null;
    await refreshLoaderVersions();
    await updateVersionUI();
  });

  $('loader-version-select').addEventListener('change', async (e) => {
    state.loaderVersion = e.target.value;
    await updateVersionUI();
  });

  $('btn-save-version').addEventListener('click', () => {
    closeModal('version-modal');
    setStatus('Ready to launch', `${$('version-label').textContent} selected.`);
  });

  document.querySelectorAll('[data-loader-tab]').forEach((tab) => {
    tab.addEventListener('click', async () => {
      setLoaderTab(tab.dataset.loaderTab);
      await refreshLoaderVersions();
      await updateVersionUI();
    });
  });

  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
  });

  window.launcherAPI.onLaunchStatus(({ state: launchState, message }) => {
    if (launchState === 'preparing' || launchState === 'launching') {
      if (!downloadProgress.phase) {
        setStatus('Launching...', message, 'busy');
      }
    } else if (launchState === 'running') {
      state.launching = false;
      resetDownloadProgress();
      setPlayEnabled(Boolean(state.account));
      setStatus('Minecraft running', message, 'running');
    } else if (launchState === 'error') {
      state.launching = false;
      resetDownloadProgress();
      setPlayEnabled(Boolean(state.account));
      setStatus('Launch failed', message, 'error');
    } else if (launchState === 'idle') {
      state.launching = false;
      resetDownloadProgress();
      setPlayEnabled(Boolean(state.account));
      setStatus('Ready to launch', message);
    }
  });

  window.launcherAPI.onLaunchEvent(({ type, data }) => {
    if (type === 'progress') {
      handleDownloadProgress(data);
    }
  });

  window.launcherAPI.onModpackStatus(({ state: mpState, message, progress }) => {
     if (mpState === 'downloading' && progress) {
         setStatus('Installing Modpack...', message, 'busy');
         $('active-pack-status-txt').textContent = message;
         const pct = Math.round((progress.completed / progress.total) * 100);
         $('active-pack-status-pct').textContent = `${pct}%`;
         $('active-pack-progress-bar').style.width = `${pct}%`;
     } else {
         setStatus(mpState === 'done' ? 'Ready to play' : (mpState === 'error' ? 'Install failed' : 'Installing Modpack...'), message, mpState === 'done' ? 'running' : (mpState === 'error' ? 'error' : 'busy'));
         $('active-pack-status-txt').textContent = message;
     }
  });

  if (window.electronAPI) {
    $('btn-minimize')?.addEventListener('click', () => window.electronAPI.minimize());
    $('btn-maximize')?.addEventListener('click', () => window.electronAPI.maximize());
    $('btn-close')?.addEventListener('click', () => window.electronAPI.close());
  }

  $('btn-notifications')?.addEventListener('click', () => {
    const panel = $('status-panel');
    if (!panel) return;

    const isVisible = panel.classList.contains('is-visible');

    if (isVisible) {
      panel.classList.remove('is-visible');
      window.setTimeout(() => {
        if (!panel.classList.contains('is-visible')) {
          panel.classList.add('hidden');
        }
      }, 220);
    } else {
      panel.classList.remove('hidden');
      window.requestAnimationFrame(() => {
        panel.classList.add('is-visible');
      });
    }
  });

  $('btn-topbar-settings')?.addEventListener('click', () => {
    $('setting-password').value = state.settings.password || '';
    $('setting-java-args').value = state.settings.javaArgs || '';
    $('setting-modpack-urls').value = state.settings.modpackUrls ? state.settings.modpackUrls.join('\n') : '';
    $('setting-server-list-url').value = state.settings.serverListUrl || '';
    switchView('settings');
    revealPageUI('view-settings');
  });

  // Navigation events
  $('nav-home')?.addEventListener('click', () => {
    switchView('home');
    revealPageUI('view-home-content');
    loadHomeData();
    scrollHomeToTop();
  });
  $('nav-modpacks')?.addEventListener('click', () => {
    switchView('modpacks');
    revealPageUI('view-modpacks');
    loadModpacksList();
    scrollViewToTop('view-modpacks');
  });
  
  $('btn-mp-prev')?.addEventListener('click', () => {
      if (state.mpPage > 1) {
        state.mpPage--;
        loadMultiplayerList(state.mpPage);
      }
  });
  $('btn-mp-next')?.addEventListener('click', () => {
      if (state.mpPage < state.mpTotalPages) {
        state.mpPage++;
        loadMultiplayerList(state.mpPage);
      }
  });
  $('btn-mp-prev-top')?.addEventListener('click', () => {
      if (state.mpPage > 1) {
        state.mpPage--;
        loadMultiplayerList(state.mpPage);
      }
  });
  $('btn-mp-next-top')?.addEventListener('click', () => {
      if (state.mpPage < state.mpTotalPages) {
        state.mpPage++;
        loadMultiplayerList(state.mpPage);
      }
  });

  $('btn-mp-plat-prev')?.addEventListener('click', () => {
    if (state.mpTab === 'modrinth' && state.mrPage > 1) {
      state.mrPage--;
      loadModpacksList();
      scrollViewToTop('view-modpacks');
    } else if (state.mpTab === 'curseforge' && state.cfPage > 1) {
      state.cfPage--;
      loadModpacksList();
      scrollViewToTop('view-modpacks');
    }
  });

  $('btn-mp-plat-next')?.addEventListener('click', () => {
    if (state.mpTab === 'modrinth') {
      state.mrPage++;
      loadModpacksList();
      scrollViewToTop('view-modpacks');
    } else if (state.mpTab === 'curseforge') {
      state.cfPage++;
      loadModpacksList();
      scrollViewToTop('view-modpacks');
    }
  });

  $('home-modpack-prev')?.addEventListener('click', () => scrollCarousel('home-modpack-scroller', -1));
  $('home-modpack-next')?.addEventListener('click', () => scrollCarousel('home-modpack-scroller', 1));
  $('home-server-prev')?.addEventListener('click', () => scrollCarousel('home-server-scroller', -1));
  $('home-server-next')?.addEventListener('click', () => {
    scrollCarousel('home-server-scroller', 1);
  });

  // News carousel controls
  $('home-news-prev')?.addEventListener('click', () => scrollCarousel('home-news-scroller', -1));
  $('home-news-next')?.addEventListener('click', () => {
    const container = $('home-news-scroller');
    if (!container) return;
    scrollCarousel('home-news-scroller', 1);
  });

  window.launcherAPI.onServerPlayersUpdate(updateServerPlayersUI);

  document.querySelectorAll('a').forEach(a => {
     if (a.textContent.includes('Settings')) {
        a.id = 'nav-settings';
        a.addEventListener('click', () => {
           $('setting-password').value = state.settings.password || '';
           $('setting-java-args').value = state.settings.javaArgs || '';
           $('setting-curseforge-proxy').value = state.settings.curseforgeProxyUrl || 'https://patient-darkness-1364.yaman26.workers.dev/';
           $('setting-modpack-urls').value = state.settings.modpackUrls ? state.settings.modpackUrls.join('\n') : '';
           $('setting-server-list-url').value = state.settings.serverListUrl || '';
           switchView('settings');
           revealPageUI('view-settings');
        });
     } else if (a.textContent.includes('Multiplayer')) {
        a.id = 'nav-multiplayer';
        a.addEventListener('click', () => {
           switchView('multiplayer');
           revealPageUI('view-multiplayer');
           state.mpPage = 1;
           loadMultiplayerList(state.mpPage);
        });
     }
  });

  $('btn-save-settings')?.addEventListener('click', async () => {
      const urls = $('setting-modpack-urls').value.split('\n').map(s => s.trim()).filter((s) => s.length > 0);
      const serverListUrl = $('setting-server-list-url').value.trim();
      let cfProxy = $('setting-curseforge-proxy').value.trim();
      if (!cfProxy) cfProxy = 'https://patient-darkness-1364.yaman26.workers.dev/';

      const newSettings = {
         password: $('setting-password').value,
         javaArgs: $('setting-java-args').value,
         curseforgeProxyUrl: cfProxy,
         modpackUrls: urls.length ? urls : ['https://raw.githubusercontent.com/Yaman-the-coder/aqua-launcher/refs/heads/main/modpacks.json'],
         serverListUrl: serverListUrl || 'https://raw.githubusercontent.com/Yaman-the-coder/aqua-launcher/refs/heads/main/servers.json',
         memory: state.memory,
      };
      state.settings = newSettings;
      await window.launcherAPI.saveSettings(newSettings);
      setStatus('Settings Saved', 'Ayarlar kaydedildi.');
      await loadHomeData();
  });

  // Modpack Tabs
  const setMpTab = (tabId) => {
     state.mpTab = tabId;
     state.mrPage = 1;
     state.cfPage = 1;
     ['installed', 'catalog', 'modrinth', 'curseforge'].forEach(id => {
       const el = $(`tab-mp-${id}`);
       if (!el) return;
       const active = id === tabId;
       el.className = active 
           ? 'px-4 py-2 font-bold text-primary border-b-2 border-primary transition-colors' 
           : 'px-4 py-2 text-on-surface-variant hover:text-on-surface transition-colors';
     });
     
     const searchContainer = $('modpack-search-container');
     if (searchContainer) {
       searchContainer.classList.toggle('hidden', tabId === 'catalog' || tabId === 'installed');
     }
     
     loadModpacksList();
  };

  $('tab-mp-installed')?.addEventListener('click', () => setMpTab('installed'));

  $('tab-mp-catalog')?.addEventListener('click', () => setMpTab('catalog'));
  $('tab-mp-modrinth')?.addEventListener('click', () => setMpTab('modrinth'));
  $('tab-mp-curseforge')?.addEventListener('click', () => setMpTab('curseforge'));

  let searchTimeout;
  $('modpack-search-input')?.addEventListener('input', (e) => {
     clearTimeout(searchTimeout);
     state.mpSearchQuery = e.target.value;
     state.mrPage = 1;
     state.cfPage = 1;
     searchTimeout = setTimeout(() => {
        loadModpacksList();
     }, 600);
  });
  $('modpack-search-input')?.addEventListener('keypress', (e) => {
     if (e.key === 'Enter') {
        clearTimeout(searchTimeout);
        state.mpSearchQuery = e.target.value;
        state.mrPage = 1;
        state.cfPage = 1;
        loadModpacksList();
     }
  });

  let serverSearchTimeout;
  $('server-search-input')?.addEventListener('input', (e) => {
     clearTimeout(serverSearchTimeout);
     state.mpServerSearchQuery = e.target.value;
     serverSearchTimeout = setTimeout(() => {
        state.mpPage = 1;
        loadMultiplayerList(1);
     }, 600);
  });
  $('server-search-input')?.addEventListener('keypress', (e) => {
     if (e.key === 'Enter') {
        clearTimeout(serverSearchTimeout);
        state.mpServerSearchQuery = e.target.value;
        state.mpPage = 1;
        loadMultiplayerList(1);
     }
  });
}

function updateActiveModpackUI() {
  const pack = state.activeModpack;
  const panel = $('active-modpack-panel');
  if (!panel) return;
  if (!pack) {
    panel.classList.add('hidden');
    // clear fields
    $('active-pack-title').textContent = '';
    $('active-pack-desc').textContent = '';
    $('active-pack-details')?.classList.add('hidden');
    const btnContentClear = $('btn-play-content');
    if (btnContentClear) btnContentClear.innerHTML = `<span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">play_arrow</span> PLAY`;
    return;
  }
  
  panel.classList.remove('hidden');
  $('active-pack-title').textContent = pack.name;
  $('active-pack-desc').textContent = pack.description || 'Ready to deploy and play!';
  
  $('active-pack-details').classList.remove('hidden');
  const loaderStr = (() => {
      if (pack.modLoaders && pack.modLoaders.length) return pack.modLoaders[0].split('-')[0];
      return pack.loader || 'fabric';
  })();
  $('active-pack-loader').textContent = loaderStr.toUpperCase();
  $('active-pack-mc').textContent = `MC ${pack.mcVersion || pack.minecraftVersion || 'Latest'}`;
  $('active-pack-version').textContent = `v${pack.version || 'Latest'}`;
  
  const installedPack = state.installedModpacks[pack.name];
  const isInstalled = installedPack && installedPack.version === pack.version;
  
  const btnContent = $('btn-play-content');
  if (btnContent) {
    if (!isInstalled) {
      btnContent.innerHTML = `INSTALL PACK`;
    } else {
      btnContent.innerHTML = `<span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">play_arrow</span> PLAY`;
    }
  }
  
  saveVersionSelection();
}

function clearActiveModpack() {
  state.activeModpack = null;
  updateActiveModpackUI();
  setStatus('No modpack selected', 'Modpack selection cleared.');
}

async function saveVersionSelection() {
  if (!state.settings) state.settings = {};
  state.settings.mcVersion = state.mcVersion;
  state.settings.loader = state.loader;
  state.settings.loaderVersion = state.loaderVersion;
  
  if (state.activeModpack) {
      // Find the installed modpack's unique ID
      const installedKey = Object.keys(state.installedModpacks).find(
          k => state.installedModpacks[k] && state.installedModpacks[k].name === state.activeModpack.name
      );
      state.settings.activeModpackId = installedKey || state.activeModpack.id || state.activeModpack.name;
  } else {
      state.settings.activeModpackId = null;
  }
  
  if (window.launcherAPI) {
      try {
          // Send background save without awaiting completely (to not block ui)
          window.launcherAPI.saveSettings(state.settings).catch(e => console.error(e));
      } catch(e) {
          console.error('Failed to save version selection', e);
      }
  }
}

function switchView(view) {
  const isHome = view === 'home';
  const isModpacks = view === 'modpacks';
  const isSettings = view === 'settings';
  const isMultiplayer = view === 'multiplayer';

  const setPageState = (el, active) => {
    if (!el) return;
    el.classList.toggle('active', active);
    el.classList.toggle('hidden', !active);
    if (active) el.classList.remove('hidden');
    else el.classList.add('hidden');
  };

  setPageState($('view-home-content'), isHome);
  setPageState($('view-modpacks'), isModpacks);
  setPageState($('view-settings'), isSettings);
  setPageState($('view-multiplayer'), isMultiplayer);

  if (isHome) {
    scrollViewToTop('view-home-content');
    revealSlideLeft($('home-modpack-scroller'), 30, 40);
    revealSlideLeft($('home-server-scroller'), 30, 40);
    revealSlideLeft($('home-news-list'), 22, 40);
  }
  if (isModpacks) scrollViewToTop('view-modpacks');
  if (isSettings) {
    scrollViewToTop('view-settings');
    revealStaggered(document.querySelector('#view-settings .flex.flex-col.gap-6'), 35, 40);
  }
  if (isMultiplayer) {
    scrollViewToTop('view-multiplayer');
    revealStaggered($('multiplayer-grid'), 30, 40);
  }
  
  const navHome = $('nav-home');
  const navModpacks = $('nav-modpacks');
  const navSettings = $('nav-settings');
  const navMultiplayer = $('nav-multiplayer');

  const styleActive = (el, active) => {
    if (!el) return;
    el.classList.toggle('active', active);
  };

  styleActive(navHome, isHome);
  styleActive(navModpacks, isModpacks);
  styleActive(navSettings, isSettings);
  styleActive(navMultiplayer, isMultiplayer);
}

function renderSkeletonMultiplayer(grid, count = 5) {
  if (!grid) return;
  grid.innerHTML = '';
  for (let i = 0; i < count; i++) {
     const card = document.createElement('div');
     card.className = 'glass-card rounded-xl overflow-hidden flex flex-col md:flex-row animate-pulse bg-white/5 border border-white/5 stagger-card visible';
     card.innerHTML = `
        <div class="h-32 md:h-32 md:w-40 w-full bg-white/10 flex-shrink-0"></div>
        <div class="p-4 flex flex-col justify-between gap-4 flex-1">
           <div>
              <div class="h-6 w-1/3 bg-white/10 rounded"></div>
              <div class="h-4 w-1/4 bg-white/5 rounded mt-3"></div>
              <div class="h-4 w-full bg-white/5 rounded mt-4"></div>
              <div class="h-4 w-3/4 bg-white/5 rounded mt-2"></div>
           </div>
           <div class="pt-4 border-t border-white/5 flex gap-4">
              <div class="h-4 w-12 bg-white/5 rounded"></div>
              <div class="h-4 w-12 bg-white/5 rounded"></div>
           </div>
        </div>
     `;
     card.style.transitionDelay = `${i * 30}ms`;
     grid.appendChild(card);
  }
}

async function loadMultiplayerList(page = 1) {
  const loading = $('multiplayer-loading');
  const grid = $('multiplayer-grid');
  if (!grid) return;

  loading?.classList.remove('hidden');
  
  // Only show skeletons if fetching takes more than 100ms
  let showSkeleton = true;
  const skelTimer = setTimeout(() => {
    if (showSkeleton) renderSkeletonMultiplayer(grid, 5);
  }, 100);
  
  try {
      const data = await window.launcherAPI.getServersPage(page, state.settings.serverListUrl, state.mpServerSearchQuery);
      
      showSkeleton = false;
      clearTimeout(skelTimer);
      
      const servers = data.servers || [];
      state.mpTotalPages = data.totalPages || 1;
      state.mpPage = data.page || page;

      $('mp-page-text').textContent = `Page ${state.mpPage} / ${state.mpTotalPages}`;
      $('mp-page-text-bottom').textContent = `Page ${state.mpPage} / ${state.mpTotalPages}`;
      const btnPrev = $('btn-mp-prev');
      const btnNext = $('btn-mp-next');
      const btnPrevTop = $('btn-mp-prev-top');
      const btnNextTop = $('btn-mp-next-top');

      if (btnPrev) {
         btnPrev.classList.toggle('opacity-50', state.mpPage === 1);
         btnPrev.classList.toggle('cursor-not-allowed', state.mpPage === 1);
      }
      if (btnNext) {
         btnNext.classList.toggle('opacity-50', state.mpPage >= state.mpTotalPages);
         btnNext.classList.toggle('cursor-not-allowed', state.mpPage >= state.mpTotalPages);
      }
      if (btnPrevTop) {
         btnPrevTop.classList.toggle('opacity-50', state.mpPage === 1);
         btnPrevTop.classList.toggle('cursor-not-allowed', state.mpPage === 1);
      }
      if (btnNextTop) {
         btnNextTop.classList.toggle('opacity-50', state.mpPage >= state.mpTotalPages);
         btnNextTop.classList.toggle('cursor-not-allowed', state.mpPage >= state.mpTotalPages);
      }

      grid.innerHTML = '';
      
      if (!servers.length) {
          grid.innerHTML = '<div class="col-span-full p-4 text-center text-on-surface-variant">No servers found. Please check your internet connection.</div>';
          return;
      }
      
      for (const srv of servers) {
         const domId = serverDomId(srv.ip);

         const card = document.createElement('div');
         card.className = 'glass-card rounded-xl overflow-hidden flex flex-col md:flex-row hover:bg-white/10 transition-all cursor-pointer glow-effect border-outline-variant';
         card.classList.add('stagger-card');
         card.style.transitionDelay = `${(grid.children.length || 0) * 30 + 40}ms`;
         card.innerHTML = `
           <div class="h-32 md:h-32 md:w-40 w-full overflow-hidden bg-black/40 flex-shrink-0">
              <img src="${escapeHtml(srv.banner)}" class="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt="Banner" onerror="this.src='https://via.placeholder.com/160?text=Server'"/>
           </div>
           <div class="p-4 flex flex-col justify-between gap-4 flex-1 min-w-0">
              <div>
                <h3 class="font-headline-md text-xl font-bold text-on-surface whitespace-nowrap overflow-hidden text-ellipsis">${escapeHtml(srv.name)}</h3>
                <p class="text-[11px] text-on-surface-variant font-mono bg-white/5 border border-white/10 px-2 py-0.5 rounded inline-block mt-3">${escapeHtml(srv.ip)}</p>
                <p class="text-sm text-on-surface-variant mt-4 leading-relaxed line-clamp-3" title="${escapeHtml(srv.description)}">${escapeHtml(srv.description)}</p>
              </div>
              <div class="flex flex-col sm:flex-row sm:items-center gap-3 pt-4 border-t border-white/5">
                  <div class="flex items-center gap-2 text-on-surface-variant text-xs opacity-80" title="Updating player count">
                     <span class="material-symbols-outlined text-[16px]">groups</span>
                     <span id="srv-players-${domId}">${escapeHtml(srv.players)}</span>
                  </div>
                  <div class="flex items-center gap-2 text-on-surface-variant text-xs" title="Version">
                     <span class="material-symbols-outlined text-[16px]">sell</span>
                     <span id="srv-version-${domId}">${escapeHtml(srv.version || '?')}</span>
                  </div>
                  <span id="srv-offline-${domId}" class="hidden text-[10px] text-error ml-auto sm:ml-0">Offline</span>
              </div>
           </div>
         `;
         card.onclick = () => {
             navigator.clipboard.writeText(srv.ip).then(() => {
                 setStatus('IP Copied', `${srv.ip} copied to clipboard!`, 'running');
             });
         };
         grid.appendChild(card);
      }
      revealStaggered(grid, 30, 40);
  } catch(e) {
      grid.innerHTML = `<div class="col-span-full p-4 rounded-xl bg-error-container/20 border border-error-container text-error text-center text-sm">${escapeHtml(e.message)}</div>`;
  } finally {
      loading?.classList.add('hidden');
  }
}

function renderSkeletonModpacks(grid, count = 12) {
  if (!grid) return;
  grid.innerHTML = '';
  for (let i = 0; i < count; i++) {
     const card = document.createElement('div');
     card.className = 'glass-card rounded-xl overflow-hidden flex flex-col h-[280px] animate-pulse bg-white/5 border border-white/5 stagger-card visible';
     card.innerHTML = `
        <div class="h-32 w-full bg-white/10"></div>
        <div class="p-4 flex flex-col flex-1 gap-3">
            <div class="h-5 w-3/4 bg-white/10 rounded mt-1"></div>
            <div class="h-3 w-full bg-white/5 rounded mt-2"></div>
            <div class="h-3 w-5/6 bg-white/5 rounded"></div>
            <div class="h-6 w-1/3 bg-white/10 rounded mt-auto"></div>
        </div>
     `;
     card.style.transitionDelay = `${i * 30}ms`;
     grid.appendChild(card);
  }
}

async function loadModpacksList() {
  const loading = $('modpacks-loading');
  const grid = $('modpacks-grid');
  if (!grid) return;

  loading?.classList.remove('hidden');
  try {
    const paginationEl = $('mp-platform-pagination');
    if (state.mpTab === 'installed') {
        if (paginationEl) paginationEl.classList.add('hidden');
        grid.innerHTML = '';
        const installedList = Object.values(state.installedModpacks || {});
        if (installedList.length === 0) {
            grid.innerHTML = '<div class="col-span-full p-10 text-center text-on-surface-variant flex flex-col items-center gap-2"><span class="material-symbols-outlined text-[48px] opacity-50">inventory_2</span><p>You have no downloaded modpacks.</p></div>';
            return;
        }
        for (let i = 0; i < installedList.length; i += 1) {
          const pack = installedList[i];
          const card = document.createElement('div');
          const loader = pack.modLoaders && pack.modLoaders.length ? pack.modLoaders[0] : (pack.loader || 'fabric');
          const mcVersion = pack.mcVersion || pack.minecraftVersion || '1.20.4';
          const typeStr = pack.type ? pack.type.toUpperCase() : 'MODPACK';
          const iconUrl = pack.iconUrl || `https://via.placeholder.com/150?text=${encodeURIComponent(pack.name || pack.folder || 'Installed')}`;
          const packDesc = pack.description || `Installed ${escapeHtml(pack.type || 'standard')} modpack.`;
          card.className = 'glass-card rounded-xl overflow-hidden flex flex-col hover:bg-white/10 transition-all cursor-pointer glow-effect border-outline-variant';
          card.innerHTML = `
            <div class="h-32 w-full overflow-hidden bg-black/40">
                <img src="${escapeHtml(iconUrl || '')}" class="w-full h-full object-cover opacity-80" onerror="this.src='https://via.placeholder.com/320x150?text=Installed'" />
            </div>
            <div class="p-4 flex flex-col flex-1">
               <div class="flex items-start justify-between gap-3">
                 <h3 class="font-headline-md text-lg font-bold text-on-surface truncate">${escapeHtml(pack.name || pack.folder)}</h3>
                 <span class="material-symbols-outlined text-primary group-hover:block transition-all">play_arrow</span>
               </div>
               <p class="text-sm text-on-surface-variant flex-1 line-clamp-3 mt-2">${escapeHtml(packDesc)}</p>
               <div class="flex flex-wrap gap-2 mt-4 pt-2 border-t border-white/5">
                  <span class="px-2 py-0.5 rounded border border-white/10 bg-surface-variant/50 text-on-surface-variant text-[10px] font-label-sm">${escapeHtml(typeStr)}</span>
                  <span class="px-2 py-0.5 rounded border border-white/10 bg-surface-variant/50 text-on-surface-variant text-[10px] font-label-sm">MC ${escapeHtml(mcVersion)}</span>
                  <span class="px-2 py-0.5 rounded border border-white/10 bg-surface-variant/50 text-on-surface-variant text-[10px] font-label-sm">v${escapeHtml(pack.version)}</span>
               </div>
            </div>
          `;
          card.classList.add('stagger-card');
          card.style.transitionDelay = `${i * 40 + 60}ms`;
          window.setTimeout(() => card.classList.add('visible'), i * 40 + 60);

          card.onclick = () => {
            state.activeModpack = pack;
            state.activeModpack.name = pack.name || pack.folder;
            state.loader = loader.split('-')[0].toLowerCase();
            state.mcVersion = mcVersion;
            if (loader.includes('-')) {
                state.loaderVersion = loader.split('-').slice(1).join('-');
            } else if (pack.loaderVersion) {
                state.loaderVersion = pack.loaderVersion;
            }
            
            setLoaderTab(state.loader);
            updateVersionUI();
            updateActiveModpackUI();
            
            setStatus('Modpack Selected', `Ready to play ${pack.name || pack.folder}`);
            switchView('home');
            scrollViewToTop('view-home-content');
            scrollActiveModpackPanelIntoView();
          };
          grid.appendChild(card);
        }
    } else if (state.mpTab === 'catalog') {
        if (paginationEl) paginationEl.classList.add('hidden');
        renderSkeletonModpacks(grid, 12);
        
        const urls = state.settings.modpackUrls || ['https://raw.githubusercontent.com/Yaman-the-coder/aqua-launcher/refs/heads/main/modpacks.json'];
        let allModpacks = [];
        
        for (const u of urls) {
           try {
               const res = await fetch(u);
               if (res.ok) {
                   const p = await res.json();
                   if (Array.isArray(p)) allModpacks.push(...p);
               }
           } catch(e) { console.error('Failed fetching catalog:', u); }
        }
        
        grid.innerHTML = '';
        const installedMap = state.installedModpacks || {};
        const installedList = [];
        const otherList = [];
        for (const pack of allModpacks) {
          const installedPack = installedMap[pack.name];
          const isInstalled = installedPack && installedPack.version === pack.version;
          if (isInstalled) installedList.push(pack);
          else otherList.push(pack);
        }
        const orderedModpacks = [...installedList, ...otherList];

        for (let i = 0; i < orderedModpacks.length; i += 1) {
          const pack = orderedModpacks[i];
          const installedPack = installedMap[pack.name];
          const isInstalled = installedPack && installedPack.version === pack.version;
          const card = document.createElement('div');
          card.className = 'glass-card rounded-xl p-5 flex flex-col gap-4 hover:bg-white/10 transition-all hover:scale-[1.02] cursor-pointer glow-effect border-outline-variant';
          card.innerHTML = `
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <h3 class="font-headline-md text-lg font-bold text-on-surface truncate">${escapeHtml(pack.name)}</h3>
              </div>
              ${isInstalled ? '<button class="reinstall-modpack-btn px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-[10px] font-semibold">Reinstall</button>' : '<span class="material-symbols-outlined text-primary group-hover:block transition-all">download</span>'}
            </div>
            <p class="text-sm text-on-surface-variant flex-grow">${escapeHtml(pack.description || 'A fantastic modpack ready to be played.')}</p>
            <div class="flex flex-wrap gap-2 mt-auto">
                <span class="px-2 py-0.5 rounded border border-primary/30 bg-primary/10 text-primary text-[10px] font-label-sm uppercase font-bold">${escapeHtml(pack.loader)} ${escapeHtml(pack.loaderVersion || '')}</span>
                <span class="px-2 py-0.5 rounded border border-white/10 bg-surface-variant/50 text-on-surface-variant text-[10px] font-label-sm">MC ${escapeHtml(pack.mcVersion)}</span>
                <span class="px-2 py-0.5 rounded border border-white/10 bg-surface-variant/50 text-on-surface-variant text-[10px] font-label-sm">v${escapeHtml(pack.version)}</span>
            </div>
          `;
          card.classList.add('stagger-card');
          card.style.transitionDelay = `${i * 40 + 60}ms`;
          window.setTimeout(() => card.classList.add('visible'), i * 40 + 60);
          const reinstallBtn = card.querySelector('.reinstall-modpack-btn');
          if (reinstallBtn) {
            reinstallBtn.addEventListener('click', async (event) => {
              event.stopPropagation();
              setStatus('Reinstalling...', `Reinstalling ${pack.name} now...`, 'busy');
              try {
                await window.launcherAPI.reinstallModpack(pack.name, pack);
                state.installedModpacks = await window.launcherAPI.getInstalledModpacks();
                setStatus('Reinstalled', `${pack.name} was reinstalled successfully.`, 'running');
              } catch (e) {
                console.error('Reinstall failed', e);
                setStatus('Reinstall failed', e.message || 'Could not reinstall modpack', 'error');
              }
            });
          }
          card.onclick = () => {
            state.activeModpack = pack;
            state.loader = pack.loader.toLowerCase();
            state.mcVersion = pack.mcVersion;
            if (pack.loaderVersion) state.loaderVersion = pack.loaderVersion;
            
            setLoaderTab(state.loader);
            updateVersionUI();
            updateActiveModpackUI();
            
            setStatus('Modpack Selected', `Ready to play ${pack.name}`);
            switchView('home');
            scrollViewToTop('view-home-content');
            scrollActiveModpackPanelIntoView();
          };
          grid.appendChild(card);
        }
    } else if (state.mpTab === 'modrinth') {
        const query = state.mpSearchQuery.trim();
        if (paginationEl) paginationEl.classList.remove('hidden');
        const pageText = $('mp-plat-page-text');
        if (pageText) pageText.textContent = `Page ${state.mrPage}`;
        
        renderSkeletonModpacks(grid, 20);
        
        const offset = (state.mrPage - 1) * 20;
        const results = await window.launcherAPI.searchModrinth(query, [], offset, 20);
        const hits = results.hits || [];
        
        const btnPrev = $('btn-mp-plat-prev');
        const btnNext = $('btn-mp-plat-next');
        if (btnPrev) { btnPrev.disabled = state.mrPage <= 1; }
        if (btnNext) { btnNext.disabled = hits.length < 20; }
        
        grid.innerHTML = '';
        if (hits.length === 0) {
           grid.innerHTML = '<div class="col-span-full p-4 text-center text-on-surface-variant">No modpacks found on Modrinth.</div>';
        }
        for (let i = 0; i < hits.length; i++) {
           const hit = hits[i];
           const card = document.createElement('div');
           card.className = 'glass-card rounded-xl overflow-hidden flex flex-col hover:bg-white/10 transition-all cursor-pointer glow-effect border-outline-variant';
           card.innerHTML = `
              <div class="h-32 w-full overflow-hidden bg-black/40">
                  <img src="${escapeHtml(hit.icon_url || '')}" class="w-full h-full object-cover opacity-80" onerror="this.src='https://via.placeholder.com/320x150?text=Modrinth'" />
              </div>
              <div class="p-4 flex flex-col flex-1">
                 <h3 class="font-headline-md text-lg font-bold text-on-surface truncate cursor-pointer" title="${escapeHtml(hit.title)}">${escapeHtml(hit.title)}</h3>
                 <p class="text-sm text-on-surface-variant flex-1 mt-2 line-clamp-3">${hit.description ? escapeHtml(hit.description) : ''}</p>
                 <div class="flex items-center justify-between mt-4 border-t border-white/5 pt-2">
                    <span class="text-primary text-[10px] font-bold">Modrinth</span>
                    <span class="material-symbols-outlined text-[18px] text-on-surface-variant">download</span>
                 </div>
              </div>
           `;
           card.classList.add('stagger-card');
           card.style.transitionDelay = `${i * 30 + 40}ms`;
           window.setTimeout(() => card.classList.add('visible'), i * 30 + 40);
           card.onclick = () => openModpackVersionModal('modrinth', hit.project_id || hit.slug, hit.title, hit.icon_url, hit.description);
           grid.appendChild(card);
        }
    } else if (state.mpTab === 'curseforge') {
        const query = state.mpSearchQuery.trim();
        if (paginationEl) paginationEl.classList.remove('hidden');
        const pageText = $('mp-plat-page-text');
        if (pageText) pageText.textContent = `Page ${state.cfPage}`;

        const pxUrl = state.settings.curseforgeProxyUrl || 'https://patient-darkness-1364.yaman26.workers.dev/';
        if (!pxUrl) {
           grid.innerHTML = '<div class="col-span-full p-4 text-center text-error border border-error-container bg-error-container/10 rounded-xl">Please configure the CurseForge Proxy URL in Settings first.</div>';
           loading?.classList.add('hidden');
           return;
        }
        
        renderSkeletonModpacks(grid, 20);
        
        const index = (state.cfPage - 1) * 20;
        const results = await window.launcherAPI.searchCurseForge(query, pxUrl, index, 20);
        const data = results.data || [];
        
        const btnPrev = $('btn-mp-plat-prev');
        const btnNext = $('btn-mp-plat-next');
        if (btnPrev) { btnPrev.disabled = state.cfPage <= 1; }
        if (btnNext) { btnNext.disabled = data.length < 20; }

        grid.innerHTML = '';
        if (data.length === 0) {
           grid.innerHTML = '<div class="col-span-full p-4 text-center text-on-surface-variant">No modpacks found on CurseForge.</div>';
        }
        for (let i = 0; i < data.length; i++) {
           const hit = data[i];
           const attachments = hit.logo ? [hit.logo] : [];
           const iconUrl = attachments.length ? attachments[0].thumbnailUrl : (hit.logo?.url || '');
           const card = document.createElement('div');
           card.className = 'glass-card rounded-xl overflow-hidden flex flex-col hover:bg-white/10 transition-all cursor-pointer glow-effect border-outline-variant';
           card.innerHTML = `
              <div class="h-32 w-full overflow-hidden bg-black/40">
                  <img src="${escapeHtml(iconUrl)}" class="w-full h-full object-cover opacity-80" onerror="this.src='https://via.placeholder.com/320x150?text=CurseForge'" />
              </div>
              <div class="p-4 flex flex-col flex-1">
                 <h3 class="font-headline-md text-lg font-bold text-on-surface truncate" title="${escapeHtml(hit.name)}">${escapeHtml(hit.name)}</h3>
                 <p class="text-sm text-on-surface-variant mt-2 flex-1 line-clamp-3">${hit.summary ? escapeHtml(hit.summary) : ''}</p>
                 <div class="flex items-center justify-between mt-4 border-t border-white/5 pt-2">
                    <span class="text-tertiary text-[10px] font-bold">CurseForge</span>
                    <span class="material-symbols-outlined text-[18px] text-on-surface-variant">download</span>
                 </div>
              </div>
           `;
           card.classList.add('stagger-card');
           card.style.transitionDelay = `${i * 30 + 40}ms`;
           window.setTimeout(() => card.classList.add('visible'), i * 30 + 40);
           card.onclick = () => openModpackVersionModal('curseforge', hit.id, hit.name, iconUrl, hit.summary);
           grid.appendChild(card);
        }
    }
  } catch (error) {
    console.error('loadModpacksList Error:', error);
    grid.innerHTML = `<div class="col-span-full p-4 rounded-xl bg-error-container/20 border border-error-container text-error text-center text-sm">${escapeHtml(error.message)}</div>`;
  } finally {
    loading?.classList.add('hidden');
  }
}

async function openModpackVersionModal(platform, projectId, packName, iconUrl, description) {
   $('mp-version-title').textContent = `Install ${packName}`;
   const select = $('mp-version-select');
   const loadingEl = $('mp-version-loading');
   select.innerHTML = '';
   select.classList.add('hidden');
   loadingEl.classList.remove('hidden');
   $('btn-install-modpack').disabled = true;
   openModal('mp-version-modal');

   try {
      if (platform === 'modrinth') {
         const versions = await window.launcherAPI.getModrinthVersions(projectId);
         if (!versions || versions.error) throw new Error('Failed to fetch versions');
         
         const validVersions = versions.filter(v => v.files && v.files.some(f => f.primary || f.filename.endsWith('.mrpack')));
         for (const v of validVersions) {
             const option = document.createElement('option');
             option.value = JSON.stringify(v);
             option.textContent = `${v.version_number} (MC ${v.game_versions.join(', ')})`;
             select.appendChild(option);
         }
      } else if (platform === 'curseforge') {
         const pxUrl = state.settings.curseforgeProxyUrl || 'https://patient-darkness-1364.yaman26.workers.dev/';
         const files = await window.launcherAPI.getCurseForgeFiles(projectId, pxUrl);
         if (!files || !files.data) throw new Error('Failed to fetch versions');
         
         const validFiles = files.data.filter(f => f.downloadUrl || f.serverPackFileId);
         for (const f of validFiles.sort((a,b)=> new Date(b.fileDate) - new Date(a.fileDate))) {
             const option = document.createElement('option');
             option.value = JSON.stringify({ fileData: f, projectId });
             const versionStrs = f.gameVersions ? ` (MC ${f.gameVersions.join(', ')})` : '';
             option.textContent = `${f.displayName}${versionStrs}`;
             select.appendChild(option);
         }
      }
      
      if (select.children.length === 0) {
         select.innerHTML = '<option disabled selected>No compatible versions found</option>';
      } else {
         $('btn-install-modpack').disabled = false;
      }
   } catch(e) {
      console.error(e);
      select.innerHTML = `<option disabled selected>Error: ${escapeHtml(e.message)}</option>`;
   } finally {
      loadingEl.classList.add('hidden');
      select.classList.remove('hidden');
   }

   $('btn-install-modpack').onclick = async () => {
      const val = select.value;
      if (!val) return;
      closeModal('mp-version-modal');
      
      setStatus('Installing Modpack...', 'Preparing to download', 'busy');
      switchView('home');
      scrollViewToTop('view-home-content');
      
      const parsed = JSON.parse(val);
      const randomPrefix = Math.floor(Math.random()*1000);
      const safeName = String(packName).toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const uniqueId = `${platform}-${safeName}-${randomPrefix}`;
      
      try {
         // Fake active modpack state during install
         state.activeModpack = {
            name: packName,
            description: description || 'Preparing to install...',
            loader: platform === 'modrinth' ? 'fabric' : 'forge',
            mcVersion: 'Starting...',
            version: 'Wait...'
         };
         updateActiveModpackUI();
         $('active-pack-progress-container').classList.remove('hidden');
         
         if (platform === 'modrinth') {
             await window.launcherAPI.installMrpack(uniqueId, parsed, { name: packName, description, iconUrl });
         } else if (platform === 'curseforge') {
             const pxUrl = state.settings.curseforgeProxyUrl || 'https://patient-darkness-1364.yaman26.workers.dev/';
             await window.launcherAPI.installCurseForgePack(uniqueId, parsed.fileData, pxUrl, { name: packName, description, iconUrl });
         }
         state.installedModpacks = await window.launcherAPI.getInstalledModpacks();
         setStatus('Modpack Installed', `${packName} was installed securely!`, 'running');
         
         const newlyInstalled = state.installedModpacks[uniqueId];
         if (newlyInstalled) {
            const loaderArr = newlyInstalled.modLoaders || [];
            const loaderStr = loaderArr.length ? loaderArr[0] : (newlyInstalled.loader || 'fabric');
            state.activeModpack = newlyInstalled;
            state.activeModpack.name = newlyInstalled.name || packName;
            state.loader = loaderStr.split('-')[0].toLowerCase();
            state.mcVersion = newlyInstalled.mcVersion || newlyInstalled.minecraftVersion || '1.20.4';
            if (loaderStr.includes('-')) {
                state.loaderVersion = loaderStr.split('-').slice(1).join('-');
            } else if (newlyInstalled.loaderVersion) {
                state.loaderVersion = newlyInstalled.loaderVersion;
            }
            
            setLoaderTab(state.loader);
            updateVersionUI();
            updateActiveModpackUI();
            scrollActiveModpackPanelIntoView();
         }
      } catch(e) {
         setStatus('Install failed', e.message, 'error');
         console.error('Install Pack failed:', e);
      } finally {
         $('active-pack-progress-container').classList.add('hidden');
      }
   };
}

async function init() {
  state.settings = await window.launcherAPI.getSettings();
    // Ensure default CurseForge proxy URL is set if missing
    if (!state.settings.curseforgeProxyUrl) {
        state.settings.curseforgeProxyUrl = 'https://patient-darkness-1364.yaman26.workers.dev/';
    }
  
  if (state.settings.password) {
     const lock = $('view-lock');
     openModal('view-lock');
     return new Promise(resolve => {
        $('btn-unlock').addEventListener('click', () => {
           if ($('lock-password-input').value === state.settings.password) {
              closeModal('view-lock');
              $('lock-password-input').value = '';
              setupCore().then(resolve);
           } else {
              $('lock-password-input').value = '';
              $('lock-password-input').placeholder = 'Incorrect Password';
              $('lock-password-input').classList.add('border-error');
           }
        });
     });
  } else {
      await setupCore();
      if (window.launcherAPI.showWindow) await window.launcherAPI.showWindow();
      // Animate home page static UI on first load
      revealPageUI('view-home-content');
      // Ensure home data triggers after initial paint; call immediately and as a fallback after a short delay
      try { loadHomeData(); } catch (e) { console.error('loadHomeData immediate call failed', e); }
      // fallback trigger in case of timing issues
      setTimeout(() => {
       try { loadHomeData(); } catch (e) { /* ignore */ }
      }, 250);
      // After 1s, if the user is already seeing the home view, simulate a Home button press
      setTimeout(() => {
        try {
          const homeView = $('view-home-content');
          if (homeView && !homeView.classList.contains('hidden')) {
            const navHome = $('nav-home');
            console.debug('Delayed startup: simulating Home button press');
            // Also print the home view content for debugging as requested
            try { console.debug('view-home-content innerHTML:', homeView.innerHTML); } catch (e) { /* ignore */ }
            if (navHome) navHome.click();
            else {
              // fallback: call the same handlers directly
              switchView('home');
              loadHomeData();
            }
          }
        } catch (e) {
          console.error('Simulating home press failed', e);
        }
      }, 1000);
  }
}

async function setupCore() {
  bindEvents();
  // attach deselect button for active pack
  $('active-pack-close')?.addEventListener('click', () => clearActiveModpack());
  
  if (state.settings?.memory) {
    state.memory = state.settings.memory;
    const ramSlider = $('ram-slider');
    if (ramSlider) ramSlider.value = String(state.memory);
    $('ram-label').textContent = `${state.memory}GB`;
  }
  
  state.account = await window.launcherAPI.getAccount();
  state.installedModpacks = await window.launcherAPI.getInstalledModpacks();
  
  // Restore modpack and version selections
  if (state.settings?.activeModpackId) {
     const savedId = state.settings.activeModpackId;
     const pack = state.installedModpacks[savedId] || Object.values(state.installedModpacks).find(p => p.name === savedId);
     if (pack) {
        state.activeModpack = pack;
     }
  }
  if (state.settings?.mcVersion) state.mcVersion = state.settings.mcVersion;
  if (state.settings?.loader) state.loader = state.settings.loader;
  if (state.settings?.loaderVersion) state.loaderVersion = state.settings.loaderVersion;

  setLoaderTab(state.loader);
  updateActiveModpackUI();
  
  updateAccountUI();
  await updateVersionUI();
  setStatus(
    state.account ? 'Ready to launch' : "Aqua Launcher'a hoş geldiniz",
    state.account
      ? `${$('version-label').textContent} selected.`
      : 'Hoş geldiniz! Ayarlar bölümünden sunucu JSON adresini değiştirebilirsiniz.',
  );
  await loadHomeData();
}

init();
