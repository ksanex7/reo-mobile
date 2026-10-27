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
function getBackendUrl() {
  const saved = localStorage.getItem('reo_backend_url');
  if (saved && saved.trim()) return saved.trim().replace(/\/+$/, '');
  // Default to window.origin if served via HTTP, else default 8080
  if (window.location.protocol.startsWith('http')) {
    return window.location.origin.replace(/\/+$/, '');
  }
  return 'http://127.0.0.1:8080';
}

function getAccountUrl() {
  const saved = localStorage.getItem('reo_account_url');
  if (saved && saved.trim()) return saved.trim().replace(/\/+$/, '');
  return 'http://127.0.0.1:8001';
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
  const url = getBackendUrl();
  if (statusDot) {
    statusDot.className = 'status-indicator-dot';
    statusText.textContent = 'Проверка...';
  }
  if (pingBadge) {
    pingBadge.className = 'setting-badge';
    pingBadge.textContent = 'Подключение...';
  }

  const startTime = performance.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${url}/health`, { signal: controller.signal });
    clearTimeout(timer);
    const latency = Math.round(performance.now() - startTime);

    if (res.ok) {
      if (statusDot) {
        statusDot.className = 'status-indicator-dot online';
        statusText.textContent = `${latency} ms`;
      }
      if (pingBadge) {
        pingBadge.className = 'setting-badge online';
        pingBadge.textContent = `В сети (${latency} ms)`;
      }
      return true;
    }
  } catch (err) {
    // Fail
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
  const backend = getBackendUrl();
  const isRemix = activeFilter === 'remix';
  const sType = activeFilter === 'remix' ? 'tracks' : activeFilter;

  try {
    const url = `${backend}/api/search?q=${encodeURIComponent(query)}&search_type=${sType}&remix=${isRemix}&limit=25`;
    const res = await fetch(url);
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

  const backend = getBackendUrl();
  try {
    const res = await fetch(`${backend}/api/popular?limit=20`);
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

    const backend = getBackendUrl();
    let url = `${backend}/api/lyrics?artist=${encodeURIComponent(searchArt)}&title=${encodeURIComponent(searchTit)}`;
    if (duration > 0) url += `&duration=${Math.round(duration)}`;

    const res = await fetch(url);
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

    const backend = getBackendUrl();
    try {
      const res = await fetch(`${backend}/api/lyrics?artist=${encodeURIComponent(art)}&title=${encodeURIComponent(tit)}`);
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
window.addEventListener('DOMContentLoaded', () => {
  loadFavorites();
  testServerConnection();
  loadPopularTracks();
});
