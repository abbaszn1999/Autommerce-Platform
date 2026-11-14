"""Weeks 3 and 4 posters. One visual language, a different composition every time.

usage: python3 build_weeks.py [A8 A9 ...]
"""
import asyncio, os, sys
from playwright.async_api import async_playwright
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
LW = '../../week-1/assets/autommerce-white.png'
LN = '../../week-1/assets/autommerce-natural.png'
RACK = '../../week-2/assets/w2_a6_4.jpg'
LAP = '../../week-2/assets/w2_a6_7.jpg'
HAND = '../../week-2/assets/w2_a6_8.jpg'
COAT = '../../../visual-direction-v1/assets/look-3.jpg'

BASE = """
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1080px;height:1350px;overflow:hidden}
body{font-family:'Geist',system-ui,sans-serif;-webkit-font-smoothing:antialiased;position:relative;color:#0B0A10}
.mono{font-family:'Geist Mono',ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase}
h1{font-weight:800;letter-spacing:-.055em;line-height:.92}
.o{color:#F76D01}
.foot{position:absolute;left:64px;right:64px;bottom:44px;display:flex;align-items:center;justify-content:space-between;z-index:6}
.prog{display:flex;gap:6px;width:460px}
.prog i{flex:1;height:4px;border-radius:2px;background:rgba(11,10,16,.14);display:block}
.ondark .prog i{background:rgba(255,255,255,.22)}
.prog i.on{background:#F76D01!important}
.swipe{font-family:'Geist Mono',monospace;font-size:14px;letter-spacing:.14em;text-transform:uppercase}
"""


def doc(body, css, bg='#F8F6F3'):
    return f'''<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="../../week-1/brand.css"><style>{BASE}{css}body{{background:{bg}}}</style></head><body>{body}</body></html>'''


def foot(i, n, dark=False):
    bars = ''.join(f'<i class="{"on" if k <= i else ""}"></i>' for k in range(n))
    swipe = '' if i == n - 1 else '<div class="swipe">Swipe</div>'
    return f'<div class="foot {"ondark" if dark else ""}"><div class="prog">{bars}</div>{swipe}</div>'


def logo(white=False):
    src = LW if white else LN
    return f'<img src="{src}" alt="" style="width:42px;height:36px;object-fit:contain">'


# ---------------------------------------------------------------- A8 paper + photo
def a8():
    css = """
.photo{position:absolute;right:0;top:0;width:470px;height:1350px;object-fit:cover;object-position:62% 18%}
.pane{position:absolute;left:0;top:0;width:610px;height:1350px;background:#F8F6F3;padding:60px 56px 0 64px}
.lock{display:flex;align-items:center;gap:12px}
.lock b{font-size:22px;font-weight:800;letter-spacing:-.02em}
.lock small{display:block;margin-top:3px;font-size:11px;opacity:.55}
.k{margin-top:86px;color:#F76D01;font-size:15px}
h1{margin-top:22px;font-size:78px}
.n{margin-top:48px;font-size:148px;font-weight:800;letter-spacing:-.07em;line-height:.8;color:#C40000}
.n span{font-size:64px}
.p{margin-top:18px;font-size:30px;line-height:1.25;letter-spacing:-.02em;width:460px}
.src{position:absolute;left:64px;bottom:56px;font-size:13px;color:rgba(11,10,16,.5);width:480px;line-height:1.45}
"""
    body = f'''<img class="photo" src="{RACK}">
<div class="pane"><div class="lock">{logo()}<div><b>Abbas Zein</b><small class="mono">Founder notes</small></div></div>
<div class="k mono">Why I built Persona</div>
<h1>Returns are a tax on&nbsp;guessing.</h1>
<div class="n">19.3<span>%</span></div>
<div class="p">of US online sales were returned in 2025. In fashion, a lot of that starts with one doubt: how will this look on&nbsp;me?</div>
<div class="src mono">Source: NRF and Happy Returns, 2025 Retail Returns Landscape</div></div>'''
    return {'week-3/A8-why-persona/poster': doc(body, css)}


# ---------------------------------------------------------------- A9 three readers
def a9():
    css = """
.top{position:absolute;left:0;right:0;top:0;height:250px;background:#F8F6F3;display:flex;align-items:flex-end;padding:0 64px 32px;z-index:2}
.lock{position:absolute;left:64px;top:40px;display:flex;align-items:center;gap:12px;font-weight:800;font-size:22px}
.lock small{font-weight:500;font-size:12px;opacity:.55;margin-left:8px}
h1{font-size:58px;width:950px}
.cols{position:absolute;left:0;right:0;top:250px;bottom:0;display:grid;grid-template-columns:1fr 1fr 1fr}
.col{padding:40px 36px}
.c1{background:#F8F6F3}
.c2{background:#F76D01;color:#0B0A10}
.c3{background:#400095;color:#fff}
.num{font-size:15px;font-weight:500}
.c1 .num{color:#F76D01}
.who{margin-top:28px;font-size:48px;font-weight:800;letter-spacing:-.045em;line-height:.95}
.reads{margin-top:32px;font-size:15px;letter-spacing:.14em}
.c1 .reads,.c2 .reads{color:rgba(11,10,16,.55)}
.c3 .reads{color:rgba(255,255,255,.6)}
ul{margin-top:16px;list-style:none}
li{font-size:27px;font-weight:600;letter-spacing:-.02em;padding:14px 0;border-top:1px solid rgba(11,10,16,.14)}
.c3 li{border-top-color:rgba(255,255,255,.2)}
"""
    def col(cls, n, who, items):
        lis = ''.join(f'<li>{t}</li>' for t in items)
        return f'<div class="col {cls}"><div class="num mono">{n}</div><div class="who">{who}</div><div class="reads mono">Reads</div><ul>{lis}</ul></div>'
    body = f'''<div class="top"><div class="lock">{logo()} Abbas Zein <small class="mono">Founder notes</small></div>
<h1>Every product page has three readers&nbsp;now.</h1></div>
<div class="cols">
{col('c1','01','The shopper',['The photo','The price','Delivery','Reviews'])}
{col('c2','02','Search',['The title','Headings','Links'])}
{col('c3','03','The agent',['Brand','Variant','Price','Stock'])}
</div>'''
    return {'week-3/A9-three-readers/poster': doc(body, css, '#F8F6F3')}


