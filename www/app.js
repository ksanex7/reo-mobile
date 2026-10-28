// ==========================================
// reo Mobile iOS Player Core
// ==========================================

const state = {
  currentTrack: null,
  queue: [],
  queueIndex: -1,
  isPlaying: false,
  isShuffle: false,
  repeatMode: 'none', // 'none' | 'all' | 'one'
  lyrics: [],
  activeLyricIdx: -1,
  favorites: [],
  playlists: [],
  currentView: 'viewExplore'
};

// DOM Elements
const audio = document.getElementById('audioPlayer');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const pingBadge = document.getElementById('pingBadge');
const settingBackendUrl = document.getElementById('settingBackendUrl');
const settingAccountUrl = document.getElementById('settingAccountUrl');
const btnTestServer = document.getElementById('btnTestServer');

// Views
const views = document.querySelectorAll('.app-view');
const navTabs = document.querySelectorAll('.nav-tab');

// Mini Player
const miniPlayer = document.getElementById('miniPlayer');
const miniProgressBar = document.getElementById('miniProgressBar');
const miniArt = document.getElementById('miniArt');
const miniTitle = document.getElementById('miniTitle');
const miniArtist = document.getElementById('miniArtist');
const miniPlayIcon = document.getElementById('miniPlayIcon');
const btnMiniPlay = document.getElementById('btnMiniPlay');
const btnMiniNext = document.getElementById('btnMiniNext');
const miniPlayerClickArea = document.getElementById('miniPlayerClickArea');

// Fullscreen Sheet
const playerSheet = document.getElementById('playerSheet');
const sheetBackdrop = document.getElementById('sheetBackdrop');
const sheetHandle = document.getElementById('sheetHandle');
const btnDismissSheet = document.getElementById('btnDismissSheet');
const sheetArt = document.getElementById('sheetArt');
const sheetTitle = document.getElementById('sheetTitle');
const sheetArtist = document.getElementById('sheetArtist');
const btnSheetLike = document.getElementById('btnSheetLike');
const sheetLikeIcon = document.getElementById('sheetLikeIcon');
const scrubberContainer = document.getElementById('scrubberContainer');
const scrubberFill = document.getElementById('scrubberFill');
const scrubberThumb = document.getElementById('scrubberThumb');
const currentTimeLabel = document.getElementById('currentTimeLabel');
const durationLabel = document.getElementById('durationLabel');
const btnShuffle = document.getElementById('btnShuffle');
const btnPrev = document.getElementById('btnPrev');
const btnSheetPlay = document.getElementById('btnSheetPlay');
const sheetPlayIcon = document.getElementById('sheetPlayIcon');
const btnNext = document.getElementById('btnNext');
const btnRepeat = document.getElementById('btnRepeat');
const btnSheetOpenLyrics = document.getElementById('btnSheetOpenLyrics');

// Lyrics Elements
const lyricsArtThumb = document.getElementById('lyricsArtThumb');
const lyricsTrackTitle = document.getElementById('lyricsTrackTitle');
const lyricsTrackArtist = document.getElementById('lyricsTrackArtist');
const lyricsScrollBox = document.getElementById('lyricsScrollBox');
const btnSearchLyricsManual = document.getElementById('btnSearchLyricsManual');

// Toast
const toast = document.getElementById('toastNotification');

// ==================== CONFIG & SERVER URL ====================
const DEFAULT_BACKEND_URL = 'http://vstavaydonbass.duckdns.org:8080';
const DEFAULT_ACCOUNT_URL = 'http://vstavaydonbass.duckdns.org:8001';

const BACKEND_CANDIDATES = [
  'http://vstavaydonbass.duckdns.org:8080',
  'http://192.168.1.102:8080',
  'http://86.45.130.8:8080'
];

const ACCOUNT_CANDIDATES = [
  'http://vstavaydonbass.duckdns.org:8001',
  'http://192.168.1.102:8001',
  'http://86.45.130.8:8001'
];

function getBackendUrl() {
  const saved = localStorage.getItem('reo_backend_url');
  if (saved && saved.trim()) {
    const clean = saved.trim().replace(/\/+$/, '');
    if (clean.includes('127.0.0.1') || clean.includes('localhost')) {
      return DEFAULT_BACKEND_URL;
    }
    return clean;
  }
  return DEFAULT_BACKEND_URL;
}

function getAccountUrl() {
  const saved = localStorage.getItem('reo_account_url');
  if (saved && saved.trim()) {
    const clean = saved.trim().replace(/\/+$/, '');
    if (clean.includes('127.0.0.1') || clean.includes('localhost')) {
      return DEFAULT_ACCOUNT_URL;
    }
    return clean;
  }
  return DEFAULT_ACCOUNT_URL;
}

function setBackendUrl(url) {
  const clean = (url || '').trim().replace(/\/+$/, '');
  localStorage.setItem('reo_backend_url', clean);
  if (settingBackendUrl) settingBackendUrl.value = clean;
}

function setAccountUrl(url) {
  const clean = (url || '').trim().replace(/\/+$/, '');
  localStorage.setItem('reo_account_url', clean);
  if (settingAccountUrl) settingAccountUrl.value = clean;
}

