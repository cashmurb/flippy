/* Share drawer: link, social, email & image, embed, QR code, downloads. */
(function () {
  'use strict';
  const L = window.Leaf;
  const { $, $$ } = L;
  const S = (L.Share = {});
  const enc = encodeURIComponent;
  let tab = 'link';
  let cardFormat = 'landscape';
  let cardToken = 0;
  const dirty = { post: false, subject: false, body: false };
  let busy = false;

  if (window.qrcode && window.qrcode.stringToBytesFuncs && window.qrcode.stringToBytesFuncs['UTF-8']) {
    window.qrcode.stringToBytes = window.qrcode.stringToBytesFuncs['UTF-8'];
  }

  /* Links */
  L.metaParams = function () {
    const m = L.state.meta;
    const p = {};
    if (m.title) p.title = m.title;
    if (m.author) p.author = m.author;
    if (m.bg !== 'graphite') p.bg = m.bg;
    if (m.bg === 'custom') p.bgc = m.bgCustom.replace('#', '');
    if (!m.hardCover) p.cover = '0';
    if (m.speed !== 850) p.speed = String(m.speed);
    if (!m.sound) p.sound = '0';
    if (!m.allowDownload) p.dl = '0';
    return p;
  };

  S.linkUrl = function (extra = {}) {
    const l = L.state.link;
    if (!l) return null;
    let url;
    try {
      if (l.kind === 'pdfurl') {
        const defaultPdf = L.config.defaultPdf
          ? new URL(L.config.defaultPdf, L.config.appUrl || document.baseURI).toString()
          : '';
        if (l.pdfUrl === defaultPdf && !extra.embed) {
          url = new URL(L.readerBaseUrl());
          if (extra.page > 0) url.searchParams.set('page', String(extra.page + 1));
          return url.toString();
        }
        url = new URL(l.base);
        url.search = '';
        url.searchParams.set('pdf', l.pdfUrl);
        const mp = L.metaParams();
        Object.keys(mp).forEach((k) => url.searchParams.set(k, mp[k]));
      } else {
        url = new URL(l.url);
      }
    } catch (e) {
      return null;
    }
    if (extra.page > 0) url.searchParams.set('page', String(extra.page + 1));
    if (extra.embed) url.searchParams.set('embed', '1');
    return url.toString();
  };
  S.readerUrl = function (extra = {}) {
    if (L.state.link) return S.linkUrl(extra);
    const source = L.state.source;
    let pdf = source && source.pdfUrl;
    const base = L.readerBaseUrl();
    if (!pdf || !base) return null;
    if (source.kind === 'url' && !/^https?:$/i.test(new URL(pdf).protocol) && L.config.defaultPdf) {
      pdf = new URL(L.config.defaultPdf, L.config.appUrl || document.baseURI).toString();
    }
    const url = new URL(base);
    url.searchParams.set('pdf', pdf);
    const params = L.metaParams();
    Object.keys(params).forEach((key) => url.searchParams.set(key, params[key]));
    if (extra.page > 0) url.searchParams.set('page', String(extra.page + 1));
    return url.toString();
  };
  S.coverImageUrl = function () {
    return '';
  };

  const LINK_HINTS = {
    pdfurl: 'This link loads your PDF from its current address, so keep the file there. Title, backdrop and page-turn settings live in the link itself; copy it again after you change them.',
    hosted: 'This is the address of the flipbook file you uploaded. After changing settings, download the flipbook again and replace the file on your host.'
  };

  function setMsg(el, text, kind) {
    el.textContent = text;
    el.dataset.kind = kind || '';
    el.hidden = !text;
  }

  function validHttpUrl(v) {
    try {
      const u = new URL(v);
      return u.protocol === 'https:' || u.protocol === 'http:' ? u : null;
    } catch (e) {
      return null;
    }
  }

  L.appBaseUrl = function () {
    if (L.config.previewMode) return null;
    const cfg = L.config.appUrl;
    if (cfg) return cfg;
    if (!/^https?:$/.test(location.protocol)) return null;
    let path = location.pathname.replace(/\/b\/[^/]+\/?$/, '/');
    return location.origin + path;
  };

  L.readerBaseUrl = function () {
    const base = L.appBaseUrl();
    return base ? new URL('reader/', base).toString() : null;
  };

  function renderLinkTab() {
    const st = L.state;
    const has = !!st.link;
    $('#linkReady').hidden = !has;
    $('#linkSetup').hidden = has;
    if (has) {
      const url = S.linkUrl({ page: $('#linkAtPage').checked ? st.current : 0 });
      $('#shareUrl').value = url || '';
      $('#openLink').href = url || '#';
      $('#linkHint').textContent = LINK_HINTS[st.link.kind] || '';
      $('#linkReset').hidden = st.mode === 'reader';
      return;
    }
    $('#optPdfUrl').hidden = false;
    const prefill = st.source && st.source.pdfUrl;
    if (prefill && !$('#pdfUrlInput').value) $('#pdfUrlInput').value = prefill;
  }

  async function createPdfLink() {
    const msg = $('#pdfUrlMsg');
    const v = $('#pdfUrlInput').value.trim();
    const u = validHttpUrl(v);
    if (!u) return setMsg(msg, 'Enter the full address of the PDF, starting with https://', 'error');
    const base = L.readerBaseUrl();
    if (!base) {
      return setMsg(msg, 'Viewer links need Leafwork itself to be online. Host this folder (or set appUrl in config.js), then try again. Option C works without that.', 'error');
    }
    setMsg(msg, 'Checking the file…', '');
    let reachable = null;
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 6000);
      const res = await fetch(u.toString(), { method: 'GET', headers: { Range: 'bytes=0-1023' }, signal: ctl.signal });
      clearTimeout(t);
      if (res.ok || res.status === 206) {
        const buf = new Uint8Array(await res.arrayBuffer());
        reachable = String.fromCharCode.apply(null, buf.slice(0, 5)) === '%PDF-' ? 'pdf' : 'notpdf';
      } else {
        reachable = 'http' + res.status;
      }
    } catch (e) {
      reachable = 'blocked';
    }
    setMsg(msg, '', '');
    L.state.link = { kind: 'pdfurl', pdfUrl: u.toString(), base };
    L.bus.emit('link');
    const notes = {
      pdf: ['Link ready. The PDF loads from its host.', 'ok'],
      notpdf: ['Link created, but that address didn’t return a PDF. Open the link to check it.', 'error'],
      blocked: ['Link created. The browser couldn’t confirm the file (its host may block other sites), so open the link to check it loads.', 'error']
    };
    const [text, kind] = notes[reachable] || [`Link created, but the host answered with error ${reachable.replace('http', '')}. Open the link to check it.`, 'error'];
    L.toast(text, kind === 'error' ? 'error' : '');
  }

  function useHostedLink() {
    const msg = $('#hostedUrlMsg');
    const u = validHttpUrl($('#hostedUrlInput').value.trim());
    if (!u) return setMsg(msg, 'Enter the full address of your flipbook, starting with https://', 'error');
    setMsg(msg, '', '');
    L.state.link = { kind: 'hosted', url: u.toString() };
    L.bus.emit('link');
    L.toast('Link saved.');
  }

  /* Social sharing */
  const NETWORKS = [
    { id: 'facebook', name: 'Facebook', color: '#1877F2', mark: 'f', url: (u) => `https://www.facebook.com/sharer/sharer.php?u=${enc(u)}` },
    { id: 'x', name: 'X', color: '#16181C', mark: 'X', url: (u, t) => `https://x.com/intent/post?text=${enc(t)}&url=${enc(u)}` },
    { id: 'linkedin', name: 'LinkedIn', color: '#0A66C2', mark: 'in', url: (u) => `https://www.linkedin.com/sharing/share-offsite/?url=${enc(u)}` },
    { id: 'whatsapp', name: 'WhatsApp', color: '#1FA855', mark: 'W', url: (u, t) => `https://wa.me/?text=${enc(t + ' ' + u)}` },
    { id: 'telegram', name: 'Telegram', color: '#229ED9', mark: 'T', url: (u, t) => `https://t.me/share/url?url=${enc(u)}&text=${enc(t)}` },
    { id: 'reddit', name: 'Reddit', color: '#FF4500', mark: 'r', url: (u) => `https://www.reddit.com/submit?url=${enc(u)}&title=${enc(L.state.meta.title || '')}` },
    {
      id: 'pinterest', name: 'Pinterest', color: '#E60023', mark: 'P',
      url: (u, t) => `https://www.pinterest.com/pin/create/button/?url=${enc(u)}&description=${enc(t)}` + (S.coverImageUrl() ? `&media=${enc(S.coverImageUrl())}` : '')
    },
    { id: 'threads', name: 'Threads', color: '#101010', mark: '@', url: (u, t) => `https://www.threads.net/intent/post?text=${enc(t + ' ' + u)}` },
    { id: 'bluesky', name: 'Bluesky', color: '#1185FE', mark: 'b', url: (u, t) => `https://bsky.app/intent/compose?text=${enc(t + ' ' + u)}` }
  ];

  function defaultPostText() {
    const m = L.state.meta;
    return `Flip through “${m.title || 'my new book'}”${m.author ? ' by ' + m.author : ''}`;
  }

  function buildSocialGrid() {
    const grid = $('#socialGrid');
    grid.innerHTML = '';
    NETWORKS.forEach((nw) => {
      const a = document.createElement('a');
      a.className = 'social';
      a.target = '_blank';
      a.rel = 'noopener';
      a.dataset.net = nw.id;
      a.href = '#';
      const mark = document.createElement('span');
      mark.className = 'social-mark';
      mark.style.setProperty('--c', nw.color);
      mark.textContent = nw.mark;
      mark.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.textContent = nw.name;
      a.append(mark, label);
      a.setAttribute('aria-label', `Share on ${nw.name}`);
      grid.appendChild(a);
    });
  }

  function renderSocial() {
    if (!L.state.link) return;
    const ta = $('#postText');
    if (!dirty.post) ta.value = defaultPostText();
    const url = S.linkUrl();
    const text = ta.value.trim();
    $$('#socialGrid .social').forEach((a) => {
      const nw = NETWORKS.find((x) => x.id === a.dataset.net);
      a.href = nw.url(url, text);
    });
    $('#nativeShare').hidden = !navigator.share;
  }

  /* QR code */
  function makeQr(text) {
    const qr = window.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    return qr;
  }
  /* Draw a QR code with a quiet zone. */
  L.drawQr = function (ctx, text, x, y, size, fg = '#14161B', bg = '#FFFFFF', quiet = 4) {
    const qr = makeQr(text);
    const count = qr.getModuleCount();
    const total = count + quiet * 2;
    const cell = Math.max(1, Math.floor(size / total));
    const drawn = cell * total;
    const ox = Math.round(x + (size - drawn) / 2);
    const oy = Math.round(y + (size - drawn) / 2);
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = fg;
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (qr.isDark(r, c)) ctx.fillRect(ox + (c + quiet) * cell, oy + (r + quiet) * cell, cell, cell);
      }
    }
  };

  function qrOptions() {
    return {
      fg: $('#qrFg').value,
      bg: $('#qrBg').value,
      size: parseInt($('#qrSize').value, 10),
      caption: $('#qrCaption').checked
    };
  }

  async function drawQrCard(canvas, size, o) {
    const url = S.linkUrl();
    const capH = o.caption ? Math.round(size * 0.16) : 0;
    canvas.width = size;
    canvas.height = size + capH;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = o.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    L.drawQr(ctx, url, 0, 0, size, o.fg, o.bg, 4);
    if (o.caption) {
      await L.fontsReady(1200);
      ctx.fillStyle = o.fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      let fs = Math.round(size * 0.075);
      ctx.font = `400 ${fs}px "Instrument Serif", Georgia, serif`;
      const title = L.state.meta.title || 'Read the magazine';
      while (ctx.measureText(title).width > size * 0.86 && fs > 10) {
        fs -= 2;
        ctx.font = `400 ${fs}px "Instrument Serif", Georgia, serif`;
      }
      ctx.fillText(title, size / 2, size + capH * 0.32);
      ctx.font = `500 ${Math.round(size * 0.032)}px "Instrument Sans", system-ui, sans-serif`;
      ctx.globalAlpha = 0.7;
      ctx.fillText('Scan to read the magazine', size / 2, size + capH * 0.72);
      ctx.globalAlpha = 1;
    }
  }

  function renderQr() {
    if (!L.state.link) return;
    drawQrCard($('#qrCanvas'), 600, qrOptions());
  }

  function qrSvg() {
    const o = qrOptions();
    const qr = makeQr(S.linkUrl());
    const count = qr.getModuleCount();
    const quiet = 4;
    const total = count + quiet * 2;
    let d = '';
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (qr.isDark(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
      }
    }
    const capH = o.caption ? total * 0.16 : 0;
    const title = L.escapeHtml(L.state.meta.title || 'Read the magazine');
    const caption = o.caption
      ? `<text x="${total / 2}" y="${total + capH * 0.42}" text-anchor="middle" font-family="Georgia, serif" font-size="${(total * 0.07).toFixed(2)}" fill="${o.fg}">${title}</text>` +
        `<text x="${total / 2}" y="${total + capH * 0.8}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${(total * 0.032).toFixed(2)}" fill="${o.fg}" fill-opacity="0.7">Scan to read the magazine</text>`
      : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${(total + capH).toFixed(2)}" width="${o.size}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="${o.bg}"/><path d="${d}" fill="${o.fg}"/>${caption}</svg>`;
  }

  /* Share image */
  const CARD_SIZES = { landscape: [1200, 630], square: [1080, 1080], story: [1080, 1920] };

  function drawBookCover(ctx, img, x, y, w, h) {
    // Page edges behind the cover
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.38)';
    ctx.shadowBlur = Math.round(w * 0.12);
    ctx.shadowOffsetY = Math.round(w * 0.05);
    ctx.fillStyle = '#F2F0EA';
    ctx.fillRect(x + w * 0.035, y + h * 0.012, w, h - h * 0.024);
    ctx.restore();
    ctx.fillStyle = '#E4E1D9';
    ctx.fillRect(x + w * 0.018, y + h * 0.006, w, h - h * 0.012);
    ctx.drawImage(img, x, y, w, h);
    const spine = ctx.createLinearGradient(x, 0, x + w * 0.08, 0);
    spine.addColorStop(0, 'rgba(0,0,0,0.28)');
    spine.addColorStop(0.35, 'rgba(255,255,255,0.12)');
    spine.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = spine;
    ctx.fillRect(x, y, w * 0.08, h);
  }

  S.drawCard = async function (canvas, format, withQr = true) {
    const st = L.state;
    const [W, H] = CARD_SIZES[format];
    await L.fontsReady(1500);
    await L.waitForPages([0]);
    const coverUrl = st.pages[0] && st.pages[0].url;
    const img = coverUrl ? await L.loadImage(coverUrl).catch(() => null) : null;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const bg = L.stageColor();
    const dark = L.luminance(bg) <= 0.45;
    const fg = dark ? '#F4F5F7' : '#16181D';
    const dim = dark ? 'rgba(244,245,247,0.68)' : 'rgba(22,24,29,0.62)';
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W * 0.35, H * 0.4, 0, W * 0.35, H * 0.4, Math.max(W, H) * 0.7);
    glow.addColorStop(0, dark ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.45)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    const m = st.meta;
    const title = m.title || 'Untitled magazine';
    const ratio = st.ratio;
    const SERIF = '"Instrument Serif", Georgia, serif';
    const SANS = '"Instrument Sans", system-ui, sans-serif';
    const MONO = '"JetBrains Mono", ui-monospace, monospace';
    ctx.textBaseline = 'alphabetic';

    const fitCover = (maxW, maxH) => {
      let h = maxH;
      let w = h * ratio;
      if (w > maxW) { w = maxW; h = w / ratio; }
      return [w, h];
    };
    const kicker = (x, y, align = 'left') => {
      ctx.font = `500 ${Math.round(W * 0.016)}px ${MONO}`;
      ctx.fillStyle = dark ? '#FF7FAF' : '#C2185B';
      ctx.textAlign = align;
      ctx.fillText(st.n + ' PAGES', x, y);
      ctx.textAlign = 'left';
    };

    if (format === 'landscape') {
      const [cw, ch] = fitCover(W * 0.38, H - 130);
      const cx = 80;
      const cy = (H - ch) / 2;
      if (img) drawBookCover(ctx, img, cx, cy, cw, ch);
      const tx = cx + cw + 80;
      const tw = W - tx - 70;
      kicker(tx, 140);
      ctx.fillStyle = fg;
      ctx.font = `400 70px ${SERIF}`;
      let lines = L.wrapLines(ctx, title, tw, 3);
      lines.forEach((ln, i) => ctx.fillText(ln, tx, 220 + i * 74));
      let y = 220 + (lines.length - 1) * 74 + 56;
      if (m.author) {
        ctx.font = `500 28px ${SANS}`;
        ctx.fillStyle = dim;
        ctx.fillText(m.author, tx, y);
      }
      ctx.font = `600 24px ${SANS}`;
      ctx.fillStyle = fg;
      ctx.fillText('Read the magazine | link in bio', tx, H - 100);
    } else if (format === 'square') {
      const [cw, ch] = fitCover(W * 0.62, H * 0.56);
      const cx = (W - cw) / 2;
      const cy = 90;
      if (img) drawBookCover(ctx, img, cx, cy, cw, ch);
      let y = cy + ch + 110;
      ctx.textAlign = 'center';
      ctx.fillStyle = fg;
      ctx.font = `400 72px ${SERIF}`;
      const lines = L.wrapLines(ctx, title, W - 200, 2);
      lines.forEach((ln, i) => ctx.fillText(ln, W / 2, y + i * 76));
      y += (lines.length - 1) * 76 + 54;
      if (m.author) {
        ctx.font = `500 30px ${SANS}`;
        ctx.fillStyle = dim;
        ctx.fillText(m.author, W / 2, y);
      }
      ctx.textAlign = 'left';
      ctx.font = `600 26px ${SANS}`;
      ctx.fillStyle = fg;
      ctx.fillText('Read the magazine | link in bio', W / 2, H - 120);
      kicker(60, H - 66);
    } else {
      const [cw, ch] = fitCover(W * 0.74, H * 0.5);
      const cx = (W - cw) / 2;
      const cy = 230;
      kicker(W / 2, 160, 'center');
      if (img) drawBookCover(ctx, img, cx, cy, cw, ch);
      let y = cy + ch + 150;
      ctx.textAlign = 'center';
      ctx.fillStyle = fg;
      ctx.font = `400 92px ${SERIF}`;
      const lines = L.wrapLines(ctx, title, W - 160, 3);
      lines.forEach((ln, i) => ctx.fillText(ln, W / 2, y + i * 96));
      y += (lines.length - 1) * 96 + 64;
      if (m.author) {
        ctx.font = `500 36px ${SANS}`;
        ctx.fillStyle = dim;
        ctx.fillText(m.author, W / 2, y);
      }
      ctx.font = `600 34px ${SANS}`;
      ctx.fillStyle = fg;
      ctx.fillText('Read the magazine | link in bio', W / 2, H - 140);
      ctx.textAlign = 'left';
    }
    return canvas;
  };

  S.cardBlob = async function (format, withQr) {
    const c = document.createElement('canvas');
    await S.drawCard(c, format, withQr);
    return L.canvasToBlob(c, 'image/png');
  };

  async function renderCard() {
    const token = ++cardToken;
    const off = document.createElement('canvas');
    await S.drawCard(off, cardFormat, true);
    if (token !== cardToken) return;
    const c = $('#cardCanvas');
    c.width = off.width;
    c.height = off.height;
    c.getContext('2d').drawImage(off, 0, 0);
    $('#cardHint').textContent = 'The cover, magazine title, author and page count.';
    $('#cardShare').hidden = !(navigator.canShare && window.File && navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] }));
  }

  /* Email */
  function renderMail() {
    if (!L.state.link) return;
    const m = L.state.meta;
    const url = S.linkUrl();
    if (!dirty.subject) $('#mailSubject').value = `Discover ${m.title || 'our magazine'}`;
    if (!dirty.body) {
      $('#mailBody').value =
        `Hello,\n\nWe’re pleased to share “${m.title || 'our magazine'}”` +
        `${m.author ? `, created by ${m.author}` : ''}.\n\n` +
        `Read it here:\n\n${url}\n\nThank you for reading.`;
    }
    updateMailLinks();
  }
  function updateMailLinks() {
    const to = $('#mailTo').value.trim();
    const s = $('#mailSubject').value;
    const b = $('#mailBody').value;
    $('#mailApp').href = `mailto:${enc(to)}?subject=${enc(s)}&body=${enc(b)}`;
    $('#mailGmail').href = `https://mail.google.com/mail/?view=cm&fs=1&to=${enc(to)}&su=${enc(s)}&body=${enc(b)}`;
    $('#mailOutlook').href = `https://outlook.live.com/mail/0/deeplink/compose?to=${enc(to)}&subject=${enc(s)}&body=${enc(b)}`;
  }

  /* Embed */
  function renderEmbed() {
    if (!L.state.link) return;
    const w = $('#embedWidth').value;
    const h = $('#embedHeight').value;
    const src = S.linkUrl({ embed: true, page: $('#embedAtPage').checked ? L.state.current : 0 });
    const title = L.escapeHtml(L.state.meta.title || 'Flipbook');
    $('#embedCode').value =
      `<iframe src="${L.escapeHtml(src)}" width="${w}" height="${h}" ` +
      `style="border:0;max-width:100%;border-radius:8px" title="${title}" loading="lazy" allow="fullscreen" allowfullscreen></iframe>`;
  }

  /* Downloads */
  function renderDownloads() {
    const st = L.state;
    const hasPdf = !!(st.doc || (st.source && st.source.file));
    $('#dlPdfRow').hidden = !hasPdf;
    if (hasPdf) {
      const s = st.source || {};
      const name = s.fileName || (s.pdfUrl ? decodeURIComponent(s.pdfUrl.split('/').pop().split('?')[0]) : 'book.pdf');
      $('#dlPdfMeta').textContent = s.fileSize ? `${name} · ${L.formatBytes(s.fileSize)}` : name;
    }
    const q = $('#dlQuality');
    q.querySelector('[value="high"]').disabled = !st.doc;
    if (!st.doc) q.value = 'screen';
  }

  async function runDownload(btn, label, job) {
    if (busy) return;
    busy = true;
    const bar = $('#dlBar');
    const status = $('#dlStatus');
    $$('[data-panel="download"] .btn, #exportForHost').forEach((b) => (b.disabled = true));
    bar.hidden = false;
    bar.firstElementChild.style.width = '0%';
    status.textContent = `${label}…`;
    try {
      await job((p) => {
        bar.firstElementChild.style.width = Math.round(p * 100) + '%';
        status.textContent = `${label}… ${Math.round(p * 100)}%`;
      });
      status.textContent = 'Download started. Check your downloads folder.';
    } catch (err) {
      console.error(err);
      status.textContent = err.message || 'The download failed.';
      L.toast(status.textContent, 'error');
    } finally {
      busy = false;
      bar.hidden = true;
      $$('[data-panel="download"] .btn, #exportForHost').forEach((b) => (b.disabled = false));
      renderDownloads();
    }
  }

  S.downloadHtml = function () {
    const q = $('#dlQuality').value;
    return runDownload(null, 'Building the flipbook file', async (p) => {
      const blob = await L.Export.html(q, p);
      L.downloadBlob(blob, L.slugify(L.state.meta.title) + '.html');
    });
  };

  /* Tabs and refresh */
  S.showTab = function (name) {
    if (L.state.mode === 'reader' && name === 'download' && !L.state.meta.allowDownload) name = 'link';
    tab = name;
    $$('#shareDrawer [role="tab"]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    $$('#shareDrawer [data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== name));
    const active = $(`#shareDrawer [role="tab"][data-tab="${name}"]`);
    if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    S.refresh();
  };

  S.refresh = function () {
    const has = !!L.state.link;
    $$('#shareDrawer [data-needs-link]').forEach((e) => (e.hidden = has));
    $$('#shareDrawer [data-has-link]').forEach((e) => (e.hidden = !has));
    if (!$('#shareDrawer').classList.contains('open')) return;
    if (tab === 'link') renderLinkTab();
    else if (tab === 'social') renderSocial();
    else if (tab === 'email') { renderCard(); renderMail(); }
    else if (tab === 'embed') renderEmbed();
    else if (tab === 'qr') renderQr();
    else if (tab === 'download') renderDownloads();
  };

  S.init = function () {
    buildSocialGrid();

    $$('#shareDrawer [role="tab"]').forEach((b) => b.addEventListener('click', () => S.showTab(b.dataset.tab)));
    $('#shareDrawer').addEventListener('click', (e) => {
      const go = e.target.closest('[data-goto]');
      if (go) S.showTab(go.dataset.goto);
      const up = e.target.closest('[data-upload]');
      if (up) $('#fileInput').click();
    });
    // Keyboard navigation across tabs
    $('#shareDrawer .tabs').addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const tabs = $$('#shareDrawer [role="tab"]').filter((t) => t.offsetParent !== null);
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      next.focus();
      S.showTab(next.dataset.tab);
      e.preventDefault();
    });

    // Link tab
    $('#copyLink').addEventListener('click', () => {
      L.copyText($('#shareUrl').value, $('#shareUrl')).then((ok) => L.toast(ok ? 'Link copied.' : 'Select the link and copy it.'));
    });
    $('#linkAtPage').addEventListener('change', renderLinkTab);
    $('#linkReset').addEventListener('click', () => {
      L.state.link = null;
      L.bus.emit('link');
    });
    $('#pdfUrlBtn').addEventListener('click', createPdfLink);
    $('#pdfUrlInput').addEventListener('keydown', (e) => e.key === 'Enter' && createPdfLink());
    $('#hostedUrlBtn').addEventListener('click', useHostedLink);
    $('#hostedUrlInput').addEventListener('keydown', (e) => e.key === 'Enter' && useHostedLink());
    $('#exportForHost').addEventListener('click', () => {
      S.showTab('download');
      S.downloadHtml();
    });
    // Social
    $('#postText').addEventListener('input', () => {
      dirty.post = true;
      renderSocial();
    });
    $('#nativeShare').addEventListener('click', () => {
      const m = L.state.meta;
      navigator.share({ title: m.title, text: $('#postText').value, url: S.linkUrl() }).catch(() => {});
    });

    // Card
    $$('#cardFormat [data-format]').forEach((b) =>
      b.addEventListener('click', () => {
        cardFormat = b.dataset.format;
        $$('#cardFormat [data-format]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
        renderCard();
      })
    );
    $('#cardDownload').addEventListener('click', async () => {
      const blob = await L.canvasToBlob($('#cardCanvas'), 'image/png');
      L.downloadBlob(blob, `${L.slugify(L.state.meta.title)}-${cardFormat}.png`);
    });
    $('#cardCopy').addEventListener('click', () => {
      try {
        if (!window.ClipboardItem || !navigator.clipboard || !navigator.clipboard.write) throw new Error('unsupported');
        const item = new window.ClipboardItem({ 'image/png': L.canvasToBlob($('#cardCanvas'), 'image/png') });
        navigator.clipboard.write([item]).then(
          () => L.toast('Image copied. Paste it into your email or post.'),
          () => L.toast('This browser won’t copy images. Use Download PNG instead.', 'error')
        );
      } catch (e) {
        L.toast('This browser won’t copy images. Use Download PNG instead.', 'error');
      }
    });
    $('#cardShare').addEventListener('click', async () => {
      try {
        const blob = await L.canvasToBlob($('#cardCanvas'), 'image/png');
        const file = new File([blob], `${L.slugify(L.state.meta.title)}.png`, { type: 'image/png' });
        const data = { files: [file], title: L.state.meta.title };
        if (L.state.link) data.text = `${defaultPostText()} ${S.linkUrl()}`;
        await navigator.share(data);
      } catch (e) { /* cancelled */ }
    });

    // Email
    $('#mailSubject').addEventListener('input', () => { dirty.subject = true; updateMailLinks(); });
    $('#mailBody').addEventListener('input', () => { dirty.body = true; updateMailLinks(); });
    $('#mailTo').addEventListener('input', updateMailLinks);
    $('#mailCopy').addEventListener('click', () => {
      const text = `${$('#mailSubject').value}\n\n${$('#mailBody').value}`;
      L.copyText(text, $('#mailBody')).then((ok) => L.toast(ok ? 'Message copied.' : 'Select the message and copy it.'));
    });

    // Embed
    ['#embedWidth', '#embedHeight', '#embedAtPage'].forEach((s) => $(s).addEventListener('change', renderEmbed));
    $('#embedCopy').addEventListener('click', () => {
      L.copyText($('#embedCode').value, $('#embedCode')).then((ok) => L.toast(ok ? 'Embed code copied.' : 'Select the code and copy it.'));
    });

    // QR
    ['#qrFg', '#qrBg', '#qrCaption'].forEach((s) => $(s).addEventListener('input', renderQr));
    $('#qrPng').addEventListener('click', async () => {
      const c = document.createElement('canvas');
      await drawQrCard(c, qrOptions().size, qrOptions());
      L.downloadBlob(await L.canvasToBlob(c, 'image/png'), `${L.slugify(L.state.meta.title)}-qr.png`);
    });
    $('#qrSvg').addEventListener('click', () => {
      L.downloadBlob(new Blob([qrSvg()], { type: 'image/svg+xml' }), `${L.slugify(L.state.meta.title)}-qr.svg`);
    });

    // Downloads
    $('#dlPdf').addEventListener('click', () =>
      runDownload(null, 'Preparing the PDF', async (p) => {
        const blob = await L.Export.pdf();
        p(1);
        const name = (L.state.source && L.state.source.fileName) || L.slugify(L.state.meta.title) + '.pdf';
        L.downloadBlob(blob, name);
      })
    );
    $('#dlHtml').addEventListener('click', S.downloadHtml);
    $('#dlZip').addEventListener('click', () => {
      const q = $('#dlQuality').value;
      runDownload(null, 'Packing page images', async (p) => {
        const blob = await L.Export.zip(q, p);
        L.downloadBlob(blob, `${L.slugify(L.state.meta.title)}-pages.zip`);
      });
    });
    $('#dlCover').addEventListener('click', () => {
      const q = $('#dlQuality').value;
      runDownload(null, 'Preparing the cover', async (p) => {
        const blob = await L.Export.cover(q);
        p(1);
        L.downloadBlob(blob, `${L.slugify(L.state.meta.title)}-cover.jpg`);
      });
    });

    L.bus.on('link', () => {
      dirty.post = dirty.subject = dirty.body = false;
      S.refresh();
    });
    L.bus.on('meta', L.debounce(() => S.refresh(), 150));
    L.bus.on('book', () => {
      dirty.post = dirty.subject = dirty.body = false;
      $('#pdfUrlInput').value = '';
      $('#hostedUrlInput').value = '';
      setMsg($('#pdfUrlMsg'), '', '');
      setMsg($('#hostedUrlMsg'), '', '');
      S.refresh();
    });
  };
})();
