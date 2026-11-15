s=open('shell.html').read().replace('__ENGINE__',open('engine.js').read()).replace('__PRESETS__',open('presets.js').read())
open('character_studio.html','w').write(s)
