# NEXUS: Emotional Objects Clustering

NEXUS is a browser-based artwork that collects images of everyday objects, asks people to label them with one of six basic emotions, and then clusters them using machine learning. The interface visualizes how different viewers emotionally interpret similar objects.

## Live demo

https://spatikasam.github.io/nexus/

## How it works

- Upload an image of an everyday object.
- Choose an emotion: anger, disgust, fear, happiness, sadness, or surprise.
- Click **“Add to NEXUS”** to send it to the shared dataset.
- When enough images exist, click **“CLUSTER NEXUS (ML Live)”** to run PCA + K‑Means in the browser and recolor the gallery.
- Use **“Stats”** to see how many objects fall under each emotion and **“Export ML Dataset”** to download the JSON.

## Tech

- HTML, CSS, and vanilla JavaScript  
- Pyodide + scikit‑learn running entirely in the browser  
- Firebase Firestore + Storage for shared data  
- Hosted on GitHub Pages

## Notes

This project was created as an experimental exploration of emotional ambiguity in everyday objects.
