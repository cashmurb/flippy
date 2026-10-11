# Flippy

Flippy turns a PDF into a page turning magazine that runs in a web browser.

It is built with plain HTML, CSS, and JavaScript. No build step is required.

## Open the app

For local use, open `index.html` or run:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

The included `intimacy.pdf` opens by default. You can also upload another PDF
with **Upload PDF**.

## Customize the app

- `index.html` contains the page structure and visible labels.
- `css/styles.css` contains colors, fonts, spacing, and layout.
- `js/app.js` controls the viewer, settings, and PDF loading.
- `js/share.js` controls links, email, images, social sharing, and QR codes.
- `config.js` contains the app name, limits, and default PDF.

The main controls let you change the title, author, backdrop, page turning,
sound, hard cover, and reader download settings.

The studio header includes **Reader view**. Use it to open the current
magazine without the studio interface.

## Share the magazine

The Share panel can create:

- Public links
- Social media posts
- Email messages
- Landscape, square, and story images
- Embed code
- QR codes

Shared links open `reader.html`, a clean magazine view without the studio
header, controls, settings, or share panel.

To share a PDF by URL, the PDF must be hosted online at a public address such
as `https://example.com/magazine.pdf`. The host must allow other websites to
load the file.

## Download options

The app can download:

- The original PDF
- A standalone HTML flipbook
- Page images in a ZIP file
- The cover image

## Notes

Pages are displayed as images, so text is not selectable inside the viewer.
The original PDF remains available for selectable text, links, and forms.
