/**
 * Copy buttons for the code blocks <kmwc-demo> generates. The code itself is
 * rendered at build time (page-composer.js) from the demo's live markup, so it
 * can't drift; this only adds the "Copy" affordance. Styles: css/demo.css.
 */
import { copyText } from './copy-link.js';
import { COPY_FEEDBACK_DURATION_MS, DEMO_CLASSES } from './constants.js';

export function attachDemoCopyButtons(root = document) {
  for (const codeBlock of root.querySelectorAll(`.${DEMO_CLASSES.code}`)) {
    if (codeBlock.querySelector(`.${DEMO_CLASSES.copyButton}`)) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = DEMO_CLASSES.copyButton;
    button.textContent = 'Copy';
    let revertTimer = null;
    button.addEventListener('click', () => {
      copyText(codeBlock.querySelector('code')?.textContent ?? '').then((isCopied) => {
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
