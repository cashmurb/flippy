/* Create standalone viewers, page images, covers, and share images. */
(function () {
  'use strict';
  const L = window.Leaf;
  const X = (L.Export = {});
  L.PAGEFLIP_URL = 'https://cdn.jsdelivr.net/npm/page-flip@2.0.7/dist/js/page-flip.browser.js';

  /* Create page images using the screen or high quality setting. */
  X.pageBlobs = async function (quality, onProgress) {
    const st = L.state;
    const gen = st.gen;
    const n = st.n;
    const out = [];
    if (quality === 'high' && st.doc) {
      const width = Math.max(2000, st.renderWidth);
      for (let i = 0; i < n; i++) {
        if (gen !== st.gen) throw new Error('The book changed while exporting.');
        out.push(await L.renderPdfPage(st.doc, i, width, 0.9));
        onProgress && onProgress((i + 1) / n);
      }
      return out;
    }
    const all = Array.from({ length: n }, (_, i) => i);
    const tick = () => onProgress && onProgress(st.pages.filter(Boolean).length / n);
    const timer = setInterval(tick, 250);
    try {
      await L.waitForPages(all);
    } finally {
      clearInterval(timer);
    }
    if (gen !== st.gen) throw new Error('The book changed while exporting.');
    for (let i = 0; i < n; i++) {
      if (!st.pages[i]) throw new Error(`Page ${i + 1} couldn’t be drawn, so the export stopped.`);
      out.push(st.pages[i].blob);
    }
    onProgress && onProgress(1);
    return out;
  };

  X.zip = async function (quality, onProgress) {
    if (!window.JSZip) throw new Error('The ZIP library didn’t load. Check your connection and reload.');
    const blobs = await X.pageBlobs(quality, (p) => onProgress && onProgress(p * 0.8));
    const slug = L.slugify(L.state.meta.title);
    const zip = new window.JSZip();
    const folder = zip.folder(slug);
    blobs.forEach((b, i) => folder.file(`${slug}-p${String(i + 1).padStart(3, '0')}.jpg`, b));
    return zip.generateAsync({ type: 'blob', compression: 'STORE' }, (m) => onProgress && onProgress(0.8 + (m.percent / 100) * 0.2));
  };

  X.cover = async function (quality) {
    const st = L.state;
    if (quality === 'high' && st.doc) return L.renderPdfPage(st.doc, 0, 2000, 0.92);
    await L.waitForPages([0]);
    if (!st.pages[0]) throw new Error('The cover couldn’t be drawn.');
    return st.pages[0].blob;
  };

  async function pageFlipSource() {
    try {
      const res = await fetch(L.PAGEFLIP_URL, { cache: 'force-cache' });
      if (!res.ok) throw new Error(res.status);
      const text = await res.text();
      if (!/PageFlip/.test(text)) throw new Error('unexpected');
      return text;
    } catch (e) {
      return null;
    }
  }

  /* Standalone viewer with its own state. */
  function standaloneViewer(C) {
    var $ = function (s) { return document.querySelector(s); };
    var q = new URLSearchParams(location.search);
    if (q.get('embed') === '1') document.body.classList.add('embed');
    var n = C.n;
    var start = Math.max(0, Math.min(n - 1, (parseInt(q.get('page'), 10) || 1) - 1));
    var frame = $('#frame');
    var root = $('#book');
    var pages = Array.prototype.slice.call(root.querySelectorAll('.page'));
    if (!window.St || !window.St.PageFlip) {
      document.body.classList.add('plain');
      return;
    }
    var pf = new St.PageFlip(root, {
      width: 600, height: Math.round(600 / C.ratio), size: 'stretch',
      minWidth: 40, maxWidth: 4000, minHeight: 60, maxHeight: 6000, autoSize: false,
      showCover: C.hardCover, usePortrait: true, maxShadowOpacity: 0.45, flippingTime: C.speed,
      mobileScrollSupport: false, startPage: start, startZIndex: 1
    });
    function pref() {
      var W = frame.clientWidth, H = frame.clientHeight;
      if (!W || !H) return;
      var land = Math.min(W / 2, H * C.ratio), port = Math.min(W, H * C.ratio);
      pf.getSettings().minWidth = port > land * 1.3 ? Math.ceil(W / 2) + 2 : 40;
    }
    function spread(i) {
      if (pf.getOrientation() === 'portrait') return [i];
      var a;
      if (C.hardCover) { if (i === 0) return [0]; a = i % 2 ? i : i - 1; } else { a = i % 2 ? i - 1 : i; }
      return a + 1 < n ? [a, a + 1] : [a];
    }
    function shift(open) {
      var s = 0;
      if (!open && pf.getOrientation() === 'landscape') {
        var v = spread(pf.getCurrentPageIndex());
        if (v.length === 1) { var pw = pf.getBoundsRect().pageWidth; s = v[0] === n - 1 && v[0] !== 0 ? pw / 2 : -pw / 2; }
      }
      root.style.transform = s ? 'translate3d(' + s.toFixed(1) + 'px,0,0)' : '';
    }
    function folio() {
      var v = spread(pf.getCurrentPageIndex());
      $('#folio').textContent = (v.length > 1 ? (v[0] + 1) + '–' + (v[1] + 1) : (v[0] + 1)) + ' / ' + n;
      $('#prev').disabled = v[0] === 0;
      $('#next').disabled = v[v.length - 1] >= n - 1;
      root.classList.toggle('is-portrait', pf.getOrientation() === 'portrait');
    }
    var actx = null, soundOn = C.sound;
    function rustle() {
      if (!soundOn) return;
      try {
        var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        actx = actx || new AC(); if (actx.state === 'suspended') actx.resume();
        var len = Math.floor(actx.sampleRate * 0.34), buf = actx.createBuffer(1, len, actx.sampleRate), d = buf.getChannelData(0);
        for (var i = 0; i < len; i++) { var t = i / len; d[i] = (Math.random() * 2 - 1) * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.2)), 1.5) * (1 - t * 0.6) * (0.55 + 0.45 * Math.abs(Math.sin(t * 38))); }
        var src = actx.createBufferSource(); src.buffer = buf;
        var hp = actx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 650;
        var bp = actx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.6;
        var g = actx.createGain(); g.gain.value = 0.32;
        src.connect(hp); hp.connect(bp); bp.connect(g); g.connect(actx.destination); src.start();
      } catch (e) {}
    }
    pf.on('flip', function () { shift(); folio(); });
    pf.on('changeOrientation', function () { shift(); folio(); });
    pf.on('changeState', function (e) { if (e.data === 'flipping') { shift(true); rustle(); } else if (e.data === 'read') shift(); });
    pf.on('init', function () { shift(); folio(); });
    pref();
    pf.loadFromHTML(pages);
    var t = 0;
    function onResize() { clearTimeout(t); t = setTimeout(function () { pref(); pf.update(); shift(); folio(); }, 60); }
    if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(frame); else window.addEventListener('resize', onResize);
    $('#prev').onclick = function () { pf.flipPrev('bottom'); };
    $('#next').onclick = function () { pf.flipNext('bottom'); };
    var snd = $('#snd');
    function sndUi() { snd.setAttribute('aria-pressed', soundOn ? 'true' : 'false'); snd.classList.toggle('off', !soundOn); }
    sndUi();
    snd.onclick = function () { soundOn = !soundOn; sndUi(); };
    $('#fs').onclick = function () {
      var el = document.documentElement;
      if (document.fullscreenElement) document.exitFullscreen();
      else if (el.requestFullscreen) el.requestFullscreen().catch(function () {});
    };
    document.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') pf.flipNext('bottom');
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') pf.flipPrev('bottom');
      else if (e.key === 'Home') pf.turnToPage(0);
      else if (e.key === 'End') pf.turnToPage(n - 1);
    });
  }

  const STANDALONE_CSS = `
*,*::before,*::after{box-sizing:border-box}
html,body{height:100%;margin:0}
body{background:var(--stage);color:var(--fg);font:400 14px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;display:grid;grid-template-rows:auto 1fr auto;overflow:hidden;-webkit-font-smoothing:antialiased}
body[data-tone="dark"]{--fg:#F2F3F5;--dim:rgba(242,243,245,.65);--btn:rgba(255,255,255,.1);--btnh:rgba(255,255,255,.2)}
body[data-tone="light"]{--fg:#16181D;--dim:rgba(22,24,29,.6);--btn:rgba(0,0,0,.06);--btnh:rgba(0,0,0,.12)}
header{display:flex;align-items:baseline;gap:12px;padding:14px 20px 0;padding-top:calc(14px + env(safe-area-inset-top,0px));min-width:0}
header .t{font:400 22px/1.2 Georgia,"Iowan Old Style",serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
header .a{color:var(--dim);font-size:13px;white-space:nowrap}
main{position:relative;min-height:0}
#frame{position:absolute;inset:20px 24px}
#book{width:100%;height:100%;transition:transform .5s cubic-bezier(.2,.7,.2,1)}
.stf__parent{position:relative;display:block;transform:translateZ(0);touch-action:pan-y}
.stf__wrapper{position:relative;width:100%;height:100%}
.stf__block{position:absolute;inset:0;perspective:2000px}
.stf__item{display:none;position:absolute;transform-style:preserve-3d}
.stf__outerShadow,.stf__innerShadow,.stf__hardShadow,.stf__hardInnerShadow{position:absolute;left:0;top:0}
.page{background:#fff;overflow:hidden}
.page img{display:block;width:100%;height:100%;object-fit:contain;pointer-events:none;user-select:none;-webkit-user-drag:none}
.page::after{content:"";position:absolute;inset:0;pointer-events:none}
.l::after{background:linear-gradient(to left,rgba(0,0,0,.2),rgba(0,0,0,.05) 3%,transparent 8%)}
.r::after{background:linear-gradient(to right,rgba(0,0,0,.2),rgba(0,0,0,.05) 3%,transparent 8%)}
.is-portrait .page::after,.page[data-density=hard]::after{background:none}
nav{display:flex;align-items:center;justify-content:center;gap:8px;padding:8px 16px 14px;padding-bottom:calc(14px + env(safe-area-inset-bottom,0px))}
nav button{width:40px;height:40px;border:0;border-radius:50%;background:var(--btn);color:var(--fg);cursor:pointer;display:grid;place-items:center}
nav button:hover{background:var(--btnh)}nav button:disabled{opacity:.3;cursor:default}
nav button:focus-visible{outline:2px solid currentColor;outline-offset:2px}
nav svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
#snd.off .w{display:none}#snd:not(.off) .x{display:none}
#folio{min-width:90px;text-align:center;font:500 13px ui-monospace,Menlo,Consolas,monospace;font-variant-numeric:tabular-nums}
.made{position:absolute;right:16px;bottom:14px;font-size:12px;color:var(--dim);text-decoration:none}
.embed header{display:none}.embed #frame{inset:10px 12px}
.plain #book{overflow:auto;display:flex;flex-direction:column;gap:16px;align-items:center}.plain .page{position:static!important;display:block!important;width:min(100%,900px);aspect-ratio:var(--ratio)}
@media (max-width:600px){#frame{inset:10px 8px}.made{display:none}}
`;

  X.html = async function (quality, onProgress) {
    const st = L.state;
    const m = st.meta;
    const blobs = await X.pageBlobs(quality, (p) => onProgress && onProgress(p * 0.85));
    const urls = [];
    for (let i = 0; i < blobs.length; i++) {
      urls.push(await L.blobToDataURL(blobs[i]));
      onProgress && onProgress(0.85 + ((i + 1) / blobs.length) * 0.1);
    }
    const lib = await pageFlipSource();
    const esc = L.escapeHtml;
    const bg = L.stageColor();
    const tone = L.luminance(bg) > 0.45 ? 'light' : 'dark';
    const n = blobs.length;
    const pagesHtml = urls
      .map((u, i) => {
        const side = m.hardCover ? (i % 2 === 0 ? 'r' : 'l') : (i % 2 === 0 ? 'l' : 'r');
        const hard = m.hardCover && (i === 0 || i === n - 1) ? ' data-density="hard"' : '';
        return `<div class="page ${side}"${hard}><img src="${u}" alt="Page ${i + 1}"></div>`;
      })
      .join('\n');
    const config = { n, ratio: st.ratio, hardCover: !!m.hardCover, speed: m.speed, sound: !!m.sound };
    const libTag = lib
      ? `<script>${lib.replace(/<\/script/gi, '<\\/script')}</script>`
      : `<script src="${L.PAGEFLIP_URL}"></script>`;
    const desc = m.author ? `A flipbook by ${m.author}` : 'A flipbook';
    const icon = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(m.title || 'Flipbook')}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="book">
