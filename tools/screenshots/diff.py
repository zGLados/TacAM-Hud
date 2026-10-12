# usage: python3 tools/screenshots/diff.py <dirA> <dirB> – pixel diff per screenshot (threshold 24), e.g. out-before vs out
import os, sys
from PIL import Image, ImageChops
a, b = sys.argv[1:3]
total = 0
for f in sorted(os.listdir(a)):
    d = ImageChops.difference(Image.open(f'{a}/{f}').convert('RGB'), Image.open(f'{b}/{f}').convert('RGB')).convert('L').point(lambda v: 255 if v > 24 else 0)
    n = sum(1 for v in d.getdata() if v)
    total += n
    print(f'{f:28} {n:7} {d.getbbox()}')
print('TOTAL', total)
