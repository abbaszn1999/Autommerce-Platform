import asyncio, os, sys
from playwright.async_api import async_playwright
from PIL import Image

BASE = os.path.dirname(os.path.abspath(__file__))

CSS = """
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1080px;height:1350px;overflow:hidden}
body{font-family:'Geist',system-ui,sans-serif;-webkit-font-smoothing:antialiased;position:relative}
.mono{font-family:'Geist Mono',ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase}
.o{color:#F76D01}
.warm{background:linear-gradient(135deg,#F76D01,#C40000);-webkit-background-clip:text;background-clip:text;color:transparent}
.grad{background:linear-gradient(100deg,#F76D01 0%,#E0322A 45%,#B24AE0 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
.abs{position:absolute}
.ink{background:#0B0A10;color:#fff}
.paper{background:#F8F6F3;color:#0B0A10}
.glow{position:absolute;border-radius:50%;filter:blur(90px);pointer-events:none}
.bar{position:absolute;left:72px;right:72px;top:64px;height:46px;display:flex;align-items:center;justify-content:space-between;z-index:5}
.lock{display:flex;align-items:center;gap:14px}
.lock img{width:44px;height:38px;object-fit:contain}
.lock b{font-size:24px;font-weight:800;letter-spacing:-.02em}
.lock small{display:block;font-size:11px;margin-top:3px;opacity:.6}
.lock .by{font-size:11px;opacity:.6;margin-left:4px}
.chip{display:inline-flex;align-items:center;gap:10px;padding:11px 18px;border-radius:999px;font-size:12.5px}
.ink .chip{border:1px solid rgba(255,255,255,.22);color:rgba(255,255,255,.85)}
.paper .chip{border:1px solid rgba(11,10,16,.14);background:#fff;color:#0B0A10}
.chip i{width:7px;height:7px;border-radius:50%;background:#F76D01;display:block}
.count{font-size:14px}
.count b{color:#F76D01;font-weight:500}
h1{font-weight:800;letter-spacing:-.052em;line-height:.98}
.cta{display:inline-flex;align-items:center;gap:14px;padding:22px 36px;border-radius:999px;font-weight:700;font-size:27px;letter-spacing:-.01em;color:#fff;background:linear-gradient(135deg,#F76D01,#C40000);box-shadow:0 18px 44px -16px rgba(247,109,1,.65)}
.foot{position:absolute;left:72px;right:72px;bottom:56px;height:50px;display:flex;align-items:center;justify-content:space-between;z-index:5}
.prog{display:flex;gap:6px;width:520px}
.prog i{flex:1;height:4px;border-radius:2px;display:block}
.ink .prog i{background:rgba(255,255,255,.2)}
.paper .prog i{background:rgba(11,10,16,.12)}
.prog i.on{background:linear-gradient(90deg,#F76D01,#C40000)!important}
.swipe{font-size:14px;display:flex;align-items:center;gap:12px}
.swipe .arr{width:50px;height:50px;border-radius:50%;background:linear-gradient(135deg,#F76D01,#C40000);color:#fff;display:flex;align-items:center;justify-content:center;font-size:23px;letter-spacing:0}
.note{font-size:12px;opacity:.55}
"""

def page(body, cls, extra_css=''):
    return f"""<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="../brand.css">
<style>{CSS}{extra_css}</style></head><body class="{cls}">{body}</body></html>"""

def foot(i, n, dark=True):
    prog = ''.join(f'<i class="{"on" if k <= i else ""}"></i>' for k in range(n))
    swipe = '' if i == n - 1 else '<div class="swipe mono">Swipe<div class="arr">&rarr;</div></div>'
    return f'<div class="foot"><div class="prog">{prog}</div>{swipe}</div>'


