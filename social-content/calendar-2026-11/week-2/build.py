"""Week 2 static posts. usage: python3 build.py [A3 A5 A6 M4 M6 P6 P7]"""
import asyncio, importlib.util, os, sys
from playwright.async_api import async_playwright
from PIL import Image

BASE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location('w1', os.path.join(BASE, '..', 'week-1', 'build.py'))
w1 = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(w1)
CSS, page, foot, pbar, P_BG, P_CSS, M2_CSS = w1.CSS, w1.page, w1.foot, w1.pbar, w1.P_BG, w1.P_CSS, w1.M2_CSS

INK_BG = ('<div class="glow" style="width:560px;height:560px;right:-260px;top:-200px;background:rgba(247,109,1,.13)"></div>'
          '<div class="glow" style="width:640px;height:640px;left:-300px;bottom:-260px;background:rgba(64,0,149,.35)"></div>')
PAPER_BG = ('<div class="glow" style="width:700px;height:700px;right:-300px;top:-300px;background:rgba(247,109,1,.16)"></div>'
            '<div class="glow" style="width:600px;height:600px;left:-320px;bottom:-200px;background:rgba(64,0,149,.10)"></div>')
WHO = '<b>Abbas Zein</b> &nbsp;/&nbsp; Founder &amp; CEO, Autommerce'


def abar(right):
    return (f'<div class="bar"><div class="lock"><img src="../assets/autommerce-white.png"><div><b>Abbas Zein</b>'
            f'<small class="mono">Founder notes</small></div></div>{right}</div>')


def mbar(right):
    return f'<div class="bar"><div class="lock"><img src="../assets/autommerce-natural.png"><b>Autommerce</b></div>{right}</div>'


def count(i, n):
    return f'<div class="count mono"><b>{i + 1:02d}</b> / {n:02d}</div>'


# ---------------------------------------------------------------- A3 catalog checklist
A3_CSS = """
.cover{position:absolute;inset:0;overflow:hidden}
.cover img{position:absolute;left:0;top:-40px;width:1080px;height:1440px;object-fit:cover}
.cover .sh{position:absolute;inset:0;background:linear-gradient(0deg,rgba(11,10,16,.98) 0%,rgba(11,10,16,.93) 26%,rgba(11,10,16,.6) 44%,rgba(11,10,16,0) 64%),linear-gradient(180deg,rgba(11,10,16,.6) 0%,rgba(11,10,16,0) 16%)}
.main{position:absolute;left:72px;right:72px;top:182px;bottom:150px;display:flex;flex-direction:column}
.kick{display:flex;align-items:center;gap:14px;font-size:14px;color:#F76D01;margin-bottom:26px}
.kick i{width:44px;height:2px;background:#F76D01;display:block}
.why{margin-top:28px;font-size:30px;line-height:1.38;color:rgba(255,255,255,.78);letter-spacing:-.014em;max-width:900px}
.vis{flex:1;display:flex;flex-direction:column;justify-content:center;padding:40px 0}
.dots{display:grid;grid-template-columns:repeat(25,1fr);gap:9px}
.dots i{aspect-ratio:1;border-radius:50%;background:rgba(255,255,255,.12);display:block}
.dots i.on{background:linear-gradient(135deg,#F76D01,#C40000)}
.mt{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px}
.mt div{border-radius:20px;padding:30px 28px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1)}
.mt small{display:block;font-size:12px;color:rgba(255,255,255,.55)}
.mt b{display:block;margin-top:18px;font-size:50px;font-weight:800;letter-spacing:-.04em}
.mt em{display:block;margin-top:12px;font-style:normal;font-size:13px;color:rgba(255,255,255,.55)}
.mt .x{border-color:#C40000;background:rgba(196,0,0,.12)}
.mt .x b{color:#FF5A3C}.mt .x em{color:#FF5A3C}
.today{display:grid;grid-template-columns:54px 1fr;gap:22px;align-items:start;padding:30px 34px;border-radius:24px;background:#15131D;border:1px solid rgba(247,109,1,.45)}
.today .box{width:42px;height:42px;border-radius:10px;border:2px solid #F76D01;margin-top:4px}
.today small{display:block;font-size:13px;color:#F76D01;margin-bottom:10px}
.today span{font-size:27px;line-height:1.36;letter-spacing:-.012em;color:#fff}
.ba{display:grid;grid-template-columns:1fr;gap:12px}
.ba div{display:grid;grid-template-columns:130px 1fr;align-items:center;padding:34px 32px;border-radius:20px;font-family:'Geist Mono',monospace;font-size:27px;line-height:1.35;letter-spacing:0}
.ba .b{background:rgba(255,255,255,.05);color:rgba(255,255,255,.6)}
.ba .a{background:rgba(247,109,1,.1);border:1px solid rgba(247,109,1,.4);color:#fff}
.ba small{font-size:12px;letter-spacing:.14em;text-transform:uppercase}
.ba .b small{color:rgba(255,255,255,.45)}.ba .a small{color:#F76D01}
.st{display:flex;align-items:flex-end;gap:34px}
.st .n{padding-right:.08em;font-size:200px;font-weight:800;letter-spacing:-.06em;line-height:.82}
.st p{font-size:29px;line-height:1.35;color:rgba(255,255,255,.85);letter-spacing:-.012em;padding-bottom:10px;max-width:520px}
.st .src{display:block;margin-top:12px;font-size:12px;color:rgba(255,255,255,.45)}
.chk{margin-top:44px}
.chk div{display:grid;grid-template-columns:64px 50px 1fr;align-items:center;padding:23px 0;border-top:1px solid rgba(255,255,255,.12);font-size:30px;font-weight:600;letter-spacing:-.02em}
.chk div:last-child{border-bottom:1px solid rgba(255,255,255,.12)}
.chk b{font-family:'Geist Mono',monospace;font-size:16px;color:#F76D01;font-weight:500}
.chk i{width:32px;height:32px;border-radius:8px;border:2px solid rgba(255,255,255,.35);display:block}
.days{display:flex;gap:7px;margin-top:6px}
.days i{flex:1;height:58px;border-radius:9px;background:rgba(255,255,255,.07);display:block;position:relative}
.days i.on{background:rgba(247,109,1,.22);border:1px solid rgba(247,109,1,.55)}
.days i.fr{background:#C40000}
.days i.wf{background:linear-gradient(135deg,#F76D01,#C40000)}
.dl{display:flex;justify-content:space-between;margin-top:14px;font-size:13px;color:rgba(255,255,255,.55)}
.dl b{color:#fff;font-weight:500}
"""

