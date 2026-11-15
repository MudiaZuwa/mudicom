import json, os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
figs = json.load(open(os.path.join(ROOT, 'tools', 'figures.json')))['figures']
tags = '\n'.join(f'<script src="traces/{f["id"]}.js"></script>' for f in figs if os.path.exists(os.path.join(ROOT, 'traces', f['id'] + '.js')))
t = open(os.path.join(ROOT, 'tools', 'gallery_template.html')).read().replace('__SCRIPTS__', tags)
open(os.path.join(ROOT, 'gallery.html'), 'w').write(t)
print('gallery.html with', tags.count('<script'), 'traces')
