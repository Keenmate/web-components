import { blissAnalyzerConfig, cssVariablesFromManifestPlugin } from '@keenmate/web-components-core/cem';
import { customElementVsCodePlugin } from 'custom-element-vs-code-integration';
import { customElementJetBrainsPlugin } from 'custom-element-jet-brains-integration';

/**
 * Custom Elements Manifest (custom-elements-manifest.md). Core's
 * blissAnalyzerConfig() reads the `static inputs` / `static events` tables
 * (ATTRIBUTE_TABLE) straight from the AST, so attributes, properties and events
 * in custom-elements.json come from the same table the runtime uses.
 * cssVariablesFromManifestPlugin() adds the --{{PREFIX}}-* surface from
 * component-variables.manifest.json; the editor plugins then emit
 * vscode.html-custom-data.json / vscode.css-custom-data.json / web-types.json.
 */
export default blissAnalyzerConfig({
  globs: ['src/**/*.ts'],
  exclude: ['src/**/*.spec.ts', 'src/**/*.test.ts', 'src/**/*.d.ts', 'src/index.ts'],
  outdir: '.',
  plugins: [
    cssVariablesFromManifestPlugin(),
    customElementVsCodePlugin({ outdir: '.' }),
    customElementJetBrainsPlugin({ outdir: '.', packageJson: false }),
  ],
});