# ---------------------------------------------------------------- A10 not found
def a10():
    css = """
.wrap{padding:60px 72px 0}
.lock{display:flex;align-items:center;gap:12px}
.lock b{font-size:22px}
.lock small{display:block;font-size:11px;opacity:.55;margin-top:3px}
h1{margin-top:70px;font-size:168px;letter-spacing:-.07em;line-height:.84;color:#C40000}
.sub{margin-top:36px;font-size:36px;line-height:1.25;letter-spacing:-.025em;width:820px}
.card{margin-top:56px;background:#fff;border-radius:24px;padding:8px 36px;border:1px solid rgba(11,10,16,.08)}
.row{display:flex;justify-content:space-between;align-items:center;height:84px;border-bottom:1px solid rgba(11,10,16,.08);font-size:28px}
.row:last-child{border-bottom:0}
.row b{font-weight:650;letter-spacing:-.02em}
.miss{font-family:'Geist Mono',monospace;font-size:16px;letter-spacing:.12em;text-transform:uppercase;color:#C40000}
.ok{font-family:'Geist Mono',monospace;font-size:16px;letter-spacing:.12em;text-transform:uppercase;color:rgba(11,10,16,.4)}
.note{position:absolute;left:72px;bottom:56px;font-size:15px;color:rgba(11,10,16,.5)}
"""
    body = f'''<div class="wrap"><div class="lock">{logo()}<div><b>Abbas Zein</b><small class="mono">Founder notes</small></div></div>
<h1>Not<br>found.</h1>
<div class="sub">An empty cell is cheaper than the wrong photo on five hundred product&nbsp;pages.</div>
<div class="card">
<div class="row"><b>Five products</b><span class="ok">Matched</span></div>
<div class="row"><b>A Dyson V15</b><span class="miss">Not found</span></div>
</div></div>
<div class="note mono">A real Catalog Intelligence run · 5 of 6 images · the sixth left empty</div>'''
    return {'week-3/A10-not-found/poster': doc(body, css)}


# ---------------------------------------------------------------- M9 hours
def m9():
    css = """
.wrap{padding:60px 72px 0}
.lock{display:flex;align-items:center;gap:14px;font-weight:800;font-size:26px;letter-spacing:-.03em}
.chip{position:absolute;right:72px;top:64px;padding:12px 16px;border-radius:999px;border:1px solid rgba(11,10,16,.16);font-size:13px}
h1{margin-top:90px;font-size:64px;width:900px}
.n{margin-top:28px;font-size:200px;font-weight:800;letter-spacing:-.07em;line-height:.8;color:#F76D01}
.eq{margin-top:36px;font-size:32px;line-height:1.35;letter-spacing:-.02em;width:860px}
.box{position:absolute;left:72px;right:72px;bottom:64px;background:#fff;border-radius:22px;padding:28px 32px;display:flex;justify-content:space-between;align-items:center;border:1px solid rgba(11,10,16,.08)}
.box b{font-size:28px;letter-spacing:-.02em}
.box span{font-size:18px;color:#3B3742}
"""
    body = f'''<div class="wrap"><div class="lock">{logo()} Autommerce</div><div class="chip mono">Illustrative</div>
<h1>Five hundred titles, written by hand.</h1>
<div class="n">33h</div>
<div class="eq">Four minutes a title. Descriptions, specs and FAQs take longer than&nbsp;that.</div></div>
<div class="box"><b>Catalog Intelligence writes the row.</b><span class="mono">You approve it</span></div>'''
    return {'week-3/M9-hours/poster': doc(body, css)}


# ---------------------------------------------------------------- M10 approval
def m10():
    css = """
body{background:#F4F0F6}
.wrap{padding:60px 72px 0}
.lock{display:flex;align-items:center;gap:14px;font-weight:800;font-size:26px}
h1{margin-top:100px;font-size:72px;width:920px}
.ask{margin-top:64px;background:#fff;border-radius:28px;padding:36px 40px;width:900px;box-shadow:0 24px 50px -36px rgba(64,0,149,.6)}
.ask small{color:#6B358D;font-size:14px}
.ask p{margin-top:14px;font-size:34px;font-weight:650;letter-spacing:-.03em;line-height:1.25}
.gate{margin-top:22px;width:900px;border:2px solid #400095;border-radius:28px;padding:32px 40px;display:flex;justify-content:space-between;align-items:center;background:#fff}
.gate b{font-size:32px;letter-spacing:-.03em}
.gate span{display:block;margin-top:8px;font-size:20px;color:#3B3742}
.pill{padding:16px 22px;border-radius:999px;background:#400095;color:#fff;font-weight:700;font-size:20px}
.note{position:absolute;left:72px;bottom:52px;font-size:16px;color:rgba(11,10,16,.55)}
"""
    body = f'''<div class="wrap"><div class="lock">{logo()} Autommerce</div>
<h1>Nothing reaches the store until you say&nbsp;so.</h1>
<div class="ask"><small class="mono">You ask</small><p>Rewrite every title in Chargers. Name the brand and the wattage.</p></div>
<div class="gate"><div><b>Waiting for approval</b><span>Every change can be undone.</span></div><div class="pill">Approve</div></div></div>
<div class="note mono">Store Assistant · plain words in, your decision out</div>'''
    return {'week-3/M10-approval/poster': doc(body, css, '#F4F0F6')}


