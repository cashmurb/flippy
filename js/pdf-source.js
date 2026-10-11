/* Load PDFs and render their pages with PDF.js. */
(function () {
  'use strict';
  const L = window.Leaf;
  const PDFJS_VERSION = '3.11.174';
  L.PDFJS_WORKER = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.js`;

  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = L.PDFJS_WORKER;
  }

  /* Messages for common creator errors. */
  L.describePdfError = function (err, isUrl) {
    const name = (err && err.name) || '';
    if (name === 'PasswordException') {
      return { title: 'This PDF is password-protected', text: 'Remove the password in your PDF app (Export or Save As without security), then upload it again.' };
    }
    if (name === 'InvalidPDFException') {
      return { title: 'This file isn’t a readable PDF', text: 'It may be damaged or only partly downloaded. Export it again from your design app and retry.' };
    }
    if (isUrl) {
      return {
        title: 'The PDF couldn’t be downloaded',
        text: 'Its host may not allow other sites to load it (CORS), or the file has moved. Check the address, or ask the publisher for an updated link.'
      };
    }
    return { title: 'This PDF couldn’t be opened', text: (err && err.message) || 'Something went wrong while reading the file.' };
  };

  /* Open a PDF from data or a URL and return its document details. */
  L.openPdf = async function (src, onProgress) {
    if (!window.pdfjsLib) {
      throw new Error('The PDF engine didn’t load. Check your internet connection and reload the page.');
    }
    const params = typeof src === 'string' ? { url: src } : { data: src };
    params.isEvalSupported = false;
    const task = window.pdfjsLib.getDocument(params);
    if (onProgress) {
      task.onProgress = (p) => {
        if (p && p.total) onProgress(Math.min(1, p.loaded / p.total));
      };
    }
    const doc = await task.promise;
    const first = await doc.getPage(1);
    const vp = first.getViewport({ scale: 1, rotation: first.rotate });
    let info = {};
    try {
      const meta = await doc.getMetadata();
      info = (meta && meta.info) || {};
    } catch (e) { /* metadata is optional */ }
    return {
      doc,
      numPages: doc.numPages,
      ratio: vp.width / vp.height,
      sizeMm: [(vp.width * 25.4) / 72, (vp.height * 25.4) / 72],
      info
    };
  };

  /* Render one page to a JPEG blob at the given width. */
  L.renderPdfPage = async function (doc, index, targetWidth, quality = 0.88) {
    const page = await doc.getPage(index + 1);
    const base = page.getViewport({ scale: 1, rotation: page.rotate });
    const scale = targetWidth / base.width;
    const vp = page.getViewport({ scale, rotation: page.rotate });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(vp.width));
    canvas.height = Math.max(1, Math.round(vp.height));
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp, intent: 'display' }).promise;
    const blob = await L.canvasToBlob(canvas, 'image/jpeg', quality);
    try { page.cleanup(); } catch (e) { /* ignore */ }
    canvas.width = canvas.height = 0;
    return blob;
  };

  /* Common portrait trim sizes in millimeters. */
  const SIZES = [
    ['A3', 297, 420], ['A4', 210, 297], ['A5', 148, 210], ['A6', 105, 148], ['B5', 176, 250],
    ['US Letter', 215.9, 279.4], ['US Legal', 215.9, 355.6], ['Tabloid', 279.4, 431.8],
    ['Digest', 139.7, 215.9], ['US Trade', 152.4, 228.6], ['Royal', 156, 234], ['8 × 10 in', 203.2, 254]
  ];
  L.paperName = function (wMm, hMm) {
    const a = Math.min(wMm, hMm);
    const b = Math.max(wMm, hMm);
    for (const [name, x, y] of SIZES) {
      if (Math.abs(a - x) <= 2.5 && Math.abs(b - y) <= 2.5) return wMm > hMm ? name + ' landscape' : name;
    }
    if (Math.abs(a - b) <= 2) return 'Square';
    return '';
  };
})();