# ---------------------------------------------------------------- A2
def a2():
    rows = [('title', '"Trail running shoe"', True), ('brand', '', False), ('size', '', False),
            ('material', '', False), ('price', '129.00 USD', True), ('availability', 'in_stock', True)]
    r = ''.join(
        f'<div class="row"><span class="k">{k}</span><span class="v">{v if ok else "&mdash;"}</span>'
        f'<span class="s {"ok" if ok else "miss"}">{"Read" if ok else "Missing"}</span></div>' for k, v, ok in rows)
    css = """
.card{position:absolute;left:72px;top:640px;width:590px;border-radius:26px;background:#15131D;border:1px solid rgba(255,255,255,.1);overflow:hidden}
.card .hd{display:flex;align-items:center;gap:12px;padding:24px 30px;border-bottom:1px solid rgba(255,255,255,.08);font-size:13px;color:rgba(255,255,255,.7)}
.card .hd i{width:8px;height:8px;border-radius:50%;background:#F76D01;display:block}
.row{display:grid;grid-template-columns:170px 1fr 110px;align-items:center;padding:0 30px;height:64px;border-bottom:1px solid rgba(255,255,255,.06);font-family:'Geist Mono',monospace;font-size:20px}
.row .k{color:rgba(255,255,255,.55)}
.row .v{color:#fff}
.row .s{font-size:12px;letter-spacing:.12em;text-transform:uppercase;text-align:right}
.row .s.ok{color:rgba(255,255,255,.45)}
.row .s.miss{color:#F76D01}
.card .ft{padding:22px 30px;font-size:19px;color:rgba(255,255,255,.8);letter-spacing:-.01em}
.card .ft b{color:#F76D01;font-weight:600}
.stat{position:absolute;left:706px;right:60px;top:716px}
.stat .n{font-size:136px;font-weight:800;letter-spacing:-.06em;line-height:.9}
.stat p{margin-top:18px;font-size:26px;line-height:1.3;color:rgba(255,255,255,.85);letter-spacing:-.012em}
.stat .src{margin-top:20px;font-size:12px;color:rgba(255,255,255,.5)}
.who{position:absolute;left:72px;right:72px;bottom:60px;display:flex;justify-content:space-between;align-items:center;font-size:13px;color:rgba(255,255,255,.6)}
.who b{color:#fff;font-weight:600}
"""
    body = f"""
<div class="glow" style="width:560px;height:560px;right:-260px;top:-200px;background:rgba(247,109,1,.13)"></div>
<div class="glow" style="width:640px;height:640px;left:-300px;bottom:-260px;background:rgba(64,0,149,.35)"></div>
<div class="bar"><div class="lock"><img src="../assets/autommerce-white.png"><div><b>Abbas Zein</b><small class="mono">Founder notes</small></div></div>
<div class="chip mono"><i></i>Agentic commerce</div></div>
<h1 class="abs" style="left:72px;top:176px;font-size:106px">The next shopper<br>won't see your<br><span class="o">homepage.</span></h1>
<div class="abs" style="left:72px;top:520px;font-size:34px;line-height:1.3;color:rgba(255,255,255,.8);letter-spacing:-.015em">It reads your product data. Most catalogs aren't ready.</div>
<div class="card"><div class="hd mono"><i></i>An AI agent reading one product</div>{r}
<div class="ft"><b>3 of 6 fields missing.</b> The agent can't match it to a request.</div></div>
<div class="stat"><div class="n warm">15%</div><p>of merchants say their product data is ready for&nbsp;AI&nbsp;agents.</p><div class="src mono">Source: PYMNTS, Oct 2026</div></div>
<div class="who mono"><span><b>Abbas Zein</b> &nbsp;/&nbsp; Founder &amp; CEO, Autommerce</span><span>Illustrative product record</span></div>
"""
    return {'A2-agentic-commerce/A2_poster': page(body, 'ink', css)}


