Pass Predictor — install on iPhone via GitHub Pages

1. Go to github.com, sign in, click "+" (top right) -> "New repository".
   Name it pass-predictor, set it to Public, click "Create repository".
2. On the empty-repo page click "uploading an existing file".
   Drag in all of these: index.html, manifest.webmanifest, sw.js,
   icon-192.png, icon-512.png, apple-touch-icon.png
   Click "Commit changes".
3. Repo -> Settings -> Pages. Under "Build and deployment", Source = "Deploy from a branch",
   Branch = main, folder = / (root). Save.
4. Wait a minute, refresh the Pages settings; it shows your URL:
   https://<your-username>.github.io/pass-predictor/
5. On the iPhone, open that URL in Safari. Share -> Add to Home Screen -> Add.
6. Open it once from the icon while online; after that it works with no connection.

Updating later: upload a new index.html in the repo and bump CACHE in sw.js
(v1 -> v2). The phone picks up the new version on the next online launch.
