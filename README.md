# Flippy

Flippy turns a PDF into a page turning magazine that runs in a web browser.

It is built with plain HTML, CSS, and JavaScript. No build step is required.

## Open the app

For local use, open `index.html` or run:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

Use **Upload PDF** to choose your own magazine. You can also drag a PDF onto
the app. The selected file is read in your browser and is not uploaded to
GitHub or stored by the app.

The deployed app uses `intimacy.pdf` as its default magazine. Replace
`defaultPdf` in `config.js` if you want a different PDF.

## Customize the app

- `index.html` contains the page structure and visible labels.
- `css/styles.css` contains colors, fonts, spacing, and layout.
- `js/app.js` controls the viewer, settings, and PDF loading.
- `js/share.js` controls links, email, images, social sharing, and QR codes.
- `config.js` contains the app name, file limit, and optional default PDF.

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

Uploading a PDF from your computer is useful for previewing and editing it.
For a public reader link, upload the PDF to a file host first, then paste its
public URL into the Share panel. GitHub Pages can host the PDF if you add it
to the repository. The configured default PDF can use the shorter link:

```text
https://cashmurb.github.io/flippy/reader.html
```

Other PDFs use a longer link because their PDF address and settings are
included in the URL.

## Download options

The app can download:

- The original PDF
- A standalone HTML flipbook
- Page images in a ZIP file
- The cover image

## Notes

Pages are displayed as images, so text is not selectable inside the viewer.
The original PDF remains available for selectable text, links, and forms.