# ---------------------------------------------------------------- M2
TOOLS = [
    dict(name='Catalog Intelligence', pillar='Catalog', path='catalog-intelligence', img='ss_catalog.jpg',
         line='Upload a messy supplier sheet. The agent finds the exact product and writes titles, descriptions, specs and FAQs.'),
    dict(name='Image Classification', pillar='Visual', path='image-classify', img='ss_imageclass.jpg',
         line='Drop in a folder of product photos. Each image is grouped by product and matched to the right SKU.'),
    dict(name='Products Gallery', pillar='Visual', path='products-gallery', img='ss_gallery.jpg',
         line='Finds more images of the exact same item for every row, then exports the whole gallery.'),
    dict(name='Products Visualizer', pillar='Visual', path='products-visualizer', img='ss_visualizer.jpg',
         line='Turns a spec sheet into a product story: SEO-ready copy paired with matching lifestyle visuals.'),
    dict(name='Growth Engine', pillar='Growth', path='market-research', img='ss_growth.jpg',
         line='A seven-stage SEO agent: finds niches and keywords, then plans and writes collections and articles.'),
    dict(name='Store Assistant', pillar='Store agents', path='store-assistant', img='ss_assistant.jpg', tall=True,
         line='Ask in plain words. It reads and edits products, collections and inventory. Every change waits for your approval.'),
    dict(name='Website Restructure', pillar='Store agents', path='website-restructure', img=None,
         line='Rebuild your store header and navigation by chatting, with a live preview and version history.'),
]

M2_CSS = """
.kick{position:absolute;left:72px;top:170px;display:flex;align-items:center;gap:14px;font-size:14px;color:#F76D01}
.kick i{width:44px;height:2px;background:#F76D01;display:block}
.tname{position:absolute;left:72px;right:72px;top:212px;font-size:84px}
.tline{position:absolute;left:72px;width:900px;top:322px;font-size:31px;line-height:1.34;color:#3B3742;letter-spacing:-.014em}
.panel{position:absolute;left:72px;right:72px;top:480px;height:690px;border-radius:30px;overflow:hidden;
 background:linear-gradient(135deg,rgba(247,109,1,.16) 0%,rgba(196,0,0,.08) 50%,rgba(64,0,149,.16) 100%);display:flex;align-items:center;justify-content:center}
.win{background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 30px 70px -30px rgba(64,0,149,.45);border:1px solid rgba(11,10,16,.08)}
.win .wb{height:40px;display:flex;align-items:center;gap:7px;padding:0 16px;border-bottom:1px solid rgba(11,10,16,.07);background:#FBFAF8}
.win .wb i{width:10px;height:10px;border-radius:50%;background:rgba(11,10,16,.14);display:block}
.win .wb span{margin-left:12px;font-size:11px;color:rgba(11,10,16,.5)}
.win img{display:block}
.cap{position:absolute;left:72px;top:1186px;font-size:11.5px;color:rgba(11,10,16,.45)}
.steps{width:780px}
.steps .st{display:grid;grid-template-columns:90px 1fr;align-items:center;background:#fff;border-radius:20px;padding:30px 34px;margin:14px 0;border:1px solid rgba(11,10,16,.07)}
.steps .st b{font-family:'Geist Mono',monospace;font-size:20px;color:#F76D01;font-weight:500}
.steps .st span{font-size:30px;font-weight:600;letter-spacing:-.02em}
.toc{position:absolute;left:72px;right:72px;top:640px;display:grid;grid-template-columns:1fr 1fr;column-gap:24px;row-gap:14px}
.toc div{display:flex;align-items:center;gap:18px;background:#fff;border:1px solid rgba(11,10,16,.08);border-radius:18px;padding:22px 24px}
.toc b{font-family:'Geist Mono',monospace;font-size:16px;color:#F76D01;font-weight:500}
.toc span{font-size:25px;font-weight:650;letter-spacing:-.02em}
.toc small{display:block;font-size:11px;color:rgba(11,10,16,.45);margin-top:5px}
"""

