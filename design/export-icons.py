"""Export platform icons from the approved image: python3 design/export-icons.py.

Requires Pillow. Only resizes/encodes the artwork; retains its alpha channel.
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
source = Image.open(ROOT / 'design/river-icon-source.png').convert('RGBA')
assert source.width == source.height, 'The app icon must be square'
build = ROOT / 'build'
(build / 'icons').mkdir(parents=True, exist_ok=True)
public = ROOT / 'src/renderer/public'
public.mkdir(parents=True, exist_ok=True)
master = source.resize((1024, 1024), Image.Resampling.LANCZOS)
master.save(build / 'icon.png')
master.save(build / 'icon.icns')
master.save(build / 'icon.ico', sizes=[(n, n) for n in (16, 24, 32, 48, 64, 128, 256)])
for size in (16, 24, 32, 48, 64, 128, 256, 512):
    master.resize((size, size), Image.Resampling.LANCZOS).save(build / 'icons' / f'{size}x{size}.png')
master.resize((128, 128), Image.Resampling.LANCZOS).save(public / 'river-icon.png')
