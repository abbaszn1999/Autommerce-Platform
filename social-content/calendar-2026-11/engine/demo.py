"""Render a config-driven demo video.

usage: python3 demo.py <config.json> <out.mp4> [--stills t1 t2 ...]

The config describes the recorded frames (list of [file, source_seconds]),
the output-time -> source-time segments, camera keyframes [t, fx, fy, zoom]
in device pixels, taps, captions and the end card. See week-2/videos.py.
An optional "span": [t0, t1] renders only that part of the timeline.
"""
import asyncio, json, os, shutil, subprocess, sys
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
MUSIC = os.path.join(HERE, '..', '..', '..', '.cursor', 'skills', 'promo-video', 'music')
FPS = 30


async def run(cfg, out, stills):
    tmp = out + '.frames'
    shutil.rmtree(tmp, ignore_errors=True); os.makedirs(tmp)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/local/bin/google-chrome',
                                    args=['--no-sandbox', '--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': 1080, 'height': 1350}, device_scale_factor=1)
        await pg.goto(f'file://{HERE}/demo.html', wait_until='networkidle')
        await pg.evaluate('document.fonts.ready')
        await pg.evaluate('c => setup(c)', cfg)
        await pg.wait_for_timeout(600)
        t0, t1 = cfg.get('span', [0, cfg['dur']])
        times = [float(s) for s in stills] if stills else [t0 + i / FPS for i in range(round((t1 - t0) * FPS))]
        for i, t in enumerate(times):
            await pg.evaluate('t => render(t)', t)
            name = f'{tmp}/t_{t:05.2f}.png' if stills else f'{tmp}/{i:05d}.jpg'
            await pg.screenshot(path=name, type='png' if stills else 'jpeg', **({} if stills else {'quality': 95}))
        await b.close()
    if stills:
        print('stills in', tmp); return
    silent = out + '.silent.mp4'
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(FPS), '-i', f'{tmp}/%05d.jpg',
                    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-preset', 'slow', silent], check=True)
    m = cfg.get('music')
    if m:
        d = cfg['dur']; st = m.get('start', 0)
        af = (f"[1:a]atrim={st}:{st + d},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.8,"
              f"afade=t=out:st={d - 2.2}:d=2.2,volume={m.get('vol', 0.8)},loudnorm=I=-17:TP=-1.5:LRA=11[a]")
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', silent, '-i', os.path.join(MUSIC, m['file']),
                        '-filter_complex', af, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac',
                        '-b:a', '192k', '-ar', '48000', '-shortest', '-movflags', '+faststart', out], check=True)
        os.remove(silent)
    else:
        os.replace(silent, out)
    shutil.rmtree(tmp)
    print('wrote', out)


if __name__ == '__main__':
    cfg = json.load(open(sys.argv[1])); out = os.path.abspath(sys.argv[2])
    stills = sys.argv[4:] if len(sys.argv) > 3 and sys.argv[3] == '--stills' else []
    asyncio.run(run(cfg, out, stills))
