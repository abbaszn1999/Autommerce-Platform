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
.band{position:absolute;left:0;top:0;width:14px;height:1350px;background:#C40000}
.wrap{padding:52px 64px 0 78px}
.lock{display:flex;align-items:center;gap:12px}
.lock b{font-size:22px;font-weight:800}
.lock small{display:block;font-size:11px;opacity:.55;margin-top:3px}
.head{margin-top:36px;display:flex;justify-content:space-between;align-items:flex-end;gap:24px}
h1{font-size:96px;letter-spacing:-.06em;line-height:.88;color:#C40000}
.stat{text-align:right}
.stat b{display:block;font-size:64px;letter-spacing:-.05em;line-height:.9}
.stat span{display:block;margin-top:6px;font-size:14px;color:rgba(11,10,16,.5)}
.sub{margin-top:22px;font-size:26px;line-height:1.3;letter-spacing:-.02em;width:900px;color:#3B3742}
.tbl{margin-top:28px;background:#fff;border:1px solid rgba(11,10,16,.1);border-radius:18px;overflow:hidden}
.th{display:grid;grid-template-columns:72px 1fr 160px 140px;padding:14px 28px;background:rgba(11,10,16,.04);font-size:13px;color:rgba(11,10,16,.5)}
.row{display:grid;grid-template-columns:72px 1fr 160px 140px;align-items:center;padding:0 28px;height:78px;border-top:1px solid rgba(11,10,16,.08);font-size:24px}
.row b{font-weight:650;letter-spacing:-.02em}
.row .sku{font-family:'Geist Mono',monospace;font-size:15px;letter-spacing:.06em;color:rgba(11,10,16,.45)}
.miss-row{background:rgba(196,0,0,.06)}
.miss-row b{color:#C40000}
.ok{font-family:'Geist Mono',monospace;font-size:14px;letter-spacing:.12em;text-transform:uppercase;color:rgba(11,10,16,.4)}
.miss{font-family:'Geist Mono',monospace;font-size:14px;letter-spacing:.12em;text-transform:uppercase;color:#C40000;font-weight:700}
.idx{font-family:'Geist Mono',monospace;font-size:15px;color:rgba(11,10,16,.4)}
.miss-row .idx{color:#C40000}
.note{position:absolute;left:78px;right:64px;bottom:48px;display:flex;justify-content:space-between;align-items:center;font-size:14px;color:rgba(11,10,16,.5)}
.pill{padding:10px 14px;border-radius:999px;border:1px solid rgba(196,0,0,.35);color:#C40000;font-size:13px}
"""
    rows = [
        ('01', 'Sony WH-1000XM5', 'SKU-8841', True),
        ('02', 'Nespresso Vertuo', 'SKU-2204', True),
        ('03', 'Apple AirPods Pro 2', 'SKU-1109', True),
        ('04', 'Dyson V15 Detect', 'SKU-5512', False),
        ('05', 'Kindle Paperwhite', 'SKU-7730', True),
        ('06', 'Bose QuietComfort', 'SKU-3391', True),
    ]
    html_rows = ''
    for n, name, sku, ok in rows:
        cls = '' if ok else ' miss-row'
        status = '<span class="ok">Matched</span>' if ok else '<span class="miss">Not found</span>'
        html_rows += f'<div class="row{cls}"><span class="idx">{n}</span><b>{name}</b><span class="sku">{sku}</span>{status}</div>'
    body = f'''<div class="band"></div>
<div class="wrap"><div class="lock">{logo()}<div><b>Abbas Zein</b><small class="mono">Founder notes</small></div></div>
<div class="head"><h1>Not<br>found.</h1><div class="stat"><b>5<span style="color:#C40000">/6</span></b><span class="mono">images matched</span></div></div>
<div class="sub">An empty cell is cheaper than the wrong photo on five hundred product&nbsp;pages.</div>
<div class="tbl"><div class="th mono"><span>#</span><span>Product</span><span>SKU</span><span>Status</span></div>{html_rows}</div></div>
<div class="note"><span class="mono">Catalog Intelligence run · sixth left empty on purpose</span><span class="pill mono">Refuse the guess</span></div>'''
    return {'week-3/A10-not-found/poster': doc(body, css)}


# ---------------------------------------------------------------- M9 hours
def m9():
    css = """
.wrap{padding:52px 64px 0}
.lock{display:flex;align-items:center;gap:14px;font-weight:800;font-size:26px;letter-spacing:-.03em}
.chip{position:absolute;right:64px;top:56px;padding:12px 16px;border-radius:999px;background:#0B0A10;color:#fff;font-size:13px}
h1{margin-top:48px;font-size:56px;width:920px}
.math{margin-top:36px;display:grid;grid-template-columns:1fr 48px 1fr 48px 1.2fr;align-items:end;gap:8px}
.cell{background:#fff;border-radius:22px;padding:28px 26px;border:1px solid rgba(11,10,16,.08)}
.cell small{display:block;font-size:14px;color:rgba(11,10,16,.5);margin-bottom:10px}
.cell b{font-size:56px;letter-spacing:-.05em;line-height:.9}
.op{text-align:center;font-size:42px;font-weight:700;color:#F76D01;padding-bottom:28px}
.cell.res{background:#F76D01;border:0;color:#0B0A10}
.cell.res small{color:rgba(11,10,16,.7)}
.grid{margin-top:28px;display:grid;grid-template-columns:repeat(25,1fr);gap:6px}
.grid i{aspect-ratio:1;border-radius:4px;background:rgba(11,10,16,.1);display:block}
.grid i.on{background:#F76D01}
.cap{margin-top:14px;font-size:18px;color:rgba(11,10,16,.55)}
.box{position:absolute;left:64px;right:64px;bottom:56px;background:#0B0A10;color:#fff;border-radius:22px;padding:30px 34px;display:flex;justify-content:space-between;align-items:center}
.box b{font-size:28px;letter-spacing:-.02em}
.box span{font-size:16px;color:#F76D01}
"""
    dots = ''.join(f'<i class="{"on" if i < 20 else ""}"></i>' for i in range(50))
    body = f'''<div class="wrap"><div class="lock">{logo()} Autommerce</div><div class="chip mono">Illustrative</div>
<h1>Five hundred titles, written by&nbsp;hand.</h1>
<div class="math">
<div class="cell"><small class="mono">Products</small><b>500</b></div><div class="op">&times;</div>
<div class="cell"><small class="mono">Minutes each</small><b>4</b></div><div class="op">=</div>
<div class="cell res"><small class="mono">Hours of typing</small><b>33h</b></div>
</div>
<div class="grid">{dots}</div>
<div class="cap mono">50 of 500 shown · titles only · descriptions and specs come after</div></div>
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
.wrap{padding:52px 64px 0}
.lock{display:flex;align-items:center;gap:14px;font-weight:800;font-size:24px}
.count{position:absolute;right:64px;top:56px;font-size:16px}
.count b{color:#F76D01;font-weight:500}
.k{margin-top:36px;color:#F76D01;font-size:16px}
h1{margin-top:14px;font-size:64px;width:920px}
.p{margin-top:24px;font-size:30px;line-height:1.35;letter-spacing:-.02em;width:880px;color:#3B3742}
.cards{margin-top:36px;display:grid;grid-template-columns:1fr 1fr;gap:16px}
.card{background:#fff;border-radius:22px;padding:28px 26px;border:1px solid rgba(11,10,16,.08)}
.card b{display:block;font-size:28px;letter-spacing:-.03em;margin-top:8px}
.card small{color:#F76D01;font-size:14px}
.card p{margin-top:12px;font-size:22px;line-height:1.3;color:#3B3742;letter-spacing:-.015em}
.stat{margin-top:28px;display:flex;gap:18px}
.stat div{flex:1;background:#fff;border-radius:20px;padding:24px;border:1px solid rgba(11,10,16,.08)}
.stat b{display:block;font-size:48px;letter-spacing:-.05em;color:#F76D01}
.stat span{display:block;margin-top:8px;font-size:20px;color:#3B3742}
"""
    cover_cards = [
        ('01', 'The store', 'Supplier sheets faster than any team can type.'),
        ('02', 'The agency', 'Clients want catalogs live. Headcount is not the plan.'),
        ('03', 'The brand', 'Agents read your page. Empty fields get skipped.'),
        ('04', 'Fashion retail', 'Guessing size is the return you could prevent.'),
    ]
    cards = ''.join(
        f'<div class="card"><small class="mono">{n}</small><b>{t}</b><p>{d}</p></div>'
        for n, t, d in cover_cards)
    slides = [
        ('cover', 'Who Autommerce is for', 'Four kinds of operation. One catalog, one workspace.', cards),
        ('body', 'The store', 'A supplier sheet landed this morning. Four hundred rows. Titles, specs and photos are still somebody\'s tonight.',
         '<div class="stat"><div><b>400</b><span>rows waiting</span></div><div><b>1</b><span>sheet, still raw</span></div></div>'),
        ('body', 'The agency', 'The client wants five hundred products live by Friday. Hiring for every catalog is not a plan.',
         '<div class="stat"><div><b>500</b><span>products by Friday</span></div><div><b>0</b><span>new hires that scale</span></div></div>'),
        ('body', 'The brand', 'An assistant was asked for your best seller and described a product you do not sell. Your page gave it nothing to quote.',
         '<div class="stat"><div><b>3</b><span>readers on every page</span></div><div><b>1</b><span>catalog to feed them</span></div></div>'),
        ('body', 'The fashion retailer', 'Shoppers cannot try it on, so they buy two sizes and send one back. Persona is the fitting room, inside the store.',
         '<div class="stat"><div><b>19%</b><span>online returns, US 2025</span></div><div><b>1</b><span>fitting room in the store</span></div></div>'),
    ]
    out = {}
    for i, (kind, h, p, extra) in enumerate(slides):
        k = 'The back office' if i == 0 else f'Audience 0{i} / 04'
        body = f'''<div class="wrap"><div class="lock">{logo()} Autommerce</div><div class="count mono"><b>{i+1:02d}</b> / {N:02d}</div>
<div class="k mono">{k}</div><h1>{h}</h1><div class="p">{p}</div>{extra if kind=='cover' else extra}</div>{foot(i, N)}'''
        out[f'week-3/M13-who/slide_{i+1:02d}'] = doc(body, css + ('.cards{margin-top:28px}' if i == 0 else ''), '#F8F6F3')
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
    out = {}

    # 01 intro — three brand tiles
    css1 = """
.wrap{padding:48px 64px 0}
.lock{display:flex;align-items:center;gap:12px}
.lock b{font-size:24px;font-weight:800}
.lock small{display:block;font-size:11px;opacity:.55;margin-top:2px}
.count{position:absolute;right:64px;top:56px;font-size:16px}
.count b{color:#F76D01;font-weight:500}
.k{margin-top:40px;color:#F76D01;font-size:15px}
h1{margin-top:12px;font-size:68px;width:920px}
.p{margin-top:18px;font-size:26px;line-height:1.3;letter-spacing:-.02em;width:900px;color:#3B3742}
.brands{margin-top:36px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
.b{border-radius:18px;padding:28px 24px;min-height:340px;display:flex;flex-direction:column;justify-content:space-between}
.b1{background:#0B0A10;color:#fff}
.b2{background:#F76D01;color:#0B0A10}
.b3{background:#400095;color:#fff}
.b small{font-size:14px;opacity:.7}
.b strong{display:block;margin-top:18px;font-size:40px;letter-spacing:-.04em}
.b span{font-size:18px;line-height:1.3;opacity:.85}
"""
    body1 = f'''<div class="wrap"><div class="lock">{logo()}<div><b>Persona AI</b><small class="mono">By Autommerce</small></div></div>
<div class="count mono"><b>01</b> / {N:02d}</div>
<div class="k mono">The shift</div>
<h1>Try-on went mainstream.</h1>
<div class="p">Zara, Zalando and ASOS each shipped a fitting room. The independent store can have one&nbsp;too.</div>
<div class="brands">
<div class="b b1"><small class="mono">01</small><div><strong>Zara</strong><span>Avatar from two photos</span></div></div>
<div class="b b2"><small class="mono">02</small><div><strong>Zalando</strong><span>Returns down in jeans</span></div></div>
<div class="b b3"><small class="mono">03</small><div><strong>ASOS</strong><span>10k products, iOS</span></div></div>
</div></div>{foot(0, N)}'''
    out['week-3/P10-tryon-mainstream/slide_01'] = doc(body1, css1)

    # 02 Zara — ink band
    css2 = """
.band{position:absolute;left:0;top:0;bottom:0;width:340px;background:#0B0A10;color:#fff;padding:56px 40px 0}
.band .k{color:#F76D01;font-size:15px;margin-top:80px}
.band .brand{margin-top:20px;font-size:72px;font-weight:800;letter-spacing:-.05em}
.band .yr{margin-top:18px;font-size:16px;color:rgba(255,255,255,.55)}
.main{position:absolute;left:340px;right:0;top:0;bottom:0;padding:56px 56px 0 48px;background:#F8F6F3}
.lock{display:flex;align-items:center;gap:12px}
.lock b{font-size:22px;font-weight:800}
.lock small{display:block;font-size:11px;opacity:.55;margin-top:2px}
.count{position:absolute;right:56px;top:56px;font-size:16px}
.count b{color:#F76D01;font-weight:500}
h1{margin-top:56px;font-size:56px;width:580px}
.p{margin-top:22px;font-size:26px;line-height:1.35;letter-spacing:-.02em;width:560px;color:#3B3742}
.facts{margin-top:36px;display:flex;flex-direction:column;gap:12px}
.f{background:#fff;border:1px solid rgba(11,10,16,.1);border-radius:14px;padding:18px 22px;display:flex;justify-content:space-between;align-items:center}
.f b{font-size:22px;letter-spacing:-.02em}
.f span{font-family:'Geist Mono',monospace;font-size:13px;color:#F76D01}
.src{position:absolute;left:388px;right:56px;bottom:110px;font-size:14px;color:rgba(11,10,16,.5);line-height:1.4}
"""
    body2 = f'''<div class="band"><div class="k mono">Brand 01</div><div class="brand">Zara</div><div class="yr mono">Try-On · from Dec 2025</div></div>
<div class="main"><div class="lock">{logo()}<div><b>Persona AI</b><small class="mono">By Autommerce</small></div></div>
<div class="count mono"><b>02</b> / {N:02d}</div>
<h1>An avatar, from two&nbsp;photos.</h1>
<div class="p">Face and full body. The avatar walks. Zara tells the shopper the image is generated, and may not match real&nbsp;life.</div>
<div class="facts">
<div class="f"><b>Face + body capture</b><span class="mono">INPUT</span></div>
<div class="f"><b>Walking avatar</b><span class="mono">OUTPUT</span></div>
<div class="f"><b>Disclosure on every try</b><span class="mono">TRUST</span></div>
</div>
<div class="src mono">Zara Try-On, rolling out from December 2025</div></div>{foot(1, N)}'''
    out['week-3/P10-tryon-mainstream/slide_02'] = doc(body2, css2)

    # 03 Zalando — paper + orange
    css3 = """
.top{position:absolute;left:0;right:0;top:0;height:220px;background:#F76D01;padding:48px 64px 0;color:#0B0A10}
.lock{display:flex;align-items:center;gap:12px}
.lock b{font-size:22px;font-weight:800}
.lock small{display:block;font-size:11px;opacity:.65;margin-top:2px}
.count{position:absolute;right:64px;top:52px;font-size:16px}
.count b{font-weight:700}
.brand{margin-top:28px;font-size:18px;font-weight:700;letter-spacing:.04em}
.main{position:absolute;left:0;right:0;top:220px;bottom:0;padding:40px 64px 0;background:#F8F6F3}
h1{font-size:58px;width:920px}
.p{margin-top:18px;font-size:26px;line-height:1.3;width:880px;color:#3B3742}
.stats{margin-top:32px;display:grid;grid-template-columns:1fr 1fr;gap:14px}
.s{background:#fff;border:1px solid rgba(11,10,16,.1);border-radius:18px;padding:28px 28px 24px}
.s b{display:block;font-size:72px;letter-spacing:-.06em;line-height:.9;color:#F76D01}
.s span{display:block;margin-top:14px;font-size:22px;font-weight:650;letter-spacing:-.02em}
.s em{display:block;margin-top:8px;font-style:normal;font-size:16px;color:#3B3742;line-height:1.3}
.src{position:absolute;left:64px;right:64px;bottom:110px;font-size:14px;color:rgba(11,10,16,.5);line-height:1.4}
"""
    body3 = f'''<div class="top"><div class="lock">{logo(True)}<div><b>Persona AI</b><small class="mono">By Autommerce</small></div></div>
<div class="count mono"><b>03</b> / {N:02d}</div>
<div class="brand mono">02 · Zalando</div></div>
<div class="main"><h1>Fit, measured in&nbsp;returns.</h1>
<div class="p">Pilots of the virtual fitting room cut return rates by up to 40% in jeans. The rollout to all customers is the 2026&nbsp;plan.</div>
<div class="stats">
<div class="s"><b>40%</b><span>Fewer returns in jeans</span><em>Virtual fitting room pilot</em></div>
<div class="s"><b>8%</b><span>Size returns prevented</span><em>Size tools, 2025 baseline</em></div>
</div>
<div class="src mono">Zalando, 2026. Size tools prevented 8% of size-related returns in 2025.</div></div>{foot(2, N)}'''
    out['week-3/P10-tryon-mainstream/slide_03'] = doc(body3, css3)

    # 04 ASOS — purple stripe
    css4 = """
.stripe{position:absolute;left:0;right:0;top:0;height:18px;background:#400095}
.accent{position:absolute;left:0;top:18px;bottom:0;width:18px;background:#400095}
.wrap{padding:56px 64px 0 72px}
.lock{display:flex;align-items:center;gap:12px}
.lock b{font-size:22px;font-weight:800}
.lock small{display:block;font-size:11px;opacity:.55;margin-top:2px}
.count{position:absolute;right:64px;top:56px;font-size:16px}
.count b{color:#400095;font-weight:500}
.k{margin-top:36px;color:#400095;font-size:15px}
h1{margin-top:12px;font-size:58px;width:900px}
.p{margin-top:18px;font-size:26px;line-height:1.3;width:880px;color:#3B3742}
.grid{margin-top:32px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
.g{background:#fff;border:1px solid rgba(64,0,149,.18);border-radius:16px;padding:24px 20px;min-height:200px}
.g small{color:#400095;font-size:13px}
.g b{display:block;margin-top:16px;font-size:36px;letter-spacing:-.04em;line-height:1}
.g span{display:block;margin-top:12px;font-size:17px;color:#3B3742;line-height:1.3}
.src{position:absolute;left:72px;right:64px;bottom:110px;font-size:14px;color:rgba(11,10,16,.5);line-height:1.4}
"""
    body4 = f'''<div class="stripe"></div><div class="accent"></div>
<div class="wrap"><div class="lock">{logo()}<div><b>Persona AI</b><small class="mono">By Autommerce</small></div></div>
<div class="count mono"><b>04</b> / {N:02d}</div>
<div class="k mono">03 · ASOS</div>
<h1>Your photo, or a&nbsp;likeness.</h1>
<div class="p">About 10,000 products on the iOS app. Own photo or an AI likeness. Each try-on loads in 4 to 7&nbsp;seconds.</div>
<div class="grid">
<div class="g"><small class="mono">CATALOG</small><b>10k</b><span>Products live on iOS</span></div>
<div class="g"><small class="mono">SPEED</small><b>4–7s</b><span>Per try-on load</span></div>
<div class="g"><small class="mono">MODE</small><b>2</b><span>Own photo or AI likeness</span></div>
</div>
<div class="src mono">ASOS, 17 February 2026, with AIUTA. Select UK and US customers.</div></div>{foot(3, N)}'''
    out['week-3/P10-tryon-mainstream/slide_04'] = doc(body4, css4)

    # 05 your store
    css5 = """
.wrap{padding:48px 64px 0}
.lock{display:flex;align-items:center;gap:12px}
.lock b{font-size:24px;font-weight:800}
.lock small{display:block;font-size:11px;opacity:.55;margin-top:2px}
.count{position:absolute;right:64px;top:56px;font-size:16px}
.count b{color:#F76D01;font-weight:500}
.k{margin-top:40px;color:#F76D01;font-size:15px}
h1{margin-top:12px;font-size:64px;width:920px}
.p{margin-top:18px;font-size:26px;line-height:1.3;width:880px;color:#3B3742}
.list{margin-top:36px;display:flex;flex-direction:column;gap:12px}
.row{display:grid;grid-template-columns:64px 1fr;gap:18px;align-items:center;background:#fff;border:1px solid rgba(11,10,16,.1);border-radius:16px;padding:22px 26px}
.row .n{width:48px;height:48px;border-radius:50%;background:#F76D01;color:#0B0A10;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px}
.row b{font-size:28px;letter-spacing:-.03em}
.row span{display:block;margin-top:4px;font-size:18px;color:#3B3742}
"""
    body5 = f'''<div class="wrap"><div class="lock">{logo()}<div><b>Persona AI</b><small class="mono">By Autommerce</small></div></div>
<div class="count mono"><b>05</b> / {N:02d}</div>
<div class="k mono">Your store</div>
<h1>You do not need their&nbsp;team.</h1>
<div class="p">Persona is the fitting room and the stylist, inside your store. One script tag. Your cart. Only what you&nbsp;stock.</div>
<div class="list">
<div class="row"><div class="n">01</div><div><b>One script tag</b><span>Live on your product pages</span></div></div>
<div class="row"><div class="n">02</div><div><b>Your cart</b><span>Checkout and customer stay yours</span></div></div>
<div class="row"><div class="n">03</div><div><b>Only what you stock</b><span>No competitor SKUs, ever</span></div></div>
</div></div>{foot(4, N)}'''
    out['week-3/P10-tryon-mainstream/slide_05'] = doc(body5, css5)
    return out


# ---------------------------------------------------------------- P11 size
def p11():
    css = """
.wrap{padding:48px 56px 0}
.lock{display:flex;align-items:center;gap:12px}
.lock b{font-size:22px;font-weight:800}
.lock small{display:block;font-size:11px;opacity:.55;margin-top:2px}
h1{margin-top:28px;font-size:52px;width:960px}
.layout{margin-top:28px;display:grid;grid-template-columns:340px 1fr;gap:18px}
.ring-card{background:#0B0A10;color:#fff;border-radius:22px;padding:28px 24px 24px;display:flex;flex-direction:column;align-items:center}
.ring-card small{align-self:flex-start;color:#F76D01;font-size:13px}
.ring{margin-top:28px;width:220px;height:220px;border-radius:50%;background:
  conic-gradient(#F76D01 0 92%, rgba(255,255,255,.12) 92% 100%);
  display:flex;align-items:center;justify-content:center;position:relative}
.ring:after{content:'';position:absolute;inset:18px;border-radius:50%;background:#0B0A10}
.ring .val{position:relative;z-index:1;text-align:center}
.ring .val b{display:block;font-size:64px;letter-spacing:-.06em;line-height:.9}
.ring .val span{display:block;margin-top:6px;font-size:13px;color:rgba(255,255,255,.55)}
.fit{margin-top:28px;text-align:center;font-size:22px;font-weight:650;letter-spacing:-.02em}
.fit em{font-style:normal;color:#F76D01}
.right{display:flex;flex-direction:column;gap:14px}
.measures{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.m{background:#fff;border:1px solid rgba(11,10,16,.1);border-radius:16px;padding:18px 18px 16px}
.m small{color:#F76D01;font-size:12px}
.m b{display:block;margin-top:8px;font-size:28px;letter-spacing:-.03em}
.m span{display:block;margin-top:4px;font-size:15px;color:#3B3742}
.chart{background:#fff;border:1px solid rgba(11,10,16,.1);border-radius:16px;padding:18px 20px 14px;flex:1}
.chart .lab{font-size:13px;color:rgba(11,10,16,.5);margin-bottom:8px}
.crow{display:grid;grid-template-columns:70px 1fr 56px 70px;align-items:center;gap:10px;padding:11px 0;border-top:1px solid rgba(11,10,16,.08);font-size:18px}
.crow:first-of-type{border-top:0}
.crow b{font-weight:650;letter-spacing:-.02em}
.crow .bar{height:10px;border-radius:5px;background:rgba(11,10,16,.08);overflow:hidden}
.crow .bar i{display:block;height:100%;background:#F76D01;border-radius:5px}
.crow .pick{font-family:'Geist Mono',monospace;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#F76D01;font-weight:700}
.crow .mute{font-family:'Geist Mono',monospace;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:rgba(11,10,16,.35)}
.note{position:absolute;left:56px;right:56px;bottom:48px;font-size:22px;font-weight:600;letter-spacing:-.02em;line-height:1.35}
"""
    crow = ''
    for size, w, pick in [('S', 35, False), ('M', 62, False), ('L', 88, True), ('XL', 55, False)]:
        label = '<span class="pick">Best</span>' if pick else '<span class="mute">—</span>'
        crow += f'<div class="crow"><b>{size}</b><div class="bar"><i style="width:{w}%"></i></div><span>{w}%</span>{label}</div>'
    body = f'''<div class="wrap"><div class="lock">{logo()}<div><b>Persona AI</b><small class="mono">By Autommerce</small></div></div>
<h1>The wrong size is the return you could have&nbsp;prevented.</h1>
<div class="layout">
<div class="ring-card"><small class="mono">Fit score</small>
<div class="ring"><div class="val"><b>92</b><span class="mono">/ 100</span></div></div>
<div class="fit">Suggested size <em>L</em></div></div>
<div class="right">
<div class="measures">
<div class="m"><small class="mono">01 · Height</small><b>178 cm</b><span>Shopper profile</span></div>
<div class="m"><small class="mono">02 · Chest</small><b>102 cm</b><span>Against your chart</span></div>
<div class="m"><small class="mono">03 · Waist</small><b>86 cm</b><span>Against your chart</span></div>
<div class="m"><small class="mono">04 · Shoe</small><b>43 EU</b><span>Brand size map</span></div>
</div>
<div class="chart"><div class="lab mono">Size chart match · this SKU</div>{crow}</div>
</div></div></div>
<div class="note">The suggestion uses their measurements and your size&nbsp;charts.</div>'''
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
    base_css = """
.wrap{padding:48px 64px 0}
.lock{display:flex;align-items:center;gap:12px}
.lock b{font-size:22px;font-weight:800}
.lock small{display:block;font-size:11px;opacity:.55;margin-top:3px}
.count{position:absolute;right:64px;top:56px;font-size:16px}
.count b{color:#F76D01;font-weight:500}
.idx{margin-top:36px;font-size:15px;color:#F76D01}
h1{margin-top:12px;font-size:58px;width:920px}
.p{margin-top:18px;font-size:26px;line-height:1.3;letter-spacing:-.02em;width:880px;color:#3B3742}
"""
    # Slide 1 — three metric cards + day strip
    s1 = base_css + """
.metrics{margin-top:36px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
.m{background:#fff;border:1px solid rgba(11,10,16,.1);border-radius:18px;padding:22px 20px 20px}
.m small{font-size:13px;color:#F76D01}
.m b{display:block;margin-top:14px;font-size:36px;letter-spacing:-.04em;line-height:1}
.m span{display:block;margin-top:10px;font-size:15px;color:#3B3742;line-height:1.3}
.days{margin-top:22px;display:grid;grid-template-columns:repeat(7,1fr);gap:8px}
.d{height:88px;border-radius:14px;background:rgba(11,10,16,.05);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px}
.d b{font-family:'Geist Mono',monospace;font-size:13px;font-weight:500;color:rgba(11,10,16,.45)}
.d i{font-style:normal;font-size:18px;font-weight:700;letter-spacing:-.02em}
.d.on{background:#F76D01;color:#0B0A10}
.d.on b{color:rgba(11,10,16,.7)}
.cap{margin-top:14px;font-size:15px;color:rgba(11,10,16,.5)}
"""
    days = ''.join(
        f'<div class="d {"on" if d=="Fri" else ""}"><b>{d}</b><i>{n}</i></div>'
        for d, n in [('Mon','24'),('Tue','25'),('Wed','26'),('Thu','27'),('Fri','28'),('Sat','29'),('Sun','30')])
    body1 = f'''<div class="wrap"><div class="lock">{logo()}<div><b>Abbas Zein</b><small class="mono">Founder notes</small></div></div>
<div class="count mono"><b>01</b> / {N:02d}</div>
<div class="idx mono">Tomorrow</div>
<h1>Watch three numbers. Next to&nbsp;revenue.</h1>
<div class="p">White Friday revenue is a loud number. These three tell you whether it was any&nbsp;good.</div>
<div class="metrics">
<div class="m"><small class="mono">01 · Conversion</small><b>The fifty</b><span>Pages you are spending on</span></div>
<div class="m"><small class="mono">02 · Stock</small><b>By noon</b><span>Out of stock before Monday</span></div>
<div class="m"><small class="mono">03 · The drop</small><b>Cart → order</b><span>Added, never checked out</span></div>
</div>
<div class="days">{days}</div>
<div class="cap mono">White Friday week · read the day, not the week</div></div>{foot(0, N)}'''

    # Slide 2 — conversion bars
    s2 = base_css + """
.panel{margin-top:28px;background:#fff;border:1px solid rgba(11,10,16,.1);border-radius:20px;padding:28px 32px 24px}
.panel .lab{font-size:14px;color:rgba(11,10,16,.5)}
.bars{margin-top:18px}
.bar{display:grid;grid-template-columns:160px 1fr 70px;align-items:center;gap:16px;padding:12px 0;border-top:1px solid rgba(11,10,16,.08)}
.bar:first-child{border-top:0}
.bar b{font-size:20px;letter-spacing:-.02em}
.track{height:16px;border-radius:8px;background:rgba(11,10,16,.08);overflow:hidden}
.fill{height:100%;border-radius:8px;background:#F76D01}
.fill.warn{background:#C40000}
.bar em{font-style:normal;font-family:'Geist Mono',monospace;font-size:16px;text-align:right}
.call{margin-top:18px;padding:18px 22px;border-radius:14px;background:#0B0A10;color:#fff;font-size:22px;font-weight:650;letter-spacing:-.02em}
.call span{color:#F76D01}
"""
    bars = [
        ('Hero coat', 72, False),
        ('Boot edit', 58, False),
        ('Gift set', 41, False),
        ('Lookbook #3', 19, True),
    ]
    bar_html = ''
    for name, pct, warn in bars:
        bar_html += f'<div class="bar"><b>{name}</b><div class="track"><div class="fill {"warn" if warn else ""}" style="width:{pct}%"></div></div><em>{pct}%</em></div>'
    body2 = f'''<div class="wrap"><div class="lock">{logo()}<div><b>Abbas Zein</b><small class="mono">Founder notes</small></div></div>
<div class="count mono"><b>02</b> / {N:02d}</div>
<div class="idx mono">01 · Conversion</div>
<h1>The fifty you are&nbsp;pushing.</h1>
<div class="p">Site-wide conversion hides a hero product that is leaking. Read the pages you are spending&nbsp;on.</div>
<div class="panel"><div class="lab mono">Paid traffic · conversion by product page</div><div class="bars">{bar_html}</div>
<div class="call">Lookbook #3 is <span>leaking.</span> Fix the page before you spend more.</div></div></div>{foot(1, N)}'''

    # Slide 3 — stock timeline
    s3 = base_css + """
.timeline{margin-top:28px;display:grid;grid-template-columns:1fr 1fr;gap:14px}
.slot{background:#fff;border:1px solid rgba(11,10,16,.1);border-radius:18px;padding:22px 24px}
.slot small{font-size:13px;color:rgba(11,10,16,.45)}
.slot b{display:block;margin-top:10px;font-size:42px;letter-spacing:-.045em}
.slot span{display:block;margin-top:8px;font-size:18px;color:#3B3742;line-height:1.3}
.slot.bad{background:#C40000;color:#fff;border:0}
.slot.bad small{color:rgba(255,255,255,.7)}
.slot.bad span{color:rgba(255,255,255,.85)}
.clock{margin-top:16px;background:#0B0A10;color:#fff;border-radius:18px;padding:26px 28px;display:flex;justify-content:space-between;align-items:center}
.clock b{font-size:56px;letter-spacing:-.05em;color:#F76D01}
.clock p{font-size:22px;font-weight:650;letter-spacing:-.02em;width:520px;line-height:1.25}
"""
    body3 = f'''<div class="wrap"><div class="lock">{logo()}<div><b>Abbas Zein</b><small class="mono">Founder notes</small></div></div>
<div class="count mono"><b>03</b> / {N:02d}</div>
<div class="idx mono">02 · Stock</div>
<h1>Out of stock by&nbsp;noon.</h1>
<div class="p">An ad for a product you no longer have is a tax. Check the fifty at midday, not on&nbsp;Monday.</div>
<div class="timeline">
<div class="slot"><small class="mono">09:00</small><b>50</b><span>Hero SKUs in stock</span></div>
<div class="slot"><small class="mono">10:30</small><b>47</b><span>Three sizes gone</span></div>
<div class="slot bad"><small class="mono">12:00</small><b>41</b><span>Nine still in the ad set</span></div>
<div class="slot"><small class="mono">Monday</small><b>Too late</b><span>The spend already ran</span></div>
</div>
<div class="clock"><b>12:00</b><p>Midday check. Pause what you cannot&nbsp;fulfil.</p></div></div>{foot(2, N)}'''

    # Slide 4 — funnel drop chart
    s4 = base_css + """
.funnel{margin-top:28px;display:flex;flex-direction:column;gap:12px}
.step{border-radius:16px;padding:22px 28px;display:flex;justify-content:space-between;align-items:center;color:#fff}
.step b{font-size:28px;letter-spacing:-.03em}
.step em{font-style:normal;font-family:'Geist Mono',monospace;font-size:22px}
.s1{background:#400095;width:100%}
.s2{background:#6B358D;width:86%;margin-left:0}
.s3{background:#F76D01;color:#0B0A10;width:64%}
.s4{background:#C40000;width:38%}
.gap{margin-top:20px;padding:22px 26px;border-radius:16px;border:2px solid #C40000;background:rgba(196,0,0,.06)}
.gap b{display:block;font-size:28px;letter-spacing:-.03em;color:#C40000}
.gap span{display:block;margin-top:8px;font-size:20px;color:#3B3742;line-height:1.3}
"""
    body4 = f'''<div class="wrap"><div class="lock">{logo()}<div><b>Abbas Zein</b><small class="mono">Founder notes</small></div></div>
<div class="count mono"><b>04</b> / {N:02d}</div>
<div class="idx mono">03 · The drop</div>
<h1>Added to cart. Never&nbsp;ordered.</h1>
<div class="p">That gap is the page, the delivery promise, or the price at checkout. It is visible on the&nbsp;day.</div>
<div class="funnel">
<div class="step s1"><b>Product views</b><em>100</em></div>
<div class="step s2"><b>Add to cart</b><em>64</em></div>
<div class="step s3"><b>Checkout started</b><em>41</em></div>
<div class="step s4"><b>Ordered</b><em>28</em></div>
</div>
<div class="gap"><b>36 carts never became orders.</b><span>Find the break before you scale the spend.</span></div></div>{foot(3, N)}'''

    return {
        'week-4/A14-three-numbers/slide_01': doc(body1, s1),
        'week-4/A14-three-numbers/slide_02': doc(body2, s2),
        'week-4/A14-three-numbers/slide_03': doc(body3, s3),
        'week-4/A14-three-numbers/slide_04': doc(body4, s4),
    }


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
.wrap{padding:48px 56px 0}
.lock{display:flex;align-items:center;gap:14px;font-weight:800;font-size:26px}
h1{margin-top:22px;font-size:58px;width:960px}
.grid{margin-top:28px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
.cell{height:268px;border-radius:22px;overflow:hidden;position:relative;background:#E8E4DE}
.cell img{width:100%;height:100%;object-fit:cover;display:block}
.cell .lab{position:absolute;left:16px;bottom:16px;right:16px;font-size:22px;font-weight:700;letter-spacing:-.02em;color:#fff;text-shadow:0 2px 12px rgba(0,0,0,.55)}
.cell.on{background:#0B0A10}
.cell.on .lab{color:#fff}
.cell.on .lab span{display:block;color:#F76D01;font-family:'Geist Mono',monospace;font-size:13px;letter-spacing:.14em;font-weight:500;margin-bottom:6px;text-shadow:none}
.note{position:absolute;left:56px;right:56px;bottom:48px;font-size:22px;color:#3B3742;letter-spacing:-.015em}
"""
    # tonal crops of the same product photo to suggest a gallery set
    cells = [
        ('on', None, '<span>YOU HAVE</span>1 packshot'),
        ('', f'{ROOT}/../week-2/assets/xm5.jpg', 'Front'),
        ('', f'{ROOT}/../week-2/assets/xm5.jpg', 'Detail'),
        ('', f'{ROOT}/../week-2/assets/xm5.jpg', 'Scale'),
        ('', f'{ROOT}/../week-2/assets/xm5.jpg', 'In use'),
        ('', f'{ROOT}/../week-2/assets/xm5.jpg', 'Lifestyle'),
    ]
    # use relative paths from week-4/M17-gallery/poster.html
    xm = '../../week-2/assets/xm5.jpg'
    html_cells = []
    for i, (cls, _, lab) in enumerate(cells):
        if cls == 'on':
            html_cells.append(f'<div class="cell on"><div class="lab">{lab}</div></div>')
        else:
            pos = ['center 20%', '30% 40%', '70% 30%', 'center 80%', 'center 50%'][i - 1]
            html_cells.append(
                f'<div class="cell"><img src="{xm}" style="object-position:{pos}"><div class="lab">{lab}</div></div>')
    body = f'''<div class="wrap"><div class="lock">{logo()} Autommerce</div>
<h1>One photo in. A gallery&nbsp;out.</h1>
<div class="grid">{''.join(html_cells)}</div></div>
<div class="note">Products Gallery finds more images of the exact same item, then exports the&nbsp;set.</div>'''
    return {'week-4/M17-gallery/poster': doc(body, css, '#F1EEE8')}


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
.wrap{padding:48px 56px 0}
.lock{display:flex;align-items:center;gap:12px}
.lock b{font-size:22px;font-weight:800}
.lock small{display:block;font-size:11px;opacity:.55;margin-top:2px}
h1{margin-top:28px;font-size:52px;width:960px}
.flow{margin-top:28px;display:grid;grid-template-columns:1fr 48px 1fr;gap:0;align-items:stretch}
.bubble{background:#fff;border:1px solid rgba(11,10,16,.1);border-radius:22px;padding:26px 28px}
.bubble small{color:#F76D01;font-size:13px}
.bubble p{margin-top:12px;font-size:28px;font-weight:650;letter-spacing:-.03em;line-height:1.25}
.arrow{display:flex;align-items:center;justify-content:center;font-size:28px;color:#F76D01;font-weight:800}
.steps{margin-top:18px;display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.st{background:#fff;border:1px solid rgba(11,10,16,.1);border-radius:16px;padding:20px 18px}
.st small{color:#F76D01;font-size:12px}
.st b{display:block;margin-top:10px;font-size:24px;letter-spacing:-.03em}
.st span{display:block;margin-top:6px;font-size:15px;color:#3B3742;line-height:1.3}
.cart{margin-top:18px;background:#0B0A10;color:#fff;border-radius:20px;padding:26px 28px}
.cart-h{display:flex;justify-content:space-between;align-items:center}
.cart-h small{color:#F76D01;font-size:13px}
.cart-h em{font-style:normal;font-family:'Geist Mono',monospace;font-size:13px;color:rgba(255,255,255,.55)}
.item{display:grid;grid-template-columns:1fr 100px 90px;align-items:center;padding:16px 0;border-top:1px solid rgba(255,255,255,.12);font-size:22px;font-weight:600;letter-spacing:-.02em}
.item:first-of-type{margin-top:8px}
.item em{font-style:normal;color:rgba(255,255,255,.6);font-weight:500;font-size:16px}
.item .ok{color:#F76D01;font-family:'Geist Mono',monospace;font-size:13px;letter-spacing:.1em}
.total{display:flex;justify-content:space-between;align-items:center;padding-top:16px;border-top:1px solid rgba(255,255,255,.2);margin-top:4px}
.total b{font-size:28px;letter-spacing:-.03em}
.total span{padding:12px 18px;border-radius:999px;background:#F76D01;color:#0B0A10;font-weight:700;font-size:16px}
.note{position:absolute;left:56px;right:56px;bottom:44px;font-size:17px;color:rgba(11,10,16,.55)}
"""
    body = f'''<div class="wrap"><div class="lock">{logo()}<div><b>Persona AI</b><small class="mono">By Autommerce</small></div></div>
<h1>From the sentence to your&nbsp;cart.</h1>
<div class="flow">
<div class="bubble"><small class="mono">The shopper</small><p>"An outfit for a wedding, under $300."</p></div>
<div class="arrow">→</div>
<div class="bubble"><small class="mono">Persona</small><p>Reads the ask. Pulls only what you&nbsp;stock.</p></div>
</div>
<div class="steps">
<div class="st"><small class="mono">01</small><b>Parse intent</b><span>Occasion + budget</span></div>
<div class="st"><small class="mono">02</small><b>Match stock</b><span>Blazer, shirt, shoes</span></div>
<div class="st"><small class="mono">03</small><b>Add to cart</b><span>One tap checkout</span></div>
</div>
<div class="cart"><div class="cart-h"><small class="mono">Your store · cart</small><em>3 items · under $300</em></div>
<div class="item"><span>Wool blazer</span><em>$148</em><span class="ok">IN STOCK</span></div>
<div class="item"><span>Oxford shirt</span><em>$68</em><span class="ok">IN STOCK</span></div>
<div class="item"><span>Leather loafers</span><em>$79</em><span class="ok">IN STOCK</span></div>
<div class="total"><b>$295</b><span>Checkout</span></div></div></div>
<div class="note mono">Checkout, payment and the customer stay yours.</div>'''
    return {'week-4/P13-to-cart/poster': doc(body, css)}


# ---------------------------------------------------------------- P14 metrics
def p14():
    css = """
.wrap{padding:48px 56px 0}
.lock{display:flex;align-items:center;gap:12px}
.lock b{font-size:22px;font-weight:800}
.lock small{display:block;font-size:11px;opacity:.55;margin-top:2px}
.chip{position:absolute;right:56px;top:52px;padding:10px 14px;border-radius:999px;background:#400095;color:#fff;font-size:13px}
h1{margin-top:28px;font-size:52px;width:900px}
.hero{margin-top:24px;background:#0B0A10;color:#fff;border-radius:20px;padding:28px 32px;display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:center}
.hero small{color:#F76D01;font-size:13px}
.hero b{display:block;margin-top:8px;font-size:72px;letter-spacing:-.06em;line-height:.9}
.hero span{display:block;margin-top:10px;font-size:18px;color:rgba(255,255,255,.7)}
.spark{display:flex;align-items:flex-end;gap:8px;height:100px;padding-bottom:8px}
.spark i{flex:1;border-radius:6px 6px 0 0;background:#F76D01;display:block}
.grid{margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:12px}
.card{background:#fff;border:1px solid rgba(11,10,16,.1);border-radius:16px;padding:22px 22px 18px}
.card small{color:#400095;font-size:12px}
.card b{display:block;margin-top:10px;font-size:40px;letter-spacing:-.045em;line-height:.95}
.card span{display:block;margin-top:8px;font-size:16px;color:#3B3742}
.card .up{color:#F76D01;font-family:'Geist Mono',monospace;font-size:13px;margin-top:10px}
.note{position:absolute;left:56px;right:56px;bottom:44px;font-size:17px;color:rgba(11,10,16,.55)}
"""
    bars = ''.join(f'<i style="height:{h}%"></i>' for h in [35, 48, 42, 60, 55, 72, 68, 88, 80, 95])
    body = f'''<div class="wrap"><div class="lock">{logo()}<div><b>Persona AI</b><small class="mono">By Autommerce</small></div></div>
<div class="chip mono">Dashboard</div>
<h1>The sales the fitting room&nbsp;drove.</h1>
<div class="hero"><div><small class="mono">01 · Persona sales</small><b>$48.2k</b><span>Attributed this week</span></div>
<div class="spark">{bars}</div></div>
<div class="grid">
<div class="card"><small class="mono">02 · Orders</small><b>312</b><span>Through Persona</span><div class="up">↑ 18% vs last week</div></div>
<div class="card"><small class="mono">03 · Conversion</small><b>4.8%</b><span>Try-on sessions → buy</span><div class="up">↑ 0.6 pts</div></div>
<div class="card"><small class="mono">04 · AOV</small><b>$154</b><span>Average order value</span><div class="up">↑ $12</div></div>
<div class="card"><small class="mono">05 · Returns</small><b>9.1%</b><span>Below store average</span><div class="up">↓ 3.4 pts</div></div>
</div></div>
<div class="note mono">Five numbers, next to revenue. Turn tracking on before Friday.</div>'''
    return {'week-4/P14-dashboard/poster': doc(body, css, '#F4F0F6')}


# ---------------------------------------------------------------- P15 manifesto
def p15():
    css = """
.rail{position:absolute;left:0;top:0;bottom:0;width:18px;background:linear-gradient(180deg,#F76D01,#C40000 45%,#400095)}
.top{position:absolute;left:56px;right:56px;top:48px;display:flex;justify-content:space-between;align-items:center}
.lock{display:flex;align-items:center;gap:12px;font-weight:800;font-size:22px}
.lock small{display:block;font-size:11px;font-weight:500;opacity:.55;margin-top:2px}
.mark{font-size:14px;color:#F76D01}
h1{position:absolute;left:56px;top:220px;font-size:92px;width:960px;line-height:.94}
.grad{background:linear-gradient(100deg,#F76D01,#C40000 50%,#6B358D);-webkit-background-clip:text;background-clip:text;color:transparent;padding-right:.08em}
.pillars{position:absolute;left:56px;right:56px;top:720px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
.p{background:#fff;border:1px solid rgba(11,10,16,.1);border-radius:16px;padding:22px 20px}
.p small{color:#F76D01;font-size:12px}
.p b{display:block;margin-top:10px;font-size:24px;letter-spacing:-.03em}
.p span{display:block;margin-top:8px;font-size:16px;color:#3B3742;line-height:1.3}
.sub{position:absolute;left:56px;right:56px;bottom:48px;display:flex;justify-content:space-between;align-items:flex-end}
.sub p{font-size:24px;width:640px;line-height:1.35;letter-spacing:-.02em;color:#3B3742}
.sub .url{font-size:15px;color:#F76D01}
"""
    body = f'''<div class="rail"></div>
<div class="top"><div class="lock">{logo()}<div><b>Persona AI</b><small class="mono">By Autommerce</small></div></div>
<div class="mark mono">Manifesto</div></div>
<h1>Every shopper deserves a&nbsp;<span class="grad">stylist.</span></h1>
<div class="pillars">
<div class="p"><small class="mono">01</small><b>Your stock only</b><span>Never a competitor SKU</span></div>
<div class="p"><small class="mono">02</small><b>Your cart</b><span>Checkout stays on your store</span></div>
<div class="p"><small class="mono">03</small><b>Your brand</b><span>Live mirror + size + outfit</span></div>
</div>
<div class="sub"><p>One that only sells what you stock, and checks out in your&nbsp;cart.</p>
<div class="url mono">persona.autommerce.com</div></div>'''
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
