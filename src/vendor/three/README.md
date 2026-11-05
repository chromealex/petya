This directory contains the MIT-licensed Three.js 0.180.0 viewer subset. To reproduce viewer.min.js, copy entry.mjs into a temporary directory with three@0.180.0 and esbuild@0.25.11 installed and run:

    esbuild entry.mjs --bundle --minify --global-name=PetyaMesh --outfile=viewer.min.js

Run python3 bundle.py /path/to/viewer.min.js to rebuild src/ui/model-viewer.html from the bundle, template, UI script and stylesheet. Its sandbox admits only the embedded, hashed code and local model data.
