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
    const card = document.createElement('div');
    card.className = 'glass-card rounded-2xl p-3 min-w-[220px] max-w-[240px] min-h-[80px]  flex flex-col justify-between gap-2 hover:bg-white/10 transition-all cursor-pointer border border-white/10 slide-card';
    card.innerHTML = `
      <div>
        <h3 class="font-headline-md text-lg font-bold text-on-surface mb-1 line-clamp-2">${escapeHtml(pack.name)}</h3>
        <p class="text-[12px] text-on-surface-variant leading-snug line-clamp-3" title="${escapeHtml(pack.description || '')}">${escapeHtml(pack.description || 'No description available.')}</p>
      </div>
      <div class="flex flex-wrap gap-2 mt-3 text-[10px]">
        <span class="px-2 py-1 rounded-full bg-primary/10 text-primary">${escapeHtml(pack.loader || 'Unknown').toUpperCase()} ${escapeHtml(pack.loaderVersion || '')}</span>
        <span class="px-2 py-1 rounded-full bg-white/5 text-on-surface-variant">MC ${escapeHtml(pack.mcVersion || '')}</span>
        <span class="px-2 py-1 rounded-full bg-white/5 text-on-surface-variant">v${escapeHtml(pack.version || '')}</span>
      </div>
    `;
    card.style.transitionDelay = `${i * 45 + 50}ms`;
    window.setTimeout(() => card.classList.add('visible'), i * 45 + 50);
    card.onclick = () => {
      state.activeModpack = pack;
      state.loader = pack.loader.toLowerCase();
      state.mcVersion = pack.mcVersion;
      if (pack.loaderVersion) state.loaderVersion = pack.loaderVersion;

      setLoaderTab(state.loader);
      updateVersionUI();
      updateActiveModpackUI();
      setStatus('Modpack Selected', `Ready to play ${pack.name}`);
    };
    container.appendChild(card);
  }
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
}

function showHomeLoading(section, loading) {
  const loader = $(`home-${section}-loading`);
  const scroller = $(`home-${section}-scroller`);
  const prev = $(`home-${section}-prev`);
  const next = $(`home-${section}-next`);

  if (loader) loader.classList.toggle('hidden', !loading);
  if (scroller) scroller.classList.toggle('hidden', loading);
  if (prev) prev.classList.toggle('hidden', loading);
  if (next) next.classList.toggle('hidden', loading);
}

