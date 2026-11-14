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
.wrap{padding:48px 56px 0 72px}
.lock{display:flex;align-items:center;gap:12px}
.lock b{font-size:22px;font-weight:800}
.lock small{display:block;font-size:11px;opacity:.55;margin-top:3px}
.head{margin-top:28px;display:flex;justify-content:space-between;align-items:flex-end;gap:24px}
h1{font-size:88px;letter-spacing:-.06em;line-height:.88;color:#C40000}
.stat{text-align:right}
.stat b{display:block;font-size:64px;letter-spacing:-.05em;line-height:.9}
.stat span{display:block;margin-top:6px;font-size:14px;color:rgba(11,10,16,.5)}
.sub{margin-top:18px;font-size:24px;line-height:1.3;letter-spacing:-.02em;width:920px;color:#3B3742}
.tbl{margin-top:24px;background:#fff;border:1px solid rgba(11,10,16,.1);border-radius:18px;overflow:hidden}
.th{display:grid;grid-template-columns:72px 1fr 160px 140px;padding:16px 28px;background:rgba(11,10,16,.04);font-size:13px;color:rgba(11,10,16,.5)}
.row{display:grid;grid-template-columns:72px 1fr 160px 140px;align-items:center;padding:0 28px;height:92px;border-top:1px solid rgba(11,10,16,.08);font-size:26px}
.row b{font-weight:650;letter-spacing:-.02em}
.row .sku{font-family:'Geist Mono',monospace;font-size:15px;letter-spacing:.06em;color:rgba(11,10,16,.45)}
.miss-row{background:rgba(196,0,0,.07)}
.miss-row b{color:#C40000}
.ok{font-family:'Geist Mono',monospace;font-size:14px;letter-spacing:.12em;text-transform:uppercase;color:rgba(11,10,16,.4)}
.miss{font-family:'Geist Mono',monospace;font-size:14px;letter-spacing:.12em;text-transform:uppercase;color:#C40000;font-weight:700}
.idx{font-family:'Geist Mono',monospace;font-size:15px;color:rgba(11,10,16,.4)}
.miss-row .idx{color:#C40000}
.summary{margin-top:18px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
.s{background:#fff;border:1px solid rgba(11,10,16,.1);border-radius:14px;padding:18px 20px}
.s.bad{background:#C40000;color:#fff;border:0}
.s small{font-size:12px;opacity:.55}
.s.bad small{opacity:.75}
.s b{display:block;margin-top:8px;font-size:28px;letter-spacing:-.03em}
.note{position:absolute;left:72px;right:56px;bottom:44px;display:flex;justify-content:space-between;align-items:center;font-size:14px;color:rgba(11,10,16,.5)}
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
<div class="tbl"><div class="th mono"><span>#</span><span>Product</span><span>SKU</span><span>Status</span></div>{html_rows}</div>
<div class="summary">
<div class="s"><small class="mono">Matched</small><b>5 products</b></div>
<div class="s bad"><small class="mono">Not found</small><b>Dyson V15</b></div>
<div class="s"><small class="mono">Action</small><b>Leave empty</b></div>
</div></div>
<div class="note"><span class="mono">Catalog Intelligence run · sixth left empty on purpose</span><span class="pill mono">Refuse the guess</span></div>'''
    return {'week-3/A10-not-found/poster': doc(body, css)}


# ---------------------------------------------------------------- M9 hours
def m9():
    css = """
.wrap{padding:48px 56px 0}
.lock{display:flex;align-items:center;gap:14px;font-weight:800;font-size:24px;letter-spacing:-.03em}
.chip{margin-left:auto;padding:10px 14px;border:1.5px solid rgba(11,10,16,.2);font-size:12px;letter-spacing:.16em;background:#fff}
.head{margin-top:28px;display:grid;grid-template-columns:1.15fr .85fr;gap:28px;align-items:end}
h1{font-size:52px;width:auto}
.math{background:#fff;border:1.5px solid rgba(11,10,16,.1);padding:22px 24px}
.math small{display:block;font-size:12px;color:#F76D01;margin-bottom:10px}
.math .line{font-size:26px;font-weight:700;letter-spacing:-.03em;line-height:1.35}
.math .line em{font-style:normal;color:#F76D01}
.math .eq{margin-top:14px;padding-top:14px;border-top:1.5px solid rgba(11,10,16,.1);font-size:42px;font-weight:800;letter-spacing:-.05em;line-height:1}
.math .eq span{color:#F76D01}
.marks{margin-top:22px}
.marks .lab{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px}
.marks .lab b{font-size:15px;letter-spacing:.14em}
.marks .lab span{font-size:14px;color:rgba(11,10,16,.55)}
.grid{display:grid;grid-template-columns:repeat(25,1fr);gap:4px}
.grid i{display:block;height:14px;background:#F76D01;opacity:.88}
.grid i:nth-child(5n){opacity:1;background:#C40000}
.table{margin-top:22px;background:#fff;border:1.5px solid rgba(11,10,16,.1)}
.table .th,.table .tr{display:grid;grid-template-columns:72px 1.4fr .9fr .7fr;gap:12px;padding:14px 18px;align-items:center}
.table .th{background:#0B0A10;color:#F8F6F3;font-size:12px;letter-spacing:.14em}
.table .tr{border-top:1px solid rgba(11,10,16,.08);font-size:22px;font-weight:650;letter-spacing:-.02em}
.table .tr span{font-family:'Geist Mono',monospace;font-size:15px;letter-spacing:.04em;color:#F76D01;font-weight:500}
.table .tr em{font-style:normal;color:rgba(11,10,16,.5);font-weight:500;font-size:18px}
.footn{margin-top:20px;display:flex;justify-content:space-between;align-items:center;padding:18px 20px;background:#F76D01;color:#0B0A10}
.footn b{font-size:24px;letter-spacing:-.02em}
.footn span{font-size:14px;letter-spacing:.12em}
"""
    marks = ''.join('<i></i>' for _ in range(500))
    rows = [
        ('01', 'Titles', '4 min each', '33h'),
        ('02', 'Descriptions', 'longer still', '\u2014'),
        ('03', 'Specs + FAQs', 'per SKU', '\u2014'),
        ('04', 'Catalog Intelligence', 'writes the row', 'you approve'),
    ]
    trs = ''.join(
        f'<div class="tr"><span>{a}</span><b>{b}</b><em>{c}</em><b>{d}</b></div>'
        for a, b, c, d in rows)
    body = f'''<div class="wrap">
<div class="lock">{logo()} Autommerce<div class="chip mono">Illustrative</div></div>
<div class="head"><h1>Five hundred titles, written by&nbsp;hand.</h1>
<div class="math"><small class="mono">The arithmetic</small>
<div class="line">500 titles \u00d7 <em>4 min</em></div>
<div class="eq">= <span>33h</span></div></div></div>
<div class="marks"><div class="lab"><b class="mono">500 marks \u00b7 one per title</b><span class="mono">paper work table</span></div>
<div class="grid">{marks}</div></div>
<div class="table"><div class="th mono"><span>Step</span><span>Work</span><span>Effort</span><span>Result</span></div>{trs}</div>
<div class="footn"><b>Catalog Intelligence writes the row.</b><span class="mono">You approve it</span></div>
</div>'''
    return {'week-3/M9-hours/poster': doc(body, css, '#F3EDE4')}


# ---------------------------------------------------------------- M10 approval
def m10():
    css = """
.wrap{padding:48px 56px 0}
.lock{display:flex;align-items:center;gap:14px;font-weight:800;font-size:24px}
h1{margin-top:28px;font-size:56px;width:960px}
.ask{margin-top:22px;background:#400095;color:#fff;border-radius:20px;padding:22px 26px}
.ask small{color:#F76D01;font-size:13px}
.ask p{margin-top:8px;font-size:28px;font-weight:650;letter-spacing:-.03em;line-height:1.25}
.panel{margin-top:18px;background:#fff;border:1.5px solid rgba(64,0,149,.18);border-radius:20px;overflow:hidden}
.panel .bar{display:flex;justify-content:space-between;align-items:center;padding:16px 22px;background:#F4F0F6;border-bottom:1px solid rgba(64,0,149,.12)}
.panel .bar b{font-size:18px;letter-spacing:-.02em}
.panel .bar span{font-size:13px;color:#6B358D}
.row{display:grid;grid-template-columns:28px 1.15fr 1.35fr 110px;gap:14px;padding:16px 22px;align-items:center;border-top:1px solid rgba(11,10,16,.06);font-size:18px}
.row:first-of-type{border-top:0}
.row .n{font-family:'Geist Mono',monospace;font-size:13px;color:#6B358D;letter-spacing:.08em}
.row .was{color:rgba(11,10,16,.45);text-decoration:line-through;text-decoration-thickness:1.5px;font-size:16px;letter-spacing:-.015em}
.row .now{font-weight:700;letter-spacing:-.02em;font-size:17px}
.row .st{justify-self:end;padding:7px 12px;background:#F4F0F6;color:#400095;font-size:12px;letter-spacing:.1em;font-weight:600}
.gate{margin-top:16px;border:2px solid #400095;border-radius:20px;padding:20px 24px;display:flex;justify-content:space-between;align-items:center;background:#fff}
.gate b{font-size:26px;letter-spacing:-.03em}
.gate span{display:block;margin-top:4px;font-size:16px;color:#3B3742}
.pill{padding:14px 22px;background:#400095;color:#fff;font-weight:700;font-size:18px;letter-spacing:-.01em}
.note{margin-top:16px;font-size:14px;color:rgba(11,10,16,.55)}
"""
    rows = [
        ('01', 'USB Charger Fast', 'Anker 65W GaN USB-C Charger', 'Pending'),
        ('02', 'Wall Adapter 20W', 'Apple 20W USB-C Power Adapter', 'Pending'),
        ('03', 'Car Charger Dual', 'Belkin BoostCharge Dual 36W Car Charger', 'Pending'),
        ('04', 'Wireless Pad', 'Samsung 15W Wireless Charging Pad', 'Pending'),
    ]
    row_html = ''.join(
        f'<div class="row"><div class="n">{n}</div><div class="was">{was}</div><div class="now">{now}</div><div class="st mono">{st}</div></div>'
        for n, was, now, st in rows)
    body = f'''<div class="wrap"><div class="lock">{logo()} Autommerce</div>
<h1>Nothing reaches the store until you say&nbsp;so.</h1>
<div class="ask"><small class="mono">You ask</small><p>Rewrite every title in Chargers. Name the brand and the wattage.</p></div>
<div class="panel"><div class="bar"><b>Chargers · draft titles</b><span class="mono">4 waiting</span></div>{row_html}</div>
<div class="gate"><div><b>Waiting for approval</b><span>Every change can be undone.</span></div><div class="pill">Approve</div></div>
<div class="note mono">Store Assistant · plain words in, your decision out</div></div>'''
    return {'week-3/M10-approval/poster': doc(body, css, '#F4F0F6')}


# ---------------------------------------------------------------- M11 seo aeo geo
def m11():
    N = 5
    pages = {}
    css0 = """
.wrap{padding:40px 56px 0}
.lock{display:flex;align-items:center;gap:14px;font-weight:800;font-size:24px}
.count{position:absolute;right:56px;top:48px;font-size:15px}
.count b{color:#F76D01;font-weight:500}
h1{margin-top:18px;font-size:48px;width:900px}
.stack{margin-top:18px;display:grid;gap:12px}
.band{padding:28px 30px;display:grid;grid-template-columns:240px 1fr;gap:24px;align-items:center;min-height:260px}
.band .word{font-size:100px;font-weight:800;letter-spacing:-.07em;line-height:.82}
.band .meta small{display:block;font-size:13px;letter-spacing:.14em;margin-bottom:10px;opacity:.85}
.band .meta b{display:block;font-size:28px;font-weight:750;letter-spacing:-.03em;line-height:1.2}
.band .meta p{margin-top:10px;font-size:20px;font-weight:550;line-height:1.3;opacity:.9;max-width:560px}
.b1{background:#F76D01;color:#0B0A10}
.b2{background:#400095;color:#fff}
.b3{background:#0B0A10;color:#fff}
.b3 .word{color:#F76D01}
.b3 .meta small{color:#F76D01;opacity:1}
.fix{margin-top:14px;display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px}
.fix div{background:#fff;border:1.5px solid rgba(11,10,16,.1);padding:16px 14px;min-height:110px}
.fix b{display:block;font-size:12px;letter-spacing:.12em;color:#F76D01;margin-bottom:8px;font-weight:500}
.fix span{font-size:18px;font-weight:700;letter-spacing:-.02em;line-height:1.2}
"""
    body0 = f'''<div class="wrap"><div class="lock">{logo()} Autommerce</div><div class="count mono"><b>01</b> / {N:02d}</div>
<h1>Three ways a product gets&nbsp;found.</h1>
<div class="stack">
<div class="band b1"><div class="word">SEO</div><div class="meta"><small class="mono">Search</small><b>People typing a query</b><p>Titles, headings and links decide who gets listed.</p></div></div>
<div class="band b2"><div class="word">AEO</div><div class="meta"><small class="mono">Answers</small><b>People asking a question</b><p>Plain-text specs get picked. Pictures do not.</p></div></div>
<div class="band b3"><div class="word">GEO</div><div class="meta"><small class="mono">Cite</small><b>Answers that cite a source</b><p>Facts written out are what generative engines quote.</p></div></div>
</div>
<div class="fix"><div><b class="mono">01</b><span>Exact titles</span></div><div><b class="mono">02</b><span>Specs as text</span></div><div><b class="mono">03</b><span>Real answers</span></div><div><b class="mono">04</b><span>One price</span></div></div>
</div>{foot(0, N)}'''
    pages['week-3/M11-seo-aeo-geo/slide_01'] = doc(body0, css0)

    css1 = """
.wrap{padding:48px 56px 0}
.lock{display:flex;align-items:center;gap:14px;font-weight:800;font-size:24px}
.count{position:absolute;right:56px;top:56px;font-size:15px}
.count b{color:#F76D01;font-weight:500}
.hero{margin-top:24px;background:#F76D01;color:#0B0A10;padding:36px 36px 32px;min-height:280px}
.hero .k{font-size:14px;letter-spacing:.16em}
.hero .word{margin-top:10px;font-size:140px;font-weight:800;letter-spacing:-.07em;line-height:.82}
.hero .deck{margin-top:18px;font-size:28px;font-weight:650;letter-spacing:-.025em;line-height:1.25;max-width:860px}
.list{margin-top:22px;background:#fff;border:1.5px solid rgba(11,10,16,.1)}
.list div{display:grid;grid-template-columns:70px 1fr;gap:16px;padding:22px 26px;border-top:1px solid rgba(11,10,16,.08);font-size:26px;font-weight:650;letter-spacing:-.02em;align-items:center}
.list div:first-child{border-top:0}
.list b{font-family:'Geist Mono',monospace;font-size:14px;color:#F76D01;font-weight:500}
"""
    body1 = f'''<div class="wrap"><div class="lock">{logo()} Autommerce</div><div class="count mono"><b>02</b> / {N:02d}</div>
<div class="hero"><div class="k mono">People typing a query</div><div class="word">SEO</div>
<div class="deck">Search engines read the title, the headings and the links. A vague title is a product they never&nbsp;list.</div></div>
<div class="list"><div><b>01</b>Exact product name in the title</div><div><b>02</b>Headings that match the query</div><div><b>03</b>Links that point to one clear page</div></div>
</div>{foot(1, N)}'''
    pages['week-3/M11-seo-aeo-geo/slide_02'] = doc(body1, css1)

    css2 = """
.wrap{padding:48px 56px 0}
.lock{display:flex;align-items:center;gap:14px;font-weight:800;font-size:24px;color:#fff}
.count{position:absolute;right:56px;top:56px;font-size:15px;color:rgba(255,255,255,.75)}
.count b{color:#F76D01;font-weight:500}
.hero{margin-top:24px;display:grid;grid-template-columns:280px 1fr;gap:20px}
.badge{background:#F76D01;color:#0B0A10;padding:28px 24px;display:flex;flex-direction:column;justify-content:flex-end;min-height:260px}
.badge .k{font-size:13px;letter-spacing:.16em}
.badge .word{margin-top:8px;font-size:96px;font-weight:800;letter-spacing:-.07em;line-height:.85}
.copy{background:rgba(255,255,255,.08);color:#fff;padding:28px 28px;border:1px solid rgba(255,255,255,.14)}
.copy .k{font-size:13px;letter-spacing:.16em;color:#F76D01}
.copy p{margin-top:14px;font-size:28px;font-weight:650;letter-spacing:-.025em;line-height:1.3}
.qa{margin-top:18px;display:grid;gap:12px}
.qa .q,.qa .a{padding:22px 26px;font-size:24px;font-weight:650;letter-spacing:-.02em;line-height:1.3}
.qa .q{background:#fff;color:#0B0A10}
.qa .q small{display:block;font-size:12px;letter-spacing:.14em;color:#6B358D;margin-bottom:8px;font-weight:500}
.qa .a{background:#0B0A10;color:#fff}
.qa .a small{display:block;font-size:12px;letter-spacing:.14em;color:#F76D01;margin-bottom:8px;font-weight:500}
"""
    body2 = f'''<div class="wrap"><div class="lock">{logo(True)} Autommerce</div><div class="count mono"><b>03</b> / {N:02d}</div>
<div class="hero"><div class="badge"><div class="k mono">Question</div><div class="word">AEO</div></div>
<div class="copy"><div class="k mono">People asking a question</div><p>Answer engines lift the page that answers in plain text. Specs trapped in a picture do not get&nbsp;picked.</p></div></div>
<div class="qa"><div class="q"><small class="mono">Shopper</small>What wattage is this charger?</div>
<div class="a"><small class="mono">Your page · as text</small>65W USB-C GaN. Fast charge for phones and laptops.</div></div>
</div>{foot(2, N, dark=True)}'''
    pages['week-3/M11-seo-aeo-geo/slide_03'] = doc(body2, css2, '#400095')

    css3 = """
.wrap{padding:48px 56px 0}
.lock{display:flex;align-items:center;gap:14px;font-weight:800;font-size:24px;color:#fff}
.count{position:absolute;right:56px;top:56px;font-size:15px;color:rgba(255,255,255,.7)}
.count b{color:#F76D01;font-weight:500}
.hero{margin-top:28px}
.k{font-size:14px;letter-spacing:.16em;color:#F76D01}
.word{margin-top:8px;font-size:140px;font-weight:800;letter-spacing:-.07em;line-height:.82;color:#fff}
.deck{margin-top:18px;font-size:28px;line-height:1.3;letter-spacing:-.025em;color:rgba(255,255,255,.82);max-width:900px;font-weight:650}
.cite{margin-top:28px;background:#F8F6F3;color:#0B0A10;padding:28px 30px;border-left:10px solid #F76D01}
.cite small{display:block;font-size:12px;letter-spacing:.14em;color:#C40000;margin-bottom:10px}
.cite p{font-size:30px;font-weight:700;letter-spacing:-.03em;line-height:1.3}
.cite .src{margin-top:16px;font-size:14px;color:rgba(11,10,16,.55)}
.facts{margin-top:16px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
.facts div{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);padding:20px 18px;color:#fff}
.facts b{display:block;font-size:13px;letter-spacing:.14em;color:#F76D01;margin-bottom:8px;font-weight:500}
.facts span{font-size:22px;font-weight:650;letter-spacing:-.02em;line-height:1.25}
"""
    body3 = f'''<div class="wrap"><div class="lock">{logo(True)} Autommerce</div><div class="count mono"><b>04</b> / {N:02d}</div>
<div class="hero"><div class="k mono">Answers that cite a source</div><div class="word">GEO</div>
<div class="deck">Generative engines cite the page they can quote. Facts, written out, are what they&nbsp;quote.</div></div>
<div class="cite"><small class="mono">Cited from your PDP</small><p>“Anker 65W GaN USB-C charger. Charges a phone and a laptop from one brick.”</p>
<div class="src mono">Source · your product page · as text</div></div>
<div class="facts"><div><b class="mono">01</b><span>Brand named</span></div><div><b class="mono">02</b><span>Wattage written</span></div><div><b class="mono">03</b><span>Use case clear</span></div></div>
</div>{foot(3, N, dark=True)}'''
    pages['week-3/M11-seo-aeo-geo/slide_04'] = doc(body3, css3, '#0B0A10')

    css4 = """
.wrap{padding:48px 56px 0}
.lock{display:flex;align-items:center;gap:14px;font-weight:800;font-size:24px}
.count{position:absolute;right:56px;top:56px;font-size:15px}
.count b{color:#F76D01;font-weight:500}
h1{margin-top:28px;font-size:52px;width:920px}
.rows{margin-top:24px;display:grid;gap:12px}
.row{display:grid;grid-template-columns:90px 1fr;min-height:150px;align-items:center}
.row .n{display:flex;align-items:center;justify-content:center;font-size:36px;font-weight:800;letter-spacing:-.04em;height:100%}
.row .t{padding:28px 30px;font-size:30px;font-weight:700;letter-spacing:-.03em;line-height:1.2;background:#fff;border:1.5px solid rgba(11,10,16,.1);height:100%;display:flex;align-items:center}
.r1 .n{background:#F76D01;color:#0B0A10}
.r2 .n{background:#400095;color:#fff}
.r3 .n{background:#6B358D;color:#fff}
.r4 .n{background:#0B0A10;color:#F76D01}
.sub{margin-top:18px;font-size:18px;color:rgba(11,10,16,.55)}
"""
    fixes = [
        ('r1', '01', 'Titles that name the exact product'),
        ('r2', '02', 'Specs as text, not a picture'),
        ('r3', '03', 'Answers to real questions'),
        ('r4', '04', 'One price, everywhere'),
    ]
    rows = ''.join(f'<div class="row {c}"><div class="n">{n}</div><div class="t">{t}</div></div>' for c, n, t in fixes)
    body4 = f'''<div class="wrap"><div class="lock">{logo()} Autommerce</div><div class="count mono"><b>05</b> / {N:02d}</div>
<h1>Same four fixes. All three&nbsp;readers.</h1>
<div class="rows">{rows}</div>
<div class="sub mono">SEO · AEO · GEO · one catalog job</div></div>{foot(4, N)}'''
    pages['week-3/M11-seo-aeo-geo/slide_05'] = doc(body4, css4)
    return pages


# ---------------------------------------------------------------- M12 menu
def m12():
    css = """
.wrap{padding:44px 56px 0}
.lock{display:flex;align-items:center;gap:14px;font-weight:800;font-size:24px}
h1{margin-top:18px;font-size:48px;width:940px}
.bubble{margin-top:16px;background:#0B0A10;color:#fff;border-radius:18px 18px 18px 6px;padding:18px 22px;max-width:960px}
.bubble small{color:#F76D01;font-size:12px;letter-spacing:.14em}
.bubble p{margin-top:8px;font-size:24px;font-weight:650;letter-spacing:-.025em;line-height:1.3}
.pair{margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:14px}
.card{border-radius:16px;padding:20px 22px 8px;min-height:520px}
.card.bad{background:#ECE8E2;border:1.5px solid rgba(11,10,16,.1)}
.card.good{background:#fff;border:2px solid #F76D01}
.card small{font-size:13px}
.card.bad small{color:rgba(11,10,16,.5)}
.card.good small{color:#F76D01}
.item{font-size:30px;font-weight:650;letter-spacing:-.03em;padding:22px 0;border-bottom:1px solid rgba(11,10,16,.1)}
.card .item:last-child{border-bottom:0}
.bad .item{color:rgba(11,10,16,.42);text-decoration:line-through;text-decoration-thickness:2px}
.bottom{margin-top:16px;display:grid;grid-template-columns:1.2fr .9fr .9fr;gap:12px}
.bottom div{padding:18px 18px;min-height:140px}
.bottom b{display:block;font-size:13px;letter-spacing:.14em;margin-bottom:10px}
.bottom span{font-size:22px;font-weight:700;letter-spacing:-.025em;line-height:1.25}
.b1{background:#F76D01;color:#0B0A10}
.b2{background:#400095;color:#fff}
.b3{background:#0B0A10;color:#fff}
.b3 b{color:#F76D01}
"""
    def items(names):
        return ''.join(f'<div class="item">{n}</div>' for n in names)
    body = f'''<div class="wrap"><div class="lock">{logo()} Autommerce</div>
<h1>Rebuild the menu by talking to&nbsp;it.</h1>
<div class="bubble"><small class="mono">You said</small><p>Rebuild the menu around how people shop: by room, by use, gifts, and replacement parts. Drop Misc and Other.</p></div>
<div class="pair">
<div class="card bad"><small class="mono">Before · illustrative</small>{items(['Sale','New','Brands','Misc','Other'])}</div>
<div class="card good"><small class="mono">After · you approve</small>{items(['Shop by room','Shop by use','Gifts','Replacement parts'])}</div>
</div>
<div class="bottom">
<div class="b1"><b class="mono">Live preview</b><span>See the new menu before anything ships.</span></div>
<div class="b2"><b class="mono">Version history</b><span>Roll back any change.</span></div>
<div class="b3"><b class="mono">Your gate</b><span>Nothing publishes until you approve.</span></div>
</div></div>'''
    return {'week-3/M12-menu/poster': doc(body, css)}


# ---------------------------------------------------------------- M13 who
def m13():
    N = 5
    out = {}
    css0 = """
.wrap{padding:40px 56px 0}
.lock{display:flex;align-items:center;gap:14px;font-weight:800;font-size:24px}
.count{position:absolute;right:56px;top:48px;font-size:15px}
.count b{color:#F76D01;font-weight:500}
.k{margin-top:16px;color:#F76D01;font-size:14px}
h1{margin-top:8px;font-size:52px;width:920px}
.p{margin-top:10px;font-size:22px;line-height:1.3;letter-spacing:-.02em;width:900px;color:#3B3742}
.grid{margin-top:18px;display:grid;grid-template-columns:1fr 1fr;gap:14px}
.card{padding:28px 26px;min-height:380px;display:flex;flex-direction:column;justify-content:space-between}
.card .n{font-size:13px;letter-spacing:.14em}
.card b{font-size:40px;font-weight:800;letter-spacing:-.04em;line-height:1}
.card span{display:block;font-size:22px;font-weight:600;letter-spacing:-.02em;line-height:1.3;margin-top:14px}
.card .job{margin-top:18px;font-size:16px;letter-spacing:.04em;opacity:.8;font-family:'Geist Mono',monospace;text-transform:uppercase}
.c1{background:#F76D01;color:#0B0A10}
.c2{background:#400095;color:#fff}
.c3{background:#6B358D;color:#fff}
.c4{background:#0B0A10;color:#fff}
.c4 .n,.c4 .job{color:#F76D01}
"""
    cards = [
        ('c1', '01', 'The store', 'Supplier sheet. Four hundred rows. Tonight.', 'Catalog · titles · photos'),
        ('c2', '02', 'The agency', 'Five hundred live by Friday. No hire-for-every-catalog.', 'Clients · deadlines · scale'),
        ('c3', '03', 'The brand', 'An assistant invents a product you do not sell.', 'Facts · quotes · AEO/GEO'),
        ('c4', '04', 'Fashion retail', 'Buy two sizes. Return one. Persona fits inside.', 'Fitting room · in-store'),
    ]
    card_html = ''.join(
        f'<div class="card {c}"><div class="n mono">{n}</div><div><b>{t}</b><span>{d}</span><div class="job">{j}</div></div></div>'
        for c, n, t, d, j in cards)
    body0 = f'''<div class="wrap"><div class="lock">{logo()} Autommerce</div><div class="count mono"><b>01</b> / {N:02d}</div>
<div class="k mono">The back office</div><h1>Who Autommerce is&nbsp;for</h1>
<div class="p">Four kinds of operation. One catalog, one workspace.</div>
<div class="grid">{card_html}</div></div>{foot(0, N)}'''
    out['week-3/M13-who/slide_01'] = doc(body0, css0)

    slides = [
        ('#FFF4E8', '#F76D01', '#0B0A10', '02', 'The store',
         'A supplier sheet landed this morning. Four hundred rows. Titles, specs and photos are still somebody\'s tonight.',
         [('400', 'rows waiting'), ('Tonight', 'titles · specs · photos'), ('One sheet', 'still somebody\'s job')],
         [('Titles', 'Still blank or vendor codes'), ('Specs', 'Trapped in a PDF'), ('Photos', 'Missing half the variants'), ('Tonight', 'Someone types until midnight')]),
        ('#F4F0F6', '#400095', '#fff', '03', 'The agency',
         'The client wants five hundred products live by Friday. Hiring for every catalog is not a plan.',
         [('500', 'products by Friday'), ('Hiring', 'is not the plan'), ('One workspace', 'every catalog')],
         [('Brief', 'Live by Friday'), ('Headcount', 'Cannot scale per client'), ('Workspace', 'One place for every catalog'), ('Margin', 'Protect the agency model')]),
        ('#F8F6F3', '#6B358D', '#fff', '04', 'The brand',
         'An assistant was asked for your best seller and described a product you do not sell. Your page gave it nothing to quote.',
         [('Asked', 'your best seller'), ('Quoted', 'nothing real'), ('Page', 'gave it no facts')],
         [('Shopper', 'Asked an assistant'), ('Answer', 'Invented a product'), ('Cause', 'Empty fields on the PDP'), ('Fix', 'Facts written as text')]),
        ('#F8F6F3', '#0B0A10', '#F76D01', '05', 'The fashion retailer',
         'Shoppers cannot try it on, so they buy two sizes and send one back. Persona is the fitting room, inside the store.',
         [('Two sizes', 'bought'), ('One', 'comes back'), ('Persona', 'fitting room inside')],
         [('Doubt', 'How will this look on me?'), ('Behavior', 'Buy two, return one'), ('Cost', 'Returns tax the margin'), ('Room', 'Persona fits inside the store')]),
    ]
    for i, (bg, accent, accent_fg, num, title, copy, stats, rows) in enumerate(slides, start=1):
        css = f"""
.wrap{{padding:40px 56px 0}}
.lock{{display:flex;align-items:center;gap:14px;font-weight:800;font-size:24px}}
.count{{position:absolute;right:56px;top:48px;font-size:15px}}
.count b{{color:{accent};font-weight:500}}
.k{{margin-top:16px;color:{accent};font-size:14px}}
.banner{{margin-top:14px;background:{accent};color:{accent_fg};padding:26px 28px}}
.banner h1{{font-size:52px;width:auto}}
.p{{margin-top:18px;font-size:26px;line-height:1.35;letter-spacing:-.02em;width:920px;color:#3B3742;font-weight:600}}
.stats{{margin-top:18px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}}
.stats div{{background:#fff;border:1.5px solid rgba(11,10,16,.1);padding:24px 20px;min-height:180px}}
.stats b{{display:block;font-size:36px;font-weight:800;letter-spacing:-.04em;line-height:1;color:{accent}}}
.stats span{{display:block;margin-top:14px;font-size:18px;font-weight:600;letter-spacing:-.02em;line-height:1.25;color:#3B3742}}
.rows{{margin-top:14px;background:#fff;border:1.5px solid rgba(11,10,16,.1)}}
.rows .r{{display:grid;grid-template-columns:160px 1fr;gap:16px;padding:22px 22px;border-top:1px solid rgba(11,10,16,.08);align-items:center;min-height:78px}}
.rows .r:first-child{{border-top:0}}
.rows .r b{{font-size:14px;letter-spacing:.14em;color:{accent};font-weight:500;font-family:'Geist Mono',monospace;text-transform:uppercase}}
.rows .r span{{font-size:24px;font-weight:650;letter-spacing:-.025em}}
"""
        stat_html = ''.join(f'<div><b>{a}</b><span>{b}</span></div>' for a, b in stats)
        row_html = ''.join(f'<div class="r"><b>{a}</b><span>{b}</span></div>' for a, b in rows)
        body = f'''<div class="wrap"><div class="lock">{logo()} Autommerce</div><div class="count mono"><b>{num}</b> / {N:02d}</div>
<div class="k mono">0{i} / 04</div>
<div class="banner"><h1>{title}</h1></div>
<div class="p">{copy}</div>
<div class="stats">{stat_html}</div>
<div class="rows">{row_html}</div></div>{foot(i, N)}'''
        out[f'week-3/M13-who/slide_{i+1:02d}'] = doc(body, css, bg)
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
.band{position:absolute;left:0;top:0;bottom:0;width:340px;background:#0B0A10;color:#fff;padding:56px 36px 0}
.band .k{color:#F76D01;font-size:15px;margin-top:70px}
.band .brand{margin-top:18px;font-size:72px;font-weight:800;letter-spacing:-.05em}
.band .yr{margin-top:16px;font-size:15px;color:rgba(255,255,255,.55)}
.band .stack{margin-top:48px;display:flex;flex-direction:column;gap:14px}
.band .chip{padding:16px 16px;border-radius:12px;background:rgba(255,255,255,.08);font-size:16px;line-height:1.3}
.band .chip b{display:block;color:#F76D01;font-size:13px;font-weight:500;margin-bottom:6px;font-family:'Geist Mono',monospace;letter-spacing:.12em;text-transform:uppercase}
.main{position:absolute;left:340px;right:0;top:0;bottom:0;padding:48px 48px 0 44px;background:#F8F6F3}
.lock{display:flex;align-items:center;gap:12px}
.lock b{font-size:22px;font-weight:800}
.lock small{display:block;font-size:11px;opacity:.55;margin-top:2px}
.count{position:absolute;right:48px;top:52px;font-size:16px}
.count b{color:#F76D01;font-weight:500}
h1{margin-top:40px;font-size:52px;width:600px}
.p{margin-top:18px;font-size:24px;line-height:1.35;letter-spacing:-.02em;width:580px;color:#3B3742}
.facts{margin-top:28px;display:flex;flex-direction:column;gap:10px}
.f{background:#fff;border:1px solid rgba(11,10,16,.1);border-radius:14px;padding:20px 22px;display:flex;justify-content:space-between;align-items:center}
.f b{font-size:22px;letter-spacing:-.02em}
.f span{font-family:'Geist Mono',monospace;font-size:13px;color:#F76D01}
.flow{margin-top:16px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
.flow div{background:#0B0A10;color:#fff;border-radius:12px;padding:16px 14px;text-align:center}
.flow small{display:block;color:#F76D01;font-size:11px}
.flow b{display:block;margin-top:8px;font-size:18px;letter-spacing:-.02em}
.src{position:absolute;left:384px;right:48px;bottom:110px;font-size:14px;color:rgba(11,10,16,.5);line-height:1.4}
"""
    body2 = f'''<div class="band"><div class="k mono">Brand 01</div><div class="brand">Zara</div><div class="yr mono">Try-On · from Dec 2025</div>
<div class="stack">
<div class="chip"><b>Capture</b>Face + full body</div>
<div class="chip"><b>Motion</b>Avatar walks the look</div>
<div class="chip"><b>Disclosure</b>Generated · may not match</div>
</div></div>
<div class="main"><div class="lock">{logo()}<div><b>Persona AI</b><small class="mono">By Autommerce</small></div></div>
<div class="count mono"><b>02</b> / {N:02d}</div>
<h1>An avatar, from two&nbsp;photos.</h1>
<div class="p">Face and full body. The avatar walks. Zara tells the shopper the image is generated, and may not match real&nbsp;life.</div>
<div class="facts">
<div class="f"><b>Face + body capture</b><span class="mono">INPUT</span></div>
<div class="f"><b>Walking avatar</b><span class="mono">OUTPUT</span></div>
<div class="f"><b>Disclosure on every try</b><span class="mono">TRUST</span></div>
</div>
<div class="flow"><div><small class="mono">01</small><b>Photo</b></div><div><small class="mono">02</small><b>Avatar</b></div><div><small class="mono">03</small><b>Try-on</b></div></div>
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
.stripe{position:absolute;left:0;right:0;top:0;height:28px;background:#400095}
.accent{position:absolute;left:0;top:28px;bottom:0;width:28px;background:#400095}
.wrap{padding:56px 56px 0 72px}
.lock{display:flex;align-items:center;gap:12px}
.lock b{font-size:22px;font-weight:800}
.lock small{display:block;font-size:11px;opacity:.55;margin-top:2px}
.count{position:absolute;right:56px;top:56px;font-size:16px}
.count b{color:#400095;font-weight:500}
.k{margin-top:28px;color:#400095;font-size:15px}
h1{margin-top:12px;font-size:54px;width:900px}
.p{margin-top:16px;font-size:24px;line-height:1.3;width:880px;color:#3B3742}
.grid{margin-top:24px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
.g{background:#fff;border:1px solid rgba(64,0,149,.18);border-radius:16px;padding:24px 20px;min-height:190px}
.g small{color:#400095;font-size:13px}
.g b{display:block;margin-top:14px;font-size:40px;letter-spacing:-.04em;line-height:1}
.g span{display:block;margin-top:12px;font-size:17px;color:#3B3742;line-height:1.3}
.panel{margin-top:14px;background:#400095;color:#fff;border-radius:18px;padding:26px 28px}
.panel .lab{font-size:13px;color:rgba(255,255,255,.7)}
.rows{margin-top:14px}
.r{display:flex;justify-content:space-between;align-items:center;padding:14px 0;border-top:1px solid rgba(255,255,255,.18);font-size:22px;font-weight:650;letter-spacing:-.02em}
.r:first-child{border-top:0}
.r em{font-style:normal;font-family:'Geist Mono',monospace;font-size:14px;color:#F76D01;font-weight:500}
.src{position:absolute;left:72px;right:56px;bottom:110px;font-size:14px;color:rgba(11,10,16,.5);line-height:1.4}
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
<div class="panel"><div class="lab mono">How it works</div>
<div class="rows">
<div class="r"><span>Upload your photo</span><em>OR LIKENESS</em></div>
<div class="r"><span>Pick a product</span><em>~10,000 SKUS</em></div>
<div class="r"><span>See it on you</span><em>4–7 SECONDS</em></div>
</div></div>
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
.metrics{margin-top:28px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
.m{background:#fff;border:1px solid rgba(11,10,16,.1);border-radius:18px;padding:26px 22px 24px;min-height:210px}
.m small{font-size:13px;color:#F76D01}
.m b{display:block;margin-top:18px;font-size:40px;letter-spacing:-.04em;line-height:1}
.m span{display:block;margin-top:14px;font-size:17px;color:#3B3742;line-height:1.3}
.days{margin-top:18px;display:grid;grid-template-columns:repeat(7,1fr);gap:8px}
.d{height:110px;border-radius:14px;background:rgba(11,10,16,.05);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px}
.d b{font-family:'Geist Mono',monospace;font-size:14px;font-weight:500;color:rgba(11,10,16,.45)}
.d i{font-style:normal;font-size:22px;font-weight:700;letter-spacing:-.02em}
.d.on{background:#F76D01;color:#0B0A10}
.d.on b{color:rgba(11,10,16,.7)}
.cap{margin-top:14px;font-size:15px;color:rgba(11,10,16,.5)}
.watch{margin-top:16px;background:#0B0A10;color:#fff;border-radius:16px;padding:22px 26px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
.watch small{display:block;color:#F76D01;font-size:12px}
.watch b{display:block;margin-top:8px;font-size:22px;letter-spacing:-.02em}
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
<div class="cap mono">White Friday week · read the day, not the week</div>
<div class="watch">
<div><small class="mono">Check</small><b>Conversion</b></div>
<div><small class="mono">Check</small><b>Stock at 12:00</b></div>
<div><small class="mono">Check</small><b>Cart drop</b></div>
</div></div>{foot(0, N)}'''

    # Slide 2 — conversion bars
    s2 = base_css + """
.panel{margin-top:22px;background:#fff;border:1px solid rgba(11,10,16,.1);border-radius:20px;padding:28px 32px 26px}
.panel .lab{font-size:14px;color:rgba(11,10,16,.5)}
.bars{margin-top:14px}
.bar{display:grid;grid-template-columns:170px 1fr 70px;align-items:center;gap:16px;padding:18px 0;border-top:1px solid rgba(11,10,16,.08)}
.bar:first-child{border-top:0}
.bar b{font-size:22px;letter-spacing:-.02em}
.track{height:20px;border-radius:10px;background:rgba(11,10,16,.08);overflow:hidden}
.fill{height:100%;border-radius:10px;background:#F76D01}
.fill.warn{background:#C40000}
.bar em{font-style:normal;font-family:'Geist Mono',monospace;font-size:18px;text-align:right}
.call{margin-top:20px;padding:22px 24px;border-radius:14px;background:#0B0A10;color:#fff;font-size:24px;font-weight:650;letter-spacing:-.02em}
.call span{color:#F76D01}
"""
    bars = [
        ('Hero coat', 72, False),
        ('Boot edit', 58, False),
        ('Gift set', 41, False),
        ('Cashmere set', 33, False),
        ('Lookbook #3', 19, True),
        ('Gift card', 14, True),
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
.timeline{margin-top:22px;display:grid;grid-template-columns:1fr 1fr;gap:14px}
.slot{background:#fff;border:1px solid rgba(11,10,16,.1);border-radius:18px;padding:28px 26px;min-height:168px}
.slot small{font-size:13px;color:rgba(11,10,16,.45)}
.slot b{display:block;margin-top:14px;font-size:48px;letter-spacing:-.045em}
.slot span{display:block;margin-top:10px;font-size:20px;color:#3B3742;line-height:1.3}
.slot.bad{background:#C40000;color:#fff;border:0}
.slot.bad small{color:rgba(255,255,255,.7)}
.slot.bad span{color:rgba(255,255,255,.85)}
.clock{margin-top:16px;background:#0B0A10;color:#fff;border-radius:18px;padding:30px 32px;display:flex;justify-content:space-between;align-items:center}
.clock b{font-size:64px;letter-spacing:-.05em;color:#F76D01}
.clock p{font-size:24px;font-weight:650;letter-spacing:-.02em;width:540px;line-height:1.25}
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
.funnel{margin-top:22px;display:flex;flex-direction:column;gap:14px}
.step{border-radius:16px;padding:26px 28px;display:flex;justify-content:space-between;align-items:center;color:#fff}
.step b{font-size:30px;letter-spacing:-.03em}
.step em{font-style:normal;font-family:'Geist Mono',monospace;font-size:24px}
.s1{background:#400095;width:100%}
.s2{background:#6B358D;width:86%;margin-left:0}
.s3{background:#F76D01;color:#0B0A10;width:64%}
.s4{background:#C40000;width:38%}
.gap{margin-top:18px;padding:26px 28px;border-radius:16px;border:2px solid #C40000;background:rgba(196,0,0,.06)}
.gap b{display:block;font-size:30px;letter-spacing:-.03em;color:#C40000}
.gap span{display:block;margin-top:8px;font-size:22px;color:#3B3742;line-height:1.3}
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
.wrap{padding:40px 56px 0}
.lock{display:flex;align-items:center;gap:14px;font-weight:800;font-size:24px}
h1{margin-top:18px;font-size:48px;width:940px}
.sub{margin-top:10px;font-size:20px;color:#3B3742;letter-spacing:-.015em;max-width:900px}
.stages{margin-top:18px;display:grid;grid-template-columns:1fr 1fr;gap:12px}
.st{padding:24px 22px;min-height:310px;display:flex;flex-direction:column;justify-content:space-between}
.st .n{font-size:13px;letter-spacing:.14em}
.st b{font-size:38px;font-weight:800;letter-spacing:-.04em;line-height:1}
.st span{margin-top:12px;font-size:20px;font-weight:600;letter-spacing:-.02em;line-height:1.3}
.s1{background:#F76D01;color:#0B0A10}
.s2{background:#FFF4E8;color:#0B0A10;border:1.5px solid rgba(247,109,1,.35)}
.s2 .n{color:#F76D01}
.s3{background:#400095;color:#fff}
.s4{background:#0B0A10;color:#fff}
.s4 .n{color:#F76D01}
.pipe{margin-top:16px;display:grid;grid-template-columns:repeat(7,1fr);gap:8px}
.pipe div{background:#fff;border:1.5px solid rgba(11,10,16,.1);padding:14px 10px;text-align:center;min-height:110px}
.pipe b{display:block;font-size:12px;letter-spacing:.1em;color:#F76D01;margin-bottom:8px;font-weight:500}
.pipe span{font-size:15px;font-weight:700;letter-spacing:-.02em;line-height:1.2}
.pipe .on{background:#0B0A10;color:#fff;border-color:#0B0A10}
.pipe .on b{color:#F76D01}
.note{margin-top:14px;padding:18px 20px;background:#F76D01;color:#0B0A10;font-size:22px;line-height:1.3;letter-spacing:-.02em;font-weight:650}
"""
    pipe = [
        ('01', 'Research'), ('02', 'Niche'), ('03', 'Keywords'), ('04', 'Outline'),
        ('05', 'Collections'), ('06', 'Articles'), ('07', 'Publish'),
    ]
    on = {2, 3, 5, 6}
    pipe_html = ''.join(
        f'<div class="{"on" if i in on else ""}"><b class="mono">{n}</b><span>{t}</span></div>'
        for i, (n, t) in enumerate(pipe, start=1))
    body = f'''<div class="wrap"><div class="lock">{logo()} Autommerce</div>
<h1>From a keyword to a page in the&nbsp;store.</h1>
<div class="sub">Growth Engine is a seven-stage agent. These four are what land in the store.</div>
<div class="stages">
<div class="st s1"><div class="n mono">01</div><div><b>Niche</b><span>Where the demand actually sits</span></div></div>
<div class="st s2"><div class="n mono">02</div><div><b>Keywords</b><span>The phrases shoppers type</span></div></div>
<div class="st s3"><div class="n mono">03</div><div><b>Collections</b><span>Pages built into the store</span></div></div>
<div class="st s4"><div class="n mono">04</div><div><b>Articles</b><span>Content that feeds the catalog</span></div></div>
</div>
<div class="pipe">{pipe_html}</div>
<div class="note">You stay the editor. Nothing publishes until you say so.</div></div>'''
    return {'week-4/M15-growth/poster': doc(body, css, '#F8F6F3')}


# ---------------------------------------------------------------- M16 24h
def m16():
    css = """
.wrap{padding:40px 56px 0}
.lock{display:flex;align-items:center;gap:14px;font-weight:800;font-size:24px}
.top{margin-top:18px;display:grid;grid-template-columns:1.25fr .75fr;gap:14px;align-items:stretch}
h1{font-size:48px;width:auto}
.ring{background:#400095;color:#fff;padding:24px 22px;display:flex;flex-direction:column;justify-content:flex-end;min-height:180px}
.ring b{font-size:84px;letter-spacing:-.06em;line-height:.8}
.ring span{margin-top:8px;font-size:13px;letter-spacing:.14em;color:#F76D01}
.rule{margin-top:14px;background:#fff;border:1.5px solid rgba(64,0,149,.2);padding:16px 20px}
.rule small{display:block;font-size:12px;color:#6B358D;letter-spacing:.12em}
.rule p{margin-top:6px;font-size:22px;font-weight:650;letter-spacing:-.025em;line-height:1.3}
.flow{margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:12px}
.card{padding:22px 20px;min-height:200px;display:flex;flex-direction:column;justify-content:space-between}
.card small{font-size:12px;letter-spacing:.14em}
.card b{display:block;margin-top:8px;font-size:30px;letter-spacing:-.035em;line-height:1.15}
.card p{margin-top:10px;font-size:18px;line-height:1.3;font-weight:550}
.c1{background:#F4F0F6;color:#0B0A10}
.c1 small{color:#400095}
.c2{background:#0B0A10;color:#fff}
.c2 small{color:#F76D01}
.log{margin-top:14px;background:#fff;border:1.5px solid rgba(11,10,16,.1);overflow:hidden}
.log .bar{display:flex;justify-content:space-between;padding:14px 18px;background:#0B0A10;color:#fff;font-size:13px;letter-spacing:.12em}
.log .bar span{color:#F76D01}
.log .r{display:grid;grid-template-columns:70px 1.2fr .9fr 120px;gap:12px;padding:14px 18px;border-top:1px solid rgba(11,10,16,.08);align-items:center;font-size:18px;font-weight:650;letter-spacing:-.02em}
.log .r:first-of-type{border-top:0}
.log .r em{font-style:normal;font-family:'Geist Mono',monospace;font-size:13px;color:#6B358D;letter-spacing:.08em;font-weight:500}
.log .ok{color:#400095;font-size:13px;letter-spacing:.1em;font-family:'Geist Mono',monospace;justify-self:end}
.log .hold{color:#F76D01;font-size:13px;letter-spacing:.1em;font-family:'Geist Mono',monospace;justify-self:end}
.note{margin-top:12px;font-size:14px;color:rgba(11,10,16,.55)}
"""
    rows = [
        ('02:11', 'Sony WH-1000XM5', 'Headphones', 'ok', 'Filed'),
        ('02:11', 'Anker 65W GaN', 'Chargers', 'ok', 'Filed'),
        ('02:12', 'Ceramic planter set', 'Home · unclear', 'hold', 'Listed'),
        ('02:12', 'USB-C braided cable', 'Chargers', 'ok', 'Filed'),
    ]
    log = ''.join(
        f'<div class="r"><em>{t}</em><b>{n}</b><span>{c}</span><span class="{cls}">{st}</span></div>'
        for t, n, c, cls, st in rows)
    body = f'''<div class="wrap"><div class="lock">{logo()} Autommerce</div>
<div class="top"><h1>New stock, classified while you&nbsp;sleep.</h1>
<div class="ring"><b>24h</b><span class="mono">Every day</span></div></div>
<div class="rule"><small class="mono">The rule you set once</small><p>If it matches Headphones or Chargers, file it. Everything else stays listed, not guessed.</p></div>
<div class="flow">
<div class="card c1"><div><small class="mono">Fits a rule</small><b>Filed in the right category.</b></div><p>New SKUs land where shoppers already look.</p></div>
<div class="card c2"><div><small class="mono">Doesn't fit</small><b>Listed. Not guessed.</b></div><p>Ambiguous products wait for you — never auto-invented.</p></div>
</div>
<div class="log"><div class="bar mono"><b>Overnight run</b><span>4 new SKUs</span></div>{log}</div>
<div class="note mono">Growth Sync · classify on a schedule · you keep the exceptions</div></div>'''
    return {'week-4/M16-sync/poster': doc(body, css, '#F8F6F3')}


# ---------------------------------------------------------------- M17 gallery
def m17():
    css = """
.wrap{padding:40px 56px 0}
.lock{display:flex;align-items:center;gap:14px;font-weight:800;font-size:24px}
h1{margin-top:16px;font-size:48px;width:960px}
.grid{margin-top:18px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
.cell{height:340px;overflow:hidden;position:relative;padding:22px 20px;display:flex;flex-direction:column;justify-content:space-between}
.cell .tag{font-size:12px;letter-spacing:.14em}
.cell .lab{font-size:30px;font-weight:800;letter-spacing:-.03em;line-height:1.05}
.cell .cap{font-size:17px;font-weight:550;line-height:1.3;opacity:.9;margin-top:6px}
.cell img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.cell.hasimg .lab,.cell.hasimg .tag,.cell.hasimg .cap{position:relative;z-index:1;color:#fff;text-shadow:0 2px 10px rgba(0,0,0,.45)}
.cell.hasimg:after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(11,10,16,.12),rgba(11,10,16,.78));z-index:0}
.c0{background:#0B0A10;color:#fff}
.c0 .tag{color:#F76D01}
.c1{background:#F76D01;color:#0B0A10}
.c2{background:#E8E0D4;color:#0B0A10}
.c3{background:#400095;color:#fff}
.c4{background:#6B358D;color:#fff}
.c5{background:#C40000;color:#fff}
.note{margin-top:16px;padding:20px 22px;background:#0B0A10;color:#fff;font-size:22px;letter-spacing:-.015em;line-height:1.35;display:flex;justify-content:space-between;align-items:center;gap:20px}
.note span{color:#F76D01;font-size:14px;letter-spacing:.14em;white-space:nowrap}
"""
    xm = '../../week-2/assets/xm5.jpg'
    cells = [
        ('c0', None, 'YOU HAVE', '1 packshot', 'The only image on the PDP'),
        ('c1', None, 'BUILT', 'Front', 'Clean hero angle'),
        ('hasimg c2', xm, 'EXAMPLE', 'Detail', 'Crop from the same SKU'),
        ('c3', None, 'BUILT', 'Scale', 'Size against a known object'),
        ('c4', None, 'BUILT', 'In use', 'On a person or desk'),
        ('c5', None, 'BUILT', 'Lifestyle', 'Context that sells'),
    ]
    html = []
    for cls, src, tag, lab, cap in cells:
        if src:
            html.append(
                f'<div class="cell {cls}"><img src="{src}" style="object-position:center 35%">'
                f'<div class="tag mono">{tag}</div><div><div class="lab">{lab}</div><div class="cap">{cap}</div></div></div>')
        else:
            html.append(
                f'<div class="cell {cls}"><div class="tag mono">{tag}</div>'
                f'<div><div class="lab">{lab}</div><div class="cap">{cap}</div></div></div>')
    body = f'''<div class="wrap"><div class="lock">{logo()} Autommerce</div>
<h1>One photo in. A gallery&nbsp;out.</h1>
<div class="grid">{''.join(html)}</div>
<div class="note"><b>Products Gallery finds more images of the exact same item, then exports the set.</b><span class="mono">Export gallery</span></div></div>'''
    return {'week-4/M17-gallery/poster': doc(body, css, '#F1EEE8')}


# ---------------------------------------------------------------- M18 night
def m18():
    css = """
body{color:#fff}
.wrap{position:relative;padding:40px 56px 0}
.lock{display:flex;align-items:center;gap:14px;font-weight:800;font-size:24px}
.when{margin-left:auto;font-size:14px;letter-spacing:.14em;color:#F76D01}
h1{margin-top:20px;font-size:56px;width:940px}
.h2{margin-top:6px;font-size:56px;font-weight:800;letter-spacing:-.055em;line-height:.92;color:#F76D01}
.p{margin-top:14px;font-size:24px;line-height:1.35;width:900px;color:rgba(255,255,255,.82);letter-spacing:-.02em}
.grid{margin-top:18px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
.tile{padding:20px 18px;min-height:170px;display:flex;flex-direction:column;justify-content:space-between}
.tile small{font-size:12px;letter-spacing:.14em}
.tile b{font-size:26px;font-weight:800;letter-spacing:-.03em;line-height:1.1}
.t1{background:#F76D01;color:#0B0A10}
.t2{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.16)}
.t2 small{color:#F76D01}
.t3{background:#0B0A10;border:1px solid rgba(255,255,255,.16)}
.t3 small{color:#F76D01}
.ask{margin-top:14px;background:#fff;color:#0B0A10;padding:18px 20px;display:flex;justify-content:space-between;align-items:center;gap:20px}
.ask .l small{display:block;font-size:12px;letter-spacing:.14em;color:#6B358D}
.ask .l b{display:block;margin-top:6px;font-size:22px;letter-spacing:-.025em}
.ask .r{padding:12px 16px;background:#400095;color:#fff;font-weight:700;font-size:15px;white-space:nowrap}
.log{margin-top:14px;border:1px solid rgba(255,255,255,.16);overflow:hidden}
.log .bar{display:flex;justify-content:space-between;padding:12px 18px;background:rgba(0,0,0,.25);font-size:12px;letter-spacing:.14em}
.log .bar span{color:#F76D01}
.log .r{display:grid;grid-template-columns:80px 1fr 140px;gap:12px;padding:16px 18px;border-top:1px solid rgba(255,255,255,.1);align-items:center;font-size:20px;font-weight:650;letter-spacing:-.02em}
.log .r em{font-style:normal;font-family:'Geist Mono',monospace;font-size:13px;color:#F76D01;letter-spacing:.08em;font-weight:500}
.log .r span{font-size:14px;letter-spacing:.1em;color:rgba(255,255,255,.7);font-family:'Geist Mono',monospace;justify-self:end;text-transform:uppercase}
.line{margin-top:14px;font-size:15px;color:rgba(255,255,255,.7)}
"""
    logs = [
        ('00:41', 'SKU-5512 went out of stock', 'Waiting'),
        ('01:18', 'Draft title for Chargers · 4 rows', 'Waiting'),
        ('02:03', 'Price mismatch on AirPods Pro 2', 'Waiting'),
    ]
    log_html = ''.join(f'<div class="r"><em>{t}</em><b>{n}</b><span>{s}</span></div>' for t, n, s in logs)
    body = f'''<div class="wrap"><div class="lock">{logo(True)} Autommerce<div class="when mono">White Friday</div></div>
<h1>Your store is open all&nbsp;night.</h1>
<div class="h2">So is the assistant.</div>
<div class="p">Ask what broke. Stock, a title, a price. Nothing changes until you&nbsp;approve&nbsp;it.</div>
<div class="grid">
<div class="tile t1"><small class="mono">01 · Stock</small><b>Which SKU went dark?</b></div>
<div class="tile t2"><small class="mono">02 · Title</small><b>Which draft is waiting?</b></div>
<div class="tile t3"><small class="mono">03 · Price</small><b>What drifted overnight?</b></div>
</div>
<div class="ask"><div class="l"><small class="mono">You ask at 2:14am</small><b>Show me everything that broke since midnight.</b></div><div class="r">Approve later</div></div>
<div class="log"><div class="bar mono"><b>Overnight queue</b><span>3 waiting</span></div>{log_html}</div>
<div class="line mono">Store Assistant · autommerce.com/contact</div></div>'''
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
.wrap{padding:44px 52px 0}
.lock{display:flex;align-items:center;gap:12px}
.lock b{font-size:22px;font-weight:800}
.lock small{display:block;font-size:11px;opacity:.55;margin-top:2px}
.chip{position:absolute;right:52px;top:48px;padding:10px 14px;border-radius:999px;background:#400095;color:#fff;font-size:13px}
h1{margin-top:22px;font-size:48px;width:920px}
.hero{margin-top:20px;background:#0B0A10;color:#fff;border-radius:20px;padding:32px 34px;display:grid;grid-template-columns:1.1fr .9fr;gap:24px;align-items:center}
.hero small{color:#F76D01;font-size:13px}
.hero b{display:block;margin-top:10px;font-size:80px;letter-spacing:-.06em;line-height:.9}
.hero span{display:block;margin-top:12px;font-size:18px;color:rgba(255,255,255,.7)}
.spark{display:flex;align-items:flex-end;gap:8px;height:130px;padding-bottom:8px}
.spark i{flex:1;border-radius:6px 6px 0 0;background:#F76D01;display:block}
.grid{margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:12px}
.card{background:#fff;border:1px solid rgba(11,10,16,.1);border-radius:16px;padding:26px 24px 22px;min-height:168px}
.card small{color:#400095;font-size:12px}
.card b{display:block;margin-top:12px;font-size:44px;letter-spacing:-.045em;line-height:.95}
.card span{display:block;margin-top:10px;font-size:17px;color:#3B3742}
.card .up{color:#F76D01;font-family:'Geist Mono',monospace;font-size:13px;margin-top:14px}
.strip{margin-top:14px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
.strip div{background:#400095;color:#fff;border-radius:14px;padding:18px 18px}
.strip small{font-size:12px;opacity:.75}
.strip b{display:block;margin-top:8px;font-size:20px;letter-spacing:-.02em}
.note{position:absolute;left:52px;right:52px;bottom:40px;font-size:16px;color:rgba(11,10,16,.55)}
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
</div>
<div class="strip">
<div><small class="mono">Before Friday</small><b>Turn tracking on</b></div>
<div><small class="mono">Next to</small><b>Store revenue</b></div>
<div><small class="mono">Read daily</small><b>Not Monday</b></div>
</div></div>
<div class="note mono">Five numbers, next to revenue. Turn tracking on before Friday.</div>'''
    return {'week-4/P14-dashboard/poster': doc(body, css, '#F4F0F6')}


# ---------------------------------------------------------------- P15 manifesto
def p15():
    css = """
.rail{position:absolute;left:0;top:0;bottom:0;width:18px;background:linear-gradient(180deg,#F76D01,#C40000 45%,#400095)}
.bands{position:absolute;right:0;top:0;width:120px;height:1350px;display:flex;flex-direction:column}
.bands i{flex:1;display:block}
.bands .o{background:#F76D01}
.bands .r{background:#C40000}
.bands .p{background:#400095}
.bands .v{background:#6B358D}
.top{position:absolute;left:56px;right:160px;top:48px;display:flex;justify-content:space-between;align-items:center}
.lock{display:flex;align-items:center;gap:12px;font-weight:800;font-size:22px}
.lock small{display:block;font-size:11px;font-weight:500;opacity:.55;margin-top:2px}
.mark{font-size:14px;color:#F76D01}
h1{position:absolute;left:56px;top:150px;font-size:82px;width:860px;line-height:.94}
.grad{background:linear-gradient(100deg,#F76D01,#C40000 50%,#6B358D);-webkit-background-clip:text;background-clip:text;color:transparent;padding-right:.08em}
.pillars{position:absolute;left:56px;right:160px;top:500px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
.pi{background:#fff;border:1px solid rgba(11,10,16,.1);border-radius:16px;padding:28px 22px;min-height:240px}
.pi small{color:#F76D01;font-size:13px}
.pi b{display:block;margin-top:16px;font-size:28px;letter-spacing:-.03em}
.pi span{display:block;margin-top:14px;font-size:18px;color:#3B3742;line-height:1.3}
.quote{position:absolute;left:56px;right:160px;top:780px;background:#0B0A10;color:#fff;border-radius:18px;padding:30px 32px}
.quote p{font-size:28px;font-weight:650;letter-spacing:-.03em;line-height:1.3;width:820px}
.quote span{display:block;margin-top:12px;color:#F76D01;font-size:14px}
.sub{position:absolute;left:56px;right:160px;bottom:48px;display:flex;justify-content:space-between;align-items:flex-end}
.sub p{font-size:22px;width:620px;line-height:1.35;letter-spacing:-.02em;color:#3B3742}
.sub .url{font-size:15px;color:#F76D01}
"""
    body = f'''<div class="rail"></div>
<div class="bands"><i class="o"></i><i class="r"></i><i class="p"></i><i class="v"></i></div>
<div class="top"><div class="lock">{logo()}<div><b>Persona AI</b><small class="mono">By Autommerce</small></div></div>
<div class="mark mono">Manifesto</div></div>
<h1>Every shopper deserves a&nbsp;<span class="grad">stylist.</span></h1>
<div class="pillars">
<div class="pi"><small class="mono">01</small><b>Your stock only</b><span>Never a competitor SKU</span></div>
<div class="pi"><small class="mono">02</small><b>Your cart</b><span>Checkout stays on your store</span></div>
<div class="pi"><small class="mono">03</small><b>Your brand</b><span>Live mirror + size + outfit</span></div>
</div>
<div class="quote"><p>Fitting room. Size. Outfit. One script tag inside the&nbsp;store.</p><span class="mono">Persona AI · by Autommerce</span></div>
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
