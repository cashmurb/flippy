/* Shared helpers exposed through window.Leaf. */
(function () {
  'use strict';
  const L = (window.Leaf = window.Leaf || {});

  L.$ = (sel, root = document) => root.querySelector(sel);
  L.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* Event bus */
  const handlers = {};
  L.bus = {
    on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); },
    emit(ev, data) {
      (handlers[ev] || []).forEach((fn) => {
        try { fn(data); } catch (err) { console.error(err); }
      });
    }
  };

  let toastTimer = 0;
  L.toast = function (msg, kind = '') {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.dataset.kind = kind;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), kind === 'error' ? 4200 : 2600);
  };

  L.downloadBlob = function (blob, filename) {
    if (window.LEAF_CONFIG && window.LEAF_CONFIG.previewMode) {
      L.toast('Downloads are switched off in this preview. They work once you host the project.', 'error');
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  /* Copy text from a user action. */
  L.copyText = function (text, fallbackEl) {
    const fallback = () => {
      if (fallbackEl) {
        fallbackEl.focus();
        fallbackEl.select && fallbackEl.select();
        try { if (document.execCommand('copy')) return true; } catch (e) { /* ignore */ }
      }
      return false;
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(() => true, () => fallback());
    }
    return Promise.resolve(fallback());
  };

  L.slugify = (s) =>
    (String(s || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)) || 'flipbook';

  L.formatBytes = (n) =>
    n < 1024 ? n + ' B' : n < 1048576 ? Math.round(n / 1024) + ' KB' : (n / 1048576).toFixed(1) + ' MB';

  L.escapeHtml = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  L.blobToDataURL = (blob) =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });

  L.loadImage = (src) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Image failed to load'));
      img.src = src;
    });

  L.canvasToBlob = (canvas, type = 'image/jpeg', quality = 0.88) =>
    new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), type, quality)
    );

  L.debounce = (fn, ms) => {
    let t = 0;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  };

  L.clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  L.hexToRgb = (hex) => {
    const h = String(hex).replace('#', '');
    const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0').slice(0, 6);
    return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
  };
  /* Relative luminance from zero to one. */
  L.luminance = (hex) => {
    const [r, g, b] = L.hexToRgb(hex).map((c) => {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  /* Wait for fonts used by canvas drawings. */
  L.fontsReady = (timeout = 2500) => {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    const loads = [
      '400 48px "Instrument Serif"',
      'italic 400 48px "Instrument Serif"',
      '400 20px "Instrument Sans"',
      '600 20px "Instrument Sans"',
      '400 16px "JetBrains Mono"'
    ].map((f) => document.fonts.load(f).catch(() => null));
    return Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, timeout))]);
  };

  /* Wrap text to fit a canvas width. */
  L.wrapLines = (ctx, text, maxWidth, maxLines = Infinity) => {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      const kept = lines.slice(0, maxLines);
      let last = kept[maxLines - 1];
      while (last.length && ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1);
      kept[maxLines - 1] = last.replace(/\s+$/, '') + '…';
      return kept;
    }
    return lines;
  };

  /* Create a paper rustle without audio files. */
  L.Sound = {
    enabled: true,
    ctx: null,
    play() {
      if (!this.enabled) return;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        const ctx = (this.ctx = this.ctx || new AC());
        if (ctx.state === 'suspended') ctx.resume();
        const dur = 0.34;
        const len = Math.floor(ctx.sampleRate * dur);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) {
          const t = i / len;
          const env = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.2)), 1.5) * (1 - t * 0.6);
          const flutter = 0.55 + 0.45 * Math.abs(Math.sin(t * 38 + Math.sin(t * 9) * 2));
          d[i] = (Math.random() * 2 - 1) * env * flutter;
        }
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 650;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 2200 + Math.random() * 900;
        bp.Q.value = 0.6;
        const g = ctx.createGain();
        g.gain.value = 0.32;
        src.connect(hp).connect(bp).connect(g).connect(ctx.destination);
        src.start();
      } catch (e) { /* audio is optional */ }
    }
  };
})();
