import * as vscode from "vscode";
import * as path from "path";

export async function activate(context: vscode.ExtensionContext) {
  console.log('Activating Auto CSS to JS extension');
  
  // Check if we've asked about keybinding before
  const hasAskedAboutKeybinding = context.globalState.get('hasAskedAboutKeybinding', false);
  console.log('Has asked about keybinding before:', hasAskedAboutKeybinding);
  
  if (!hasAskedAboutKeybinding) {
    const answer = await vscode.window.showInformationMessage(
      'Auto CSS-to-JS will use Ctrl+V for pasting in the editor, while keeping normal paste behavior elsewhere. Is this OK?',
      'Yes', 'No'
    );

    if (answer === 'No') {
      // User doesn't want our keybindings, disable the feature
      await vscode.workspace.getConfiguration().update(
        'autoCssToJs.enabled',
        false,
        vscode.ConfigurationTarget.Global
      );
      vscode.window.showInformationMessage(
        'Auto CSS-to-JS paste feature has been disabled. You can re-enable it in settings.'
      );
    }

    // Remember that we've asked
    await context.globalState.update('hasAskedAboutKeybinding', true);
  }

  // Register the manual command
  const disposable = vscode.commands.registerCommand(
    "auto-css-to-js.convert",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor!");
        return;
      }

      const selection = editor.selection;
      const text = editor.document.getText(selection);

      if (!text) {
        vscode.window.showErrorMessage("No text selected!");
        return;
      }

      try {
        const jsStyles = convertCSSToJS(text);
        await editor.edit((editBuilder) => {
          editBuilder.replace(selection, jsStyles);
        });
      } catch (error) {
        vscode.window.showErrorMessage("Failed to convert CSS to JS: " + error);
      }
    }
  );

  context.subscriptions.push(disposable);

  // Register clipboard paste handler
  const pasteDisposable = vscode.commands.registerTextEditorCommand(
    "auto-css-to-js.clipboardPasteAction",
    async (editor: vscode.TextEditor) => {
      console.log("PASTE");
      try {
        // Check if we're actually in the editor
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor || activeEditor !== editor) {
          console.log("Not in editor");
          // If not in editor, execute default paste
          await vscode.commands.executeCommand("editor.action.clipboardPasteAction");
          return;
        }

        // Check if the feature is enabled
        const config = vscode.workspace.getConfiguration("autoCssToJs");
        if (!config.get<boolean>("enabled", true)) {
          console.log("Feature is disabled");
          await vscode.commands.executeCommand("editor.action.clipboardPasteAction");
          return;
        }

        const supportedLanguages = [
          "javascript",
          "typescript",
          "javascriptreact",
          "typescriptreact",
        ];

        if (!supportedLanguages.includes(editor.document.languageId)) {
          console.log("Language not supported:", editor.document.languageId);
          await vscode.commands.executeCommand("editor.action.clipboardPasteAction");
          return;
        }

        // Get the clipboard text
        const clipboardText = await vscode.env.clipboard.readText();
        const pastedText = clipboardText.trim();
        console.log("Clipboard text:", pastedText);

        // Quick early returns for obvious non-CSS content
        if (
          !pastedText ||
          pastedText.startsWith("{") ||
          !pastedText.includes(":") ||
          !/-/.test(pastedText)
        ) {
          console.log("Text doesn't match basic CSS pattern");
          await vscode.commands.executeCommand("editor.action.clipboardPasteAction");
          return;
        }

        // Skip if it looks like JS object (camelCase properties or JS syntax)
        if (
          pastedText.includes(":{") ||
          /[A-Z]/.test(pastedText) ||
          /[:,]\s*function/.test(pastedText) ||
          pastedText.includes("fontSize") ||
          pastedText.includes("backgroundColor")
        ) {
          console.log("Text looks like JS object");
          await vscode.commands.executeCommand("editor.action.clipboardPasteAction");
          return;
        }

        // Check if the pasted text looks like CSS
        const isCSS = looksLikeCSS(pastedText);

        if (!isCSS) {
          console.log("Text doesn't look like CSS");
          await vscode.commands.executeCommand("editor.action.clipboardPasteAction");
          return;
        }

        // Get the context around the cursor
        const position = editor.selection.active;
        const currentLine = editor.document.lineAt(position.line);

        // Look at previous lines to find context
        let contextLine = position.line;
        let contextFound = false;
        let lineText = "";

        // Look up to 5 lines back for context
        while (contextLine >= 0 && contextLine > position.line - 5) {
          lineText = editor.document.lineAt(contextLine).text;

          if (isStyleContext(lineText)) {
            contextFound = true;
            break;
          }
          contextLine--;
        }

        if (contextFound) {
          const isSxProp = isMuiSxContext(
            currentLine.text,
            position.line,
            editor.document
          );
          const jsStyles = convertCSSToJS(pastedText, isSxProp);
          console.log("Converted to JS:", jsStyles);

          // Insert the converted styles at the cursor position
          await editor.edit((editBuilder) => {
            editBuilder.insert(position, jsStyles);
          });

          // Format the document
          await vscode.commands.executeCommand("editor.action.formatDocument");
        } else {
          // If not in a style context, just do a normal paste
          await vscode.commands.executeCommand("editor.action.clipboardPasteAction");
        }
      } catch (error) {
        // If there's an error, fall back to normal paste
        console.error("Error during paste handling:", error);
        const fallbackText = await vscode.env.clipboard.readText();
        await vscode.commands.executeCommand("editor.action.clipboardPasteAction");
      }
    }
  );

  context.subscriptions.push(pasteDisposable);

  // Register reset command
  const resetDisposable = vscode.commands.registerCommand(
    "auto-css-to-js.resetKeybindingPrompt",
    async () => {
      await context.globalState.update('hasAskedAboutKeybinding', false);
      vscode.window.showInformationMessage('Keybinding prompt has been reset. Reload VS Code to see the prompt again.');
    }
  );

  context.subscriptions.push(resetDisposable);

  // Rest of the code remains the same
}