A3_CHECKS = [
    ('Start with your <span class="o">top 50.</span>',
     "You can't fix 5,000 products in 18 days. You can fix the 50 that will carry the weekend: last year's bestsellers and everything in this year's deals.",
     '<div class="dots">' + ''.join(f'<i class="{"on" if k < 50 else ""}"></i>' for k in range(250)) + '</div><div class="dl mono"><span><b>50</b> products to fix first</span><span>Illustrative catalog</span></div>', "Export last year's top sellers and this year's deal list. Merge them. That's your list."),
    ('Titles that name the <span class="o">exact product.</span>',
     'Shoppers and AI assistants search by brand and model. Your internal code means nothing to them.',
     '<div class="ba"><div class="b"><small>Before</small><span>NB 1080 GRY 43</span></div>'
     '<div class="a"><small>After</small><span>New Balance Fresh Foam X 1080v13, Grey, EU&nbsp;43</span></div></div>',
     'Rewrite each title as brand, model, product type, colour and size.'),
    ('Descriptions that <span class="o">answer questions.</span>',
     "Size, material, what's in the box, what it works with. If your page doesn't answer it, the shopper leaves for a page that does.",
     '<div class="st"><div class="n warm">83%</div><p>of shoppers would abandon a product page that lacks the information they&nbsp;want.'
     '<span class="src mono">Source: Syndigo, State of Product Experience 2026</span></p></div>',
     'Read your top 10 pages as a first-time buyer. Write down every question left open.'),
    ('One photo for<br><span class="o">every variant.</span>',
     "When a shopper picks grey and still sees the black photo, you haven't made a sale. You've booked a return.",
     '<div class="st"><div class="n warm">26%</div><p>of shoppers returned a product because the content set the wrong&nbsp;expectations.'
     '<span class="src mono">Source: Syndigo, State of Product Experience 2026</span></p></div>',
     'Click every colour and size option on your top 50. Each one should change the photo.'),
    ('Specs as text,<br><span class="o">not pictures.</span>',
     'AI assistants quote pages that explain: specs, FAQs, guides. A spec sheet baked into an image is invisible to them.',
     '<div class="st"><div class="n warm">63%</div><p>is the average citation readability score of a US retail homepage. Over a third is invisible to&nbsp;AI.'
     '<span class="src mono">Source: Adobe, October 2026</span></p></div>',
     'Move key specs into a table on the page, not inside an image or a PDF.'),
    ('Price and stock that <span class="o">match everywhere.</span>',
     'The feed, the product page and the checkout must show the same price and the same stock. A mismatch gets ads disapproved and shoppers suspicious.',
     '<div class="mt"><div><small class="mono">Shopping feed</small><b>$139.99</b><em class="mono">In stock</em></div>'
     '<div><small class="mono">Product page</small><b>$139.99</b><em class="mono">In stock</em></div>'
     '<div class="x"><small class="mono">Checkout</small><b>$149.99</b><em class="mono">Mismatch</em></div></div>', 'Spot-check 10 deal products in your shopping feed against the live page.'),
    ('Freeze the catalog on <span class="o">24 November.</span>',
     'Finish the fixes by Tuesday 24 November. Peak week is for watching orders and stock, not for rebuilding pages.',
     '<div class="days">' + ''.join(f'<i class="{"on" if d == 9 else "fr" if d == 24 else "wf" if d == 27 else ""}"></i>' for d in range(9, 28)) + '</div>'
     '<div class="dl mono"><span><b>9 Nov</b> Today</span><span><b>24 Nov</b> Freeze</span><span><b>27 Nov</b> White Friday</span></div>',
     'Put the freeze date in the team calendar today.'),
]
A3_SHORT = ['Start with your top 50', 'Titles name the exact product', 'Descriptions answer questions',
            'One photo for every variant', 'Specs as text, not pictures', 'Price and stock match everywhere',
            'Freeze the catalog on 24 November']


