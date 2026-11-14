import sys, asyncio, os
ROOT = os.path.dirname(os.path.abspath(__file__))
from playwright.async_api import async_playwright

async def main(names):
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/local/bin/google-chrome', args=['--no-sandbox', '--allow-file-access-from-files'])
        for n in names:
            pg = await b.new_page(viewport={'width': 1080, 'height': 1350}, device_scale_factor=2)
            await pg.goto(f'file://{ROOT}/{n}.html', wait_until='networkidle')
            await pg.evaluate('document.fonts.ready')
            await pg.wait_for_timeout(600)
            await pg.screenshot(path=f'{ROOT}/out/{n}.png')
            print('ok', n)
        await b.close()

asyncio.run(main(sys.argv[1:]))
