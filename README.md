# NEXUS: What We Feel vs What We See

Interactive art piece exploring the gap between machine vision and human emotion.

## How It Works

- Upload page (index.html): add your object and choose the emotion it evokes.
- Analysis page (visualisation.html): a PCA 2D map places objects based on simple visual features (colour, contrast, brightness, saturation). Colours indicate reported emotions.
- Hover points to see filename and emotion. Re-run PCA anytime.

## Files
- index.html — Upload UI + live gallery
- visualisation.html — PCA 2D map + legend + dataset export
- style.css — Shared UI styles
- scripts.js — Firebase sync, uploads, PCA rendering (numeric.js)

## Notes
- No clustering or Pyodide is used anymore; the visualization is a pure PCA projection computed in the browser with numeric.js.
- Admin deletion and dataset utilities live in the same codebase (see scripts.js).
