import asyncio, os, subprocess, sys
from playwright.async_api import async_playwright

BASE = os.path.dirname(os.path.abspath(__file__))
N = 8

SLIDES = [
 dict(img='photo_1.jpg', pos='top', layout='bottom', kind='cover',
      kicker='Founder notes', title='5 lessons from <span class="o" style="white-space:nowrap">6 years</span> building in ecommerce.',
      body='From a founder building the AI operating system for online stores.'),
 dict(img='photo_2.jpg', pos='top', layout='bottom', kind='lesson', num='01',
      title='Your catalog is your <span class="o">storefront.</span>',
      body='Every missing title, thin description and wrong attribute is a shopper who never finds the product. Clean data comes first.'),
 dict(img='photo_3.jpg', pos='top', layout='left', kind='lesson', num='02',
      title='Hiring more people is not a <span class="o">scaling plan.</span>',
      body='If your catalog doubles and your data-entry team has to double with it, the model is broken. Automate the repeatable work.'),
 dict(img='photo_4.jpg', pos='top', layout='bottom', kind='lesson', num='03',
      title='Shoppers buy what they can <span class="o">picture on themselves.</span>',
      body='That is why we built Persona: a virtual fitting room and AI stylist that lives inside the store.'),
 dict(img='photo_5.jpg', pos='top', layout='bottom', kind='lesson', num='04',
      title='Images are <span class="o">data,</span> not decoration.',
      body='Classify them, enrich them, tie them to the product. Search engines and AI assistants read them too.'),
 dict(img='photo_6.jpg', pos='top', layout='bottom', kind='lesson', num='05',
      title='Put AI in the <span class="o">back office</span> first.',
      body='The wins that compound are the quiet ones: catalog, images, and assistants that already know your products.'),
 dict(img='photo_7.jpg', pos='top', layout='bottom', kind='system',
      kicker='So I am building Autommerce',
      title='One AI operating system. <span class="o">Not ten tools.</span>',
      chips=['Catalog Intelligence','Image Classification','Product Gallery','Product Visualizer','Growth Engine','Store Assistant','Website Restructurer']),
 dict(img='photo_8b.jpg', pos='top', layout='bottom', kind='cta',
      title="Let's fix your<br><span class=\"o\">back office.</span>",
      body='Book a meeting and see Autommerce on your own store.'),
]

CSS = """
body{background:#0B0A10;color:#fff}
.bg{position:absolute;inset:0;overflow:hidden}
.bg img{position:absolute;left:0;top:0;width:1080px;height:1440px;object-fit:cover;display:block}
.shade{position:absolute;inset:0}
.top{position:absolute;left:64px;right:64px;top:56px;display:flex;justify-content:space-between;align-items:center;z-index:5}
.top .l{display:flex;align-items:center;gap:14px}
.top .l img{width:42px;height:35px;object-fit:contain}
.top .l b{font-size:22px;font-weight:700;letter-spacing:-0.02em}
.top .l span{font-size:11px;color:rgba(255,255,255,.6);display:block;margin-top:2px}
.top .r{font-size:14px;color:rgba(255,255,255,.75)}
.top .r b{color:#F76D01;font-weight:500}
.txt{position:absolute;z-index:5}
.txt.bottom{left:64px;right:64px;bottom:150px}
.txt.left{left:64px;width:560px;bottom:150px}
.tag{display:flex;align-items:center;gap:14px;font-size:14px;color:#F76D01;margin-bottom:22px}
.tag i{display:block;width:44px;height:2px;background:#F76D01}
h1{font-weight:800;letter-spacing:-0.055em;line-height:.97}
.o{color:#F76D01}
.warm{background:linear-gradient(135deg,#F76D01,#C40000);-webkit-background-clip:text;background-clip:text;color:transparent}
.body{margin-top:24px;font-size:28px;line-height:1.38;color:rgba(255,255,255,.82);letter-spacing:-0.012em}
.txt.left .body{font-size:25px}
.chips{display:flex;flex-wrap:wrap;gap:10px;margin-top:28px}
.chips span{padding:11px 18px;border-radius:999px;border:1px solid rgba(255,255,255,.28);background:rgba(11,10,16,.55);backdrop-filter:blur(8px);font-size:19px;font-weight:600;letter-spacing:-0.01em}
.chips span:nth-child(odd){border-color:rgba(247,109,1,.7)}
.foot{height:50px;position:absolute;left:64px;right:64px;bottom:58px;z-index:6;display:flex;align-items:center;justify-content:space-between}
.prog{display:flex;gap:6px;width:560px}
.prog i{flex:1;height:4px;border-radius:2px;background:rgba(255,255,255,.22);display:block;position:relative;overflow:hidden}
.prog i.on{background:linear-gradient(90deg,#F76D01,#C40000)}
.swipe{font-size:15px;color:rgba(255,255,255,.85);display:flex;align-items:center;gap:12px}
.swipe .arr{width:50px;height:50px;border-radius:50%;background:linear-gradient(135deg,#F76D01,#C40000);display:flex;align-items:center;justify-content:center;font-size:24px;box-shadow:0 12px 30px -8px rgba(247,109,1,.7)}
.cta{display:inline-flex;align-items:center;gap:14px;margin-top:30px;padding:24px 40px;border-radius:999px;font-weight:700;font-size:30px;letter-spacing:-0.01em;color:#fff;background:linear-gradient(135deg,#F76D01,#C40000);box-shadow:0 18px 48px -14px rgba(247,109,1,.75)}
.url{margin-left:22px;font-size:16px;color:rgba(255,255,255,.8)}
.who{margin-top:34px;font-size:15px;color:rgba(255,255,255,.7)}
.who b{color:#fff;font-weight:600}
"""

