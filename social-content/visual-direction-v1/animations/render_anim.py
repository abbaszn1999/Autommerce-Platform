import sys, asyncio, os, shutil, subprocess
from playwright.async_api import async_playwright

name, dur = sys.argv[1], float(sys.argv[2])
only = sys.argv[3:]  # optional time stamps for stills
FPS = 30
base = os.path.join(os.path.dirname(os.path.abspath(__file__)), name)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/local/bin/google-chrome', args=['--no-sandbox', '--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': 1080, 'height': 1350}, device_scale_factor=1)
        await pg.goto(f'file://{base}/index.html', wait_until='networkidle')
        await pg.evaluate('document.fonts.ready')
        await pg.wait_for_timeout(800)
        if only:
            os.makedirs(f'{base}/stills', exist_ok=True)
            for s in only:
                await pg.evaluate(f'render({s})'); await pg.wait_for_timeout(60)
                await pg.screenshot(path=f'{base}/stills/t_{float(s):05.2f}.png')
            await b.close(); return
        fd = f'{base}/frames'
        shutil.rmtree(fd, ignore_errors=True); os.makedirs(fd)
        n = int(dur * FPS)
        for i in range(n):
            await pg.evaluate(f'render({i / FPS})')
            await pg.screenshot(path=f'{fd}/{i:04d}.jpg', type='jpeg', quality=95)
        await b.close()

asyncio.run(main())
if not only:
    out = f'{base}/{name}.mp4'
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(FPS), '-i', f'{base}/frames/%04d.jpg', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '15', '-preset', 'slow', '-movflags', '+faststart', out], check=True)
    print('wrote', out)
