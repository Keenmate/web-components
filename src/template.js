/**
 * Side layer: the one placeholder syntax the devkit uses for its own templates
 * (generated files, the scaffold, the examples layout) — `{{UPPER_CASE}}`.
 * An unknown placeholder is an error, never silently empty.
 */
export function renderTemplate(templateText, variables) {
  return templateText.replace(/\{\{([A-Z_]+)\}\}/g, (placeholder, variableName) => {
    if (!(variableName in variables)) throw new Error(`kmwc: template variable ${variableName} is not defined`);
    return String(variables[variableName]);
  });
}
