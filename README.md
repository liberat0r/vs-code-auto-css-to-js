# Auto CSS to JS

A Visual Studio Code extension that automatically converts CSS styles to JavaScript objects. Perfect for React inline styles and Material-UI's `sx` prop!

## Features

- **Automatic Conversion**: Automatically converts CSS to JavaScript object syntax when pasting within a valid style context
- **Material-UI Support**: Special handling for Material-UI's `sx` prop with proper value conversions
- **Manual Command**: Use the "Convert CSS to JS" command to convert selected CSS text
- **Smart Context Detection**: Only converts when pasting within style objects or props
- **Configurable**: Customize the conversion behavior to match your preferences

## Usage

### Automatic Conversion

1. Copy some CSS properties:

```css
margin-top: 16px;
background-color: #fff;
padding: 8px;
```

2. Paste into a JavaScript style object or JSX style prop:

```jsx
// In a style object
const styles = {
  // Paste here -> converts to:
  marginTop: 16,
  backgroundColor: '#fff',
  padding: 8
}

// In a JSX style prop
<div style={
  // Paste here -> converts to:
  marginTop: 16,
  backgroundColor: '#fff',
  padding: 8
}>
```

### Material-UI SX Prop Support

When pasting into an `sx` prop, the extension automatically uses MUI's shorthand properties and value conversions:

```jsx
<Box sx={
  // Paste:
  // margin: 16px;
  // width: 100%;
  // padding: 8px;
  //
  // Converts to:
  m: 2,
  width: 1,
  p: 1
}>
```

### Manual Conversion

1. Select CSS text in your editor
2. Open the command palette (Ctrl+Shift+P / Cmd+Shift+P)
3. Run "Convert CSS to JS"

## Configuration

This extension can be customized through VS Code settings:

- `autoCssToJs.enabled`: Enable/disable automatic conversion (default: true)
- `autoCssToJs.removePixelUnit`: Remove 'px' unit and convert to number (default: true)
- `autoCssToJs.quoteValues`: Add quotes to non-numeric values (default: true)

## Supported Languages

- JavaScript (.js)
- TypeScript (.ts)
- React JSX (.jsx)
- React TSX (.tsx)

## Release Notes

### 0.0.1

- Initial release
- Automatic CSS to JS conversion on paste
- Material-UI sx prop support with value conversions
- Manual conversion command
- Configurable settings

## Contributing

Found a bug or have a feature request? Please open an issue on our [GitHub repository](https://github.com/yourusername/auto-css-to-js).

## License

This extension is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
