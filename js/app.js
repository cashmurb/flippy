/* App controller for loading, rendering, and settings. */
(function () {
  'use strict';
  const L = window.Leaf;
  const { $, $$ } = L;

  const CFG = (L.config = Object.assign({ appUrl: '', brand: 'Leafwork', maxMb: 300, defaultPdf: '' }, window.LEAF_CONFIG || {}));
  L.BACKDROPS = { lighttable: '#FEFAF3', midnight: '#000000' };

  const state = (L.state = {
    meta: { title: '', author: '', bg: 'lighttable', bgCustom: '#3A3F4A', hardCover: true, speed: 850, sound: true, allowDownload: true },
    source: null, // { kind: 'file' | 'url', file, fileName, fileSize, pdfUrl }
    doc: null,
    n: 0,
    ratio: 0.8,
    sizeMm: null,
    pages: [], // { blob, url } per page once rendered
    failed: [],
    inflight: new Set(),
    gen: 0,
    renderWidth: 1400,
    link: null, // { kind: 'pdfurl' | 'hosted', ... }
    mode: 'creator',
    embed: false,
    current: 0
  });

  L.stageColor = () => (state.meta.bg === 'custom' ? state.meta.bgCustom : L.BACKDROPS[state.meta.bg] || L.BACKDROPS.lighttable);

  /* Page rendering queue */
  const waiters = [];
  function checkWaiters() {
    for (let k = waiters.length - 1; k >= 0; k--) {
      const w = waiters[k];
      if (w.gen !== state.gen || w.idx.every((i) => i >= state.n || state.pages[i] || state.failed[i])) {
        waiters.splice(k, 1);
        w.resolve();
      }
    }
  }
  L.waitForPages = (idx) =>
    new Promise((resolve) => {
      waiters.push({ idx, resolve, gen: state.gen });
      checkWaiters();
    });

  function pickNext() {
    const cur = state.current;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < state.n; i++) {
      if (state.pages[i] || state.failed[i] || state.inflight.has(i)) continue;
      const d = i >= cur ? i - cur : (cur - i) * 1.5;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  async function renderWorker(gen) {
    while (gen === state.gen && state.doc) {
      const i = pickNext();
      if (i < 0) return;
      state.inflight.add(i);
      try {
        const blob = await L.renderPdfPage(state.doc, i, state.renderWidth);
        if (gen !== state.gen) return;
        setPageBlob(i, blob);
      } catch (err) {
        if (gen !== state.gen) return;
        console.warn('Page', i + 1, 'failed to render', err);
        state.failed[i] = true;
        L.Book.setFailed(i);
      } finally {
        state.inflight.delete(i);
      }
      updateRenderProgress();
      checkWaiters();
    }
  }
  function startRendering(gen) {
    updateRenderProgress();
    renderWorker(gen);
    renderWorker(gen);
  }
  function setPageBlob(i, blob) {
    const url = URL.createObjectURL(blob);
    state.pages[i] = { blob, url };
    L.Book.setImage(i, url);
    Thumbs.set(i, url);
  }
  function updateRenderProgress() {
    const done = state.pages.filter(Boolean).length + state.failed.filter(Boolean).length;
    const box = $('#renderProgress');
    if (!state.n || done >= state.n) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    $('#renderProgressBar').style.width = Math.round((done / state.n) * 100) + '%';
    $('#renderProgressText').textContent = `Preparing pages ${done} / ${state.n}`;
  }

  function computeRenderWidth() {
    const r = $('#stage').getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const pageH = Math.max(300, r.height - 40);
    const pageW = Math.min(r.width, pageH * state.ratio);
    state.renderWidth = Math.round(L.clamp(pageW * dpr * 1.15, 1000, 2200));
  }

  function resetBook() {
    state.gen++;
    state.pages.forEach((p) => p && URL.revokeObjectURL(p.url));
    state.pages = [];
    state.failed = [];
    state.inflight = new Set();
    if (state.doc) {
      try { state.doc.destroy(); } catch (e) { /* ignore */ }
      state.doc = null;
    }
    checkWaiters();
  }

  /* Loading */
  let loadToken = 0;
  function showLoading(label, progress) {
    $('#errorCard').hidden = true;
    $('#loading').hidden = false;
    $('#loadingLabel').textContent = label;
    setLoadingProgress(progress);
  }
  function setLoadingProgress(p) {
    const wrap = $('#loadingBarWrap');
    if (p == null) {
      wrap.classList.add('indeterminate');
      $('#loadingBar').style.width = '';
    } else {
      wrap.classList.remove('indeterminate');
      $('#loadingBar').style.width = Math.round(p * 100) + '%';
    }
  }
  function hideLoading() {
    $('#loading').hidden = true;
  }
  function showError(err, isUrl, pdfUrl) {
    const d = L.describePdfError(err, isUrl);
    $('#errorTitle').textContent = d.title;
    $('#errorText').textContent = d.text;
    const open = $('#errorOpenPdf');
    open.hidden = !pdfUrl;
    if (pdfUrl) open.href = pdfUrl;
    $('#errorDismiss').hidden = !L.Book.ready();
    $('#errorCard').hidden = false;
  }

  function prettyName(fileName) {
    return String(fileName || 'Untitled')
      .replace(/\.pdf$/i, '')
      .replace(/[_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^./, (c) => c.toUpperCase());
  }
  function usefulTitle(t) {
    t = String(t || '').trim();
    if (!t || t.length < 2) return '';
    if (/^(untitled|document|microsoft|adobe|print|slide|presentation)\b/i.test(t)) return '';
    if (/\.(docx?|pptx?|indd|pdf|ai|psd|key|pages)$/i.test(t)) return '';
    return t;
  }

  function showEmptyState() {
    resetBook();
    state.source = null;
    state.n = 0;
    state.sizeMm = null;
    state.link = null;
    $('#docTitle').textContent = 'No magazine loaded';
    $('#docAuthor').textContent = '';
    $('#thumbs').hidden = true;
    $('#emptyState').hidden = false;
    hideLoading();
    ['tbFirst', 'tbPrev', 'tbNext', 'tbLast', 'arrowPrev', 'arrowNext', 'tbThumbs', 'tbZoom', 'tbSound', 'tbFullscreen', 'btnDownload', 'btnShare'].forEach((id) => {
      const control = $('#' + id);
      if (control) control.disabled = true;
    });
    $('#pageInput').value = '1';
    $('#pageTotal').textContent = '/ 0';
  }

  async function openPdfSource(source, { data, url, startPage = 0, resetMeta = false }) {
    const token = ++loadToken;
    showLoading(source.kind === 'file' ? `Opening ${source.fileName}…` : 'Opening the flipbook…', url ? 0 : null);
    let info;
    try {
      info = await L.openPdf(data || url, (p) => token === loadToken && setLoadingProgress(p));
    } catch (err) {
      if (token !== loadToken) return;
      console.error(err);
      hideLoading();
      showError(err, !!url, url);
      return;
    }
    if (token !== loadToken) {
      info.doc.destroy();
      return;
    }
    resetBook();
    const gen = state.gen;
    state.doc = info.doc;
    state.n = info.numPages;
    state.ratio = info.ratio;
    state.sizeMm = info.sizeMm;
    state.source = source;
    state.pages = new Array(state.n).fill(null);
    state.failed = new Array(state.n).fill(false);
    $('#emptyState').hidden = true;
    ['tbFirst', 'tbPrev', 'tbNext', 'tbLast', 'arrowPrev', 'arrowNext', 'tbThumbs', 'tbZoom', 'tbSound', 'tbFullscreen', 'btnDownload', 'btnShare'].forEach((id) => {
      const control = $('#' + id);
      if (control) control.disabled = false;
    });
    const pdfTitle = usefulTitle(info.info.Title);
    const fallbackName = source.fileName || (source.pdfUrl ? decodeURIComponent(source.pdfUrl.split('/').pop().split('?')[0]) : '');
    if (resetMeta) {
      state.meta.title = pdfTitle || prettyName(fallbackName);
      state.meta.author = String(info.info.Author || '').trim();
      state.link = null;
    } else if (!state.meta.title) {
      state.meta.title = pdfTitle || prettyName(fallbackName);
    }
    computeRenderWidth();
    buildBook(startPage);
    hideLoading();
    applyMeta();
    syncSettingsForm();
    L.bus.emit('book');
    startRendering(gen);
  }

  async function loadPdfFile(file) {
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!isPdf) {
      L.toast('That file isn’t a PDF. Choose a .pdf file.', 'error');
      return;
    }
    if (file.size > CFG.maxMb * 1048576) {
      L.toast(`That PDF is larger than ${CFG.maxMb} MB. Compress it and try again.`, 'error');
      return;
    }
    closeDrawers();
    const data = await file.arrayBuffer();
    await openPdfSource({ kind: 'file', file, fileName: file.name, fileSize: file.size }, { data, resetMeta: true });
  }
  L.loadPdfFile = loadPdfFile;

  function buildBook(startPage) {
    $('#stage').style.setProperty('--ratio', state.ratio);
    L.Book.build($('#bookFrame'), {
      count: state.n,
      ratio: state.ratio,
      hardCover: state.meta.hardCover && state.n > 2,
      speed: state.meta.speed,
      startPage,
      urls: state.pages.map((p) => p && p.url)
    });
    Thumbs.build();
    state.current = L.Book.current();
    updateFolio();
  }

  /* Metadata and settings */
  function specText() {
    if (!state.n) return '';
    let s = `${state.n} ${state.n === 1 ? 'page' : 'pages'}`;
    if (state.sizeMm) {
      const [w, h] = state.sizeMm;
      const name = L.paperName(w, h);
      s += ` · ${name ? name + ' · ' : ''}${Math.round(w)} × ${Math.round(h)} mm`;
    }
    return s;
  }

  function applyMeta() {
    const m = state.meta;
    $('#docTitle').textContent = m.title || 'Untitled flipbook';
    $('#docAuthor').textContent = m.author || '';
    document.title = (m.title ? m.title + ' · ' : '') + CFG.brand;
    const col = L.stageColor();
    const stage = $('#stage');
    stage.style.setProperty('--stage', col);
    stage.dataset.tone = L.luminance(col) > 0.45 ? 'light' : 'dark';
    document.documentElement.style.setProperty('--backdrop', col);
    document.documentElement.style.setProperty('--backdrop-ink', L.luminance(col) > 0.45 ? '#2D4031' : '#FEFAF3');
    L.Sound.enabled = !!m.sound;
    $('#tbSound').setAttribute('aria-pressed', String(!!m.sound));
    $('#soundIcon').setAttribute('href', m.sound ? '#i-sound' : '#i-mute');
    L.Book.setSpeed(m.speed);
    document.body.classList.toggle('no-download', state.mode === 'reader' && !m.allowDownload);
    L.bus.emit('meta');
  }

  function syncSettingsForm() {
    const m = state.meta;
    $('#setTitle').value = m.title;
    $('#setAuthor').value = m.author;
    $('#setCover').checked = m.hardCover;
    $('#setSound').checked = m.sound;
    $('#setAllowDl').checked = m.allowDownload;
    $('#bgCustom').value = m.bgCustom;
    $$('#bgSwatches .swatch').forEach((s) => s.setAttribute('aria-pressed', String(s.dataset.bg === m.bg)));
    $$('#setSpeed [data-speed]').forEach((b) => b.setAttribute('aria-checked', String(+b.dataset.speed === m.speed)));
  }

  function metaFromParams(q) {
    const m = state.meta;
    if (q.has('title')) m.title = q.get('title').slice(0, 140);
    if (q.has('author')) m.author = q.get('author').slice(0, 140);
    const bg = q.get('bg');
    if (bg && (L.BACKDROPS[bg] || bg === 'custom')) m.bg = bg;
    const bgc = q.get('bgc');
    if (bgc && /^[0-9a-f]{6}$/i.test(bgc)) m.bgCustom = '#' + bgc;
    if (q.has('cover')) m.hardCover = q.get('cover') !== '0';
    const sp = parseInt(q.get('speed'), 10);
    if (sp >= 200 && sp <= 3000) m.speed = sp;
    if (q.has('sound')) m.sound = q.get('sound') !== '0';
    if (q.has('dl')) m.allowDownload = q.get('dl') !== '0';
  }
  function setMeta(patch) {
    const coverBefore = state.meta.hardCover;
    Object.assign(state.meta, patch);
    if (state.meta.hardCover !== coverBefore && state.n) {
      const at = state.current;
      buildBook(at);
    }
    applyMeta();
  }

  /* Thumbnails */
  const Thumbs = {
    build() {
      const track = $('#thumbsTrack');
      track.innerHTML = '';
      track.style.setProperty('--ratio', state.ratio);
      for (let i = 0; i < state.n; i++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'thumb';
        b.dataset.i = i;
        b.setAttribute('aria-label', `Page ${i + 1}`);
        const box = document.createElement('span');
        box.className = 'thumb-img';
        const img = document.createElement('img');
        img.alt = '';
        img.loading = 'lazy';
        img.decoding = 'async';
        if (state.pages[i]) img.src = state.pages[i].url;
        box.appendChild(img);
        const num = document.createElement('span');
        num.className = 'thumb-num';
        num.textContent = String(i + 1);
        b.append(box, num);
        track.appendChild(b);
      }
      Thumbs.setActive(L.Book.visible());
    },
    set(i, url) {
      const b = $(`#thumbsTrack .thumb[data-i="${i}"] img`);
      if (b) b.src = url;
    },
    setActive(vis) {
      $$('#thumbsTrack .thumb.is-active').forEach((t) => t.classList.remove('is-active'));
      vis.forEach((i) => {
        const t = $(`#thumbsTrack .thumb[data-i="${i}"]`);
        if (t) t.classList.add('is-active');
      });
      if (!$('#thumbs').hidden) {
        const t = $(`#thumbsTrack .thumb[data-i="${vis[0]}"]`);
        if (t) t.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
      }
    },
    toggle(show) {
      const el = $('#thumbs');
      el.hidden = show == null ? !el.hidden : !show;
      $('#tbThumbs').setAttribute('aria-pressed', String(!el.hidden));
      if (!el.hidden) Thumbs.setActive(L.Book.visible());
    }
  };

  /* Toolbar */
  function updateFolio() {
    const vis = L.Book.visible();
    const input = $('#pageInput');
    if (document.activeElement !== input) {
      input.value = vis.length > 1 ? `${vis[0] + 1}–${vis[1] + 1}` : String(vis[0] + 1);
    }
    $('#pageTotal').textContent = `/ ${state.n}`;
    const atStart = vis[0] <= 0;
    const atEnd = vis[vis.length - 1] >= state.n - 1;
    $('#tbFirst').disabled = $('#tbPrev').disabled = $('#arrowPrev').disabled = atStart;
    $('#tbLast').disabled = $('#tbNext').disabled = $('#arrowNext').disabled = atEnd;
  }

  function toggleFullscreen() {
    const el = document.documentElement;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => L.toast('Full screen isn’t available here.', 'error'));
    } else {
      L.toast('Full screen isn’t available in this browser.', 'error');
    }
  }

  /* Zoom */
  const ZOOM_STEPS = [1, 1.5, 2, 3, 4];
  const Zoom = {
    level: 1,
    idx: [],
    token: 0,
    open() {
      if (!state.n) return;
      Zoom.idx = L.Book.visible();
      Zoom.level = 1.5;
      const content = $('#zoomContent');
      content.innerHTML = '';
      Zoom.idx.forEach((i) => {
        const img = document.createElement('img');
        img.alt = `Page ${i + 1}`;
        img.draggable = false;
        if (state.pages[i]) img.src = state.pages[i].url;
        content.appendChild(img);
      });
      $('#zoomLabel').textContent = Zoom.idx.length > 1 ? `Pages ${Zoom.idx[0] + 1}–${Zoom.idx[1] + 1}` : `Page ${Zoom.idx[0] + 1}`;
      $('#zoom').hidden = false;
      Zoom.apply();
      $('#zoomClose').focus();
      // Sharper pages for zooming, straight from the PDF
      if (state.doc) {
        const token = ++Zoom.token;
        const width = Math.min(3200, Math.max(2000, state.renderWidth * 2));
        Zoom.idx.forEach(async (i, k) => {
          try {
            const blob = await L.renderPdfPage(state.doc, i, width, 0.92);
            if (token !== Zoom.token || $('#zoom').hidden) return;
            const img = content.children[k];
            const old = img.dataset.hires;
            img.src = URL.createObjectURL(blob);
            img.dataset.hires = img.src;
            if (old) URL.revokeObjectURL(old);
          } catch (e) { /* keep the screen version */ }
        });
      }
    },
    apply() {
      const scroll = $('#zoomScroll');
      const h = (scroll.clientHeight - 32) * Zoom.level;
      $$('#zoomContent img').forEach((img) => {
        img.style.height = Math.round(h) + 'px';
        img.style.width = Math.round(h * state.ratio) + 'px';
      });
      $('#zoomLevel').textContent = Math.round(Zoom.level * 100) + '%';
      $('#zoomOut').disabled = Zoom.level <= ZOOM_STEPS[0];
      $('#zoomIn').disabled = Zoom.level >= ZOOM_STEPS[ZOOM_STEPS.length - 1];
    },
    step(dir) {
      const scroll = $('#zoomScroll');
      const cx = (scroll.scrollLeft + scroll.clientWidth / 2) / Math.max(1, scroll.scrollWidth);
      const cy = (scroll.scrollTop + scroll.clientHeight / 2) / Math.max(1, scroll.scrollHeight);
      const i = ZOOM_STEPS.indexOf(Zoom.level);
      Zoom.level = ZOOM_STEPS[L.clamp(i + dir, 0, ZOOM_STEPS.length - 1)];
      Zoom.apply();
      scroll.scrollLeft = cx * scroll.scrollWidth - scroll.clientWidth / 2;
      scroll.scrollTop = cy * scroll.scrollHeight - scroll.clientHeight / 2;
    },
    close() {
      Zoom.token++;
      $$('#zoomContent img').forEach((img) => img.dataset.hires && URL.revokeObjectURL(img.dataset.hires));
      $('#zoomContent').innerHTML = '';
      $('#zoom').hidden = true;
      $('#tbZoom').focus();
    }
  };

  function wireZoomPan() {
    const scroll = $('#zoomScroll');
    let drag = null;
    scroll.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      drag = { x: e.clientX, y: e.clientY, l: scroll.scrollLeft, t: scroll.scrollTop };
      scroll.classList.add('dragging');
      scroll.setPointerCapture(e.pointerId);
    });
    scroll.addEventListener('pointermove', (e) => {
      if (!drag) return;
      scroll.scrollLeft = drag.l - (e.clientX - drag.x);
      scroll.scrollTop = drag.t - (e.clientY - drag.y);
    });
    const end = () => {
      drag = null;
      scroll.classList.remove('dragging');
    };
    scroll.addEventListener('pointerup', end);
    scroll.addEventListener('pointercancel', end);
    scroll.addEventListener('dblclick', () => Zoom.step(Zoom.level >= 2 ? -10 : 1));
    window.addEventListener('resize', () => !$('#zoom').hidden && Zoom.apply());
  }

  /* Drawers */
  let lastFocus = null;
  function openDrawer(id, tab) {
    closeDrawers(true);
    lastFocus = document.activeElement;
    const d = $('#' + id);
    const scrim = $('#scrim');
    scrim.hidden = false;
    requestAnimationFrame(() => scrim.classList.add('show'));
    d.classList.add('open');
    d.setAttribute('aria-hidden', 'false');
    if (id === 'shareDrawer') L.Share.showTab(tab || 'link');
    if (id === 'settingsDrawer') syncSettingsForm();
    setTimeout(() => {
      const f = d.querySelector('[role="tab"][aria-selected="true"], input:not([type="hidden"]), button');
      if (f) f.focus({ preventScroll: true });
    }, 60);
  }
  function closeDrawers(keepScrim) {
    $$('.drawer.open').forEach((d) => {
      d.classList.remove('open');
      d.setAttribute('aria-hidden', 'true');
    });
    if (!keepScrim) {
      const scrim = $('#scrim');
      scrim.classList.remove('show');
      setTimeout(() => {
        if (!$('.drawer.open')) scrim.hidden = true;
      }, 250);
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    }
  }
  const anyDrawerOpen = () => !!$('.drawer.open');

  /* Keep keyboard focus inside an open drawer. */
  function trapFocus(e) {
    if (e.key !== 'Tab') return;
    const d = $('.drawer.open');
    if (!d) return;
    const items = $$('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select, textarea', d).filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      last.focus();
      e.preventDefault();
    } else if (!e.shiftKey && document.activeElement === last) {
      first.focus();
      e.preventDefault();
    }
  }

  /* Event wiring */
  function wireUI() {
    const fileInput = $('#fileInput');
    const pick = () => {
      fileInput.value = '';
      fileInput.click();
    };
    $('#btnUpload').addEventListener('click', pick);
    $('#emptyUpload').addEventListener('click', pick);
    $('#errorUpload').addEventListener('click', pick);
    $('#errorDismiss').addEventListener('click', () => ($('#errorCard').hidden = true));
    fileInput.addEventListener('change', () => loadPdfFile(fileInput.files[0]));

    $('#btnShare').addEventListener('click', () => openDrawer('shareDrawer', 'link'));
    $('#btnDownload').addEventListener('click', () => openDrawer('shareDrawer', 'download'));
    $('#btnSettings').addEventListener('click', () => openDrawer('settingsDrawer'));
    $('#scrim').addEventListener('click', () => closeDrawers());
    $$('[data-close]').forEach((b) => b.addEventListener('click', () => closeDrawers()));

    $('#tbFirst').addEventListener('click', () => L.Book.first());
    $('#tbPrev').addEventListener('click', () => L.Book.prev());
    $('#tbNext').addEventListener('click', () => L.Book.next());
    $('#tbLast').addEventListener('click', () => L.Book.last());
    $('#arrowPrev').addEventListener('click', () => L.Book.prev());
    $('#arrowNext').addEventListener('click', () => L.Book.next());
    $('#tbThumbs').addEventListener('click', () => Thumbs.toggle());
    $('#tbZoom').addEventListener('click', () => Zoom.open());
    $('#tbFullscreen').addEventListener('click', toggleFullscreen);
    $('#tbSound').addEventListener('click', () => {
      // Readers can mute for themselves; creators change the book's setting.
      if (state.mode === 'reader') {
        L.Sound.enabled = !L.Sound.enabled;
        $('#tbSound').setAttribute('aria-pressed', String(L.Sound.enabled));
        $('#soundIcon').setAttribute('href', L.Sound.enabled ? '#i-sound' : '#i-mute');
      } else {
        setMeta({ sound: !state.meta.sound });
        syncSettingsForm();
      }
    });
    $('#thumbsTrack').addEventListener('click', (e) => {
      const t = e.target.closest('.thumb');
      if (t) L.Book.goTo(+t.dataset.i);
    });

    const pageInput = $('#pageInput');
    pageInput.addEventListener('focus', () => {
      pageInput.value = String(L.Book.visible()[0] + 1);
      pageInput.select();
    });
    pageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') pageInput.blur();
      if (e.key === 'Escape') {
        pageInput.value = '';
        pageInput.blur();
      }
    });
    pageInput.addEventListener('blur', () => {
      const v = parseInt(pageInput.value, 10);
      if (v >= 1 && v <= state.n) L.Book.goTo(v - 1);
      setTimeout(updateFolio, 0);
    });

    $('#zoomIn').addEventListener('click', () => Zoom.step(1));
    $('#zoomOut').addEventListener('click', () => Zoom.step(-1));
    $('#zoomClose').addEventListener('click', () => Zoom.close());
    wireZoomPan();

    // Settings
    $('#setTitle').addEventListener('input', (e) => setMeta({ title: e.target.value }));
    $('#setAuthor').addEventListener('input', (e) => setMeta({ author: e.target.value }));
    $('#setCover').addEventListener('change', (e) => setMeta({ hardCover: e.target.checked }));
    $('#setSound').addEventListener('change', (e) => setMeta({ sound: e.target.checked }));
    $('#setAllowDl').addEventListener('change', (e) => setMeta({ allowDownload: e.target.checked }));
    $$('#bgSwatches button.swatch').forEach((b) =>
      b.addEventListener('click', () => {
        setMeta({ bg: b.dataset.bg });
        syncSettingsForm();
      })
    );
    $('#bgCustom').addEventListener('input', (e) => {
      setMeta({ bg: 'custom', bgCustom: e.target.value });
      $$('#bgSwatches .swatch').forEach((s) => s.setAttribute('aria-pressed', String(s.dataset.bg === 'custom')));
    });
    $$('#setSpeed [data-speed]').forEach((b) =>
      b.addEventListener('click', () => {
        setMeta({ speed: +b.dataset.speed });
        syncSettingsForm();
      })
    );

    // Keyboard
    document.addEventListener('keydown', (e) => {
      trapFocus(e);
      if (e.key === 'Escape') {
        if (!$('#zoom').hidden) Zoom.close();
        else if (anyDrawerOpen()) closeDrawers();
        return;
      }
      if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (anyDrawerOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
      if (!$('#zoom').hidden) {
        if (e.key === '+' || e.key === '=') Zoom.step(1);
        else if (e.key === '-') Zoom.step(-1);
        return;
      }
      const k = e.key;
      if (k === 'ArrowRight' || k === 'PageDown') L.Book.next();
      else if (k === 'ArrowLeft' || k === 'PageUp') L.Book.prev();
      else if (k === 'Home') L.Book.first();
      else if (k === 'End') L.Book.last();
      else if (k === 'f' || k === 'F') toggleFullscreen();
      else if (k === 'z' || k === 'Z') Zoom.open();
      else if (k === 't' || k === 'T') Thumbs.toggle();
      else return;
      e.preventDefault();
    });

    // Drag and drop a PDF anywhere
    let depth = 0;
    const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
    window.addEventListener('dragenter', (e) => {
      if (state.mode !== 'creator' || !hasFiles(e)) return;
      e.preventDefault();
      depth++;
      $('#dropOverlay').hidden = false;
    });
    window.addEventListener('dragover', (e) => {
      if (state.mode !== 'creator' || !hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    window.addEventListener('dragleave', (e) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) $('#dropOverlay').hidden = true;
    });
    window.addEventListener('drop', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      $('#dropOverlay').hidden = true;
      if (state.mode === 'creator') loadPdfFile(e.dataTransfer.files[0]);
    });

    // Book events
    L.Book.on('page', (i) => {
      state.current = i;
      updateFolio();
      Thumbs.setActive(L.Book.visible());
      L.bus.emit('page', i);
    });
    L.Book.on('flipping', () => L.Sound.play());

    L.bus.on('link', () => {
      const open = $('#embedOpen');
      open.hidden = !(state.embed && state.link);
      if (state.link) open.href = L.Share.linkUrl({ page: state.current });
    });
    L.bus.on('page', () => {
      if (state.embed && state.link) $('#embedOpen').href = L.Share.linkUrl({ page: state.current });
    });
  }

  function setReader() {
    state.mode = 'reader';
    document.body.classList.add('is-reader');
    const base = L.appBaseUrl ? L.appBaseUrl() : null;
    $('#madeWith').href = base || './';
    $('#brandLink').href = base || './';
  }

  /* Startup */
  async function boot() {
    const q = new URLSearchParams(location.search);
    state.embed = q.get('embed') === '1';
    document.body.classList.toggle('is-embed', state.embed);
    const startPage = Math.max(0, (parseInt(q.get('page'), 10) || 1) - 1);
    wireUI();
    L.Share.init();
    if (!window.St || !window.St.PageFlip) {
      $('#errorTitle').textContent = 'The page-turn engine didn’t load';
      $('#errorText').textContent = 'Check your internet connection (the viewer loads two small libraries from a CDN) and reload the page.';
      $('#errorCard').hidden = false;
      $('#errorDismiss').hidden = true;
      return;
    }

    // Share link with a public PDF
    const pdf = q.get('pdf');
    if (pdf) {
      setReader();
      metaFromParams(q);
      state.link = { kind: 'pdfurl', pdfUrl: pdf, base: L.appBaseUrl() || location.href.split('?')[0] };
      applyMeta();
      L.bus.emit('link');
      await openPdfSource({ kind: 'url', pdfUrl: pdf }, { url: pdf, startPage });
      return;
    }

    // Creator studio with the configured default PDF
    metaFromParams(q);
    if (CFG.defaultPdf) {
      const defaultPdf = new URL(CFG.defaultPdf, document.baseURI).toString();
      await openPdfSource(
        { kind: 'url', pdfUrl: defaultPdf, fileName: CFG.defaultPdf.split('/').pop() },
        { url: defaultPdf, startPage }
      );
      return;
    }
    showEmptyState();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