def m2():
    N = len(TOOLS) + 2
    out = {}
    def bar(i):
        return (f'<div class="bar"><div class="lock"><img src="../assets/autommerce-natural.png"><b>Autommerce</b></div>'
                f'<div class="count mono"><b>{i+1:02d}</b> / {N:02d}</div></div>')
    bg = ('<div class="glow" style="width:700px;height:700px;right:-300px;top:-300px;background:rgba(247,109,1,.16)"></div>'
          '<div class="glow" style="width:600px;height:600px;left:-320px;bottom:-200px;background:rgba(64,0,149,.10)"></div>')
    toc = ''.join(f'<div><b>{k+1:02d}</b><span>{t["name"]}<small class="mono">{t["pillar"]}</small></span></div>'
                  for k, t in enumerate(TOOLS))
    toc += '<div style="background:transparent;border:1px dashed rgba(11,10,16,.18)"><b>&rarr;</b><span style="font-weight:500;color:#3B3742">One catalog.<br>One workspace.</span></div>'
    out['M2-seven-tools/slide_01'] = page(bg + bar(0) + f"""
<div class="kick mono"><i></i>Autommerce OS</div>
<div class="abs" style="left:72px;right:72px;top:212px"><h1 style="font-size:88px">One operating system.<br><span class="warm">Seven AI tools.</span></h1>
<div style="margin-top:34px;width:880px;font-size:31px;line-height:1.34;color:#3B3742;letter-spacing:-.014em">From the supplier sheet to a store that sells. Every screen in this carousel is from the live platform.</div></div>
<div class="toc">{toc}</div>""" + foot(0, N), 'paper', M2_CSS)
    for k, t in enumerate(TOOLS):
        i = k + 1
        if t['img']:
            im = Image.open(f'{BASE}/assets/{t["img"]}')
            r = im.width / im.height
            maxw, maxh = 860, 690 - 80 - 40
            w = maxw; h = w / r
            if h > maxh: h = maxh; w = h * r
            win = (f'<div class="win"><div class="wb"><i></i><i></i><i></i><span class="mono">platform.autommerce.com / {t["path"]}</span></div>'
                   f'<img src="../assets/{t["img"]}" style="width:{w:.0f}px;height:{h:.0f}px"></div>')
            cap = '<div class="cap mono">Live platform &middot; sample data</div>'
        else:
            win = ('<div class="steps">'
                   '<div class="st"><b>01</b><span>Describe the menu you want in chat</span></div>'
                   '<div class="st"><b>02</b><span>Check it in a live preview</span></div>'
                   '<div class="st"><b>03</b><span>Publish, or roll back to any version</span></div></div>')
            cap = ''
        out[f'M2-seven-tools/slide_{i+1:02d}'] = page(bg + bar(i) + f"""
<div class="kick mono"><i></i>Tool {k+1:02d} / 07 &middot; {t['pillar']}</div>
<h1 class="tname">{t['name']}</h1>
<div class="tline">{t['line']}</div>
<div class="panel">{win}</div>{cap}""" + foot(i, N), 'paper', M2_CSS)
    out[f'M2-seven-tools/slide_{N:02d}'] = page(bg + bar(N - 1) + """
<div class="kick mono" style="top:420px"><i></i>Next step</div>
<h1 class="abs" style="left:72px;top:466px;font-size:112px">See it on your<br><span class="warm">own catalog.</span></h1>
<div class="abs" style="left:72px;width:860px;top:710px;font-size:32px;line-height:1.34;color:#3B3742;letter-spacing:-.014em">Bring one supplier sheet to the meeting and watch it run on your own products.</div>
<div class="abs" style="left:72px;top:860px;display:flex;align-items:center;gap:28px"><div class="cta">Book a meeting <span>&rarr;</span></div><span class="mono" style="font-size:15px;color:rgba(11,10,16,.6)">autommerce.com/contact</span></div>
""" + foot(N - 1, N), 'paper', M2_CSS)
    return out


