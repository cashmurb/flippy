/* Flipbook wrapper for StPageFlip in HTML mode. */
(function () {
  'use strict';
  const L = window.Leaf;
  const Book = (L.Book = {});
  const listeners = {};
  let pf = null;
  let root = null;
  let frame = null;
  let pageEls = [];
  let opts = null;
  let n = 0;
  let ro = null;

  Book.on = (ev, fn) => (listeners[ev] = listeners[ev] || []).push(fn);
  const emit = (ev, d) => (listeners[ev] || []).forEach((fn) => fn(d));

  /* Find the page side for gutter shading. */
  function sideOf(i, hardCover) {
    if (hardCover) return i % 2 === 0 ? 'right' : 'left';
    return i % 2 === 0 ? 'left' : 'right';
  }

  /* Find the visible pages in the current spread. */
  function spreadFor(i) {
    if (!pf || pf.getOrientation() === 'portrait') return [i];
    let a;
    if (opts.hardCover) {
      if (i === 0) return [0];
      a = i % 2 === 1 ? i : i - 1;
    } else {
      a = i % 2 === 0 ? i : i - 1;
    }
    return a + 1 < n ? [a, a + 1] : [a];
  }

  /* Use one page when a spread would be too large. */
  function applyOrientationPreference() {
    if (!pf || !frame) return;
    const W = frame.clientWidth;
    const H = frame.clientHeight;
    if (!W || !H) return;
    const r = opts.ratio;
    const landscapePage = Math.min(W / 2, H * r);
    const portraitPage = Math.min(W, H * r);
    const wantSingle = portraitPage > landscapePage * 1.3;
    pf.getSettings().minWidth = wantSingle ? Math.ceil(W / 2) + 2 : 40;
  }

  /* Center the closed book with covers on opposite sides. */
  function syncShift(forceOpen) {
    if (!pf || !root) return;
    let shift = 0;
    if (!forceOpen && pf.getOrientation() === 'landscape') {
      const vis = spreadFor(pf.getCurrentPageIndex());
      if (vis.length === 1) {
        const pw = pf.getBoundsRect().pageWidth;
        shift = vis[0] === n - 1 && vis[0] !== 0 ? pw / 2 : -pw / 2;
      }
    }
    root.style.transform = shift ? `translate3d(${shift.toFixed(1)}px,0,0)` : '';
  }

  Book.build = function (container, o) {
    Book.destroy();
    frame = container;
    opts = Object.assign({ ratio: 0.75, hardCover: true, speed: 850, startPage: 0, urls: [] }, o);
    n = opts.count;

    root = document.createElement('div');
    root.className = 'book';
    pageEls = [];
    for (let i = 0; i < n; i++) {
      const p = document.createElement('div');
      p.className = `page page--${sideOf(i, opts.hardCover)} is-empty`;
      if (opts.hardCover && (i === 0 || i === n - 1)) p.dataset.density = 'hard';
      const inner = document.createElement('div');
      inner.className = 'page-inner';
      const img = document.createElement('img');
      img.alt = `Page ${i + 1}`;
      img.draggable = false;
      img.decoding = 'async';
      const spin = document.createElement('span');
      spin.className = 'page-spinner';
      spin.setAttribute('aria-hidden', 'true');
      inner.append(img, spin);
      p.appendChild(inner);
      root.appendChild(p);
      pageEls.push(p);
      if (opts.urls[i]) Book.setImage(i, opts.urls[i]);
    }
    frame.appendChild(root);

    const baseW = 600;
    const baseH = Math.round(baseW / opts.ratio);
    pf = new window.St.PageFlip(root, {
      width: baseW,
      height: baseH,
      size: 'stretch',
      minWidth: 40,
      maxWidth: 4000,
      minHeight: 60,
      maxHeight: 6000,
      autoSize: false,
      showCover: !!opts.hardCover,
      usePortrait: true,
      drawShadow: true,
      maxShadowOpacity: 0.45,
      flippingTime: opts.speed,
      mobileScrollSupport: false,
      swipeDistance: 30,
      startPage: L.clamp(opts.startPage || 0, 0, Math.max(0, n - 1)),
      startZIndex: 1
    });
    applyOrientationPreference();

    pf.on('flip', () => {
      syncShift();
      emit('page', pf.getCurrentPageIndex());
    });
    pf.on('changeOrientation', (e) => {
      root.classList.toggle('is-portrait', e.data === 'portrait');
      syncShift();
      emit('page', pf.getCurrentPageIndex());
    });
    pf.on('changeState', (e) => {
      if (e.data === 'flipping') {
        syncShift(true);
        emit('flipping');
      } else if (e.data === 'read') {
        syncShift();
      }
    });
    pf.on('init', () => {
      root.classList.toggle('is-portrait', pf.getOrientation() === 'portrait');
      syncShift();
      emit('page', pf.getCurrentPageIndex());
    });
    pf.loadFromHTML(pageEls);

    if (!ro && 'ResizeObserver' in window) {
      ro = new ResizeObserver(L.debounce(() => Book.resize(), 60));
    }
    if (ro) {
      ro.disconnect();
      ro.observe(frame);
    }
  };

  Book.resize = function () {
    if (!pf) return;
    applyOrientationPreference();
    try { pf.update(); } catch (e) { /* not ready yet */ }
    root.classList.toggle('is-portrait', pf.getOrientation() === 'portrait');
    syncShift();
  };

  Book.destroy = function () {
    if (pf) {
      try { pf.destroy(); } catch (e) { /* ignore */ }
    }
    if (root && root.parentNode) root.parentNode.removeChild(root);
    if (frame) frame.innerHTML = '';
    pf = null;
    root = null;
    pageEls = [];
  };

  Book.setImage = function (i, url) {
    const el = pageEls[i];
    if (!el) return;
    const img = el.querySelector('img');
    img.onload = () => el.classList.remove('is-empty');
    img.src = url;
  };
  Book.setFailed = function (i) {
    const el = pageEls[i];
    if (el) el.classList.add('is-failed');
  };
  Book.setSpeed = function (ms) {
    if (opts) opts.speed = ms;
    if (pf) pf.getSettings().flippingTime = ms;
  };

  Book.ready = () => !!pf;
  Book.count = () => n;
  Book.current = () => (pf ? pf.getCurrentPageIndex() : 0);
  Book.visible = () => (pf ? spreadFor(pf.getCurrentPageIndex()) : [0]);
  Book.orientation = () => (pf ? pf.getOrientation() : 'landscape');
  Book.isBusy = () => !!pf && pf.getState() !== 'read';

  Book.next = () => pf && pf.flipNext('bottom');
  Book.prev = () => pf && pf.flipPrev('bottom');
  Book.first = () => Book.goTo(0);
  Book.last = () => Book.goTo(n - 1);
  Book.goTo = function (i) {
    if (!pf) return;
    i = L.clamp(i, 0, n - 1);
    if (spreadFor(pf.getCurrentPageIndex()).includes(i)) return;
    const far = Math.abs(i - pf.getCurrentPageIndex()) > 6;
    if (far) pf.turnToPage(i);
    else pf.flip(i, 'bottom');
  };
})();
