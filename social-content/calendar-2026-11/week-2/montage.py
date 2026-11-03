"""M8 'Recorded, not rendered' montage. usage: python3 montage.py"""
import asyncio, json, os, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from videos import VIDEOS, ENGINE, k

V = f'{HERE}/videos'
MUSIC = os.path.join(HERE, '..', '..', '..', '.cursor', 'skills', 'promo-video', 'music', 'the-upbeat-inspiring-corporate-142313.mp3')
TMP = '/tmp/work/w2/m8'
FPS, XF = 30, 0.5
INTRO, OUTRO = 3.4, 4.6
CLIPS = [('P4', 8.0, 5.0, 'Persona AI stylist', 'Only what you stock,|with their size on it.'),
         ('M5', 17.5, 5.0, 'Image Classification', '8 products, named|down to the model.'),
         ('A4', 18.5, 5.0, 'Catalog Intelligence', 'Images for 5 of 6.|The 6th says Not found.'),
         ('M7', 17.5, 5.0, 'Products Visualizer', 'A finished product page,|ready to publish.')]


def clip(i, key, ss, d, label, text):
    cfg = VIDEOS[key]()
    cfg.pop('music', None)
    cfg['caps'] = [dict(a=ss - 2, b=ss + d + 2, k=k(f'{i:02d}', label), t=text)]
    cfg['span'] = [ss, ss + d]
    cp = f'{TMP}/clip{i}.json'; json.dump(cfg, open(cp, 'w'))
    subprocess.run([sys.executable, f'{ENGINE}/demo.py', cp, f'{TMP}/{i}.mp4'], check=True)


async def cards():
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/local/bin/google-chrome', args=['--no-sandbox'])
        pg = await b.new_page(viewport={'width': 1080, 'height': 1350})
        await pg.goto(f'file://{HERE}/montage.html'); await pg.wait_for_timeout(1500)
        await pg.evaluate('document.fonts.ready')
        for mode, dur in (('intro', INTRO), ('outro', OUTRO)):
            d = f'{TMP}/{mode}'; os.makedirs(d, exist_ok=True)
            for i in range(round(dur * FPS)):
                await pg.evaluate(f'render("{mode}", {i / FPS}, {dur})')
                await pg.screenshot(path=f'{d}/{i:05d}.png')
        await b.close()


def enc(args, out):
    subprocess.run(['ffmpeg', '-y', '-v', 'error', *args, '-r', str(FPS), '-pix_fmt', 'yuv420p',
                    '-c:v', 'libx264', '-crf', '16', '-preset', 'medium', '-an', out], check=True)


def main():
    shutil.rmtree(TMP, ignore_errors=True); os.makedirs(TMP)
    asyncio.run(cards())
    parts = []
    enc(['-framerate', str(FPS), '-i', f'{TMP}/intro/%05d.png'], f'{TMP}/0.mp4'); parts.append((f'{TMP}/0.mp4', INTRO))
    for i, (key, ss, d, label, text) in enumerate(CLIPS, 1):
        clip(i, key, ss, d, label, text); parts.append((f'{TMP}/{i}.mp4', d))
    enc(['-framerate', str(FPS), '-i', f'{TMP}/outro/%05d.png'], f'{TMP}/9.mp4'); parts.append((f'{TMP}/9.mp4', OUTRO))

    ins, fl, off, last = [], [], 0.0, '0:v'
    for f, _ in parts: ins += ['-i', f]
    for i in range(1, len(parts)):
        off += parts[i - 1][1] - XF
        lab = f'v{i}'
        fl.append(f'[{last}][{i}:v]xfade=transition=fadeblack:duration={XF}:offset={off:.3f}[{lab}]'); last = lab
    total = sum(d for _, d in parts) - XF * (len(parts) - 1)
    ins += ['-ss', '4', '-i', MUSIC]
    fl.append(f'[{len(parts)}:a]atrim=0:{total:.3f},asetpts=PTS-STARTPTS,afade=t=in:d=0.6,'
              f'afade=t=out:st={total - 2.2:.3f}:d=2.2,volume=0.75,loudnorm=I=-17:TP=-1.5:LRA=11[a]')
    subprocess.run(['ffmpeg', '-y', '-v', 'error', *ins, '-filter_complex', ';'.join(fl), '-map', f'[{last}]', '-map', '[a]',
                    '-r', str(FPS), '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-crf', '16', '-c:a', 'aac', '-b:a', '192k',
                    '-movflags', '+faststart', f'{V}/M8.mp4'], check=True)
    print('wrote', f'{V}/M8.mp4', round(total, 2))


if __name__ == '__main__':
    main()