async function loadHomeModpackCarousel() {
  console.debug('loadHomeModpackCarousel: start');
  showHomeLoading('modpack', true);
  try {
    const urls = state.settings?.modpackUrls || ['https://raw.githubusercontent.com/yamanist0/aqua-launcher/refs/heads/main/modpacks.json'];
    let allModpacks = [];
    for (const u of urls) {
      try {
        const res = await fetch(u);
        if (res.ok) {
          const p = await res.json();
          if (Array.isArray(p)) allModpacks.push(...p);
        }
      } catch (e) {
        console.error('Failed fetching home modpacks:', u, e);
      }
    }
    state.homeModpacks = allModpacks;
    renderHomeModpackCarousel(allModpacks);
    revealStaggered($('home-modpack-scroller'), 35, 60);
    console.debug('loadHomeModpackCarousel: done, items=', allModpacks.length);
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
  container.innerHTML = '';
  state.homeNewsPage = 1;
  state.homeNewsLoading = false;
  state.homeNewsEnded = false;

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
}

async function loadVersions() {
  state.versions = await window.launcherAPI.getVersions();
  const select = $('mc-version-select');
  select.innerHTML = '';

  for (const version of state.versions.slice(0, 40)) {
    const option = document.createElement('option');
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
  $(id).classList.remove('hidden');
  $(id).classList.add('flex');
}

function closeModal(id) {
  $(id).classList.add('hidden');
  $(id).classList.remove('flex');
}

function setLoaderTab(loader) {
  state.loader = loader;
  state.loaderVersion = null;

  document.querySelectorAll('[data-loader-tab]').forEach((tab) => {
    const active = tab.dataset.loaderTab === loader;
    tab.classList.toggle('border-primary', active);
    tab.classList.toggle('text-primary', active);
    tab.classList.toggle('bg-white/5', active);
    tab.classList.toggle('text-on-surface-variant', !active);
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

  for (const version of versions.slice(0, 20)) {
    const option = document.createElement('option');
    option.value = version;
    option.textContent = version;
    select.appendChild(option);
  }

  state.loaderVersion = versions[0] || null;
  if (state.loaderVersion) select.value = state.loaderVersion;
}

function bindEvents() {
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
    await loadVersions();
    await refreshLoaderVersions();
    openModal('version-modal');
  });

  $('btn-play').addEventListener('click', async () => {
    if (!state.account || state.launching) return;
    
    if (state.activeModpack) {
      const pack = state.activeModpack;
      const installedPack = state.installedModpacks[pack.name];
      if (!installedPack || installedPack.version !== pack.version) {
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

  document.querySelectorAll('[data-loader-tab]').forEach((tab) => {
    tab.addEventListener('click', async () => {
      setLoaderTab(tab.dataset.loaderTab);
      await refreshLoaderVersions();
    });
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

  window.launcherAPI.onModpackStatus(({ state, message, progress }) => {
     if (state === 'downloading' && progress) {
         $('active-pack-status-txt').textContent = message;
         const pct = Math.round((progress.completed / progress.total) * 100);
         $('active-pack-status-pct').textContent = `${pct}%`;
         $('active-pack-progress-bar').style.width = `${pct}%`;
     } else {
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
    const isHidden = panel.classList.contains('hidden') || panel.style.display === 'none';
    if (isHidden) {
      panel.classList.remove('hidden');
      panel.style.display = 'block';
    } else {
      panel.classList.add('hidden');
      panel.style.display = 'none';
    }
  });

  $('btn-topbar-settings')?.addEventListener('click', () => {
    $('setting-password').value = state.settings.password || '';
    $('setting-java-args').value = state.settings.javaArgs || '';
    $('setting-modpack-urls').value = state.settings.modpackUrls ? state.settings.modpackUrls.join('\n') : '';
    $('setting-server-list-url').value = state.settings.serverListUrl || '';
    switchView('settings');
  });

  // Navigation events
  $('nav-home')?.addEventListener('click', () => {
    switchView('home');
    loadHomeData();
    scrollHomeToTop();
  });
  $('nav-modpacks')?.addEventListener('click', () => {
    switchView('modpacks');
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

  $('home-modpack-prev')?.addEventListener('click', () => scrollCarousel('home-modpack-scroller', -1));
  $('home-modpack-next')?.addEventListener('click', () => scrollCarousel('home-modpack-scroller', 1));
  $('home-server-prev')?.addEventListener('click', () => scrollCarousel('home-server-scroller', -1));
  $('home-server-next')?.addEventListener('click', () => {
    const container = $('home-server-scroller');
    if (!container) return;

    const maxScrollLeft = container.scrollWidth - container.clientWidth;
    const atEnd = container.scrollLeft >= maxScrollLeft - 2;

    if (atEnd) {
      switchView('multiplayer');
      state.mpPage = 2;
      loadMultiplayerList(state.mpPage);
      return;
    }

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
           $('setting-modpack-urls').value = state.settings.modpackUrls ? state.settings.modpackUrls.join('\n') : '';
           $('setting-server-list-url').value = state.settings.serverListUrl || '';
           switchView('settings');
        });
     } else if (a.textContent.includes('Multiplayer')) {
        a.id = 'nav-multiplayer';
        a.addEventListener('click', () => {
           switchView('multiplayer');
           state.mpPage = 1;
           loadMultiplayerList(state.mpPage);
        });
     }
  });

  $('btn-save-settings')?.addEventListener('click', async () => {
      const urls = $('setting-modpack-urls').value.split('\n').map(s => s.trim()).filter((s) => s.length > 0);
      const serverListUrl = $('setting-server-list-url').value.trim();
      const newSettings = {
         password: $('setting-password').value,
         javaArgs: $('setting-java-args').value,
         modpackUrls: urls.length ? urls : ['https://raw.githubusercontent.com/yamanist0/aqua-launcher/refs/heads/main/modpacks.json'],
         serverListUrl: serverListUrl || 'https://raw.githubusercontent.com/yamanist0/aqua-launcher/refs/heads/main/servers.json',
         memory: state.memory,
      };
      state.settings = newSettings;
      await window.launcherAPI.saveSettings(newSettings);
      setStatus('Settings Saved', 'Ayarlar kaydedildi.');
      await loadHomeData();
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
  $('active-pack-loader').textContent = pack.loader.toUpperCase();
  $('active-pack-mc').textContent = `MC ${pack.mcVersion}`;
  $('active-pack-version').textContent = `v${pack.version}`;
  
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
}

function clearActiveModpack() {
  state.activeModpack = null;
  updateActiveModpackUI();
  setStatus('No modpack selected', 'Modpack selection cleared.');
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
    el.classList.toggle('text-primary', active);
    el.classList.toggle('font-bold', active);
    el.classList.toggle('border-l-2', active);
    el.classList.toggle('border-primary', active);
    el.classList.toggle('bg-white/5', active);
    el.classList.toggle('text-on-surface-variant', !active);
  };

  styleActive(navHome, isHome);
  styleActive(navModpacks, isModpacks);
  styleActive(navSettings, isSettings);
  styleActive(navMultiplayer, isMultiplayer);
}

async function loadMultiplayerList(page = 1) {
  const loading = $('multiplayer-loading');
  const grid = $('multiplayer-grid');
  if (!grid) return;

  loading?.classList.remove('hidden');
  try {
      const data = await window.launcherAPI.getServersPage(page, state.settings.serverListUrl);
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

async function loadModpacksList() {
  const loading = $('modpacks-loading');
  const grid = $('modpacks-grid');
  if (!grid) return;

  loading?.classList.remove('hidden');
  try {
    const urls = state.settings.modpackUrls || ['https://raw.githubusercontent.com/yamanist0/aqua-launcher/refs/heads/main/modpacks.json'];
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
    // Put installed/downlaoded modpacks first in the list
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
            <h3 class="font-headline-md text-lg font-bold text-on-surface truncate">${pack.name}</h3>
          </div>
          ${isInstalled ? '<button class="reinstall-modpack-btn px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-[10px] font-semibold">Reinstall</button>' : '<span class="material-symbols-outlined text-primary group-hover:block transition-all">download</span>'}
        </div>
        <p class="text-sm text-on-surface-variant flex-grow">${pack.description || 'A fantastic modpack ready to be played.'}</p>
        <div class="flex flex-wrap gap-2 mt-auto">
            <span class="px-2 py-0.5 rounded border border-primary/30 bg-primary/10 text-primary text-[10px] font-label-sm uppercase font-bold">${pack.loader} ${pack.loaderVersion || ''}</span>
            <span class="px-2 py-0.5 rounded border border-white/10 bg-surface-variant/50 text-on-surface-variant text-[10px] font-label-sm">MC ${pack.mcVersion}</span>
            <span class="px-2 py-0.5 rounded border border-white/10 bg-surface-variant/50 text-on-surface-variant text-[10px] font-label-sm">v${pack.version}</span>
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
  } catch (error) {
    grid.innerHTML = `<div class="col-span-full p-4 rounded-xl bg-error-container/20 border border-error-container text-error text-center text-sm">${error.message}</div>`;
  } finally {
    loading?.classList.add('hidden');
  }
}

async function init() {
  state.settings = await window.launcherAPI.getSettings();
  
  if (state.settings.password) {
     const lock = $('view-lock');
     lock.classList.remove('hidden');
     lock.classList.add('flex');
     return new Promise(resolve => {
        $('btn-unlock').addEventListener('click', () => {
           if ($('lock-password-input').value === state.settings.password) {
              lock.classList.add('hidden');
              lock.classList.remove('flex');
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
  
  setLoaderTab(state.loader);
  state.account = await window.launcherAPI.getAccount();
  state.installedModpacks = await window.launcherAPI.getInstalledModpacks();
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