# ---------------------------------------------------------------- M3
def m3():
    css = M2_CSS + """
.rows{position:absolute;left:72px;right:72px;top:690px}
.rows .r{display:grid;grid-template-columns:84px 1fr;padding:30px 0;border-top:1px solid rgba(11,10,16,.12)}
.rows .r:last-child{border-bottom:1px solid rgba(11,10,16,.12)}
.rows b{font-family:'Geist Mono',monospace;font-size:18px;color:#F76D01;font-weight:500;padding-top:8px}
.rows h3{font-size:36px;font-weight:700;letter-spacing:-.03em}
.rows p{margin-top:8px;font-size:24px;color:#4A4651;letter-spacing:-.01em;line-height:1.35}
.mark{position:absolute;right:-140px;top:120px;width:700px;opacity:.06}
"""
    body = f"""
<div class="glow" style="width:700px;height:700px;right:-300px;top:-300px;background:rgba(247,109,1,.16)"></div>
<div class="glow" style="width:600px;height:600px;left:-320px;bottom:-200px;background:rgba(64,0,149,.10)"></div>
<div class="bar"><div class="lock"><img src="../assets/autommerce-natural.png"><b>Autommerce</b></div><div class="chip mono"><i></i>Partner program</div></div>
<h1 class="abs" style="left:72px;top:180px;font-size:92px">Your clients want<br>more products live.<br><span class="warm">Your team can't<br>type faster.</span></h1>
<div class="abs" style="left:72px;width:900px;top:590px;font-size:28px;line-height:1.35;color:#3B3742;letter-spacing:-.014em">We partner with agencies, consultants and platforms. Together, we deliver:</div>
<div class="rows">
<div class="r"><b>01</b><div><h3>Catalog data</h3><p>Supplier sheets turned into store-ready titles, descriptions and specs.</p></div></div>
<div class="r"><b>02</b><div><h3>Product visuals</h3><p>Complete galleries and lifestyle visuals for every product.</p></div></div>
<div class="r"><b>03</b><div><h3>Search growth</h3><p>Keywords, collections and articles written into the store.</p></div></div>
</div>
<div class="foot"><div class="cta">Become a partner <span>&rarr;</span></div><span class="mono" style="font-size:14px;color:rgba(11,10,16,.6)">autommerce.com/contact</span></div>
"""
    return {'M3-partners/M3_poster': page(body, 'paper', css)}


# ---------------------------------------------------------------- Persona shared
P_CSS = """
.phone{position:absolute;filter:drop-shadow(0 40px 60px rgba(0,0,0,.55))}
.phone img{display:block;width:100%;border-radius:11.5% / 5.9%}
.kick{display:flex;align-items:center;gap:14px;font-size:14px;color:#F76D01;margin-bottom:24px}
.kick i{width:44px;height:2px;background:#F76D01;display:block}
.body{font-size:27px;line-height:1.4;color:rgba(255,255,255,.78);letter-spacing:-.012em}
.label{position:absolute;padding:12px 18px;border-radius:999px;background:rgba(11,10,16,.82);border:1px solid rgba(255,255,255,.18);font-size:12px;color:#fff;backdrop-filter:blur(8px)}
.label i{display:inline-block;width:7px;height:7px;border-radius:50%;background:#F76D01;margin-right:10px;vertical-align:middle}
"""

def pbar(right):
    return (f'<div class="bar"><div class="lock"><img src="../assets/persona_logo.png"><b>Persona AI</b><span class="by mono">by Autommerce</span></div>{right}</div>')

P_BG = ('<div class="glow" style="width:700px;height:700px;right:-260px;top:-240px;background:rgba(107,53,141,.55)"></div>'
        '<div class="glow" style="width:620px;height:620px;left:-300px;bottom:-240px;background:rgba(247,109,1,.22)"></div>')