<meta property="og:title" content="${esc(m.title || 'Flipbook')}">
<meta property="og:description" content="${esc(desc)}">
<meta name="generator" content="Leafwork">
<style>${STANDALONE_CSS}</style>
</head>
<body data-tone="${tone}" style="--stage:${esc(bg)};--ratio:${st.ratio}">
<header><div class="t">${esc(m.title || '')}</div><div class="a">${esc(m.author || '')}</div></header>
<main><div id="frame"><div id="book">
${pagesHtml}
</div></div></main>
<nav aria-label="Pages">
<button id="prev" type="button" aria-label="Previous page">${icon('<path d="m14.5 6-6 6 6 6"/>')}</button>
<span id="folio" aria-live="polite">1 / ${n}</span>
<button id="next" type="button" aria-label="Next page">${icon('<path d="m9.5 6 6 6-6 6"/>')}</button>
<button id="snd" type="button" aria-label="Page-turn sound">${icon('<path d="M4 9.5v5h3.5L12 19V5L7.5 9.5H4z"/><path class="w" d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/><path class="x" d="M16 9.5l5 5M21 9.5l-5 5"/>')}</button>
<button id="fs" type="button" aria-label="Full screen">${icon('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>')}</button>
</nav>
${libTag}
<script>(${standaloneViewer.toString()})(${JSON.stringify(config)});</script>
</body>
</html>`;
    onProgress && onProgress(1);
    return new Blob([html], { type: 'text/html' });
  };

  /* The original PDF bytes, whatever the source. */
  X.pdf = async function () {
    const st = L.state;
    if (st.source && st.source.file) return st.source.file;
    if (st.doc) return new Blob([await st.doc.getData()], { type: 'application/pdf' });
    throw new Error('There is no PDF for this book.');
  };
})();
