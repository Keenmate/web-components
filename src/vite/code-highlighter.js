/**
 * Build-time syntax highlighting for example-page code (Shiki). The page
 * composer stays synchronous and pure: it takes the `highlightCode(code,
 * language)` this module returns and calls it for every code block it renders.
 *
 * Colours are never baked in: the theme maps TextMate scopes onto the kit's
 * `--kmwc-code-*` tokens (css/tokens.css), so a token's colour is a
 * `var(--kmwc-code-…)` reference resolved by the page's stylesheet. Shiki is a
 * devkit dependency (not a peer): a second copy of it can't conflict.
 */
/** Grammars loaded up front (their aliases — js, ts, sh, bash … — work too). */
export const HIGHLIGHTED_LANGUAGES = ['html', 'javascript', 'typescript', 'css', 'json', 'svelte', 'shellscript'];

const CODE_THEME_NAME = 'kmwc';
const FOREGROUND = 'var(--kmwc-code-text-color)';

/** Scope → kit token. Later entries win for the same scope (TextMate rule order). */
const CODE_THEME = {
  name: CODE_THEME_NAME,
  type: 'dark',
  colors: { 'editor.foreground': FOREGROUND, 'editor.background': 'var(--kmwc-code-bg)' },
  tokenColors: [
    { settings: { foreground: FOREGROUND } },
    { scope: ['keyword', 'storage', 'storage.type', 'storage.modifier', 'keyword.control'], settings: { foreground: 'var(--kmwc-code-keyword-color)' } },
    { scope: ['keyword.operator', 'punctuation'], settings: { foreground: FOREGROUND } },
    { scope: ['string', 'punctuation.definition.string', 'string.template'], settings: { foreground: 'var(--kmwc-code-string-color)' } },
    { scope: ['constant', 'constant.numeric', 'constant.language', 'support.constant', 'entity.other.attribute-name', 'support.type.property-name', 'meta.object-literal.key'], settings: { foreground: 'var(--kmwc-code-property-color)' } },
    { scope: ['entity.name.function', 'support.function', 'meta.function-call entity.name.function', 'variable.function'], settings: { foreground: 'var(--kmwc-code-function-color)' } },
    { scope: ['entity.name.type', 'entity.name.class', 'support.type', 'support.class', 'entity.other.inherited-class'], settings: { foreground: 'var(--kmwc-code-type-color)' } },
    { scope: ['entity.name.tag', 'support.class.component'], settings: { foreground: 'var(--kmwc-code-tag-color)' } },
    { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: 'var(--kmwc-code-comment-color)', fontStyle: 'italic' } },
  ],
};

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const mapToEscapedHtml = (text) => String(text).replace(/[&<>"]/g, (character) => HTML_ESCAPES[character]);

let highlighterPromise = null;

/**
 * The `highlightCode(code, language)` the composer takes: escaped HTML of the
 * code with `<span style="color: var(--kmwc-code-…)">` runs. Created once
 * (Shiki loads its grammars once) and shared by every page.
 */
export function loadCodeHighlighter() {
  highlighterPromise ??= import('shiki').then(async ({ createHighlighter }) => {
    const highlighter = await createHighlighter({ themes: [CODE_THEME], langs: HIGHLIGHTED_LANGUAGES });
    const supportedLanguages = new Set(highlighter.getLoadedLanguages());
    return (code, language) => {
      if (!supportedLanguages.has(language)) {
        throw new Error(`kmwc: code language "${language}" is not highlighted (${HIGHLIGHTED_LANGUAGES.join(', ')} and their aliases)`);
      }
      const { tokens } = highlighter.codeToTokens(code, { lang: language, theme: CODE_THEME_NAME });
      return tokens.map(renderLine).join('\n');
    };
  });
  return highlighterPromise;
}

/** One line's tokens; neighbours of the same look merge, plain text gets no span. */
function renderLine(lineTokens) {
  const runs = [];
  for (const token of lineTokens) {
    const isItalic = Boolean(token.fontStyle & 1);
    const previous = runs[runs.length - 1];
    if (previous && previous.color === token.color && previous.isItalic === isItalic) previous.content += token.content;
    else runs.push({ content: token.content, color: token.color, isItalic });
  }
  return runs.map(({ content, color, isItalic }) => {
    const escapedContent = mapToEscapedHtml(content);
    if ((!color || color === FOREGROUND) && !isItalic) return escapedContent;
    const styles = [color && color !== FOREGROUND ? `color: ${color}` : '', isItalic ? 'font-style: italic' : ''].filter(Boolean);
    return `<span style="${styles.join('; ')}">${escapedContent}</span>`;
  }).join('');
}