# ---------------------------------------------------------------- M11 seo aeo geo
def m11():
    N = 5
    css = """
.wrap{padding:56px 72px 0}
.lock{display:flex;align-items:center;gap:14px;font-weight:800;font-size:24px}
.count{position:absolute;right:72px;top:62px;font-size:16px}
.count b{color:#F76D01;font-weight:500}
.word{margin-top:120px;font-size:168px;font-weight:800;letter-spacing:-.07em;line-height:.86}
.deck{margin-top:36px;font-size:36px;line-height:1.3;letter-spacing:-.025em;width:860px;color:#3B3742}
.rows{margin-top:48px}
.rows div{display:flex;gap:22px;align-items:baseline;padding:20px 0;border-top:1px solid rgba(11,10,16,.1);font-size:30px;font-weight:650;letter-spacing:-.02em}
.rows b{font-family:'Geist Mono',monospace;font-size:16px;color:#F76D01;font-weight:500}
"""
    pages = {}
    slides = [
        ('Three ways a product gets found.', '<div class="word">SEO<br>AEO<br><span class="o">GEO</span></div>', ''),
        ('People typing a query.', '<div class="word">SEO</div><div class="deck">Search engines read the title, the headings and the links. A vague title is a product they never&nbsp;list.</div>', ''),
        ('People asking a question.', '<div class="word" style="font-size:150px">AEO</div><div class="deck">Answer engines lift the page that answers in plain text. Specs trapped in a picture do not get&nbsp;picked.</div>', ''),
        ('Answers that cite a source.', '<div class="word">GEO</div><div class="deck">Generative engines cite the page they can quote. Facts, written out, are what they&nbsp;quote.</div>', ''),
        ('Same four fixes. All three readers.', '', '<div class="rows" style="margin-top:160px"><div><b>01</b>Titles that name the exact product</div><div><b>02</b>Specs as text, not a picture</div><div><b>03</b>Answers to real questions</div><div><b>04</b>One price, everywhere</div></div>'),
    ]
    for i, (deck, main, extra) in enumerate(slides):
        headline = f'<h1 style="margin-top:80px;font-size:76px;width:900px">{deck}</h1>' if i in (0, 4) and i == 4 else ''
        if i == 0:
            main_html = f'<h1 style="margin-top:70px;font-size:64px;width:800px">{deck}</h1>' + main
        elif i == 4:
            main_html = f'<h1 style="margin-top:48px;font-size:68px;width:900px">{deck}</h1>' + extra
        else:
            main_html = main
        body = f'''<div class="wrap"><div class="lock">{logo()} Autommerce</div><div class="count mono"><b>{i+1:02d}</b> / {N:02d}</div>{main_html}</div>{foot(i, N)}'''
        pages[f'week-3/M11-seo-aeo-geo/slide_{i+1:02d}'] = doc(body, css)
    return pages


# ---------------------------------------------------------------- M12 menu
def m12():
    css = """
.wrap{padding:56px 72px 0}
.lock{display:flex;align-items:center;gap:14px;font-weight:800;font-size:26px}
h1{margin-top:36px;font-size:64px;width:940px}
.pair{position:absolute;left:72px;right:72px;top:430px;display:grid;grid-template-columns:1fr 1fr;gap:24px}
.card{background:#fff;border-radius:28px;padding:32px 32px 12px;border:1px solid rgba(11,10,16,.08)}
.card small{font-size:14px;color:rgba(11,10,16,.5)}
.card.good{border:2px solid #F76D01}
.card.good small{color:#F76D01}
.item{font-size:32px;font-weight:650;letter-spacing:-.03em;padding:22px 0;border-bottom:1px solid rgba(11,10,16,.08)}
.card .item:last-child{border-bottom:0}
.bad .item{color:rgba(11,10,16,.45);text-decoration:line-through;text-decoration-thickness:2px}
.note{position:absolute;left:72px;bottom:48px;font-size:15px;color:rgba(11,10,16,.5)}
"""
    def items(names, cls=''):
        return ''.join(f'<div class="item {cls}">{n}</div>' for n in names)
    body = f'''<div class="wrap"><div class="lock">{logo()} Autommerce</div>
<h1>Rebuild the menu by talking to&nbsp;it.</h1></div>
<div class="pair">
<div class="card bad"><small class="mono">Before · illustrative</small>{items(['Sale','New','Brands','Misc','Other'])}</div>
<div class="card good"><small class="mono">After · you approve</small>{items(['Shop by room','Shop by use','Gifts','Replacement parts'])}</div>
</div>
<div class="note mono">Website Restructure · live preview · version history</div>'''
    return {'week-3/M12-menu/poster': doc(body, css)}


# ---------------------------------------------------------------- M13 who
def m13():
    N = 5
    css = """
.wrap{padding:56px 72px 0}
.lock{display:flex;align-items:center;gap:14px;font-weight:800;font-size:24px}
.count{position:absolute;right:72px;top:64px;font-size:16px}
.count b{color:#F76D01;font-weight:500}
.k{margin-top:90px;color:#F76D01;font-size:16px}
h1{margin-top:20px;font-size:80px;width:920px}
.p{margin-top:32px;font-size:32px;line-height:1.35;letter-spacing:-.02em;width:860px;color:#3B3742}
"""
    slides = [
        ('Who Autommerce is for', 'Four kinds of operation. One catalog, one workspace.'),
        ('The store', 'A supplier sheet landed this morning. Four hundred rows. Titles, specs and photos are still somebody\'s tonight.'),
        ('The agency', 'The client wants five hundred products live by Friday. Hiring for every catalog is not a plan.'),
        ('The brand', 'An assistant was asked for your best seller and described a product you do not sell. Your page gave it nothing to quote.'),
        ('The fashion retailer', 'Shoppers cannot try it on, so they buy two sizes and send one back. Persona is the fitting room, inside the store.'),
    ]
    out = {}
    for i, (h, p) in enumerate(slides):
        k = 'The back office' if i == 0 else f'0{i} / 04'
        night = 'body{background:#400095;color:#fff}.p{color:rgba(255,255,255,.82)}.lock{color:#fff}' if i == 0 else ''
        body = f'''<div class="wrap"><div class="lock">{logo(i == 0)} Autommerce</div><div class="count mono"><b>{i+1:02d}</b> / {N:02d}</div>
<div class="k mono">{k}</div><h1>{h}</h1><div class="p">{p}</div></div>{foot(i, N, dark=(i == 0))}'''
        out[f'week-3/M13-who/slide_{i+1:02d}'] = doc(body, css + night, '#400095' if i == 0 else '#F8F6F3')
    return out