def a3():
    N = 9
    out = {}
    out['A3-white-friday-checklist/slide_01'] = page(f"""
<div class="cover"><img src="../assets/w2_a3_cover.jpg"><div class="sh"></div></div>
{abar(count(0, N))}
<div class="abs" style="left:72px;right:72px;bottom:160px">
<div class="kick mono"><i></i>White Friday &middot; 27 November</div>
<h1 style="font-size:104px">18 days left.<br><span class="warm">Fix the catalog first.</span></h1>
<div class="why" style="margin-top:26px">The 7-point checklist I would run this week, before a single ad goes&nbsp;live.</div></div>
""" + foot(0, N), 'ink', A3_CSS)
    for k, (title, why, vis, today) in enumerate(A3_CHECKS):
        i = k + 1
        vis_html = f'<div class="vis">{vis}</div>'
        out[f'A3-white-friday-checklist/slide_{i + 1:02d}'] = page(INK_BG + abar(count(i, N)) + f"""
<div class="main"><div class="kick mono"><i></i>Check {k + 1:02d} / 07</div>
<h1 style="font-size:84px">{title}</h1><div class="why">{why}</div>{vis_html}
<div class="today"><div class="box"></div><div><small class="mono">Do this today</small><span>{today}</span></div></div></div>
""" + foot(i, N), 'ink', A3_CSS)
    rows = ''.join(f'<div><b>{k + 1:02d}</b><i></i><span>{t}</span></div>' for k, t in enumerate(A3_SHORT))
    out['A3-white-friday-checklist/slide_08'] = page(INK_BG + abar(count(7, N)) + f"""
<div class="main"><div class="kick mono"><i></i>The whole list</div>
<h1 style="font-size:84px">Save it. <span class="o">Share it</span><br>with your catalog team.</h1>
<div class="chk">{rows}</div></div>
""" + foot(7, N), 'ink', A3_CSS)
    out['A3-white-friday-checklist/slide_09'] = page(INK_BG + abar(count(8, N)) + f"""
<div class="main" style="justify-content:center;padding-bottom:40px"><div class="kick mono"><i></i>Your turn</div>
<h1 style="font-size:100px">Which check<br>fails first<br><span class="warm">in your store?</span></h1>
<div class="why" style="margin-top:34px">Tell me in the comments. If you want a second pair of eyes on your top 50, send me a&nbsp;message.</div>
<div class="mono" style="margin-top:56px;font-size:15px;color:rgba(255,255,255,.7)">{WHO}</div></div>
""" + foot(8, N), 'ink', A3_CSS)
    return out


# ---------------------------------------------------------------- A5 11.11 poster
def a5():
    bars = [('Ratings and reviews', 53, True), ('Detailed product descriptions', 52, True), ('A discount or deal', 49, False)]
    rows = ''.join(
        f'<div class="r"><div class="l"><span>{t}</span><b class="{"warm" if hot else ""}">{v}%</b></div>'
        f'<div class="t"><i class="{"hot" if hot else ""}" style="width:{v / 60 * 100:.1f}%"></i></div></div>' for t, v, hot in bars)
    css = """
.chart{position:absolute;left:72px;right:72px;top:670px}
.chart .h{font-size:14px;color:rgba(255,255,255,.6);margin-bottom:30px}
.r{margin-bottom:30px}
.r .l{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:14px}
.r .l span{font-size:30px;font-weight:600;letter-spacing:-.02em}
.r .l b{font-size:44px;font-weight:800;letter-spacing:-.04em}
.r .t{height:22px;border-radius:11px;background:rgba(255,255,255,.07);overflow:hidden}
.r .t i{display:block;height:100%;border-radius:11px;background:rgba(255,255,255,.28)}
.r .t i.hot{background:linear-gradient(90deg,#F76D01,#C40000)}
.take{position:absolute;left:72px;right:72px;top:1124px;font-size:28px;line-height:1.38;color:rgba(255,255,255,.82);letter-spacing:-.014em}
.who{position:absolute;left:72px;right:72px;bottom:56px;display:flex;justify-content:space-between;font-size:12.5px;color:rgba(255,255,255,.55)}
.who b{color:#fff;font-weight:600}
"""
    body = INK_BG + abar('<div class="chip mono"><i></i>11.11</div>') + f"""
<h1 class="abs" style="left:72px;top:170px;font-size:106px">Discounts win<br>the click.<br><span class="warm">Product pages<br>win the sale.</span></h1>
<div class="chart"><div class="h mono">What shoppers say influences their purchase</div>{rows}</div>
<div class="take">Shoppers rank reviews and detailed descriptions above the deal itself.<br>This&nbsp;11.11, fix the page before you cut the&nbsp;price.</div>
<div class="who mono"><span>{WHO}</span><span>Source: Syndigo, State of Product Experience 2026</span></div>
"""
    return {'A5-11-11/A5_poster': page(body, 'ink', css)}


