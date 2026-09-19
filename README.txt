Pass Predictor — layout and deployment

index.html              page markup; loads css/app.css, vendor/satellite.min.js, js/main.js
css/app.css             all styles, grouped by component; colours only via the tokens at the top
js/main.js              entry point: state, event wiring, the one-second timer, storage
js/dom.js               element handles grouped by page region
js/units.js             constants shared by more than one module
js/storage.js           localStorage keys and safe JSON read/write
js/tle.js               TLE parsing, catalog number, coordinate parsing
js/library.js           saved-satellite list helpers
js/format.js            time/duration/degree formatting (TimeFormatter)
js/propagation.js       SGP4 wrapper: Tracker (look angles, pass search)
js/polar.js             polar sky-plot SVG builder
js/pass-card.js         pass card / list / history markup
js/timeline.js          timeline markup
js/hero-view.js         renders the summary card
js/passes-view.js       renders the upcoming region and history panel
js/setup-view.js        message line, summary line, share link, library dropdown
js/overlay.js           full-screen plot with zoom/pan
vendor/satellite.min.js satellite.js 5.0.0, unmodified
sw.js                   offline cache; bump CACHE when any listed file changes
manifest.webmanifest, icon-192.png, icon-512.png, apple-touch-icon.png
tools/bundle.mjs        builds dist/pass-predictor.html, the single-file build used for the claude.ai artifact

Deploying to GitHub Pages: upload everything except tools/ and dist/, keeping the folder
structure. To ship an update, replace the changed files and bump CACHE in sw.js so
installed phones pick it up on their next online launch.

Installing on iPhone: open the Pages URL in Safari, Share -> Add to Home Screen.
