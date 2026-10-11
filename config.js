/*
 * Leafwork configuration. Edit these values when you deploy.
 *
 * appUrl   Public address where the app is hosted.
 *          Used to build share links with the app address and PDF address.
 *          Leave empty to use the address the page was opened from.
 *
 * maxMb      Largest PDF the app accepts, in megabytes.
 * defaultPdf PDF opened for visitors who open the app without a book link.
 */
window.LEAF_CONFIG = {
  appUrl: 'https://cashmurb.github.io/flippy/',
  brand: 'Flippy',
  maxMb: 300,
  defaultPdf: 'intimacy.pdf'
};