# ---------------------------------------------------------------- A6 five lessons (new photos)
A6_SLIDES = [
    dict(img='w2_a6_1.jpg', kind='cover', kicker='Founder notes',
         title='5 lessons from <span class="o" style="white-space:nowrap">6 years</span> building in&nbsp;ecommerce.',
         body='From a founder building the AI operating system for online stores.'),
    dict(img='w2_a6_2.jpg', kind='lesson', num='01', title='Your catalog is your <span class="o">storefront.</span>',
         body='Every missing title, thin description and wrong attribute is a shopper who never finds the product. Clean data comes&nbsp;first.'),
    dict(img='w2_a6_6.jpg', kind='lesson', num='02', title='Hiring more people is not a <span class="o">scaling plan.</span>',
         body='If your catalog doubles and your data-entry team has to double with it, the model is broken. Automate the repeatable&nbsp;work.'),
    dict(img='w2_a6_4.jpg', kind='lesson', num='03', title='Shoppers buy what they can <span class="o">picture on themselves.</span>',
         body='That is why we built Persona: a virtual fitting room and AI stylist that lives inside the&nbsp;store.'),
    dict(img='w2_a6_5.jpg', kind='lesson', num='04', title='Images are <span class="o">data,</span><br>not decoration.',
         body='Classify them, enrich them, tie them to the product. Search engines and AI assistants read them&nbsp;too.'),
    dict(img='w2_a6_3.jpg', kind='lesson', num='05', title='Put AI in the<br><span class="o">back office</span> first.',
         body='The wins that compound are the quiet ones: catalog, images, and assistants that already know your&nbsp;products.'),
    dict(img='w2_a6_7.jpg', kind='system', kicker='So I am building Autommerce',
         title='One AI operating system. <span class="o">Not ten tools.</span>',
         chips=['Catalog Intelligence', 'Image Classification', 'Products Gallery', 'Products Visualizer', 'Growth Engine',
                'Store Assistant', 'Website Restructure']),
    dict(img='w2_a6_8.jpg', kind='cta', title="Let's fix your<br><span class=\"o\">back office.</span>",
         body='Book a meeting and see Autommerce on your own store.'),
]
A6_CSS = """
body{background:#0B0A10;color:#fff}
.bg{position:absolute;inset:0;overflow:hidden}
.bg img{position:absolute;left:0;top:0;width:1080px;height:1440px;object-fit:cover;display:block}
.shade{position:absolute;inset:0;background:linear-gradient(0deg,rgba(11,10,16,.98) 0%,rgba(11,10,16,.94) 24%,rgba(11,10,16,.7) 42%,rgba(11,10,16,0) 62%),linear-gradient(180deg,rgba(11,10,16,.6) 0%,rgba(11,10,16,0) 15%)}
.txt{position:absolute;left:72px;right:72px;bottom:150px;z-index:5}
.tag{display:flex;align-items:center;gap:14px;font-size:14px;color:#F76D01;margin-bottom:22px}
.tag i{display:block;width:44px;height:2px;background:#F76D01}
h1{letter-spacing:-.055em;line-height:.97}
.body{margin-top:24px;font-size:28px;line-height:1.38;color:rgba(255,255,255,.82);letter-spacing:-.012em;max-width:900px}
.chips{display:flex;flex-wrap:wrap;gap:10px;margin-top:28px}
.chips span{padding:11px 18px;border-radius:999px;border:1px solid rgba(255,255,255,.28);background:rgba(11,10,16,.55);font-size:19px;font-weight:600;letter-spacing:-.01em}
.chips span:nth-child(odd){border-color:rgba(247,109,1,.7)}
.who{margin-top:30px;font-size:15px;color:rgba(255,255,255,.7)}
.who b{color:#fff;font-weight:600}
.url{margin-left:24px;font-size:15px;color:rgba(255,255,255,.75)}
"""


def a6():
    N = len(A6_SLIDES)
    out = {}
    for i, sl in enumerate(A6_SLIDES):
        size = {'cover': 98, 'lesson': 76, 'system': 80, 'cta': 104}[sl['kind']]
        tag = {'lesson': f'Lesson {sl.get("num")} / 05', 'cta': 'Next step'}.get(sl['kind'], sl.get('kicker'))
        body = f'<div class="body">{sl["body"]}</div>' if sl.get('body') else ''
        chips = '<div class="chips">' + ''.join(f'<span>{c}</span>' for c in sl['chips']) + '</div>' if sl.get('chips') else ''
        extra = ''
        if sl['kind'] == 'cover':
            extra = f'<div class="who mono">{WHO}</div>'
        if sl['kind'] == 'cta':
            extra = (f'<div style="display:flex;align-items:center;margin-top:34px"><div class="cta">Book a meeting <span>&rarr;</span></div>'
                     f'<div class="url mono">autommerce.com/contact</div></div><div class="who mono">{WHO}</div>')
        out[f'A6-five-lessons/slide_{i + 1:02d}'] = page(f"""
<div class="bg"><img src="../assets/{sl['img']}"><div class="shade"></div></div>
{abar(count(i, N))}
<div class="txt"><div class="tag mono"><i></i>{tag}</div><h1 style="font-size:{size}px">{sl['title']}</h1>{body}{chips}{extra}</div>
""" + foot(i, N), 'ink', A6_CSS)
    return out


# ---------------------------------------------------------------- M4 countdown poster
def m4():
    cells = ''.join(f'<i class="{"on" if d == 9 else "wf" if d == 27 else ""}"></i>' for d in range(9, 28))
    qs = [('Can a shopper tell the exact model from the title alone?'),
          ('Does every colour and size show its own photo?'),
          ('Does the page answer size, specs and delivery up&nbsp;front?')]
    rows = ''.join(f'<div class="q"><b>{k + 1:02d}</b><span>{q}</span></div>' for k, q in enumerate(qs))
    css = M2_CSS + """
.days{position:absolute;left:72px;right:72px;top:500px;display:flex;gap:7px}
.days i{flex:1;height:52px;border-radius:9px;background:rgba(11,10,16,.07);display:block}
.days i.on{background:rgba(247,109,1,.2);border:1px solid rgba(247,109,1,.6)}
.days i.wf{background:linear-gradient(135deg,#F76D01,#C40000)}
.dl{position:absolute;left:72px;right:72px;top:568px;display:flex;justify-content:space-between;font-size:13px;color:rgba(11,10,16,.55)}
.dl b{color:#0B0A10;font-weight:500}
.qs{position:absolute;left:72px;right:72px;top:650px}
.q{display:grid;grid-template-columns:76px 1fr;padding:26px 0;border-top:1px solid rgba(11,10,16,.12)}
.q:last-child{border-bottom:1px solid rgba(11,10,16,.12)}
.q b{font-family:'Geist Mono',monospace;font-size:18px;color:#F76D01;font-weight:500;padding-top:8px}
.q span{font-size:33px;font-weight:650;letter-spacing:-.025em;line-height:1.22}
.stat{position:absolute;left:72px;right:72px;top:1046px;display:flex;align-items:center;gap:28px}
.stat .n{padding-right:.08em;font-size:92px;font-weight:800;letter-spacing:-.06em;line-height:.9}
.stat p{font-size:23px;line-height:1.35;color:#3B3742;letter-spacing:-.01em}
.stat small{display:block;margin-top:6px;font-size:11.5px;color:rgba(11,10,16,.45)}
"""
    body = PAPER_BG + mbar('<div class="chip mono"><i></i>White Friday &middot; 27 Nov</div>') + f"""
<h1 class="abs" style="left:72px;top:170px;font-size:90px">18 days to<br>White Friday.<br><span class="warm">Is your catalog ready?</span></h1>
<div class="days">{cells}</div>
<div class="dl mono"><span><b>9 Nov</b> Today</span><span><b>27 Nov</b> White Friday</span></div>
<div class="qs">{rows}</div>
<div class="stat"><div class="n warm">83%</div><p>of shoppers would abandon a product page that lacks the&nbsp;information they&nbsp;want.<small class="mono">Source: Syndigo, State of Product Experience 2026</small></p></div>
<div class="foot"><div class="cta">Book a demo <span>&rarr;</span></div><span class="mono" style="font-size:14px;color:rgba(11,10,16,.6)">autommerce.com/contact</span></div>
"""
    return {'M4-white-friday-ready/M4_poster': page(body, 'paper', css)}