# ---------------------------------------------------------------- P8 mirror
def p8():
    css = """
.wrap{position:absolute;left:0;top:0;width:560px;height:1350px;padding:56px 40px 0 64px}
.lock{display:flex;align-items:center;gap:12px}
.lock b{font-size:24px;font-weight:800}
.lock small{display:block;font-size:11px;opacity:.55;margin-top:2px}
h1{margin-top:64px;font-size:68px;width:460px}
.p{margin-top:28px;font-size:26px;line-height:1.35;width:440px;color:#3B3742;letter-spacing:-.015em}
.fact{margin-top:36px;font-size:22px;font-weight:650;letter-spacing:-.02em}
.mirror{position:absolute;right:64px;top:150px;width:430px;height:1040px;border-radius:215px;overflow:hidden;border:10px solid #0B0A10;box-shadow:0 40px 80px -36px rgba(64,0,149,.55)}
.mirror img{width:100%;height:100%;object-fit:cover;object-position:center 12%}
.cap{position:absolute;right:64px;bottom:48px;width:430px;text-align:center;font-size:13px;color:rgba(11,10,16,.5)}
"""
    body = f'''<div class="wrap"><div class="lock">{logo()}<div><b>Persona AI</b><small class="mono">By Autommerce</small></div></div>
<h1>A photo can't show how it&nbsp;moves.</h1>
<div class="p">The shopper turns the camera on. Tap a garment and it is on them, following the&nbsp;movement.</div>
<div class="fact">90-second sessions.<br>Loaded only when someone starts&nbsp;one.</div></div>
<div class="mirror"><img src="{COAT}"></div>
<div class="cap mono">Campaign still · Live mirror</div>'''
    return {'week-3/P8-live-mirror/poster': doc(body, css)}


# ---------------------------------------------------------------- P10 news
def p10():
    N = 5
    css = """
.wrap{padding:56px 72px 0}
.lock{display:flex;align-items:center;gap:12px}
.lock b{font-size:24px;font-weight:800}
.lock small{display:block;font-size:11px;opacity:.55;margin-top:2px}
.count{position:absolute;right:72px;top:64px;font-size:16px}
.count b{color:#F76D01;font-weight:500}
.k{margin-top:70px;color:#F76D01;font-size:16px}
h1{margin-top:16px;font-size:78px;width:920px}
.p{margin-top:28px;font-size:30px;line-height:1.35;letter-spacing:-.02em;width:880px;color:#3B3742}
.src{position:absolute;left:72px;right:72px;bottom:110px;font-size:15px;color:rgba(11,10,16,.5);line-height:1.4}
"""
    slides = [
        ('The shift', 'Try-on went mainstream.', 'Zara, Zalando and ASOS each shipped a fitting room. The independent store can have one too.', ''),
        ('Zara', 'An avatar, from two photos.', 'Face and full body. The avatar walks. Zara tells the shopper the image is generated, and may not match real life.', 'Zara Try-On, rolling out from December 2025'),
        ('Zalando', 'Fit, measured in returns.', 'Pilots of the virtual fitting room cut return rates by up to 40% in jeans. The rollout to all customers is the 2026 plan.', 'Zalando, 2026. Size tools prevented 8% of size-related returns in 2025.'),
        ('ASOS', 'Your photo, or a likeness.', 'About 10,000 products on the iOS app. Own photo or an AI likeness. Each try-on loads in 4 to 7 seconds.', 'ASOS, 17 February 2026, with AIUTA. Select UK and US customers.'),
        ('Your store', 'You do not need their team.', 'Persona is the fitting room and the stylist, inside your store. One script tag. Your cart. Only what you stock.', ''),
    ]
    out = {}
    for i, (k, h, p, src) in enumerate(slides):
        s = f'<div class="src mono">{src}</div>' if src else ''
        body = f'''<div class="wrap"><div class="lock">{logo()}<div><b>Persona AI</b><small class="mono">By Autommerce</small></div></div>
<div class="count mono"><b>{i+1:02d}</b> / {N:02d}</div>
<div class="k mono">{k}</div><h1>{h}</h1><div class="p">{p}</div></div>{s}{foot(i, N)}'''
        out[f'week-3/P10-tryon-mainstream/slide_{i+1:02d}'] = doc(body, css)
    return out


# ---------------------------------------------------------------- P11 size
def p11():
    css = """
.wrap{padding:56px 72px 0}
.lock{display:flex;align-items:center;gap:12px}
.lock b{font-size:24px;font-weight:800}
.lock small{display:block;font-size:11px;opacity:.55;margin-top:2px}
h1{margin-top:48px;font-size:68px;width:940px}
.grid{margin-top:48px;display:grid;grid-template-columns:1fr 1fr;gap:18px}
.m{background:#fff;border-radius:24px;padding:32px 32px 28px;border:1px solid rgba(11,10,16,.08)}
.m small{color:#F76D01;font-size:14px}
.m b{display:block;margin-top:12px;font-size:48px;letter-spacing:-.04em}
.line{position:absolute;left:72px;right:72px;bottom:64px;font-size:26px;font-weight:600;letter-spacing:-.02em;line-height:1.35}
"""
    cells = ''.join(
        f'<div class="m"><small class="mono">{n}</small><b>{t}</b></div>'
        for n, t in [('01', 'Height'), ('02', 'Chest'), ('03', 'Waist'), ('04', 'Shoe size')])
    body = f'''<div class="wrap"><div class="lock">{logo()}<div><b>Persona AI</b><small class="mono">By Autommerce</small></div></div>
<h1>The wrong size is the return you could have&nbsp;prevented.</h1>
<div class="grid">{cells}</div></div>
<div class="line">The suggestion uses their measurements and your size&nbsp;charts.</div>'''
    return {'week-3/P11-size/poster': doc(body, css)}


