/**
 * COPY-LINK — a small chain-link button appended inside every section <h2>.
 * Click copies a share-ready deep link to that section (same anchor ids as the
 * chapter nav — both use sections.js); it briefly flips to a check + "Copied!".
 *
 * Link origin: the current URL by default, so on the deployed site the copied
 * link is already public. `kmwc.examples.canonicalOrigin` (injected into the
 * page config) forces production links even when browsing a local dev server.
 * Styles: css/copy-link.css.
 */
import { ensureSectionAnchors } from './sections.js';
import { getPageConfig } from './page-config.js';
import { COPY_FEEDBACK_DURATION_MS, COPY_LINK_CLASSES } from './constants.js';

const COPY_TITLE = 'Copy link to this section';

const LINK_ICON_HTML =
  `<svg class="${COPY_LINK_CLASSES.icon} ${COPY_LINK_CLASSES.iconLink}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">` +
  '<path d="M9 12a3 3 0 0 0 3 3h4a3 3 0 0 0 0-6h-2"></path>' +
  '<path d="M15 12a3 3 0 0 0-3-3H8a3 3 0 0 0 0 6h2"></path>' +
  '</svg>';
const CHECK_ICON_HTML =
  `<svg class="${COPY_LINK_CLASSES.icon} ${COPY_LINK_CLASSES.iconCheck}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">` +
  '<polyline points="5 13 10 18 19 7"></polyline>' +
  '</svg>';

/** Async Clipboard API (secure contexts) with an execCommand fallback. Resolves to `isCopied`. */
export function copyText(text) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).then(
      () => true,
      () => copyTextWithExecCommand(text)
    );
  }
  return Promise.resolve(copyTextWithExecCommand(text));
}

function copyTextWithExecCommand(text) {
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.setAttribute('readonly', '');
    textArea.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(textArea);
    textArea.select();
    const isCopied = document.execCommand('copy');
    textArea.remove();
    return isCopied;
  } catch {
    return false;
  }
}

export function getSectionUrl(sectionId, canonicalOrigin = getPageConfig().canonicalOrigin) {
  const baseUrl = canonicalOrigin ? canonicalOrigin.replace(/\/$/, '') + location.pathname : location.href;
  return `${baseUrl.replace(/#.*$/, '')}#${sectionId}`;
}

function createCopyLinkButton(sectionId) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = COPY_LINK_CLASSES.root;
  button.setAttribute('aria-label', COPY_TITLE);
  button.title = COPY_TITLE;
  button.innerHTML = `${LINK_ICON_HTML}${CHECK_ICON_HTML}<span class="${COPY_LINK_CLASSES.label}" aria-hidden="true">Copied!</span>`;

  let revertTimer = null;
  button.addEventListener('click', (event) => {
    event.preventDefault();
    copyText(getSectionUrl(sectionId)).then((isCopied) => {
      button.classList.toggle(COPY_LINK_CLASSES.rootCopied, isCopied);
      button.classList.toggle(COPY_LINK_CLASSES.rootFailed, !isCopied);
      button.title = isCopied ? 'Link copied!' : 'Press Ctrl/Cmd+C to copy';
      clearTimeout(revertTimer);
      revertTimer = setTimeout(() => {
        button.classList.remove(COPY_LINK_CLASSES.rootCopied, COPY_LINK_CLASSES.rootFailed);
        button.title = COPY_TITLE;
      }, COPY_FEEDBACK_DURATION_MS);
    });
  });
  return button;
}

/** Append a copy-link button to every section heading that doesn't have one yet. */
export function attachCopyLinks() {
  for (const section of ensureSectionAnchors()) {
    if (!section.heading.querySelector(`.${COPY_LINK_CLASSES.root}`)) section.heading.appendChild(createCopyLinkButton(section.id));
  }
}