# ---------------------------------------------------------------- M6 what AI assistants read
M6_CSS = M2_CSS + """
.pp{position:absolute;left:72px;right:72px;top:540px;height:660px;border-radius:30px;background:linear-gradient(135deg,rgba(247,109,1,.14) 0%,rgba(196,0,0,.06) 50%,rgba(64,0,149,.14) 100%);display:flex;align-items:center;justify-content:center}
.pg{width:860px;background:#fff;border-radius:20px;border:1px solid rgba(11,10,16,.08);box-shadow:0 30px 70px -34px rgba(64,0,149,.45);padding:28px;display:grid;grid-template-columns:290px 1fr;gap:24px;font-size:16px;color:#0B0A10}
.pg .im{grid-row:span 3;border-radius:14px;background:#fff;border:1px solid rgba(11,10,16,.07);display:flex;align-items:center;justify-content:center;height:340px}
.pg .im img{height:290px}
.sec{border-radius:12px;padding:12px 14px;transition:none;position:relative}
.pg .t{font-size:25px;font-weight:700;letter-spacing:-.02em;line-height:1.2}
.pg .rv{font-size:15.5px;line-height:1.4;color:#6B6670}
.pg .rv b{color:#F76D01;letter-spacing:2px}
.pg .of{display:flex;flex-direction:column;gap:6px;font-size:16px}
.pg .of .p{font-size:32px;font-weight:800;letter-spacing:-.03em}
.pg .of .g{color:#11803B;font-weight:600}
.pg table{width:100%;border-collapse:collapse;font-size:16px}
.pg td{padding:7px 0;border-top:1px solid rgba(11,10,16,.07)}
.pg td:first-child{color:#6B6670;width:48%}
.pg .h{font-family:'Geist Mono',monospace;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#6B6670;margin-bottom:6px}
.pg .faq p{font-size:15.5px;line-height:1.4;margin-top:6px}
.pg .faq p b{font-weight:600}
.pg .full{grid-column:span 2;display:grid;grid-template-columns:1fr 1fr;gap:18px}
.dim .sec{opacity:.28}
.dim .sec.hl{opacity:1;outline:3px solid #F76D01;outline-offset:2px;background:#FFF7F0}
.ill{position:absolute;left:72px;top:1226px;font-size:11.5px;color:rgba(11,10,16,.45)}
.bigs{position:absolute;left:72px;right:72px;top:560px;display:grid;gap:22px}
.bigs .c{background:#fff;border:1px solid rgba(11,10,16,.08);border-radius:26px;padding:40px 44px;display:grid;grid-template-columns:400px 1fr;align-items:center}
.bigs .n{padding-right:.08em;font-size:120px;font-weight:800;letter-spacing:-.06em;line-height:.9}
.bigs p{font-size:28px;line-height:1.34;letter-spacing:-.014em;color:#26232B}
.src{position:absolute;left:72px;top:1214px;font-size:11.5px;color:rgba(11,10,16,.45)}
"""


def product_page(hl=None):
    def s(key):
        return 'sec hl' if key == hl else 'sec'
    return f"""<div class="pg">
<div class="im {s('img')}"><img src="../assets/xm5.jpg"></div>
<div class="{s('title')}"><div class="t">Sony WH-1000XM5 Wireless Noise Cancelling Headphones, Black</div></div>
<div class="{s('reviews')}"><div class="rv"><b>&#9733;&#9733;&#9733;&#9733;&#9733;</b>&nbsp; 4.7 &middot; 128 reviews &middot; &ldquo;Best noise cancelling I've owned.&rdquo;</div></div>
<div class="{s('offer')}"><div class="of"><span class="p">$399.99</span><span class="g">In stock &middot; Delivery in 2 days</span><span>Free returns within 30 days</span></div></div>
<div class="full"><div class="{s('specs')}"><div class="h">Specifications</div><table>
<tr><td>Battery life</td><td>Up to 30 hours</td></tr><tr><td>Weight</td><td>250 g</td></tr>
<tr><td>Bluetooth</td><td>5.2, multipoint</td></tr><tr><td>Noise cancelling</td><td>Yes, adaptive</td></tr></table></div>
<div class="{s('faq')} faq"><div class="h">Questions</div><p><b>Does it work with iPhone and Android?</b> Yes, over Bluetooth, with apps for both.</p>
<p><b>Can I use it on a plane?</b> Yes, with the included cable.</p></div></div>
</div>"""


