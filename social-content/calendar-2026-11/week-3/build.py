"""Week 3 and 4 static posts. usage: python3 build.py [A7 ...]"""
import asyncio, os, sys
from playwright.async_api import async_playwright
from PIL import Image

BASE = os.path.dirname(os.path.abspath(__file__))
LOGO = '../week-1/assets/autommerce-white.png'

CSS = """
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1080px;height:1350px;overflow:hidden}
body{font-family:'Geist',system-ui,sans-serif;-webkit-font-smoothing:antialiased;background:#0B0A10;color:#fff;position:relative}
.mono{font-family:'Geist Mono',ui-monospace,monospace;letter-spacing:.16em;text-transform:uppercase}
.o{color:#F76D01}
.warm{background:linear-gradient(135deg,#F76D01,#C40000);-webkit-background-clip:text;background-clip:text;color:transparent;padding-right:.06em}
.glow{position:absolute;border-radius:50%;filter:blur(90px);pointer-events:none}
.bar{position:absolute;left:72px;right:72px;top:60px;height:48px;display:flex;align-items:center;justify-content:space-between;z-index:5}
.lock{display:flex;align-items:center;gap:14px}
.lock img{width:42px;height:36px;object-fit:contain}
.lock b{font-size:23px;font-weight:750;letter-spacing:-.02em}
.num{font-size:15px;color:rgba(255,255,255,.55)}
.num b{color:#F76D01;font-weight:500}
.kick{display:flex;align-items:center;gap:14px;font-size:15px;color:#F76D01}
.kick i{width:36px;height:2px;background:#F76D01;display:block}
.foot{position:absolute;left:72px;right:72px;bottom:52px;height:52px;display:flex;align-items:center;justify-content:space-between;z-index:5}
.prog{display:flex;gap:7px;width:460px}
.prog i{flex:1;height:4px;border-radius:2px;background:rgba(255,255,255,.16);display:block}
.prog i.on{background:linear-gradient(90deg,#F76D01,#C40000)}
.swipe{font-size:15px;color:rgba(255,255,255,.8);display:flex;align-items:center;gap:12px}
.swipe .arr{width:46px;height:46px;border-radius:50%;background:linear-gradient(135deg,#F76D01,#C40000);color:#fff;display:flex;align-items:center;justify-content:center;font-size:22px}
.dim{color:rgba(255,255,255,.62)}
"""

BG = ('<div class="glow" style="width:640px;height:640px;right:-280px;top:-240px;background:rgba(247,109,1,.13)"></div>'
      '<div class="glow" style="width:700px;height:700px;left:-340px;bottom:-300px;background:rgba(64,0,149,.34)"></div>')


def frame(body, i, n):
    bar = f'''<div class="bar"><div class="lock"><img src="{LOGO}"><b>Abbas Zein</b></div>
      <div class="num mono"><b>{i + 1:02d}</b> / {n:02d}</div></div>'''
    swipe = '' if i == n - 1 else '<div class="swipe mono">Swipe<div class="arr">&rarr;</div></div>'
    prog = ''.join(f'<i class="{"on" if k <= i else ""}"></i>' for k in range(n))
    foot = f'<div class="foot"><div class="prog">{prog}</div>{swipe}</div>'
    return f'''<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="../engine/brand.css"><style>{CSS}</style></head>
<body>{BG}{bar}{body}{foot}</body></html>'''


# ---------------------------------------------------------------- A7 nine fields
FIELDS_A = [
    ('01', 'ID', 'One code for this exact variant. Never reused.'),
    ('02', 'Title', 'Brand, model, colour, size. The precise product.'),
    ('03', 'Description', 'What it is, in plain text. Not text baked into an image.'),
    ('04', 'Link', 'The product page, opened on this variant.'),
    ('05', 'Brand', 'The brand name, as it appears on the page.'),
]
FIELDS_B = [
    ('06', 'Seller', "Your store's name, as the buyer should read it."),
    ('07', 'Image', 'A photo of this variant, as a direct link.'),
    ('08', 'Availability', 'In stock, out of stock, or unknown. Never blank.'),
    ('09', 'Price', 'The amount and the currency, like 399.00&nbsp;USD.'),
]

