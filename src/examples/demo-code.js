/**
 * Copy buttons for the code blocks <kmwc-demo> generates, and for hand-written
 * `.code-block`s that name their language (COPYABLE_CODE_SELECTOR). The code is
 * rendered at build time (page-composer.js); this only adds the "Copy"
 * affordance. A block that already has a button (a page's own `.copy-button`)
 * is left alone. Styles: css/demo.css.
 */
import { copyText } from './copy-link.js';
import { COPYABLE_CODE_SELECTOR, COPY_FEEDBACK_DURATION_MS, DEMO_CLASSES } from './constants.js';

/** The block's code as shown: its <code> or <pre>, else its own text without buttons. */
function getCodeText(codeBlock) {
  const codeElement = codeBlock.querySelector('code, pre');
  if (codeElement) return codeElement.textContent;
  return [...codeBlock.childNodes].filter((node) => node.nodeName !== 'BUTTON').map((node) => node.textContent).join('');
}

export function attachDemoCopyButtons(root = document) {
  for (const codeBlock of root.querySelectorAll(COPYABLE_CODE_SELECTOR)) {
    if (codeBlock.querySelector('button')) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = DEMO_CLASSES.copyButton;
    button.textContent = 'Copy';
    let revertTimer = null;
    button.addEventListener('click', () => {
      copyText(getCodeText(codeBlock)).then((isCopied) => {
        button.textContent = isCopied ? 'Copied!' : 'Ctrl/Cmd+C';
        button.classList.toggle(DEMO_CLASSES.copyButtonCopied, isCopied);
        clearTimeout(revertTimer);
        revertTimer = setTimeout(() => {
          button.textContent = 'Copy';
          button.classList.remove(DEMO_CLASSES.copyButtonCopied);
        }, COPY_FEEDBACK_DURATION_MS);
      });
    });
    codeBlock.appendChild(button);
  }
}