M6_POINTS = [
    ('title', 'title', 'A title that names<br><span class="warm">the exact product.</span>',
     'Brand, model, product type, colour. An assistant matches the request to the title before it reads anything&nbsp;else.'),
    ('specs', 'specs', 'Specs as text,<br><span class="warm">not pictures.</span>',
     'A table it can quote: battery, weight, size, compatibility. A spec sheet inside an image is&nbsp;invisible.'),
    ('faq', 'faq', 'Answers to<br><span class="warm">real questions.</span>',
     'Adobe found AI assistants read content that explains best: specs, FAQs and&nbsp;guides.'),
    ('proof', 'reviews', 'Proof from<br><span class="warm">other buyers.</span>',
     '53% of shoppers say ratings and reviews influence their purchase. Syndigo, State of Product Experience&nbsp;2026.'),
    ('offer', 'offer', 'The offer,<br><span class="warm">spelled out.</span>',
     'Price, stock, delivery time and the returns policy, written on the page. An assistant can only promise what it can&nbsp;read.'),
]


def m6():
    N = 9
    out = {}
    out['M6-ai-assistants-read/slide_01'] = page(PAPER_BG + mbar(count(0, N)) + f"""
<div class="kick mono"><i></i>Holiday 2026</div>
<h1 class="abs" style="left:72px;right:72px;top:212px;font-size:92px">AI assistants don't<br>see your banners.<br><span class="warm">They read the page.</span></h1>
<div class="tline" style="top:520px;width:860px">What they look for on a product page, in five points.</div>
<div class="pp" style="top:580px;height:636px">{product_page()}</div>
<div class="ill mono">Illustrative product page</div>""" + foot(0, N), 'paper', M6_CSS)
    out['M6-ai-assistants-read/slide_02'] = page(PAPER_BG + mbar(count(1, N)) + """
<div class="kick mono"><i></i>Why now</div>
<h1 class="abs" style="left:72px;right:72px;top:212px;font-size:88px">Shoppers now ask<br><span class="warm">before they browse.</span></h1>
<div class="tline" style="top:428px">Adobe's numbers for US retail sites this season:</div>
<div class="bigs"><div class="c"><div class="n warm">+130%</div><p>forecast growth in AI traffic this holiday season, year over&nbsp;year.</p></div>
<div class="c"><div class="n warm">90%</div><p>higher conversion from AI traffic than from other traffic in September&nbsp;2026.</p></div></div>
<div class="src mono">Source: Adobe, October 2026</div>""" + foot(1, N), 'paper', M6_CSS)
    out['M6-ai-assistants-read/slide_03'] = page(PAPER_BG + mbar(count(2, N)) + """
<div class="kick mono"><i></i>The gap</div>
<h1 class="abs" style="left:72px;right:72px;top:212px;font-size:88px">Most pages are<br><span class="warm">half-readable.</span></h1>
<div class="tline" style="top:428px">If an assistant can't read it, it can't recommend it.</div>
<div class="bigs"><div class="c"><div class="n warm">63%</div><p>average citation readability score of a US retail homepage. Over a third of the content is invisible to&nbsp;AI.</p></div>
<div class="c"><div class="n warm">83%</div><p>of shoppers would abandon a product page that lacks the information they want.</p></div></div>
<div class="src mono">Sources: Adobe, October 2026 &middot; Syndigo, State of Product Experience 2026</div>""" + foot(2, N), 'paper', M6_CSS)
    for k, (key, hl, title, line) in enumerate(M6_POINTS):
        i = k + 3
        out[f'M6-ai-assistants-read/slide_{i + 1:02d}'] = page(PAPER_BG + mbar(count(i, N)) + f"""
<div class="kick mono"><i></i>What it reads &middot; {k + 1:02d} / 05</div>
<h1 class="tname" style="font-size:76px;line-height:1">{title}</h1>
<div class="tline" style="top:406px;width:900px">{line}</div>
<div class="pp dim">{product_page(hl)}</div>
<div class="ill mono">Illustrative product page</div>""" + foot(i, N), 'paper', M6_CSS)
    out['M6-ai-assistants-read/slide_09'] = page(PAPER_BG + mbar(count(8, N)) + """
<div class="kick mono" style="top:360px"><i></i>Next step</div>
<h1 class="abs" style="left:72px;top:406px;font-size:100px">Make every page<br><span class="warm">readable.</span></h1>
<div class="abs" style="left:72px;width:880px;top:640px;font-size:31px;line-height:1.36;color:#3B3742;letter-spacing:-.014em">Catalog Intelligence finds the exact product and writes titles, descriptions, specs and FAQs for every row in your supplier&nbsp;sheet.</div>
<div class="abs" style="left:72px;top:840px;display:flex;align-items:center;gap:28px"><div class="cta">Book a demo <span>&rarr;</span></div><span class="mono" style="font-size:15px;color:rgba(11,10,16,.6)">autommerce.com/contact</span></div>
""" + foot(8, N), 'paper', M6_CSS)
    return out


