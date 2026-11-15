import json, os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
sets = json.load(open(os.path.join(ROOT, 'generator/sets.json')))['sets']
ids = sorted({f for s in sets.values() for f in s['views'].values() if f})
tags = '\n'.join(f'<script src="../traces/{i}.js"></script>' for i in ids)
src = open(os.path.join(ROOT, 'generator/index.html')).read()
import re
src = re.sub(r'(?s)(<script>window.TRACES = \[\];</script>\n).*?(\n<script src="parts.js">)', lambda m: m.group(1) + tags + m.group(2), src.replace('__TRACES__', '__T__')).replace('__T__', tags)
open(os.path.join(ROOT, 'generator/index.html'), 'w').write(src)
print(len(ids), 'traces linked')
