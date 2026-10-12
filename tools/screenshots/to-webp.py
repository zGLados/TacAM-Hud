# usage: python3 tools/screenshots/to-webp.py [name ...] – converts out/*.png to docs/images/*.webp
# (quality 85) and refreshes the copies in website/images. Needs Pillow.
import os, sys
from PIL import Image
here = os.path.dirname(os.path.abspath(__file__))
root = os.path.abspath(os.path.join(here, '..', '..'))
out = os.path.join(here, 'out')
names = sys.argv[1:] or [f[:-4] for f in sorted(os.listdir(out)) if f.endswith('.png')]
for name in names:
    img = Image.open(os.path.join(out, name + '.png')).convert('RGB')
    target = os.path.join(root, 'docs', 'images', name + '.webp')
    img.save(target, 'WEBP', quality=85)
    site = os.path.join(root, 'website', 'images', name + '.webp')
    if os.path.exists(site):
        img.save(site, 'WEBP', quality=85)
    print(name, '→ docs/images' + (' + website/images' if os.path.exists(site) else ''))