# ---------------------------------------------------------------- P2
def p2():
    boxes = ''.join(f'<div class="bx {"hot" if k == 0 else ""}"></div>' for k in range(5))
    css = P_CSS + """
.bxs{display:flex;gap:14px;margin-top:30px}
.bx{width:74px;height:74px;border-radius:14px;border:1.5px solid rgba(255,255,255,.25);position:relative}
.bx:after{content:'';position:absolute;left:50%;top:0;bottom:0;width:1.5px;background:rgba(255,255,255,.25)}
.bx.hot{border-color:#F76D01;background:rgba(247,109,1,.16)}
.bx.hot:after{background:#F76D01}
"""
    body = P_BG + pbar('<div class="chip mono"><i></i>Fashion returns</div>') + f"""
<h1 class="abs" style="left:72px;top:176px;font-size:110px">Returns are<br>the tax on<br><span class="grad">guessing.</span></h1>
<div class="abs" style="left:72px;width:470px;top:580px">
<div class="warm" style="font-size:150px;font-weight:800;letter-spacing:-.06em;line-height:.9">19.3%</div>
<div class="body" style="margin-top:18px">of US online sales were returned in 2025. That's about one parcel in five.</div>
<div class="bxs">{boxes}</div>
<div class="body" style="margin-top:34px;font-size:24px">Let shoppers see it on themselves before&nbsp;they&nbsp;buy.</div>
</div>
<div class="phone" style="left:620px;top:440px;width:350px"><img src="../assets/ph_result.png"></div>
<div class="foot" style="bottom:96px"><div style="display:flex;align-items:center;gap:26px"><div class="cta">Book a demo <span>&rarr;</span></div><span class="mono" style="font-size:14px;color:rgba(255,255,255,.7)">persona.autommerce.com/contact</span></div></div>
<div class="abs note mono" style="left:72px;right:72px;bottom:48px;display:flex;justify-content:space-between"><span>Source: NRF, via CNBC</span><span>Demo store &middot; sample avatar</span></div>
"""
    return {'P2-returns/P2_poster': page(body, 'ink', css)}


# ---------------------------------------------------------------- P3
P3_STEPS = [
    ('ph_fill4.png', 'Build your avatar.', 'The shopper adds height, weight and a few measurements, plus one photo. No app to download.'),
    ('ph_choose.png', 'Pick the one that feels like you.', 'Persona creates avatar options that keep the shopper\'s face. The chosen one becomes their fitting model.'),
    ('ph_chat.png', 'Ask the stylist.', 'In their own words, like "a smart shirt for a dinner, under $100". Answers come only from the store\'s real catalog.'),
    ('ph_result.png', 'See it on you. Add to cart.', 'The outfit is rendered on the shopper\'s own avatar, with a size suggestion. One tap adds it to the store\'s cart.'),
]