function looksLikeCSS(text: string): boolean {
  // Don't convert if it already looks like JS object
  if (
    text.includes("fontSize") ||
    text.includes("backgroundColor") ||
    /{\s*\w+:\s*['"]/.test(text)
  ) {
    return false;
  }

  // Must contain at least one CSS property with hyphen
  const hasHyphen = /-/.test(text);

  if (!hasHyphen) {
    return false;
  }

  // Check if the text contains CSS-like patterns
  const cssPatterns = [
    /[a-zA-Z-]+:\s*[^;\n]+;/, // property: value;
    /^[a-zA-Z-]+:[^;\n]+$/m, // property: value (no semicolon)
    /^[a-z-]+$/m, // just property name
    /^[a-z-]+:\s*[^;\n]+$/m, // property: value on single line
  ];

  // Text must match at least one CSS pattern and contain a colon
  const hasColon = text.includes(":");
  const matchesPattern = cssPatterns.some((pattern) => pattern.test(text));

  return hasColon && matchesPattern;
}

// Material UI sx prop shorthand mappings
const muiShorthands: { [key: string]: string } = {
  // Margins
  margin: "m",
  marginTop: "mt",
  marginRight: "mr",
  marginBottom: "mb",
  marginLeft: "ml",
  "margin-top": "mt",
  "margin-right": "mr",
  "margin-bottom": "mb",
  "margin-left": "ml",

  // Paddings
  padding: "p",
  paddingTop: "pt",
  paddingRight: "pr",
  paddingBottom: "pb",
  paddingLeft: "pl",
  "padding-top": "pt",
  "padding-right": "pr",
  "padding-bottom": "pb",
  "padding-left": "pl",

  // Colors and Backgrounds
  backgroundColor: "bgcolor",
  "background-color": "bgcolor",
};

// Properties that use theme.spacing multiplier (divide by 8)
const spacingProperties = new Set([
  "m",
  "mt",
  "mr",
  "mb",
  "ml", // margins
  "p",
  "pt",
  "pr",
  "pb",
  "pl", // paddings
  "gap",
  "rowGap",
  "columnGap", // grid gaps
]);

// Properties that convert percentages to decimals
const percentageProperties = new Set([
  "width",
  "height",
  "maxWidth",
  "maxHeight",
  "minWidth",
  "minHeight",
]);

function formatMuiValue(property: string, value: string): string {
  // Handle percentage values first
  if (value.endsWith("%")) {
    if (percentageProperties.has(property)) {
      const percentage = parseFloat(value);
      if (!isNaN(percentage)) {
        return String(percentage / 100);
      }
    }
    return value;
  }

  // Remove 'px' if present
  const cleanValue = value.replace("px", "");

  // Try to parse as number
  const numValue = parseFloat(cleanValue);
  if (isNaN(numValue)) return value;

  // Handle margin and padding values
  if (property.startsWith("margin") || property.startsWith("padding")) {
    if (property === "margin" || property === "padding") {
      const values = cleanValue.split(" ");
      const prefix = property === "margin" ? "m" : "p";
      if (values.length === 4) {
        return `{
          ${prefix}t: ${parseFloat(values[0]) / 8},
          ${prefix}r: ${parseFloat(values[1]) / 8},
          ${prefix}b: ${parseFloat(values[2]) / 8},
          ${prefix}l: ${parseFloat(values[3]) / 8},
        }`;
      }
    }
    return String(numValue / 8);
  }

  // Handle border values
  if (property.startsWith("border")) {
    if (Number.isInteger(numValue)) {
      return String(numValue / 4);
    }
  }

  return String(numValue);
}

function isStyleContext(text: string): boolean {
  const stylePatterns = [
    /const\s+styles?\s*=\s*{\s*$/m, // const styles = {
    /const\s+\w*style\w*\s*=\s*{\s*$/m, // const myStyle = {
    /style\s*=\s*{\s*$/m, // style={
    /style:\s*{\s*$/m, // style: {
    /sx\s*=\s*{\s*$/m, // sx={
    /{\s*$/m, // just an opening brace
  ];

  const result = stylePatterns.some((pattern) => pattern.test(text));
  return result;
}

function isMuiSxContext(
  text: string,
  lineNumber: number,
  document: vscode.TextDocument
): boolean {
  // First check the current line for sx prop
  if (/sx\s*=\s*{\s*$/.test(text)) {
    return true;
  }

  // Look back up to 3 lines to find sx prop
  for (let i = lineNumber; i >= Math.max(0, lineNumber - 3); i--) {
    const line = document.lineAt(i).text;
    if (/sx\s*=\s*{/.test(line)) {
      return true;
    }
  }

  return false;
}

function convertCSSToJS(css: string, isSxProp: boolean = false): string {
  // Get configuration
  const config = vscode.workspace.getConfiguration("autoCssToJs");
  const removePixelUnit = config.get<boolean>("removePixelUnit", true);
  const quoteValues = config.get<boolean>("quoteValues", true);

  // Remove comments and split into lines
  const lines = css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/[;\n]/)
    .filter((line) => line.trim());

  const properties: string[] = [];

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    // Handle special case where line doesn't end with semicolon
    if (!line.endsWith(";")) {
      line += ";";
    }

    // Split into property and value
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;

    const property = line.substring(0, colonIndex).trim();
    const value = line.substring(colonIndex + 1, line.length - 1).trim();

    if (!property || !value) continue;

    // Convert property name to camelCase
    const camelProperty = property.replace(/-([a-z])/g, (_, char) =>
      char.toUpperCase()
    );

    // Use MUI shorthand if we're in an sx prop context
    const finalProperty =
      isSxProp && muiShorthands[camelProperty]
        ? muiShorthands[camelProperty]
        : camelProperty;

    // Format the value
    let formattedValue = value;

    // Handle numeric values
    if (
      /^-?\d+$/.test(value) ||
      /^-?\d+px$/.test(value) ||
      /^-?\d+%$/.test(value)
    ) {
      if (isSxProp) {
        formattedValue = formatMuiValue(finalProperty, value);
      } else if (removePixelUnit && /^-?\d+px$/.test(value)) {
        formattedValue = value.replace("px", "");
      }
    } else if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) {
      // Hex colors don't need quotes
      formattedValue = value;
    } else if (quoteValues) {
      // Add quotes to other values if the setting is enabled
      formattedValue = `'${value.replace(/'/g, '"')}'`;
    }

    properties.push(`${finalProperty}: ${formattedValue}`);
  }

  // Return just the properties without surrounding braces
  const result = `  ${properties.join(",\n  ")}`;
  return result;
}

export function deactivate() {}