# ---------------------------------------------------------------- P6 demo poster
def p6():
    pts = ['Recommends only what you&nbsp;stock', 'Builds complete looks in one tap', "Shows outfits on the shopper's own&nbsp;avatar"]
    rows = ''.join(f'<div><b>{k + 1:02d}</b><span>{t}</span></div>' for k, t in enumerate(pts))
    css = P_CSS + """
.pts{position:absolute;left:72px;width:470px;top:640px}
.pts div{display:grid;grid-template-columns:54px 1fr;padding:22px 0;border-top:1px solid rgba(255,255,255,.14)}
.pts div:last-child{border-bottom:1px solid rgba(255,255,255,.14)}
.pts b{font-family:'Geist Mono',monospace;font-size:15px;color:#F76D01;font-weight:500;padding-top:6px}
.pts span{font-size:27px;font-weight:600;letter-spacing:-.02em;line-height:1.25}
.phone img{border-radius:0}
"""
    body = P_BG + pbar('<div class="chip mono"><i></i>Before White Friday</div>') + f"""
<h1 class="abs" style="left:72px;top:176px;font-size:96px">See Persona<br>in action before<br><span class="grad">White Friday.</span></h1>
<div class="abs body" style="left:72px;width:470px;top:500px;font-size:25px">A short demo of the AI stylist and virtual fitting room, on a live store.</div>
<div class="pts">{rows}</div>
<div class="phone" style="left:556px;top:600px;width:250px;transform:rotate(-4deg)"><img src="../assets/ph_looks.png"></div>
<div class="phone" style="left:770px;top:556px;width:260px;transform:rotate(4deg)"><img src="../assets/ph_wear.png"></div>
<div class="foot" style="bottom:96px"><div style="display:flex;align-items:center;gap:26px"><div class="cta">Book a demo <span>&rarr;</span></div><span class="mono" style="font-size:14px;color:rgba(255,255,255,.7)">persona.autommerce.com/contact</span></div></div>
<div class="abs note mono" style="left:72px;right:72px;bottom:48px;text-align:right">Demo store &middot; sample avatar</div>
"""
    return {'P6-see-persona/P6_poster': page(body, 'ink', css)}


# ---------------------------------------------------------------- P7 privacy carousel
P7_CSS = P_CSS + """
.main{position:absolute;left:72px;right:72px;top:182px}
.tl{position:absolute;left:72px;right:72px;top:640px}
.tl .ln{position:relative;height:4px;background:rgba(255,255,255,.14);border-radius:2px;margin:60px 0 0}
.tl .ln i{position:absolute;top:-10px;width:24px;height:24px;border-radius:50%;background:#0B0A10;border:4px solid #F76D01}
.tl .ln em{position:absolute;left:0;top:0;height:4px;border-radius:2px;background:linear-gradient(90deg,#F76D01,#C40000)}
.tl .lb{position:relative;height:230px}
.tl .lb div{position:absolute;top:34px;width:300px}
.tl .lb b{display:block;font-size:44px;font-weight:800;letter-spacing:-.04em}
.tl .lb span{display:block;margin-top:8px;font-size:21px;line-height:1.35;color:rgba(255,255,255,.75)}
.two{position:absolute;left:72px;right:72px;top:640px;display:grid;grid-template-columns:1fr 1fr;gap:22px}
.two .c{border-radius:24px;padding:34px;background:#15131D;border:1px solid rgba(255,255,255,.1)}
.two .c.off{background:transparent;border:1px dashed rgba(255,255,255,.22)}
.two small{display:block;font-size:13px;color:#F76D01;margin-bottom:20px}
.two .c.off small{color:rgba(255,255,255,.5)}
.two p{font-size:25px;padding:12px 0;border-top:1px solid rgba(255,255,255,.08);display:flex;justify-content:space-between}
.two p em{font-style:normal;color:rgba(255,255,255,.5);font-family:'Geist Mono',monospace;font-size:18px}
.code{display:flex;gap:14px;margin-top:6px}
.code span{width:88px;height:110px;border-radius:18px;background:#15131D;border:1px solid rgba(255,255,255,.14);display:flex;align-items:center;justify-content:center;font-size:52px;font-weight:700;font-family:'Geist Mono',monospace}
.code span:last-child{border-color:#F76D01}
.agree{margin-top:34px;display:flex;align-items:center;gap:18px;font-size:24px;color:rgba(255,255,255,.85)}
.agree i{width:36px;height:36px;border-radius:9px;background:linear-gradient(135deg,#F76D01,#C40000);display:flex;align-items:center;justify-content:center;font-style:normal;font-size:22px}
.li{margin-top:40px}
.li div{display:grid;grid-template-columns:54px 1fr;padding:20px 0;border-top:1px solid rgba(255,255,255,.12);font-size:26px;letter-spacing:-.015em}
.li b{font-family:'Geist Mono',monospace;font-size:15px;color:#F76D01;font-weight:500;padding-top:6px}
.phone img{border-radius:0}
"""