def p3():
    N = len(P3_STEPS) + 3
    out = {}
    cnt = lambda i: f'<div class="count mono"><b>{i+1:02d}</b> / {N:02d}</div>'
    out['P3-fitting-room/slide_01'] = page(P_BG + pbar(cnt(0)) + """
<div class="abs" style="left:72px;right:72px;top:176px"><div class="kick mono"><i></i>Virtual fitting room</div>
<h1 style="font-size:100px">How a virtual<br>fitting room<br><span class="grad">actually works.</span></h1>
<div class="body" style="margin-top:30px;width:820px">Four steps, recorded on a live demo store.</div></div>
<div class="phone" style="left:60px;top:770px;width:300px;transform:rotate(-6deg)"><img src="../assets/ph_choose.png"></div>
<div class="phone" style="left:390px;top:720px;width:300px"><img src="../assets/ph_chat.png"></div>
<div class="phone" style="left:720px;top:770px;width:300px;transform:rotate(6deg)"><img src="../assets/ph_result.png"></div>
<div class="abs" style="left:0;right:0;bottom:0;height:330px;background:linear-gradient(0deg,#0B0A10 30%,rgba(11,10,16,0))"></div>
""" + foot(0, N), 'ink', P_CSS)
    for k, (img, title, text) in enumerate(P3_STEPS):
        i = k + 1
        out[f'P3-fitting-room/slide_{i+1:02d}'] = page(P_BG + pbar(cnt(i)) + f"""
<div class="abs" style="left:72px;width:480px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center">
<div class="kick mono"><i></i>Step {k+1:02d}</div>
<h1 style="font-size:70px">{title}</h1>
<div class="body" style="margin-top:28px">{text}</div></div>
<div class="phone" style="left:590px;top:240px;width:420px"><img src="../assets/{img}"></div>
<div class="abs note mono" style="left:590px;width:420px;top:1080px;text-align:center">Demo store &middot; sample avatar</div>
""" + foot(i, N), 'ink', P_CSS)
    i = N - 2
    out[f'P3-fitting-room/slide_{i+1:02d}'] = page(P_BG + pbar(cnt(i)) + """
<div class="abs" style="left:72px;right:72px;top:200px"><div class="kick mono"><i></i>For retailers</div>
<h1 style="font-size:92px">It's one script tag<br><span class="grad">on your store.</span></h1></div>
<div class="abs mono" style="left:72px;right:72px;top:480px;padding:30px 34px;border-radius:20px;background:#15131D;border:1px solid rgba(255,255,255,.1);font-size:19px;letter-spacing:0;text-transform:none;color:rgba(255,255,255,.85)">&lt;script src="persona/widget.js" async&gt;&lt;/script&gt;</div>
<div class="abs" style="left:72px;right:72px;top:640px">
""" + ''.join(f'<div style="display:grid;grid-template-columns:70px 1fr;padding:28px 0;border-top:1px solid rgba(255,255,255,.12)"><span class="mono" style="color:#F76D01;font-size:17px;padding-top:6px">{n}</span><span style="font-size:32px;font-weight:600;letter-spacing:-.02em">{t}</span></div>'
              for n, t in [('01', 'Works with Shopify and WooCommerce'), ('02', 'Recommends only what is in your catalog'),
                           ('03', 'Your brand, your colors, your checkout'), ('04', 'Shows the sales Persona drives')]) + """
</div>""" + foot(i, N), 'ink', P_CSS)
    out[f'P3-fitting-room/slide_{N:02d}'] = page(P_BG + pbar(cnt(N - 1)) + """
<div class="abs" style="left:72px;right:72px;top:400px"><div class="kick mono"><i></i>Next step</div>
<h1 style="font-size:108px">Give every shopper<br>a <span class="grad">fitting room.</span></h1>
<div class="body" style="margin-top:34px">See Persona running on your own catalog.</div>
<div style="display:flex;align-items:center;gap:28px;margin-top:50px"><div class="cta">Book a demo <span>&rarr;</span></div><span class="mono" style="font-size:15px;color:rgba(255,255,255,.7)">persona.autommerce.com/contact</span></div></div>
""" + foot(N - 1, N), 'ink', P_CSS)
    return out


async def render(pages):
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/local/bin/google-chrome', args=['--no-sandbox', '--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': 1080, 'height': 1350}, device_scale_factor=2)
        for key, html in pages.items():
            d = os.path.join(BASE, os.path.dirname(key)); os.makedirs(d, exist_ok=True)
            fn = os.path.join(BASE, key + '.html'); open(fn, 'w').write(html)
            await pg.goto(f'file://{fn}', wait_until='networkidle')
            await pg.evaluate('document.fonts.ready'); await pg.wait_for_timeout(400)
            await pg.screenshot(path=os.path.join(BASE, key + '.png')); print('ok', key)
        await b.close()

def pdf(folder, name):
    files = sorted(f for f in os.listdir(os.path.join(BASE, folder)) if f.startswith('slide_') and f.endswith('.png'))
    ims = [Image.open(os.path.join(BASE, folder, f)).convert('RGB').resize((1080, 1350), Image.LANCZOS) for f in files]
    ims[0].save(os.path.join(BASE, folder, name), save_all=True, append_images=ims[1:], resolution=72)

if __name__ == '__main__':
    pages = {}
    for fn in (a2, m2, m3, p2, p3):
        pages.update(fn())
    only = sys.argv[1:]
    if only:
        pages = {k: v for k, v in pages.items() if any(o in k for o in only)}
    asyncio.run(render(pages))
    if not only or any('M2' in o for o in only): pdf('M2-seven-tools', 'M2_seven_tools_linkedin.pdf')
    if not only or any('P3' in o for o in only): pdf('P3-fitting-room', 'P3_fitting_room_linkedin.pdf')
