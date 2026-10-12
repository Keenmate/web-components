/**
 * Page composition for example pages — the "one copy of every repeated line"
 * half of the examples kit. Runs inside the kmwc Vite plugin (dev and build),
 * before the kit is injected:
 *
 *   1. <kmwc-include src="partials/x.html" any-param="…">inner</kmwc-include>
 *      → the partial, with {{anyParam}} / {{content}} substituted. Nested
 *      includes are fine; cycles are an error.
 *   2. <kmwc-demo>…markup…</kmwc-demo>
 *      → the live markup AND a code block of that exact markup, so a snippet
 *      can never drift from its demo. <script data-kmwc-show> inside a demo is
 *      executed and shown too.
 *   3. A page without <html> is a FRAGMENT: it gets the devkit layout (head,
 *      header with back link / title / subtitle, container, component entry
 *      script), driven by <meta name="kmwc:…"> tags:
 *        kmwc:title       page title (h1 + <title>)          — required
 *        kmwc:subtitle    header subtitle
 *        kmwc:layout      page (default) | bare (no header / container — e.g. the index)
 *        kmwc:entry       component entry script; default /<library.entry>, "none" to skip
 *        kmwc:body-class  classes for <body> (e.g. dark-output)
 *      <link> and <style> elements anywhere in a fragment move into <head>.
 *   Full documents (<html …>) are left as they are — pages migrate one at a time.
 *
 * Pure string work on purpose: unit-testable, no HTML parser dependency. The
 * tag shapes are deliberately strict (no nesting of a tag inside itself).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DEVKIT_ROOT } from '../config.js';
import { renderTemplate } from '../template.js';

const LAYOUT_TEMPLATE_PATH = join(DEVKIT_ROOT, 'templates', 'examples-layout.html');
const MAX_INCLUDE_DEPTH = 10;
const DEFAULT_LAYOUT = 'page';
const LAYOUTS = ['page', 'bare'];

const INCLUDE_PATTERN = /<kmwc-include\b([^>]*?)(?:\/>|>([\s\S]*?)<\/kmwc-include>)/g;
const DEMO_PATTERN = /<kmwc-demo\b([^>]*)>([\s\S]*?)<\/kmwc-demo>/g;
const SHOWN_SCRIPT_PATTERN = /<script\b([^>]*\bdata-kmwc-show\b[^>]*)>([\s\S]*?)<\/script>/g;
const PAGE_META_PATTERN = /<meta\s+name="kmwc:([a-z-]+)"\s+content="([^"]*)"\s*\/?>\s*/g;
const HEAD_ELEMENT_PATTERN = /<link\b[^>]*>\s*|<style\b[^>]*>[\s\S]*?<\/style>\s*/g;
const ATTRIBUTE_PATTERN = /([a-zA-Z][\w-]*)(?:\s*=\s*"([^"]*)")?/g;

const HTML_COMMENT_PATTERN = /<!--[\s\S]*?-->/g;
// A full document STARTS with a doctype or <html> (after a BOM, whitespace, comments). Matching
// `<html>` anywhere would misread a fragment whose script or code sample mentions it.
const DOCUMENT_START_PATTERN = /^﻿?(?:\s|<!--[\s\S]*?-->)*<(?:!doctype\b|html[\s>])/i;

/**
 * Apply `mapper` to the text OUTSIDE HTML comments only, so a usage example in
 * a comment (`<!-- <kmwc-include src="…"> -->`) is never expanded.
 */
export function mapOutsideComments(html, mapper) {
  let mappedHtml = '';
  let lastIndex = 0;
  for (const comment of html.matchAll(HTML_COMMENT_PATTERN)) {
    mappedHtml += mapper(html.slice(lastIndex, comment.index)) + comment[0];
    lastIndex = comment.index + comment[0].length;
  }
  return mappedHtml + mapper(html.slice(lastIndex));
}