LIST_CSS = """
.rows{position:absolute;left:72px;right:72px;top:400px}
.row{display:grid;grid-template-columns:92px 1fr;align-items:baseline;padding:26px 0 28px;border-top:1px solid rgba(255,255,255,.1)}
.row:last-child{border-bottom:1px solid rgba(255,255,255,.1)}
.row .ix{font-size:20px;color:#F76D01}
.row .nm{font-size:52px;font-weight:700;letter-spacing:-.045em;line-height:1}
.row .ds{display:block;margin-top:10px;font-size:26px;line-height:1.3;color:rgba(255,255,255,.6);letter-spacing:-.012em;font-weight:450}
"""


def rows(fields):
    return '<div class="rows">' + ''.join(
        f'<div class="row"><span class="ix mono">{n}</span><div><div class="nm">{name}</div>'
        f'<span class="ds">{desc}</span></div></div>' for n, name, desc in fields) + '</div>'


def a7():
    N = 6
    out = {}
    out['A7-nine-fields/slide_01'] = frame(f'''
<div style="position:absolute;left:63px;top:148px;font-size:252px;font-weight:800;letter-spacing:-.075em;line-height:.8"><span class="warm">09</span></div>
<h1 style="position:absolute;left:72px;top:400px;font-size:84px;font-weight:800;letter-spacing:-.05em;line-height:.98">fields between<br>your product<br>and <span class="warm">ChatGPT.</span></h1>
<div style="position:absolute;left:72px;right:200px;bottom:150px;font-size:30px;line-height:1.35;letter-spacing:-.015em" class="dim">OpenAI's shopping feed requires all nine. Leave one empty and the row is&nbsp;rejected.</div>
''', 0, N)

    out['A7-nine-fields/slide_02'] = _with(LIST_CSS, frame(f'''
<div style="position:absolute;left:72px;top:156px" class="kick mono"><i></i>The product, 01 to 05</div>
<h1 style="position:absolute;left:72px;top:196px;font-size:64px;font-weight:800;letter-spacing:-.045em;line-height:1.02">What it is.</h1>
{rows(FIELDS_A)}
''', 1, N))

    out['A7-nine-fields/slide_03'] = _with(LIST_CSS + """
.band{position:absolute;left:72px;right:72px;bottom:140px;border-radius:22px;padding:30px 36px;
 background:linear-gradient(#14121C,#14121C) padding-box,linear-gradient(100deg,#F76D01,#C40000 60%,#400095) border-box;border:1.5px solid transparent}
.band b{font-size:30px;font-weight:650;letter-spacing:-.02em;line-height:1.3}
""", frame(f'''
<div style="position:absolute;left:72px;top:156px" class="kick mono"><i></i>The offer, 06 to 09</div>
<h1 style="position:absolute;left:72px;top:196px;font-size:64px;font-weight:800;letter-spacing:-.045em;line-height:1.02">What's for sale.</h1>
{rows(FIELDS_B)}
<div class="band"><b>Nine fields. One gap, and the row is rejected.</b></div>
''', 2, N), '')

    bars = ''.join('<i></i>' for _ in range(4)) + '<i class="gap"><b></b><b></b></i>' + ''.join('<i></i>' for _ in range(4))
    out['A7-nine-fields/slide_04'] = _with("""
.bars{position:absolute;left:72px;right:72px;top:790px;display:grid;grid-template-columns:repeat(9,1fr);gap:14px}
.bars i{height:210px;border-radius:14px;background:rgba(255,255,255,.92);display:block}
.bars i.gap{background:none;display:flex;flex-direction:column;justify-content:space-between}
.bars i.gap b{display:block;height:78px;border-radius:14px;border:3px solid #F76D01}
.glab{position:absolute;left:72px;right:72px;top:1016px;display:grid;grid-template-columns:repeat(9,1fr);gap:14px}
.glab span{grid-column:5;text-align:center;color:#F76D01;font-size:16px}
""", frame(f'''
<div style="position:absolute;left:72px;top:168px" class="kick mono"><i></i>Where records break</div>
<h1 style="position:absolute;left:72px;top:214px;font-size:108px;font-weight:800;letter-spacing:-.055em;line-height:.94">One empty<br>field.</h1>
<div style="position:absolute;left:72px;top:470px;width:900px;font-size:32px;line-height:1.34;letter-spacing:-.015em" class="dim">No brand. The agent sees a headphone and can't tell Sony from a lookalike, so it won't match the&nbsp;request.</div>
<div class="bars">{bars}</div>
<div class="glab"><span class="mono">05 &nbsp;Brand</span></div>
''', 3, N), '')

    out['A7-nine-fields/slide_05'] = frame('''
<div style="position:absolute;left:72px;top:200px" class="kick mono"><i></i>What happens next</div>
<h1 style="position:absolute;left:68px;top:300px;font-size:168px;font-weight:800;letter-spacing:-.06em;line-height:.9"><span class="warm">Rejected.</span></h1>
<div style="position:absolute;left:72px;top:560px;width:860px;font-size:36px;line-height:1.32;letter-spacing:-.018em" class="dim">Leave one of the nine empty and OpenAI's feed rejects the row. The agent never sees that&nbsp;product.</div>
<div style="position:absolute;left:72px;bottom:150px;font-size:15px;color:rgba(255,255,255,.5)" class="mono">Source: OpenAI, product feed specification</div>
''', 4, N)

    out['A7-nine-fields/slide_06'] = frame('''
<div style="position:absolute;left:72px;top:200px" class="kick mono"><i></i>Your turn</div>
<h1 style="position:absolute;left:72px;top:270px;right:72px;font-size:92px;font-weight:800;letter-spacing:-.05em;line-height:.98">Which field is empty in your&nbsp;catalog?</h1>
<div style="position:absolute;left:72px;top:600px;width:860px;font-size:34px;line-height:1.34;letter-spacing:-.016em" class="dim">Start with title, brand and price. That's where most catalogs go&nbsp;quiet.</div>
<div style="position:absolute;left:72px;bottom:160px">
  <div style="font-size:32px;font-weight:700;letter-spacing:-.02em">Abbas Zein</div>
  <div class="mono" style="margin-top:12px;font-size:15px;color:rgba(255,255,255,.6)">Founder &amp; CEO, Autommerce</div>
</div>
''', 5, N)
    return out