async function testServerConnection() {
  if (statusDot) {
    statusDot.className = 'status-indicator-dot';
    statusText.textContent = 'Проверка...';
  }
  if (pingBadge) {
    pingBadge.className = 'setting-badge';
    pingBadge.textContent = 'Подключение...';
  }

  const probeOne = async (target) => {
    const startTime = performance.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${target}/health`, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        return { target, latency: Math.round(performance.now() - startTime) };
      }
    } catch (e) {}
    return null;
  };

  const current = getBackendUrl();
  const pool = [current, ...BACKEND_CANDIDATES.filter(c => c !== current)];
  const results = await Promise.all(pool.map(probeOne));
  const successful = results.filter(r => r !== null).sort((a, b) => a.latency - b.latency);

  if (successful.length > 0) {
    const fastest = successful[0];
    setBackendUrl(fastest.target);
    const pairedAccount = fastest.target.replace(':8080', ':8001');
    setAccountUrl(pairedAccount);

    if (statusDot) {
      statusDot.className = 'status-indicator-dot online';
      statusText.textContent = `${fastest.latency} ms`;
    }
    if (pingBadge) {
      pingBadge.className = 'setting-badge online';
      pingBadge.textContent = `В сети (${fastest.latency} ms)`;
    }
    return true;
  }

  if (statusDot) {
    statusDot.className = 'status-indicator-dot offline';
    statusText.textContent = 'Офлайн';
  }
  if (pingBadge) {
    pingBadge.className = 'setting-badge offline';
    pingBadge.textContent = 'Сервер недоступен';
  }
  return false;
}

// Universal fetch with automatic candidate failover for backend
async function backendFetch(endpoint, options = {}) {
  const current = getBackendUrl();
  const pool = [current, ...BACKEND_CANDIDATES.filter(c => c !== current)];

  let lastErr = null;
  for (const base of pool) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(`${base}${endpoint}`, { ...options, signal: controller.signal });
      clearTimeout(timer);
      if (res.ok || (res.status >= 400 && res.status < 500)) {
        if (base !== current) {
          setBackendUrl(base);
          const pairedAcc = base.replace(':8080', ':8001');
          if (ACCOUNT_CANDIDATES.includes(pairedAcc)) {
            setAccountUrl(pairedAcc);
          }
        }
        return res;
      }
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Сервер недоступен');
}

// ==================== TOAST & HELPERS ====================
function showToast(msg) {
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2400);
}

function formatTime(sec) {
  if (!sec || isNaN(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// ==================== NAVIGATION TABS ====================
function switchView(viewId) {
  state.currentView = viewId;
  views.forEach(v => v.classList.toggle('active', v.id === viewId));
  navTabs.forEach(t => t.classList.toggle('active', t.dataset.view === viewId));

  if (viewId === 'viewLyrics' && state.currentTrack) {
    setTimeout(scrollActiveLyricToCenter, 50);
  }
}

navTabs.forEach(tab => {
  tab.addEventListener('click', () => switchView(tab.dataset.view));
});

// ==================== AUDIO & PLAYBACK ENGINE ====================
function playTrack(track, queueList = null, startIndex = 0) {
  if (!track) return;
  state.currentTrack = track;

  if (queueList && Array.isArray(queueList)) {
    state.queue = [...queueList];
    state.queueIndex = startIndex >= 0 ? startIndex : state.queue.findIndex(t => t.id === track.id);
  } else if (!state.queue.find(t => t.id === track.id)) {
    state.queue.push(track);
    state.queueIndex = state.queue.length - 1;
  }

  // Update UI metadata
  updatePlayerUI(track);

  // Build stream URL
  const backend = getBackendUrl();
  let streamSrc = track.stream_url || '';
  if (!streamSrc.startsWith('http')) {
    streamSrc = `${backend}/api/stream?track_url=${encodeURIComponent(track.url || '')}&title=${encodeURIComponent(track.title || '')}&artist=${encodeURIComponent(track.artist || '')}`;
  } else if (!streamSrc.includes('/api/stream') && !streamSrc.includes('sndcdn.com')) {
    streamSrc = `${backend}/api/stream?stream_url=${encodeURIComponent(streamSrc)}&title=${encodeURIComponent(track.title || '')}&artist=${encodeURIComponent(track.artist || '')}`;
  }

  audio.src = streamSrc;
  audio.play().then(() => {
    state.isPlaying = true;
    updatePlayState(true);
  }).catch(e => {
    console.warn('Playback error:', e);
    state.isPlaying = false;
    updatePlayState(false);
  });

  // Fetch lyrics
  fetchLyrics(track.artist, track.title, track.duration);

  // Setup iOS MediaSession for lock screen
  updateMediaSession(track);
}

function updatePlayState(isPlaying) {
  state.isPlaying = isPlaying;
  const playSvg = '<polygon points="5 3 19 12 5 21 5 3"></polygon>';
  const pauseSvg = '<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>';

  if (miniPlayIcon) miniPlayIcon.innerHTML = isPlaying ? pauseSvg : playSvg;
  if (sheetPlayIcon) sheetPlayIcon.innerHTML = isPlaying ? pauseSvg : playSvg;
  if (miniPlayer) miniPlayer.style.display = 'flex';

  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }
}

function togglePlayPause() {
  if (!state.currentTrack) {
    if (state.queue.length > 0) playTrack(state.queue[0]);
    return;
  }
  if (audio.paused) {
    audio.play().then(() => updatePlayState(true)).catch(() => {});
  } else {
    audio.pause();
    updatePlayState(false);
  }
}

function playNext() {
  if (state.queue.length === 0) return;
  if (state.repeatMode === 'one') {
    audio.currentTime = 0;
    audio.play();
    return;
  }
  let nextIdx = state.queueIndex + 1;
  if (state.isShuffle) {
    nextIdx = Math.floor(Math.random() * state.queue.length);
  } else if (nextIdx >= state.queue.length) {
    if (state.repeatMode === 'all') nextIdx = 0;
    else return;
  }
  state.queueIndex = nextIdx;
  playTrack(state.queue[nextIdx]);
}

function playPrev() {
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    return;
  }
  if (state.queue.length === 0) return;
  let prevIdx = state.queueIndex - 1;
  if (prevIdx < 0) prevIdx = state.queue.length - 1;
  state.queueIndex = prevIdx;
  playTrack(state.queue[prevIdx]);
}

function updatePlayerUI(track) {
  const artUrl = track.artwork || 'reo.png';
  const title = track.title || 'Без названия';
  const artist = track.artist || 'Неизвестный исполнитель';

  // Mini Player
  if (miniArt) miniArt.src = artUrl;
  if (miniTitle) miniTitle.textContent = title;
  if (miniArtist) miniArtist.textContent = artist;

  // Sheet
  if (sheetArt) sheetArt.src = artUrl;
  if (sheetTitle) sheetTitle.textContent = title;
  if (sheetArtist) sheetArtist.textContent = artist;
  if (sheetBackdrop) sheetBackdrop.style.backgroundImage = `url(${artUrl})`;

  // Lyrics Header
  if (lyricsArtThumb) lyricsArtThumb.src = artUrl;
  if (lyricsTrackTitle) lyricsTrackTitle.textContent = title;
  if (lyricsTrackArtist) lyricsTrackArtist.textContent = artist;

  // Duration label
  if (track.duration && durationLabel) {
    durationLabel.textContent = formatTime(track.duration);
  }

  // Like icon
  updateLikeState();
}

function updateMediaSession(track) {
  if (!('mediaSession' in navigator)) return;
  const art = track.artwork || 'reo.png';
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title || 'reo',
    artist: track.artist || 'reo Music',
    album: 'SoundCloud HQ',
    artwork: [
      { src: art, sizes: '512x512', type: 'image/jpeg' }
    ]
  });

  navigator.mediaSession.setActionHandler('play', () => {
    audio.play();
    updatePlayState(true);
  });
  navigator.mediaSession.setActionHandler('pause', () => {
    audio.pause();
    updatePlayState(false);
  });
  navigator.mediaSession.setActionHandler('previoustrack', playPrev);
  navigator.mediaSession.setActionHandler('nexttrack', playNext);
  navigator.mediaSession.setActionHandler('seekto', (details) => {
    if (details.seekTime !== undefined) {
      audio.currentTime = details.seekTime;
    }
  });
}

// Audio Event Listeners
audio.addEventListener('play', () => updatePlayState(true));
audio.addEventListener('pause', () => updatePlayState(false));
audio.addEventListener('ended', playNext);
audio.addEventListener('timeupdate', () => {
  const cur = audio.currentTime || 0;
  const dur = audio.duration || state.currentTrack?.duration || 0;
  if (currentTimeLabel) currentTimeLabel.textContent = formatTime(cur);

  if (dur > 0) {
    const pct = Math.max(0, Math.min(100, (cur / dur) * 100));
    if (miniProgressBar) miniProgressBar.style.width = `${pct}%`;
    if (scrubberFill) scrubberFill.style.width = `${pct}%`;
    if (scrubberThumb) scrubberThumb.style.left = `${pct}%`;
    if (durationLabel && !durationLabel.dataset.set) {
      durationLabel.textContent = formatTime(dur);
    }
  }

  updateActiveLyric(cur);
});

// Scrubber seeking
let isScrubbing = false;
function handleScrubberMove(e) {
  const rect = scrubberContainer.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  const dur = audio.duration || state.currentTrack?.duration || 0;
  if (scrubberFill) scrubberFill.style.width = `${pos * 100}%`;
  if (scrubberThumb) scrubberThumb.style.left = `${pos * 100}%`;
  if (currentTimeLabel) currentTimeLabel.textContent = formatTime(pos * dur);
  return pos * dur;
}

if (scrubberContainer) {
  scrubberContainer.addEventListener('touchstart', (e) => {
    isScrubbing = true;
    handleScrubberMove(e);
  }, { passive: true });

  scrubberContainer.addEventListener('touchmove', (e) => {
    if (isScrubbing) handleScrubberMove(e);
  }, { passive: true });

  scrubberContainer.addEventListener('touchend', (e) => {
    if (isScrubbing) {
      const seekTime = handleScrubberMove(e);
      if (seekTime >= 0 && !isNaN(seekTime)) audio.currentTime = seekTime;
      isScrubbing = false;
    }
  });

  scrubberContainer.addEventListener('click', (e) => {
    const seekTime = handleScrubberMove(e);
    if (seekTime >= 0 && !isNaN(seekTime)) audio.currentTime = seekTime;
  });
}

// Mini player & Sheet controls
if (btnMiniPlay) btnMiniPlay.addEventListener('click', (e) => {
  e.stopPropagation();
  togglePlayPause();
});
if (btnMiniNext) btnMiniNext.addEventListener('click', (e) => {
  e.stopPropagation();
  playNext();
});
if (miniPlayerClickArea) miniPlayerClickArea.addEventListener('click', () => {
  if (playerSheet) playerSheet.classList.add('open');
});
if (btnDismissSheet) btnDismissSheet.addEventListener('click', () => {
  if (playerSheet) playerSheet.classList.remove('open');
});
if (sheetHandle) sheetHandle.addEventListener('click', () => {
  if (playerSheet) playerSheet.classList.remove('open');
});
if (btnSheetPlay) btnSheetPlay.addEventListener('click', togglePlayPause);
if (btnNext) btnNext.addEventListener('click', playNext);
if (btnPrev) btnPrev.addEventListener('click', playPrev);

if (btnShuffle) btnShuffle.addEventListener('click', () => {
  state.isShuffle = !state.isShuffle;
  btnShuffle.classList.toggle('active', state.isShuffle);
  showToast(state.isShuffle ? 'Перемешивание включено' : 'Перемешивание выключено');
});

if (btnRepeat) btnRepeat.addEventListener('click', () => {
  if (state.repeatMode === 'none') {
    state.repeatMode = 'all';
    btnRepeat.classList.add('active');
    showToast('Повтор всех треков');
  } else if (state.repeatMode === 'all') {
    state.repeatMode = 'one';
    btnRepeat.classList.add('active');
    showToast('Повтор текущего трека');
  } else {
    state.repeatMode = 'none';
    btnRepeat.classList.remove('active');
    showToast('Повтор выключен');
  }
});

if (btnSheetOpenLyrics) btnSheetOpenLyrics.addEventListener('click', () => {
  if (playerSheet) playerSheet.classList.remove('open');
  switchView('viewLyrics');
});

// Favorites (Likes)
function loadFavorites() {
  try {
    const saved = localStorage.getItem('reo_mobile_favorites');
    if (saved) state.favorites = JSON.parse(saved);
  } catch (e) {}
  updateFavoritesUI();
}

function toggleLikeCurrentTrack() {
  if (!state.currentTrack) return;
  const id = state.currentTrack.id;
  const idx = state.favorites.findIndex(t => t.id === id);
  if (idx >= 0) {
    state.favorites.splice(idx, 1);
    showToast('Удалено из Избранного');
  } else {
    state.favorites.unshift(state.currentTrack);
    showToast('Добавлено в Избранное');
  }
  localStorage.setItem('reo_mobile_favorites', JSON.stringify(state.favorites));
  updateLikeState();
  updateFavoritesUI();
}

function updateLikeState() {
  if (!state.currentTrack || !btnSheetLike) return;
  const isLiked = state.favorites.some(t => t.id === state.currentTrack.id);
  btnSheetLike.classList.toggle('liked', isLiked);
}

function updateFavoritesUI() {
  const countEl = document.getElementById('favCount');
  if (countEl) countEl.textContent = state.favorites.length;
  const container = document.getElementById('libraryFavoritesContainer');
  if (!container) return;
  if (state.favorites.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>В Избранном пока нет треков</p></div>';
    return;
  }
  container.innerHTML = '';
  state.favorites.forEach((t, i) => {
    container.appendChild(renderTrackItem(t, () => playTrack(t, state.favorites, i)));
  });
}

if (btnSheetLike) btnSheetLike.addEventListener('click', toggleLikeCurrentTrack);

// ==================== TRACK ITEM RENDERING ====================
function renderTrackItem(track, onClick) {
  const el = document.createElement('div');
  el.className = 'track-item';
  if (state.currentTrack && state.currentTrack.id === track.id) {
    el.classList.add('playing');
  }

  el.innerHTML = `
    <img class="track-thumb" src="${track.artwork || 'reo.png'}" loading="lazy" alt="Cover">
    <div class="track-details">
      <div class="track-name">${escapeHtml(track.title || '')}</div>
      <div class="track-meta">${escapeHtml(track.artist || '')}</div>
    </div>
    <div class="track-time">${formatTime(track.duration || 0)}</div>
  `;

  el.addEventListener('click', () => {
    document.querySelectorAll('.track-item').forEach(i => i.classList.remove('playing'));
    el.classList.add('playing');
    onClick();
  });
  return el;
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, s => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[s]);
}

// ==================== SEARCH ====================
const searchInput = document.getElementById('searchInput');
const btnSearchClear = document.getElementById('btnSearchClear');
const searchResultsList = document.getElementById('searchResultsList');
const filterChips = document.querySelectorAll('.chip');
let activeFilter = 'tracks';
let searchDebounceTimer = null;

filterChips.forEach(chip => {
  chip.addEventListener('click', () => {
    filterChips.forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    activeFilter = chip.dataset.type;
    doSearch();
  });
});

if (searchInput) {
  searchInput.addEventListener('input', () => {
    const val = searchInput.value.trim();
    if (btnSearchClear) btnSearchClear.style.display = val ? 'flex' : 'none';
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(doSearch, 400);
  });
}

if (btnSearchClear) {
  btnSearchClear.addEventListener('click', () => {
    searchInput.value = '';
    btnSearchClear.style.display = 'none';
    searchResultsList.innerHTML = '<div class="empty-state"><p>Введите запрос для поиска</p></div>';
  });
}

async function doSearch() {
  const query = (searchInput ? searchInput.value : '').trim();
  if (!query) return;

  searchResultsList.innerHTML = '<div class="loading-state"><div class="spinner"></div><span>Поиск...</span></div>';
  const isRemix = activeFilter === 'remix';
  const sType = activeFilter === 'remix' ? 'tracks' : activeFilter;

  try {
    const res = await backendFetch(`/api/search?q=${encodeURIComponent(query)}&search_type=${sType}&remix=${isRemix}&limit=25`);
    const data = await res.json();
    const tracks = data.tracks || [];

    if (tracks.length === 0) {
      searchResultsList.innerHTML = '<div class="empty-state"><p>Ничего не найдено</p></div>';
      return;
    }

    searchResultsList.innerHTML = '';
    tracks.forEach((t, i) => {
      searchResultsList.appendChild(renderTrackItem(t, () => playTrack(t, tracks, i)));
    });
  } catch (err) {
    searchResultsList.innerHTML = `<div class="empty-state"><p>Ошибка подключения к бэкенду.<br>Проверьте адрес в Настройках.</p></div>`;
  }
}

// ==================== EXPLORE / POPULAR ====================
async function loadPopularTracks() {
  const container = document.getElementById('popularTracksList');
  if (!container) return;
  container.innerHTML = '<div class="loading-state"><div class="spinner"></div><span>Загрузка...</span></div>';

  try {
    const res = await backendFetch('/api/popular?limit=20');
    const data = await res.json();
    const tracks = data.tracks || [];

    if (tracks.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>Список пуст</p></div>';
      return;
    }

    container.innerHTML = '';
    tracks.forEach((t, i) => {
      container.appendChild(renderTrackItem(t, () => playTrack(t, tracks, i)));
    });
  } catch (err) {
    container.innerHTML = '<div class="empty-state"><p>Не удалось связаться с сервером.<br>Укажите IP-адрес сервера в Настройках.</p></div>';
  }
}

const btnRefreshPopular = document.getElementById('btnRefreshPopular');
if (btnRefreshPopular) btnRefreshPopular.addEventListener('click', loadPopularTracks);

// ==================== LYRICS / KARAOKE ====================
let currentLyricsReqId = 0;

async function fetchLyrics(artist, title, duration = 0) {
  const reqId = ++currentLyricsReqId;
  lyricsScrollBox.innerHTML = '<div class="lyric-line prompt">Загрузка караоке...</div>';
  state.lyrics = [];
  state.activeLyricIdx = -1;

  try {
    let searchArt = artist || '';
    let searchTit = title || '';

    // Check localStorage custom mapping
    const trackKey = `${state.currentTrack?.id || ''}::${searchArt.toLowerCase()}::${searchTit.toLowerCase()}`;
    const saved = localStorage.getItem('reo_lyrics_override_' + trackKey);
    if (saved) {
      try {
        const p = JSON.parse(saved);
        if (p.artist) searchArt = p.artist;
        if (p.title) searchTit = p.title;
      } catch (e) {}
    }

    let endpoint = `/api/lyrics?artist=${encodeURIComponent(searchArt)}&title=${encodeURIComponent(searchTit)}`;
    if (duration > 0) endpoint += `&duration=${Math.round(duration)}`;

    const res = await backendFetch(endpoint);
    if (reqId !== currentLyricsReqId) return;
    const data = await res.json();
    if (reqId !== currentLyricsReqId) return;

    if (data.synced) {
      parseLrc(data.synced);
    } else if (data.plain) {
      state.lyrics = [];
      lyricsScrollBox.innerHTML = data.plain.split('\n')
        .map(l => `<div class="lyric-line" style="opacity: 0.85; font-size: 20px;">${escapeHtml(l || '')}</div>`)
        .join('');
    } else {
      lyricsScrollBox.innerHTML = `
        <div style="text-align: center; margin-top: 40px;">
          <div class="lyric-line prompt" style="margin-bottom: 16px;">Текст песни не найден</div>
          <button class="btn-primary" onclick="openLyricsManualModal()" style="margin: 0 auto; display: inline-flex;">Найти вручную</button>
        </div>
      `;
    }
  } catch (err) {
    if (reqId === currentLyricsReqId) {
      lyricsScrollBox.innerHTML = '<div class="lyric-line prompt">Ошибка загрузки текста</div>';
    }
  }
}

function parseLrc(lrcText) {
  state.lyrics = [];
  state.activeLyricIdx = -1;
  const timeRegex = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
  const lines = lrcText.split(/\r?\n/);

  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const matches = [...trimmed.matchAll(timeRegex)];
    if (matches.length > 0) {
      const text = trimmed.replace(timeRegex, '').trim();
      if (!text) return;
      matches.forEach(m => {
        const min = parseInt(m[1], 10);
        const sec = parseInt(m[2], 10);
        const msStr = m[3] || '0';
        const ms = parseInt(msStr.padEnd(3, '0').slice(0, 3), 10);
        state.lyrics.push({ time: min * 60 + sec + ms / 1000, text });
      });
    }
  });

  state.lyrics.sort((a, b) => a.time - b.time);
  lyricsScrollBox.innerHTML = '';
  const frag = document.createDocumentFragment();

  state.lyrics.forEach((item, idx) => {
    const el = document.createElement('div');
    el.className = 'lyric-line';
    el.textContent = item.text;
    el.dataset.idx = idx;
    el.addEventListener('click', () => {
      audio.currentTime = item.time;
      updateActiveLyric(item.time, true);
    });
    frag.appendChild(el);
  });

  lyricsScrollBox.appendChild(frag);
  updateActiveLyric(audio.currentTime, true);
}

function updateActiveLyric(currentTime, force = false) {
  if (state.lyrics.length === 0) return;
  let active = -1;
  for (let i = 0; i < state.lyrics.length; i++) {
    if (currentTime >= state.lyrics[i].time) active = i;
    else break;
  }

  if (active !== state.activeLyricIdx || force) {
    const lines = lyricsScrollBox.querySelectorAll('.lyric-line');
    if (state.activeLyricIdx >= 0 && lines[state.activeLyricIdx]) {
      lines[state.activeLyricIdx].classList.remove('active');
    }
    state.activeLyricIdx = active;
    if (active >= 0 && lines[active]) {
      lines[active].classList.add('active');
      scrollActiveLyricToCenter();
    }
  }
}

function scrollActiveLyricToCenter() {
  const activeEl = lyricsScrollBox.querySelector('.lyric-line.active');
  if (activeEl) {
    const boxHeight = lyricsScrollBox.clientHeight;
    const elTop = activeEl.offsetTop - lyricsScrollBox.offsetTop;
    lyricsScrollBox.scrollTo({
      top: elTop - boxHeight / 2 + activeEl.clientHeight / 2,
      behavior: 'smooth'
    });
  }
}

// Manual Lyrics Modal
const modalLyricsSearch = document.getElementById('modalLyricsSearch');
const btnCloseLyricsModal = document.getElementById('btnCloseLyricsModal');
const btnCancelLyricsModal = document.getElementById('btnCancelLyricsModal');
const btnSubmitLyricsModal = document.getElementById('btnSubmitLyricsModal');
const lyricsManualArtistInput = document.getElementById('lyricsManualArtistInput');
const lyricsManualTitleInput = document.getElementById('lyricsManualTitleInput');
const lyricsManualStatus = document.getElementById('lyricsManualStatus');

window.openLyricsManualModal = function() {
  if (!modalLyricsSearch) return;
  const track = state.currentTrack;
  let defaultArt = track ? (track.artist || '') : '';
  let defaultTit = track ? (track.title || '') : '';

  // Clean remix tags
  defaultTit = defaultTit.replace(/\s*[\(\[](?:[^\)\]]*(?:remix|mix|edit|bootleg|flip|rework|sped\s*up|slowed)[^\)\]]*)[\)\]]/gi, '').trim();

  if (lyricsManualArtistInput) lyricsManualArtistInput.value = defaultArt;
  if (lyricsManualTitleInput) lyricsManualTitleInput.value = defaultTit;
  if (lyricsManualStatus) {
    lyricsManualStatus.style.display = 'none';
    lyricsManualStatus.textContent = '';
  }
  modalLyricsSearch.classList.add('active');
};

function closeLyricsManualModal() {
  if (modalLyricsSearch) modalLyricsSearch.classList.remove('active');
}

if (btnSearchLyricsManual) btnSearchLyricsManual.addEventListener('click', openLyricsManualModal);
if (btnCloseLyricsModal) btnCloseLyricsModal.addEventListener('click', closeLyricsManualModal);
if (btnCancelLyricsModal) btnCancelLyricsModal.addEventListener('click', closeLyricsManualModal);

if (btnSubmitLyricsModal) {
  btnSubmitLyricsModal.addEventListener('click', async () => {
    const art = (lyricsManualArtistInput ? lyricsManualArtistInput.value : '').trim();
    const tit = (lyricsManualTitleInput ? lyricsManualTitleInput.value : '').trim();
    if (!art && !tit) return;

    btnSubmitLyricsModal.disabled = true;
    btnSubmitLyricsModal.textContent = 'Поиск...';

    try {
      const res = await backendFetch(`/api/lyrics?artist=${encodeURIComponent(art)}&title=${encodeURIComponent(tit)}`);
      const data = await res.json();
      if (data && (data.synced || data.plain)) {
        const cur = state.currentTrack || {};
        const key = `${cur.id || ''}::${(cur.artist || '').toLowerCase()}::${(cur.title || '').toLowerCase()}`;
        localStorage.setItem('reo_lyrics_override_' + key, JSON.stringify({ artist: art, title: tit }));

        if (data.synced) parseLrc(data.synced);
        else if (data.plain) {
          lyricsScrollBox.innerHTML = data.plain.split('\n')
            .map(l => `<div class="lyric-line" style="opacity: 0.85; font-size: 20px;">${escapeHtml(l || '')}</div>`)
            .join('');
        }
        showToast('Текст успешно привязан!');
        closeLyricsManualModal();
      } else {
        if (lyricsManualStatus) {
          lyricsManualStatus.style.display = 'block';
          lyricsManualStatus.textContent = 'Текст не найден. Попробуйте уточнить название.';
        }
      }
    } catch (e) {
      if (lyricsManualStatus) {
        lyricsManualStatus.style.display = 'block';
        lyricsManualStatus.textContent = 'Ошибка запроса к серверу.';
      }
    } finally {
      btnSubmitLyricsModal.disabled = false;
      btnSubmitLyricsModal.textContent = 'Найти текст';
    }
  });
}

// ==================== AUTH & ACCOUNT MANAGEMENT ====================
let currentUser = null;
let authToken = localStorage.getItem('reo_token') || null;
let currentAuthMode = 'login'; // 'login' | 'register'

// Auth elements
const authModal = document.getElementById('authModal');
const authTabLogin = document.getElementById('authTabLogin');
const authTabRegister = document.getElementById('authTabRegister');
const authTitle = document.getElementById('authTitle');
const authSubtitle = document.getElementById('authSubtitle');
const authForm = document.getElementById('authForm');
const authEmailInput = document.getElementById('authEmailInput');
const authNicknameGroup = document.getElementById('authNicknameGroup');
const authNicknameInput = document.getElementById('authNicknameInput');
const authPasswordInput = document.getElementById('authPasswordInput');
const authConfirmPassGroup = document.getElementById('authConfirmPassGroup');
const authConfirmPassInput = document.getElementById('authConfirmPassInput');
const authErrorAlert = document.getElementById('authErrorAlert');
const btnAuthSubmit = document.getElementById('btnAuthSubmit');
const btnAuthSubmitText = document.getElementById('btnAuthSubmitText');
const btnAuthOfflineSkip = document.getElementById('btnAuthOfflineSkip');
const btnOpenAuthFromSettings = document.getElementById('btnOpenAuthFromSettings');
const btnAccLogout = document.getElementById('btnAccLogout');
const accountCardLoggedIn = document.getElementById('accountCardLoggedIn');
const accountCardLoggedOut = document.getElementById('accountCardLoggedOut');
const accAvatarImg = document.getElementById('accAvatarImg');
const accNickname = document.getElementById('accNickname');
const accEmail = document.getElementById('accEmail');
const btnHeaderAccount = document.getElementById('btnHeaderAccount');
const headerAvatarImg = document.getElementById('headerAvatarImg');

function formatAvatarUrl(url) {
  if (!url) return 'reo.png';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  const clean = url.startsWith('/') ? url : '/' + url;
  return `${getAccountUrl()}${clean}`;
}

async function authFetch(endpoint, options = {}) {
  const headers = options.headers || {};
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const currentAcc = getAccountUrl();
  const pool = [
    currentAcc,
    ...ACCOUNT_CANDIDATES.filter(c => c !== currentAcc)
  ];

  let lastErr = null;
  for (const base of pool) {
    try {
      const targetUrl = `${base}${endpoint}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(targetUrl, { ...options, headers, signal: controller.signal });
      clearTimeout(timer);
      if (res.ok || (res.status >= 400 && res.status < 500)) {
        if (base !== currentAcc) {
          setAccountUrl(base);
          const pairedBack = base.replace(':8001', ':8080');
          if (BACKEND_CANDIDATES.includes(pairedBack)) {
            setBackendUrl(pairedBack);
          }
        }
        return res;
      }
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Сервер аккаунтов временно недоступен');
}

function updateCurrentUserUI(user) {
  currentUser = user;
  const avatarSrc = user ? formatAvatarUrl(user.avatar_url) : 'reo.png';
  if (headerAvatarImg) headerAvatarImg.src = avatarSrc;

  if (user) {
    if (accountCardLoggedIn) accountCardLoggedIn.style.display = 'block';
    if (accountCardLoggedOut) accountCardLoggedOut.style.display = 'none';
    if (accAvatarImg) accAvatarImg.src = avatarSrc;
    if (accNickname) accNickname.textContent = user.nickname || 'Пользователь';
    if (accEmail) accEmail.textContent = user.email || '';
  } else {
    if (accountCardLoggedIn) accountCardLoggedIn.style.display = 'none';
    if (accountCardLoggedOut) accountCardLoggedOut.style.display = 'block';
  }
}

function setAuthMode(mode) {
  currentAuthMode = mode;
  if (authErrorAlert) {
    authErrorAlert.style.display = 'none';
    authErrorAlert.textContent = '';
  }

  if (mode === 'login') {
    if (authTabLogin) authTabLogin.classList.add('active');
    if (authTabRegister) authTabRegister.classList.remove('active');
    if (authTitle) authTitle.textContent = 'Добро пожаловать в reo';
    if (authSubtitle) authSubtitle.textContent = 'Войдите в аккаунт для синхронизации и общения с друзьями';
    if (btnAuthSubmitText) btnAuthSubmitText.textContent = 'Войти в аккаунт';
    if (authNicknameGroup) authNicknameGroup.style.display = 'none';
    if (authConfirmPassGroup) authConfirmPassGroup.style.display = 'none';
    if (authNicknameInput) authNicknameInput.removeAttribute('required');
    if (authConfirmPassInput) authConfirmPassInput.removeAttribute('required');
  } else {
    if (authTabLogin) authTabLogin.classList.remove('active');
    if (authTabRegister) authTabRegister.classList.add('active');
    if (authTitle) authTitle.textContent = 'Создание аккаунта reo';
    if (authSubtitle) authSubtitle.textContent = 'Придумайте никнейм, по которому вас смогут найти друзья';
    if (btnAuthSubmitText) btnAuthSubmitText.textContent = 'Зарегистрироваться';
    if (authNicknameGroup) authNicknameGroup.style.display = 'block';
    if (authConfirmPassGroup) authConfirmPassGroup.style.display = 'block';
    if (authNicknameInput) authNicknameInput.setAttribute('required', 'true');
    if (authConfirmPassInput) authConfirmPassInput.setAttribute('required', 'true');
  }
}

function showAuthModal(mode = 'login') {
  setAuthMode(mode);
  if (authModal) authModal.classList.add('active');
}

function closeAuthModal() {
  if (authModal) authModal.classList.remove('active');
}

function initAuth() {
  if (authTabLogin) authTabLogin.addEventListener('click', () => setAuthMode('login'));
  if (authTabRegister) authTabRegister.addEventListener('click', () => setAuthMode('register'));

  if (btnAuthOfflineSkip) {
    btnAuthOfflineSkip.addEventListener('click', () => {
      closeAuthModal();
      showToast('Работа в офлайн режиме (без аккаунта)');
    });
  }

  if (btnOpenAuthFromSettings) {
    btnOpenAuthFromSettings.addEventListener('click', () => showAuthModal('login'));
  }

  if (btnHeaderAccount) {
    btnHeaderAccount.addEventListener('click', () => {
      if (!currentUser && !authToken) {
        showAuthModal('login');
      } else {
        switchView('viewSettings');
      }
    });
  }

  if (btnAccLogout) {
    btnAccLogout.addEventListener('click', () => {
      authToken = null;
      currentUser = null;
      localStorage.removeItem('reo_token');
      localStorage.removeItem('reo_user');
      updateCurrentUserUI(null);
      showToast('Вы вышли из аккаунта');
      showAuthModal('login');
    });
  }

  // Password visibility toggles
  document.querySelectorAll('.btn-toggle-password').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (!input) return;
      const isPass = input.type === 'password';
      input.type = isPass ? 'text' : 'password';
      btn.style.opacity = isPass ? '1' : '0.6';
    });
  });

  // Auth form submit
  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (authErrorAlert) authErrorAlert.style.display = 'none';

      const email = (authEmailInput ? authEmailInput.value : '').trim();
      const password = authPasswordInput ? authPasswordInput.value : '';

      if (!email || !password) {
        if (authErrorAlert) {
          authErrorAlert.textContent = 'Пожалуйста, заполните email и пароль';
          authErrorAlert.style.display = 'block';
        }
        return;
      }

      if (btnAuthSubmit) {
        btnAuthSubmit.disabled = true;
        btnAuthSubmit.style.opacity = '0.7';
      }

      try {
        if (currentAuthMode === 'register') {
          const nickname = (authNicknameInput ? authNicknameInput.value : '').trim();
          const confirmPass = authConfirmPassInput ? authConfirmPassInput.value : '';

          if (!nickname) throw new Error('Пожалуйста, укажите ваш никнейм');
          if (password !== confirmPass) throw new Error('Введенные пароли не совпадают');
          if (password.length < 4) throw new Error('Пароль должен содержать от 4 символов');

          if (btnAuthSubmitText) btnAuthSubmitText.textContent = 'Регистрация...';

          const res = await authFetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, nickname, password })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.detail || 'Ошибка регистрации');

          authToken = data.token;
          currentUser = data.user;
          localStorage.setItem('reo_token', authToken);
          localStorage.setItem('reo_user', JSON.stringify(currentUser));
          updateCurrentUserUI(currentUser);
          closeAuthModal();
          showToast(`Добро пожаловать, ${currentUser.nickname}!`);
          syncPlaylistsFromAccount();
        } else {
          if (btnAuthSubmitText) btnAuthSubmitText.textContent = 'Вход...';

          const res = await authFetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.detail || 'Неверный email или пароль');

          authToken = data.token;
          currentUser = data.user;
          localStorage.setItem('reo_token', authToken);
          localStorage.setItem('reo_user', JSON.stringify(currentUser));
          updateCurrentUserUI(currentUser);
          closeAuthModal();
          showToast(`С возвращением, ${currentUser.nickname}!`);
          syncPlaylistsFromAccount();
        }
      } catch (err) {
        if (authErrorAlert) {
          authErrorAlert.textContent = err.message || 'Ошибка соединения с сервером';
          authErrorAlert.style.display = 'block';
        }
      } finally {
        if (btnAuthSubmit) {
          btnAuthSubmit.disabled = false;
          btnAuthSubmit.style.opacity = '1';
        }
        if (btnAuthSubmitText) {
          btnAuthSubmitText.textContent = currentAuthMode === 'register' ? 'Зарегистрироваться' : 'Войти в аккаунт';
        }
      }
    });
  }
}