# ---------------------------------------------------------------- A11 peak week
def a11():
    css = """
.photo{position:absolute;left:0;bottom:0;width:1080px;height:540px;object-fit:cover;object-position:center 28%}
.fade{position:absolute;left:0;bottom:430px;width:1080px;height:200px;background:linear-gradient(#F8F6F3,rgba(248,246,243,0));z-index:1}
.wrap{padding:56px 72px 0}
.lock{display:flex;align-items:center;gap:12px}
.lock b{font-size:22px;font-weight:800}
.lock small{display:block;font-size:11px;opacity:.55;margin-top:3px}
h1{margin-top:48px;font-size:76px;width:940px}
.p{margin-top:24px;font-size:30px;line-height:1.3;letter-spacing:-.02em;width:860px;color:#3B3742}
.days{margin-top:36px;display:flex;gap:10px}
.days i{width:86px;height:64px;border-radius:12px;background:rgba(11,10,16,.06);display:flex;align-items:center;justify-content:center;font-style:normal;font-family:'Geist Mono',monospace;font-size:14px}
.days i.on{background:#F76D01;color:#0B0A10;font-weight:600}
.hold{margin-top:16px;font-size:18px;font-weight:650;letter-spacing:-.01em}
"""
    days = ''.join(f'<i class="{"on" if d=="Tue" else ""}">{d}</i>' for d in ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'])
    body = f'''<img class="photo" src="{LAP}"><div class="fade"></div>
<div class="wrap"><div class="lock">{logo()}<div><b>Abbas Zein</b><small class="mono">Founder notes</small></div></div>
<h1>Peak week is for staying accurate.</h1>
<div class="p">Not for rebuilding the catalog. Correct the fifty products you will actually sell. Then stop&nbsp;touching&nbsp;it.</div>
<div class="days">{days}</div><div class="hold">Tuesday. The catalog holds.</div></div>'''
    return {'week-4/A11-peak-week/poster': doc(body, css)}


# ---------------------------------------------------------------- A12 open closed
def a12():
    css = """
.half{position:absolute;top:0;bottom:210px;width:540px;padding:56px 48px 0}
.left{left:0;background:#0B0A10;color:#fff}
.right{right:0;background:#F8F6F3;color:#0B0A10}
.tag{font-size:15px}
.left .tag{color:#F76D01}
.right .tag{color:#C40000}
h1{margin-top:28px;font-size:92px}
.name{margin-top:20px;font-size:28px;font-weight:700;letter-spacing:-.02em}
.p{margin-top:16px;font-size:26px;line-height:1.3;letter-spacing:-.015em}
.left .p{color:rgba(255,255,255,.78)}
.right .p{color:#3B3742}
.band{position:absolute;left:0;right:0;bottom:0;height:210px;background:#400095;color:#fff;padding:32px 56px}
.band b{font-size:30px;letter-spacing:-.02em}
.band p{margin-top:8px;font-size:22px;color:rgba(255,255,255,.8);letter-spacing:-.01em}
.src{margin-top:10px;font-size:13px;color:rgba(255,255,255,.6)}
"""
    body = f'''<div class="half left"><div class="lock" style="display:flex;gap:10px;align-items:center">{logo(True)}<b>Abbas Zein</b></div>
<div class="tag mono" style="margin-top:48px">Closed</div><h1>Amazon.</h1>
<div class="p">Outside agents are turned away. Its own agent, Alexa for Shopping, now takes the order by&nbsp;text.</div></div>
<div class="half right"><div class="tag mono" style="margin-top:128px">Open</div><h1>Shopify.</h1>
<div class="p">Eligible stores in the US, Canada and Mexico can be bought through Shop Pay, inside someone else's&nbsp;agent.</div></div>
<div class="band"><b>Walmart is building the agent itself.</b><p>Sparky turns a holiday list into a cart. Voice is still on the way.</p>
<div class="src mono">Amazon Nov 2026 · Shopify Nov 2026 · Walmart, 30 Oct 2026</div></div>'''
    return {'week-4/A12-open-closed/poster': doc(body, css, '#0B0A10')}


# ---------------------------------------------------------------- A13 first question
def a13():
    css = """
.rule{position:absolute;left:72px;top:150px;width:72px;height:8px;border-radius:4px;background:#F76D01}
.wrap{padding:190px 72px 0;position:relative}
.lock{display:flex;align-items:center;gap:12px}
.lock b{font-size:22px;font-weight:800}
.lock small{display:block;font-size:11px;opacity:.55;margin-top:3px}
h1{margin-top:28px;font-size:72px;width:760px}
.photo{position:absolute;right:0;bottom:0;width:460px;height:620px;object-fit:cover;object-position:center 20%}
.note{position:absolute;left:72px;bottom:56px;width:500px;font-size:22px;line-height:1.35;color:#3B3742;letter-spacing:-.015em}
"""
    body = f'''<div class="rule"></div>
<div class="wrap"><div class="lock">{logo()}<div><b>Abbas Zein</b><small class="mono">Founder notes</small></div></div>
<h1>The first thing I ask to see is the&nbsp;catalog.</h1></div>
<img class="photo" src="{HAND}">
<div class="note">Ads can wait. The page the shopper lands on cannot.</div>'''
    return {'week-4/A13-first-question/poster': doc(body, css)}


# ---------------------------------------------------------------- A14 three numbers
def a14():
    N = 4
    css = """
.wrap{padding:56px 72px 0}
.lock{display:flex;align-items:center;gap:12px}
.lock b{font-size:22px;font-weight:800}
.lock small{display:block;font-size:11px;opacity:.55;margin-top:3px}
.count{position:absolute;right:72px;top:64px;font-size:16px}
.count b{color:#F76D01;font-weight:500}
.idx{margin-top:48px;font-size:22px;color:#F76D01}
.big{margin-top:12px;font-size:160px;font-weight:800;letter-spacing:-.07em;line-height:.8;color:#F76D01}
h1{margin-top:16px;font-size:68px;width:920px}
.p{margin-top:28px;font-size:32px;line-height:1.32;letter-spacing:-.02em;width:860px;color:#3B3742}
"""
    slides = [
        ('Tomorrow', 'Watch three numbers. Next to revenue.', 'White Friday revenue is a loud number. These three tell you whether it was any good.'),
        ('Conversion', 'The fifty you are pushing.', 'Site-wide conversion hides a hero product that is leaking. Read the pages you are spending on.'),
        ('Stock', 'Out of stock by noon.', 'An ad for a product you no longer have is a tax. Check the fifty at midday, not on Monday.'),
        ('The drop', 'Added to cart. Never ordered.', 'That gap is the page, the delivery promise, or the price at checkout. It is visible on the day.'),
    ]
    out = {}
    for i, (k, h, p) in enumerate(slides):
        big = f'<div class="big">0{i}</div>' if i else ''
        body = f'''<div class="wrap"><div class="lock">{logo()}<div><b>Abbas Zein</b><small class="mono">Founder notes</small></div></div>
<div class="count mono"><b>{i+1:02d}</b> / {N:02d}</div>
<div class="idx mono">{k}</div>{big}<h1>{h}</h1><div class="p">{p}</div></div>{foot(i, N)}'''
        out[f'week-4/A14-three-numbers/slide_{i+1:02d}'] = doc(body, css)
    return out


# ---------------------------------------------------------------- M14 orange
def m14():
    css = """
body{color:#0B0A10}
.wrap{padding:60px 72px 0}
.lock{display:flex;align-items:center;gap:14px;font-weight:800;font-size:26px}
.when{position:absolute;right:72px;top:68px;font-size:15px}
h1{margin-top:120px;font-size:108px;width:920px}
.p{margin-top:36px;font-size:34px;line-height:1.3;letter-spacing:-.025em;width:800px}
.rule{position:absolute;left:72px;bottom:150px;width:180px;height:8px;border-radius:4px;background:#0B0A10}
.footl{position:absolute;left:72px;bottom:64px;font-size:20px;font-weight:650;letter-spacing:-.02em}
"""
    body = f'''<div class="wrap"><div class="lock">{logo(True)} Autommerce</div><div class="when mono">Friday 27 Nov</div>
<h1>Four days. Fifty products.</h1>
<div class="p">Fix the ones you will discount. Leave the rest of the catalog&nbsp;alone.</div></div>
<div class="rule"></div><div class="footl">Titles. Photos. Price. Stock.</div>'''
    return {'week-4/M14-top-50/poster': doc(body, css, '#F76D01')}


# ---------------------------------------------------------------- M15 growth
def m15():
    css = """
.wrap{padding:56px 72px 0}
.lock{display:flex;align-items:center;gap:14px;font-weight:800;font-size:26px}
h1{margin-top:40px;font-size:64px;width:940px}
.steps{margin-top:40px;position:relative}
.steps:before{content:'';position:absolute;left:22px;top:24px;bottom:24px;width:2px;background:rgba(247,109,1,.45)}
.st{display:grid;grid-template-columns:64px 1fr;align-items:center;padding:16px 0}
.dot{width:46px;height:46px;border-radius:50%;background:#F76D01;color:#0B0A10;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;position:relative;z-index:1}
.st b{font-size:40px;letter-spacing:-.04em}
.note{position:absolute;left:72px;right:72px;bottom:60px;font-size:26px;line-height:1.35;letter-spacing:-.02em;color:#3B3742}
"""
    steps = ''.join(f'<div class="st"><div class="dot">{n}</div><b>{t}</b></div>' for n, t in [('01', 'Niche'), ('02', 'Keywords'), ('03', 'Collections'), ('04', 'Articles')])
    body = f'''<div class="wrap"><div class="lock">{logo()} Autommerce</div>
<h1>From a keyword to a page in the&nbsp;store.</h1>
<div class="steps">{steps}</div></div>
<div class="note">Growth Engine is a seven-stage agent. These four are what land in the store. You stay the&nbsp;editor.</div>'''
    return {'week-4/M15-growth/poster': doc(body, css)}


# ---------------------------------------------------------------- M16 24h
def m16():
    css = """
.ring{position:absolute;right:80px;top:180px;width:420px;height:420px;border-radius:50%;border:18px solid #400095;display:flex;align-items:center;justify-content:center;flex-direction:column}
.ring b{font-size:120px;letter-spacing:-.06em;line-height:.8}
.ring span{margin-top:8px;font-size:16px;color:#400095}
.wrap{padding:60px 72px 0;width:560px}
.lock{display:flex;align-items:center;gap:14px;font-weight:800;font-size:26px}
h1{margin-top:80px;font-size:68px}
.cards{position:absolute;left:72px;right:72px;bottom:70px;display:grid;grid-template-columns:1fr 1fr;gap:18px}
.card{background:#fff;border-radius:22px;padding:26px 28px;border:1px solid rgba(11,10,16,.08)}
.card small{font-size:14px;color:#400095}
.card b{display:block;margin-top:8px;font-size:30px;letter-spacing:-.03em}
"""
    body = f'''<div class="ring"><b>24h</b><span class="mono">Every day</span></div>
<div class="wrap"><div class="lock">{logo()} Autommerce</div>
<h1>New stock, classified while you&nbsp;sleep.</h1></div>
<div class="cards"><div class="card"><small class="mono">Fits a rule</small><b>Filed in the right category.</b></div>
<div class="card"><small class="mono">Doesn't fit</small><b>Listed. Not guessed.</b></div></div>'''
    return {'week-4/M16-sync/poster': doc(body, css)}


# ---------------------------------------------------------------- M17 gallery
def m17():
    css = """
.wrap{padding:52px 72px 0}
.lock{display:flex;align-items:center;gap:14px;font-weight:800;font-size:26px}
h1{margin-top:28px;font-size:64px;width:940px}
.grid{margin-top:32px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px}
.cell{height:250px;border-radius:22px;background:#fff;border:1px solid rgba(11,10,16,.08);display:flex;align-items:flex-end;padding:20px;font-size:22px;font-weight:650;letter-spacing:-.02em}
.cell.on{background:#0B0A10;color:#fff;border:0}
.cell.on span{color:#F76D01;display:block;font-family:'Geist Mono',monospace;font-size:13px;letter-spacing:.14em;font-weight:500;margin-bottom:6px}
"""
    labels = [('on', '<span>YOU HAVE</span>1 photo'), ('', 'Front'), ('', 'Detail'), ('', 'Scale'), ('', 'In use'), ('', 'Lifestyle')]
    cells = ''.join(f'<div class="cell {c}">{t}</div>' for c, t in labels)
    body = f'''<div class="wrap"><div class="lock">{logo()} Autommerce</div>
<h1>One photo in. A gallery&nbsp;out.</h1>
<div class="grid">{cells}</div></div>'''
    return {'week-4/M17-gallery/poster': doc(body, css)}


# ---------------------------------------------------------------- M18 night
def m18():
    css = """
body{color:#fff}
.glow{position:absolute;width:700px;height:700px;right:-200px;top:-180px;border-radius:50%;background:rgba(247,109,1,.35);filter:blur(40px)}
.wrap{position:relative;padding:64px 72px 0}
.lock{display:flex;align-items:center;gap:14px;font-weight:800;font-size:26px}
.when{position:absolute;right:72px;top:72px;font-size:15px;color:rgba(255,255,255,.7)}
h1{margin-top:160px;font-size:92px;width:900px}
.o{color:#F76D01}
.p{margin-top:36px;font-size:32px;line-height:1.35;width:760px;color:rgba(255,255,255,.82);letter-spacing:-.02em}
.line{position:absolute;left:72px;bottom:64px;font-size:22px;font-weight:600}
"""
    body = f'''<div class="glow"></div><div class="wrap"><div class="lock">{logo(True)} Autommerce</div><div class="when mono">White Friday</div>
<h1>Your store is open all&nbsp;night.</h1>
<h1 style="margin-top:8px" class="o">So is the assistant.</h1>
<div class="p">Ask what broke. Stock, a title, a price. Nothing changes until you&nbsp;approve&nbsp;it.</div></div>
<div class="line">Store Assistant · autommerce.com/contact</div>'''
    return {'week-4/M18-all-night/poster': doc(body, css, '#400095')}


# ---------------------------------------------------------------- P12 returns split
def p12():
    css = """
.top{position:absolute;left:0;right:0;top:0;height:620px;background:#F76D01;color:#0B0A10;padding:56px 72px 0}
.bot{position:absolute;left:0;right:0;top:620px;bottom:0;background:#F8F6F3;color:#0B0A10;padding:48px 72px 0}
.lock{display:flex;align-items:center;gap:12px;font-weight:800;font-size:24px}
h1{margin-top:48px;font-size:84px;width:900px}
.bot h1{margin-top:10px;font-size:78px}
.n{margin-top:36px}
.n b{font-size:140px;letter-spacing:-.06em;line-height:.8;color:#C40000}
.n span{display:block;margin-top:16px;font-size:18px;line-height:1.4;color:rgba(11,10,16,.55);width:520px}
"""
    body = f'''<div class="top"><div class="lock">{logo(True)} Persona AI</div><h1>White Friday sells&nbsp;it.</h1></div>
<div class="bot"><h1>December returns&nbsp;it.</h1>
<div class="n"><b>17%</b><span class="mono">of holiday sales, retailers expected to come back. NRF and Happy Returns, 2025.</span></div></div>'''
    return {'week-4/P12-returns/poster': doc(body, css, '#F76D01')}


# ---------------------------------------------------------------- P13 sentence to cart
def p13():
    css = """
.wrap{padding:56px 72px 0}
.lock{display:flex;align-items:center;gap:12px}
.lock b{font-size:24px;font-weight:800}
.lock small{display:block;font-size:11px;opacity:.55;margin-top:2px}
h1{margin-top:40px;font-size:64px;width:940px}
.bubble{margin-top:36px;background:#fff;border-radius:28px 28px 28px 8px;padding:32px 36px;width:860px;border:1px solid rgba(11,10,16,.08)}
.bubble small{color:#F76D01;font-size:14px}
.bubble p{margin-top:10px;font-size:34px;font-weight:650;letter-spacing:-.03em;line-height:1.25}
.cart{margin-top:18px;background:#0B0A10;color:#fff;border-radius:28px;padding:32px 36px;width:860px}
.cart small{color:#F76D01;font-size:14px}
.row{display:flex;justify-content:space-between;padding-top:16px;font-size:28px;font-weight:600;letter-spacing:-.02em}
.row em{font-style:normal;color:rgba(255,255,255,.7);font-weight:500}
.note{position:absolute;left:72px;bottom:48px;font-size:18px;color:rgba(11,10,16,.55)}
"""
    body = f'''<div class="wrap"><div class="lock">{logo()}<div><b>Persona AI</b><small class="mono">By Autommerce</small></div></div>
<h1>From the sentence to your&nbsp;cart.</h1>
<div class="bubble"><small class="mono">The shopper</small><p>"An outfit for a wedding, under $300."</p></div>
<div class="cart"><small class="mono">Your store</small>
<div class="row"><span>Blazer, shirt, shoes</span><em>In stock</em></div>
<div class="row"><span>Added to your cart</span><em>One tap</em></div></div></div>
<div class="note">Checkout, payment and the customer stay yours.</div>'''
    return {'week-4/P13-to-cart/poster': doc(body, css)}


# ---------------------------------------------------------------- P14 metrics
def p14():
    css = """
body{color:#fff;background:#0B0A10}
.glow{position:absolute;width:640px;height:640px;left:-200px;bottom:-200px;background:rgba(64,0,149,.7);filter:blur(30px);border-radius:50%}
.wrap{position:relative;padding:56px 72px 0}
.lock{display:flex;align-items:center;gap:12px}
.lock b{font-size:24px;font-weight:800}
.lock small{display:block;font-size:11px;opacity:.6;margin-top:2px}
h1{margin-top:36px;font-size:64px;width:940px}
.rows{margin-top:36px}
.row{display:grid;grid-template-columns:70px 1fr;align-items:center;height:78px;border-top:1px solid rgba(255,255,255,.12)}
.row:last-child{border-bottom:1px solid rgba(255,255,255,.12)}
.row b{font-family:'Geist Mono',monospace;font-size:16px;color:#F76D01;font-weight:500}
.row span{font-size:32px;font-weight:650;letter-spacing:-.03em}
.note{position:absolute;left:72px;bottom:48px;font-size:18px;color:rgba(255,255,255,.65)}
"""
    rows = ''.join(f'<div class="row"><b>{n}</b><span>{t}</span></div>' for n, t in [
        ('01', 'Persona sales'), ('02', 'Orders'), ('03', 'Conversion'), ('04', 'Average order value'), ('05', 'Returns')])
    body = f'''<div class="glow"></div><div class="wrap"><div class="lock">{logo(True)}<div><b>Persona AI</b><small class="mono">By Autommerce</small></div></div>
<h1>The sales the fitting room&nbsp;drove.</h1>
<div class="rows">{rows}</div></div>
<div class="note">Five numbers, next to revenue. Turn tracking on before Friday.</div>'''
    return {'week-4/P14-dashboard/poster': doc(body, css, '#0B0A10')}


# ---------------------------------------------------------------- P15 manifesto
def p15():
    css = """
.rule{position:absolute;left:72px;top:64px;width:80px;height:8px;border-radius:4px;background:linear-gradient(90deg,#F76D01,#C40000,#400095)}
h1{position:absolute;left:72px;top:280px;font-size:108px;width:940px}
.grad{background:linear-gradient(100deg,#F76D01,#C40000 50%,#6B358D);-webkit-background-clip:text;background-clip:text;color:transparent;padding-right:.08em}
.sub{position:absolute;left:72px;top:860px;font-size:32px;width:700px;line-height:1.35;letter-spacing:-.02em;color:#3B3742}
.lock{position:absolute;left:72px;bottom:60px;display:flex;align-items:center;gap:12px;font-weight:800;font-size:22px}
"""
    body = f'''<div class="rule"></div>
<h1>Every shopper deserves a&nbsp;<span class="grad">stylist.</span></h1>
<div class="sub">One that only sells what you stock, and checks out in your&nbsp;cart.</div>
<div class="lock">{logo()} Persona AI</div>'''
    return {'week-4/P15-stylist/poster': doc(body, css)}


BUILDERS = dict(A8=a8, A9=a9, A10=a10, M9=m9, M10=m10, M11=m11, M12=m12, M13=m13, P8=p8, P10=p10, P11=p11,
                A11=a11, A12=a12, A13=a13, A14=a14, M14=m14, M15=m15, M16=m16, M17=m17, M18=m18,
                P12=p12, P13=p13, P14=p14, P15=p15)


async def render(pages):
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/local/bin/google-chrome', args=['--no-sandbox'])
        pg = await b.new_page(viewport={'width': 1080, 'height': 1350}, device_scale_factor=2)
        for key, html in pages.items():
            folder = os.path.join(ROOT, os.path.dirname(key))
            os.makedirs(folder, exist_ok=True)
            fn = os.path.join(ROOT, key + '.html')
            open(fn, 'w').write(html)
            await pg.goto('file://' + fn, wait_until='networkidle')
            await pg.evaluate('document.fonts.ready')
            await pg.wait_for_timeout(250)
            await pg.screenshot(path=os.path.join(ROOT, key + '.png'))
            print('ok', key)
        await b.close()


def pdfs():
    jobs = {
        'week-3/M11-seo-aeo-geo': 'M11_seo_aeo_geo_linkedin.pdf',
        'week-3/M13-who': 'M13_who_linkedin.pdf',
        'week-3/P10-tryon-mainstream': 'P10_tryon_mainstream_linkedin.pdf',
        'week-4/A14-three-numbers': 'A14_three_numbers_linkedin.pdf',
    }
    for folder, name in jobs.items():
        d = os.path.join(ROOT, folder)
        files = sorted(f for f in os.listdir(d) if f.startswith('slide_') and f.endswith('.png'))
        if not files:
            continue
        ims = [Image.open(os.path.join(d, f)).convert('RGB').resize((1080, 1350), Image.LANCZOS) for f in files]
        ims[0].save(os.path.join(d, name), save_all=True, append_images=ims[1:], resolution=72)
        print('pdf', name)


if __name__ == '__main__':
    keys = sys.argv[1:] or list(BUILDERS)
    pages = {}
    for k in keys:
        pages.update(BUILDERS[k]())
    asyncio.run(render(pages))
    if not sys.argv[1:]:
        pdfs()