def _with(extra, html, _unused=''):
    return html.replace('</style>', extra + '</style>', 1)


BUILDERS = dict(A7=a7)


async def render(pages):
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/local/bin/google-chrome', args=['--no-sandbox'])
        pg = await b.new_page(viewport={'width': 1080, 'height': 1350}, device_scale_factor=2)
        for key, html in pages.items():
            os.makedirs(os.path.join(BASE, os.path.dirname(key)), exist_ok=True)
            fn = os.path.join(BASE, key + '.html')
            open(fn, 'w').write(html)
            await pg.goto(f'file://{fn}', wait_until='networkidle')
            face = await pg.evaluate("document.fonts.ready.then(()=>document.fonts.check('800 80px Geist'))")
            await pg.wait_for_timeout(300)
            await pg.screenshot(path=os.path.join(BASE, key + '.png'))
            print('ok', key, 'geist' if face else 'FALLBACK FONT')
        await b.close()


def pdf(folder, name):
    files = sorted(f for f in os.listdir(os.path.join(BASE, folder)) if f.startswith('slide_') and f.endswith('.png'))
    ims = [Image.open(os.path.join(BASE, folder, f)).convert('RGB').resize((1080, 1350), Image.LANCZOS) for f in files]
    ims[0].save(os.path.join(BASE, folder, name), save_all=True, append_images=ims[1:], resolution=72)


if __name__ == '__main__':
    keys = sys.argv[1:] or list(BUILDERS)
    pages = {}
    for k in keys:
        pages.update(BUILDERS[k]())
    asyncio.run(render(pages))
    for k in keys:
        if k == 'A7':
            pdf('A7-nine-fields', 'A7_nine_fields_linkedin.pdf')