async function syncPlaylistsFromAccount() {
  if (!authToken) return;
  try {
    const res = await authFetch('/api/account/playlists');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.playlists) && data.playlists.length > 0) {
        state.playlists = data.playlists;
        localStorage.setItem('reo_playlists', JSON.stringify(state.playlists));
        renderLibraryPlaylists();
      }
    }
  } catch (e) {
    console.warn('Sync playlists error:', e);
  }
}

function checkAuthOnStartup() {
  try {
    const savedUser = localStorage.getItem('reo_user');
    if (savedUser) {
      currentUser = JSON.parse(savedUser);
      updateCurrentUserUI(currentUser);
    }
  } catch (e) {}

  if (authToken) {
    authFetch('/api/auth/me')
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Unauthorized');
      })
      .then(data => {
        if (data && data.user) {
          currentUser = data.user;
          localStorage.setItem('reo_user', JSON.stringify(currentUser));
          updateCurrentUserUI(currentUser);
          syncPlaylistsFromAccount();
        }
      })
      .catch(err => {
        if (err.message === 'Unauthorized') {
          authToken = null;
          currentUser = null;
          localStorage.removeItem('reo_token');
          localStorage.removeItem('reo_user');
          updateCurrentUserUI(null);
          showAuthModal('login');
        }
      });
  } else {
    // Prompt immediately on launch if not authorized
    setTimeout(() => {
      showAuthModal('login');
    }, 120);
  }
}

// ==================== SETTINGS HANDLERS ====================
if (settingBackendUrl) {
  settingBackendUrl.value = getBackendUrl();
  settingBackendUrl.addEventListener('change', () => {
    setBackendUrl(settingBackendUrl.value);
    testServerConnection();
    loadPopularTracks();
  });
}

if (settingAccountUrl) {
  settingAccountUrl.value = getAccountUrl();
  settingAccountUrl.addEventListener('change', () => {
    setAccountUrl(settingAccountUrl.value);
    if (authToken) checkAuthOnStartup();
  });
}

if (btnTestServer) {
  btnTestServer.addEventListener('click', async () => {
    setBackendUrl(settingBackendUrl.value);
    const ok = await testServerConnection();
    showToast(ok ? 'Сервер успешно подключен!' : 'Не удалось связаться с сервером');
  });
}

// ==================== INIT ====================
window.addEventListener('DOMContentLoaded', async () => {
  initAuth();
  loadFavorites();
  await testServerConnection();
  loadPopularTracks();
  checkAuthOnStartup();
});