const mapToCamelCase = (kebabName) => kebabName.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const mapToEscapedHtml = (text) => String(text).replace(/[&<>"]/g, (character) => HTML_ESCAPES[character]);

/** `preview-class="x" code` → { previewClass: 'x', code: '' } */
export function getAttributes(attributeText) {
  const attributes = {};
  for (const match of attributeText.matchAll(ATTRIBUTE_PATTERN)) {
    attributes[mapToCamelCase(match[1])] = match[2] ?? '';
  }
  return attributes;
}

/** Strip the common leading indentation and surrounding blank lines. */
export function mapToDedentedText(text) {
  const lines = text.replace(/\t/g, '    ').split(/\r?\n/);
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const indentation = Math.min(...lines.filter((line) => line.trim()).map((line) => line.match(/^ */)[0].length));
  return lines.map((line) => line.slice(Number.isFinite(indentation) ? indentation : 0)).join('\n');
}

/**
 * Replace every <kmwc-include> (recursively). Parameters are the tag's
 * attributes (kebab → camel: `note-title` → {{noteTitle}}) plus {{content}}
 * (the tag's inner HTML). Unknown {{placeholders}} are left untouched — a
 * partial may legitimately show template syntax.
 */
export function resolveIncludes(html, { root, includeChain = [], readFile = defaultReadFile }) {
  if (includeChain.length > MAX_INCLUDE_DEPTH) throw new Error(`kmwc: includes nested deeper than ${MAX_INCLUDE_DEPTH}: ${includeChain.join(' → ')}`);
  return mapOutsideComments(html, (text) =>
    text.replace(INCLUDE_PATTERN, (includeTag, attributeText, innerHtml = '') => {
      const { src: partialPath, ...parameters } = getAttributes(attributeText);
      if (!partialPath) throw new Error(`kmwc: <kmwc-include> without src: ${includeTag.slice(0, 80)}`);
      if (includeChain.includes(partialPath)) throw new Error(`kmwc: include cycle: ${[...includeChain, partialPath].join(' → ')}`);
      const partialHtml = readFile(resolve(root, partialPath), partialPath);
      const variables = { ...parameters, content: innerHtml.trim() };
      const filledHtml = partialHtml.replace(/\{\{\s*([a-zA-Z][\w]*)\s*\}\}/g, (placeholder, name) => (name in variables ? variables[name] : placeholder));
      return resolveIncludes(filledHtml, { root, includeChain: [...includeChain, partialPath], readFile });
    })
  );
}

function defaultReadFile(absolutePath, displayPath) {
  if (!existsSync(absolutePath)) throw new Error(`kmwc: <kmwc-include src="${displayPath}"> — file not found (${absolutePath})`);
  return readFileSync(absolutePath, 'utf8');
}

function renderCodeBlock(codeText, language) {
  return `<div class="code-block kmwc-demo__code" data-language="${language}"><pre><code>${mapToEscapedHtml(codeText)}</code></pre></div>`;
}

/**
 * Turn every <kmwc-demo> into live markup + the code that produced it.
 * Attributes: `preview-class` (default "demo-area"), `markup-hidden` (show
 * only the scripts' code), `code-hidden` (live only — rarely what you want).
 */
export function renderDemos(html) {
  return mapOutsideComments(html, (text) => text.replace(DEMO_PATTERN, renderDemo));
}

function renderDemo(demoTag, attributeText, innerHtml) {
  const attributes = getAttributes(attributeText);
  const shownScripts = [];
  const markupHtml = innerHtml.replace(SHOWN_SCRIPT_PATTERN, (scriptTag, scriptAttributeText, scriptBody) => {
    shownScripts.push({ attributeText: scriptAttributeText.replace(/\s*\bdata-kmwc-show\b(="[^"]*")?/, ''), body: scriptBody });
    return '';
  });
  const codeBlocks = [];
  if (!('markupHidden' in attributes) && markupHtml.trim()) codeBlocks.push(renderCodeBlock(mapToDedentedText(markupHtml), 'html'));
  for (const script of shownScripts) codeBlocks.push(renderCodeBlock(mapToDedentedText(script.body), 'js'));

  const previewClass = attributes.previewClass ?? 'demo-area';
  const scriptsHtml = shownScripts.map((script) => `<script${script.attributeText}>${script.body}</script>`).join('\n');
  return (
    `<div class="kmwc-demo">\n` +
    `<div class="kmwc-demo__preview ${previewClass}">${markupHtml}</div>\n` +
    ('codeHidden' in attributes ? '' : codeBlocks.join('\n')) +
    `\n</div>\n${scriptsHtml}`
  );
}

/** Read and remove the page's <meta name="kmwc:…"> tags (`kmwc:body-class` → `bodyClass`). */
export function getPageMeta(html) {
  const pageMeta = {};
  const htmlWithoutMeta = mapOutsideComments(html, (text) =>
    text.replace(PAGE_META_PATTERN, (metaTag, name, content) => {
      pageMeta[mapToCamelCase(name)] = content;
      return '';
    })
  );
  return { pageMeta, htmlWithoutMeta };
}

export const checkIsFragment = (html) => !DOCUMENT_START_PATTERN.test(html);

/** Wrap a fragment page in the devkit layout. */
export function renderLayout(fragmentHtml, { config, pagePath }) {
  const { pageMeta, htmlWithoutMeta } = getPageMeta(fragmentHtml);
  const layout = pageMeta.layout || DEFAULT_LAYOUT;
  if (!LAYOUTS.includes(layout)) throw new Error(`kmwc: ${pagePath}: unknown kmwc:layout "${layout}" (${LAYOUTS.join(' | ')})`);
  if (layout === 'page' && !pageMeta.title) throw new Error(`kmwc: ${pagePath}: a fragment page needs <meta name="kmwc:title" content="…">`);

  const headElements = [];
  const bodyContent = mapOutsideComments(htmlWithoutMeta, (text) =>
    text.replace(HEAD_ELEMENT_PATTERN, (element) => {
      headElements.push(`    ${element.trim()}`);
      return '';
    })
  );

  const entry = pageMeta.entry ?? `/${config.library.entry.replace(/^\.?\//, '')}`;
  const pageTitle = pageMeta.title || config.title;
  const bodyHtml =
    layout === 'bare'
      ? bodyContent.trim()
      : [
          '<div class="container">',
          '    <header>',
          '        <a href="index.html" class="back-link">← Back to Examples</a>',
          `        <h1>${pageTitle}</h1>`,
          pageMeta.subtitle ? `        <p class="subtitle">${pageMeta.subtitle}</p>` : '',
          '    </header>',
          bodyContent.trim(),
          '</div>',
        ]
          .filter(Boolean)
          .join('\n');

  return renderTemplate(readFileSync(LAYOUT_TEMPLATE_PATH, 'utf8'), {
    DOCUMENT_TITLE: layout === 'bare' ? pageTitle : `${pageTitle} — ${mapToEscapedHtml(config.title)}`,
    HEAD_HTML: headElements.join('\n'),
    BODY_ATTRIBUTES: pageMeta.bodyClass ? ` class="${pageMeta.bodyClass}"` : '',
    BODY_HTML: bodyHtml,
    // In <head>: module scripts run in document order, so the element is
    // defined before the page's own scripts run.
    ENTRY_SCRIPT_HTML: entry === 'none' ? '' : `    <script type="module" src="${entry}"></script>`,
  });
}

/** The whole pipeline: includes → demos → layout (fragments only). */
export function composePage(html, { config, pagePath, readFile }) {
  let composedHtml = resolveIncludes(html, { root: config.root, readFile });
  composedHtml = renderDemos(composedHtml);
  return checkIsFragment(composedHtml) ? renderLayout(composedHtml, { config, pagePath }) : composedHtml;
}
