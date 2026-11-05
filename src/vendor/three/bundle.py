"""Embed the offline viewer into an opaque-origin frame with a hash-only CSP."""
import base64
import hashlib
import pathlib
import sys

here = pathlib.Path(__file__).resolve().parent
ui = here.parent.parent / 'ui'
library = pathlib.Path(sys.argv[1]).read_text()
script = (ui / 'model-viewer.js').read_text()
style = (ui / 'model-viewer.css').read_text()

def csp(text):
    return "'sha256-" + base64.b64encode(hashlib.sha256(text.encode()).digest()).decode() + "'"

page = (here / 'template.html').read_text()
page = page.replace("script-src 'self'", "script-src " + csp(library) + " " + csp(script))
page = page.replace("style-src 'self'", "style-src " + csp(style))
page = page.replace('<link rel="stylesheet" href="model-viewer.css">', '<style>' + style + '</style>')
for name, source in [('../vendor/three/viewer.min.js', library), ('model-viewer.js', script)]:
    if '</script' in source.lower():
        raise ValueError('Script contains an HTML closing tag')
    page = page.replace('<script src="' + name + '"></script>', '<script>' + source + '</script>')
(ui / 'model-viewer.html').write_text(page)
