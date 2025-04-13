# Stadium Visualizer

A 3D interactive visualization tool to represent large numbers of people using 100,000-person capacity stadiums.

## Features

- Input any number of people to visualize
- 3D interactive environment with flyable camera
- Visual representation where each stadium represents 100,000 people
- Responsive design that works on various screen sizes

## How to Use

1. Open `index.html` in a modern web browser (Chrome, Firefox, Edge recommended)
2. Enter a number of people in the input field
3. Click "Visualize" to see the representation
4. Use your mouse to navigate the 3D environment:
   - Left-click + drag to rotate
   - Right-click + drag to pan
   - Scroll to zoom in/out

## Requirements

- Modern web browser with WebGL support
- JavaScript enabled

## Project Structure

- `index.html` - Main HTML document
- `styles.css` - CSS styling
- `scripts.js` - JavaScript code for visualization
- `stage.obj` - 3D model of a stadium

## Local Development

To run this project locally:

1. Clone this repository
2. Open `index.html` in your browser

Alternatively, you can use a simple local server:

```bash
# Using Python 3
python -m http.server

# Using Node.js
npx serve
```

Then open `http://localhost:8000` (Python) or `http://localhost:3000` (Node) in your browser.

## Technical Details

This project uses:
- Three.js for 3D rendering
- D3.js for data visualization
- HTML5/CSS3 for structure and styling

## License

MIT 