def p7():
    N = 6
    out = {}
    c = lambda i: count(i, N)
    out['P7-photo-privacy/slide_01'] = page(P_BG + pbar(c(0)) + """
<div class="main"><div class="kick mono"><i></i>Shopper privacy</div>
<h1 style="font-size:100px">What happens<br>to the shopper's<br><span class="grad">photo?</span></h1>
<div class="body" style="margin-top:30px;width:560px">The first question retailers ask us. Here is the plain answer, step by&nbsp;step.</div></div>
<div class="phone" style="left:650px;top:600px;width:330px;transform:rotate(4deg)"><img src="../assets/ph_choose.png"></div>
""" + foot(0, N), 'ink', P7_CSS)
    out['P7-photo-privacy/slide_02'] = page(P_BG + pbar(c(1)) + """
<div class="abs" style="left:72px;width:500px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center">
<div class="kick mono"><i></i>01 &middot; One job</div>
<h1 style="font-size:72px">It builds the<br>avatar. <span class="grad">That's&nbsp;all.</span></h1>
<div class="body" style="margin-top:28px">The photo is used to create the shopper's avatar options. The raw photo is removed from the browser before anything is saved&nbsp;there.</div></div>
<div class="phone" style="left:610px;top:250px;width:400px"><img src="../assets/ph_choose.png"></div>
<div class="abs note mono" style="left:610px;width:400px;top:1090px;text-align:center">Demo store &middot; sample avatar</div>
""" + foot(1, N), 'ink', P7_CSS)
    out['P7-photo-privacy/slide_03'] = page(P_BG + pbar(c(2)) + """
<div class="main"><div class="kick mono"><i></i>02 &middot; A short life</div>
<h1 style="font-size:84px">Held in memory.<br><span class="grad">Then it's gone.</span></h1>
<div class="body" style="margin-top:28px;width:880px">Not written to a database. The server keeps the photo in memory only, so the shopper doesn't upload it again every&nbsp;message.</div></div>
<div class="tl"><div class="ln"><em style="width:100%"></em><i style="left:-4px"></i><i style="left:calc(25% - 12px)"></i><i style="left:calc(100% - 20px)"></i></div>
<div class="lb"><div style="left:0;width:200px"><b>0 min</b><span>Photo uploaded, avatar created</span></div>
<div style="left:calc(25% - 10px);width:290px"><b>30 min</b><span>Image provider deletes the upload</span></div>
<div style="right:0;width:260px;text-align:right"><b>2 hours</b><span>Server memory cleared, at the latest</span></div></div></div>
""" + foot(2, N), 'ink', P7_CSS)
    out['P7-photo-privacy/slide_04'] = page(P_BG + pbar(c(3)) + """
<div class="main"><div class="kick mono"><i></i>03 &middot; Measurements</div>
<h1 style="font-size:84px">The merchant never<br><span class="grad">sees the numbers.</span></h1>
<div class="body" style="margin-top:28px;width:880px">Height, weight and measurements are used for fit and size suggestions. They are not shown in the retailer's&nbsp;dashboard.</div></div>
<div class="two"><div class="c"><small class="mono">Used for the shopper</small><p>Height <em>fit</em></p><p>Weight <em>fit</em></p><p>Chest, waist <em>size</em></p><p>Shoe size <em>size</em></p></div>
<div class="c off"><small class="mono">Shown to the merchant</small><p>Height <em>no</em></p><p>Weight <em>no</em></p><p>Chest, waist <em>no</em></p><p>Shoe size <em>no</em></p></div></div>
""" + foot(3, N), 'ink', P7_CSS)
    out['P7-photo-privacy/slide_05'] = page(P_BG + pbar(c(4)) + """
<div class="main"><div class="kick mono"><i></i>04 &middot; Sign-in</div>
<h1 style="font-size:84px">A code by email.<br><span class="grad">No passwords.</span></h1>
<div class="body" style="margin-top:28px;width:880px">Shoppers sign in with a 6-digit code and accept a privacy notice the first time. One account holds up to 3 profiles, for the shopper, a partner or a&nbsp;child.</div>
<div class="code" style="margin-top:60px"><span>4</span><span>8</span><span>2</span><span>9</span><span>1</span><span>6</span></div>
<div class="agree"><i>&#10003;</i>I agree to the privacy notice</div></div>
""" + foot(4, N), 'ink', P7_CSS)
    out['P7-photo-privacy/slide_06'] = page(P_BG + pbar(c(5)) + """
<div class="main" style="top:300px"><div class="kick mono"><i></i>For retailers</div>
<h1 style="font-size:96px">Try-on shoppers<br><span class="grad">can trust.</span></h1>
<div class="li"><div><b>01</b>Photo used only to build the avatar</div><div><b>02</b>Gone from memory within 2 hours</div>
<div><b>03</b>Measurements never shown to you</div><div><b>04</b>Checkout stays on your own store</div></div>
<div style="display:flex;align-items:center;gap:28px;margin-top:56px"><div class="cta">Book a demo <span>&rarr;</span></div><span class="mono" style="font-size:15px;color:rgba(255,255,255,.7)">persona.autommerce.com/contact</span></div></div>
""" + foot(5, N), 'ink', P7_CSS)
    return out


# ---------------------------------------------------------------- render
async def render(pages):
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/local/bin/google-chrome', args=['--no-sandbox', '--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': 1080, 'height': 1350}, device_scale_factor=2)
        for key, html in pages.items():
            os.makedirs(os.path.join(BASE, os.path.dirname(key)), exist_ok=True)
            fn = os.path.join(BASE, key + '.html'); open(fn, 'w').write(html)
            await pg.goto(f'file://{fn}', wait_until='networkidle')
            await pg.evaluate('document.fonts.ready'); await pg.wait_for_timeout(400)
            await pg.screenshot(path=os.path.join(BASE, key + '.png')); print('ok', key)
        await b.close()


def pdf(folder, name):
    files = sorted(f for f in os.listdir(os.path.join(BASE, folder)) if f.startswith('slide_') and f.endswith('.png'))
    ims = [Image.open(os.path.join(BASE, folder, f)).convert('RGB').resize((1080, 1350), Image.LANCZOS) for f in files]
    ims[0].save(os.path.join(BASE, folder, name), save_all=True, append_images=ims[1:], resolution=72)


BUILDERS = dict(A3=a3, A5=a5, A6=a6, M4=m4, M6=m6, P6=p6, P7=p7)
PDFS = dict(A3=('A3-white-friday-checklist', 'A3_white_friday_checklist_linkedin.pdf'),
            A6=('A6-five-lessons', 'A6_five_lessons_linkedin.pdf'),
            M6=('M6-ai-assistants-read', 'M6_ai_assistants_read_linkedin.pdf'),
            P7=('P7-photo-privacy', 'P7_photo_privacy_linkedin.pdf'))

if __name__ == '__main__':
    keys = sys.argv[1:] or list(BUILDERS)
    pages = {}
    for k in keys: pages.update(BUILDERS[k]())
    asyncio.run(render(pages))
    for k in keys:
        if k in PDFS: pdf(*PDFS[k])