def shade(sl):
    k = sl['layout']
    if k == 'left':
        return ("linear-gradient(90deg, rgba(11,10,16,.88) 0%, rgba(11,10,16,.6) 38%, rgba(11,10,16,0) 62%),"
                "linear-gradient(0deg, rgba(11,10,16,.96) 0%, rgba(11,10,16,.5) 24%, rgba(11,10,16,0) 46%)")
    return ("linear-gradient(0deg, rgba(11,10,16,.98) 0%, rgba(11,10,16,.94) 22%, rgba(11,10,16,.7) 40%, rgba(11,10,16,0) 62%),"
            "linear-gradient(180deg, rgba(11,10,16,.55) 0%, rgba(11,10,16,0) 14%)")

def html(i, sl):
    n = i + 1
    size = {'cover': 98, 'lesson': 74, 'system': 80, 'cta': 100}[sl['kind']]
    if sl['layout'] == 'left': size = 64
    tag = ''
    if sl['kind'] == 'lesson':
        tag = f'<div class="tag mono"><i></i>Lesson {sl["num"]}</div>'
    elif sl['kind'] in ('cover', 'system'):
        tag = f'<div class="tag mono"><i></i>{sl["kicker"]}</div>'
    elif sl['kind'] == 'cta':
        tag = '<div class="tag mono"><i></i>Next step</div>'
    body = f'<div class="body">{sl["body"]}</div>' if sl.get('body') else ''
    chips = ''
    if sl.get('chips'):
        chips = '<div class="chips">' + ''.join(f'<span>{c}</span>' for c in sl['chips']) + '</div>'
    extra = ''
    if sl['kind'] == 'cta':
        extra = ('<div style="display:flex;align-items:center"><div class="cta">Book a meeting <span>&rarr;</span></div>'
                 '<div class="url mono">autommerce.com/contact</div></div>'
                 '<div class="who mono"><b>Abbas Zein</b> &nbsp;/&nbsp; Founder &amp; CEO, Autommerce</div>')
    if sl['kind'] == 'cover':
        extra = '<div class="who mono"><b>Abbas Zein</b> &nbsp;/&nbsp; Founder &amp; CEO, Autommerce</div>'
    prog = ''.join(f'<i class="{"on" if k <= i else ""}"></i>' for k in range(N))
    swipe = '' if n == N else '<div class="swipe mono">Swipe<div class="arr">&rarr;</div></div>'
    return f"""<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="brand.css">
<style>{CSS}</style></head><body><div class="frame">
<div class="bg"><img src="assets/{sl['img']}"><div class="shade" style="background:{shade(sl)}"></div></div>
<div class="top"><div class="l"><img src="assets/autommerce-white.png"><div><b>Abbas Zein</b><span class="mono">Founder notes</span></div></div>
<div class="r mono"><b>{n:02d}</b> / {N:02d}</div></div>
<div class="txt {sl['layout']}">{tag}<h1 style="font-size:{size}px">{sl['title']}</h1>{body}{chips}{extra}</div>
<div class="foot"><div class="prog">{prog}</div>{swipe}</div>
</div></body></html>"""

async def main():
    os.makedirs(f'{BASE}/pages', exist_ok=True); os.makedirs(f'{BASE}/out', exist_ok=True)
    only = [int(x) for x in sys.argv[1:]]
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/local/bin/google-chrome', args=['--no-sandbox', '--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': 1080, 'height': 1350}, device_scale_factor=2)
        for i, sl in enumerate(SLIDES):
            if only and (i + 1) not in only: continue
            fn = f'{BASE}/slide_{i+1:02d}.html'
            open(fn, 'w').write(html(i, sl))
            await pg.goto(f'file://{fn}', wait_until='networkidle')
            await pg.evaluate('document.fonts.ready'); await pg.wait_for_timeout(500)
            await pg.screenshot(path=f'{BASE}/out/slide_{i+1:02d}.png')
        await b.close()
asyncio.run(main())
