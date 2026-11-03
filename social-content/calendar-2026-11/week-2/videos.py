"""Week 2 demo video configs. usage: python3 videos.py <KEY> [--stills t ...]"""
import json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ENGINE = os.path.join(HERE, '..', 'engine')
REC = '/tmp/work/w2'          # raw recordings stay outside the repo
W1A = os.path.join(HERE, '..', 'week-1', 'assets')


def frames(name):
    s = json.load(open(f'{REC}/{name}/src.json'))
    return f'file://{REC}/{name}', s['frames'], s['size']


def k(n, label):
    return f'<span>{n}</span><em>{label}</em>'


PERSONA = dict(theme='ink', device='phone', logo=f'file://{W1A}/persona_logo.png', brand='Persona AI',
               sub='by Autommerce', fit=930,
               end=dict(cta='Book a demo', url='persona.autommerce.com'))

SEND = (730, 1460)
ARROW = (724, 849)


def p4():
    d, fr, size = frames('recp2')
    return dict(PERSONA, pill='AI stylist', dir=d, frames=fr, size=size, dur=32,
        segs=[[0, 1.3, 1.5, 1.5], [1.3, 4.6, 1.9, 5.22], [4.6, 5.2, 5.22, 5.9], [5.2, 7.6, 5.9, 15.4],
              [7.6, 10.2, 15.4, 18.0], [10.2, 14.3, 18.0, 22.1], [14.3, 16.0, 22.1, 23.8],
              [16.0, 18.5, 23.8, 26.3], [18.5, 19.0, 26.3, 26.85], [19.0, 22.4, 26.85, 50.1],
              [22.4, 27.9, 50.1, 55.6], [27.9, 32, 55.6, 55.6]],
        cam=[[0, 410, 800, 1], [1.0, 410, 800, 1], [1.9, 410, 1200, 1.7], [4.7, 410, 1200, 1.7],
             [5.6, 410, 560, 1.5], [7.6, 410, 640, 1.4], [9.6, 410, 800, 1.45], [12.8, 410, 820, 1.45],
             [13.7, 410, 1000, 1.45], [14.6, 410, 1000, 1.45], [15.4, 410, 1200, 1.6], [18.9, 410, 1200, 1.6],
             [19.8, 410, 850, 1.25], [22.4, 410, 820, 1.25], [23.2, 410, 800, 1.35], [27.5, 410, 830, 1.42],
             [28.7, 410, 800, 1]],
        taps=[[1.25, 358, 1460], [4.95, *SEND], [11.28, *ARROW], [13.01, *ARROW], [14.34, 359, 1310],
              [15.95, 358, 1460], [18.95, *SEND]],
        caps=[dict(a=0.3, b=5.2, k=k('01', 'Ask in plain words'), t="Shoppers ask the way|they'd ask a person."),
              dict(a=5.2, b=14.3, k=k('02', 'Grounded in your catalog'), t='Only what you stock,|with their size on it.'),
              dict(a=14.3, b=22.4, k=k('03', 'Complete the look'), t='One tap turns a blazer|into a full outfit.'),
              dict(a=22.4, b=27.9, k=k('04', 'Ready to buy'), t='Complete looks,|all under budget.')],
        end=dict(PERSONA['end'], at=27.9, big='Your best<br><span class="warm-text">salesperson.</span>',
                 sm='An AI stylist that recommends only what you sell, suggests a size and turns one item into a full&nbsp;outfit.'),
        music=dict(file='inspired-ambient-141686.mp3', start=0, vol=0.8))


def p5():
    d, fr, size = frames('recp2')
    return dict(PERSONA, pill='Complete the look', dir=d, frames=fr, size=size, dur=27.5,
        segs=[[0, 1.2, 20.6, 20.6], [1.2, 3.4, 20.6, 22.8], [3.4, 4.6, 22.8, 24.0], [4.6, 7.0, 24.0, 26.4],
              [7.0, 7.5, 26.4, 26.9], [7.5, 10.3, 26.9, 50.1], [10.3, 15.4, 50.1, 56.2],
              [15.4, 19.0, 56.2, 74.4], [19.0, 23.5, 74.4, 79.0], [23.5, 27.5, 79.0, 79.0]],
        cam=[[0, 410, 800, 1], [0.9, 410, 800, 1], [1.8, 410, 1000, 1.45], [3.2, 410, 1000, 1.45],
             [4.0, 410, 1200, 1.6], [7.5, 410, 1200, 1.6], [8.3, 410, 850, 1.25], [10.3, 410, 820, 1.25],
             [11.2, 410, 880, 1.45], [15.3, 410, 900, 1.45], [16.2, 410, 800, 1.0], [19.0, 410, 800, 1.0],
             [20.2, 410, 760, 1.3], [23.0, 410, 780, 1.38], [24.2, 410, 800, 1]],
        taps=[[2.74, 359, 1310], [4.35, 358, 1460], [7.4, *SEND], [15.2, 259, 1128]],
        caps=[dict(a=0.3, b=7.5, k=k('01', 'Pick one piece'), t='Start with the one item|the shopper likes.'),
              dict(a=7.5, b=15.4, k=k('02', 'Complete the look'), t='The stylist builds|three outfits around it.'),
              dict(a=15.4, b=19.0, k=k('03', 'Wear full look'), t='Every piece,|rendered together.'),
              dict(a=19.0, b=23.5, k=k('04', 'On their avatar'), t='The whole outfit,|with a fit score.')],
        end=dict(PERSONA['end'], at=23.5, big='Sell the<br><span class="warm-text">outfit,</span><br>not the item.',
                 vars={'etop': '430px', 'ew': '640px', 'ebig': '98px'},
                 sm='Persona turns one product into a complete look shoppers see on themselves, then adds every piece to the cart in one&nbsp;tap.'),
        music=dict(file='inspired-ambient-141686.mp3', start=0, vol=0.8))


AUTOMMERCE = dict(theme='paper', device='browser', logo=f'file://{W1A}/autommerce-natural.png', brand='Autommerce',
                  url='platform.autommerce.com', fit=617, curScale=2.6, exitX=800, exitShrink=0.35,
                  end=dict(cta='Book a demo', url='autommerce.com'))


def m5():
    d, fr, size = frames('recic')
    return dict(AUTOMMERCE, pill='Image Classification', dir=d, frames=fr, size=size, dur=31.4,
        segs=[[0, 1.0, 1.2, 1.2], [1.0, 3.1, 1.25, 3.37], [3.1, 6.4, 3.37, 6.67], [6.4, 6.9, 6.67, 7.17],
              [6.9, 8.2, 7.17, 8.6], [8.2, 8.9, 8.6, 9.3], [8.9, 10.6, 9.3, 14.4], [10.6, 12.2, 14.4, 16.0],
              [12.2, 15.4, 16.0, 111.6], [15.4, 16.6, 200.8, 202.0], [16.6, 27.4, 202.0, 223.7],
              [27.4, 31.4, 223.7, 223.7]],
        cam=[[0, 1440, 900, 1.0], [0.6, 1440, 900, 1.0], [1.5, 1300, 850, 1.9], [3.0, 1300, 900, 1.9],
             [6.3, 1300, 1050, 1.9], [7.2, 1300, 1150, 1.9], [8.4, 1300, 1250, 1.7], [9.0, 1440, 760, 1.6], [9.9, 1440, 760, 1.6], [10.6, 1500, 1300, 1.45],
             [11.4, 2250, 1450, 1.8], [12.4, 2250, 1450, 1.8], [13.2, 1440, 780, 1.7], [15.0, 1440, 780, 1.7],
             [15.8, 1300, 520, 1.8], [16.8, 1300, 560, 1.8], [17.8, 1440, 1000, 1.45], [27.0, 1440, 1000, 1.45],
             [28.2, 1440, 900, 1.0]],
        cursor=[[0.5, 2100, 1300], [1.0, 1296, 809], [2.9, 1296, 809], [3.1, 1296, 1003], [6.5, 1296, 1003],
                [6.9, 1296, 1210], [8.3, 1296, 1210], [8.85, 1296, 1342], [10.3, 1700, 1500], [12.1, 2623, 1646],
                [13.2, 2623, 1646], [15.4, 1700, 1150], [27.4, 1700, 1150]],
        taps=[[1.03, 1296, 809], [3.11, 1296, 1003], [6.92, 1296, 1210], [8.86, 1296, 1342], [12.14, 2623, 1646]],
        caps=[dict(a=0.3, b=6.4, k=k('01', 'Name it, guide it'), t='Tell the AI how|to group the photos.'),
              dict(a=6.4, b=12.2, k=k('02', 'Drop the batch'), t='48 supplier photos.|No SKUs in the names.'),
              dict(a=12.2, b=15.4, k=k('03', 'One multimodal pass'), t='Every image analysed|in a single run.'),
              dict(a=15.4, b=27.4, k=k('04', 'Grouped by exact model'), t='8 products, named|down to the model.')],
        end=dict(AUTOMMERCE['end'], at=27.4, big='Your photo<br>folder,<br><span class="warm-text">sorted.</span>',
                 vars={'etop': '420px', 'ew': '520px'},
                 sm='Image Classification groups supplier photos by exact product. This batch of 48 took 96&nbsp;seconds.'),
        music=dict(file='the-upbeat-inspiring-corporate-142313.mp3', start=0, vol=0.7))


def m7():
    d, fr, size = frames('recpv')
    return dict(AUTOMMERCE, pill='Products Visualizer', dir=d, frames=fr, size=size, dur=32.2,
        segs=[[0, 1.0, 1.2, 1.2], [1.0, 2.8, 1.25, 3.05], [2.8, 4.2, 3.05, 4.45], [4.2, 5.9, 4.45, 6.2],
              [5.9, 9.5, 6.2, 60], [9.5, 14.5, 60, 168.9], [14.5, 16.0, 168.9, 172.2], [16.0, 17.2, 172.2, 176.0],
              [17.2, 28.2, 176.0, 199.2], [28.2, 32.2, 199.2, 199.2]],
        cam=[[0, 1440, 900, 1.0], [0.5, 1440, 900, 1.0], [1.3, 830, 1050, 2.0], [5.9, 830, 1050, 2.0],
             [7.0, 1700, 1000, 1.9], [9.5, 1720, 980, 1.95], [14.0, 1760, 950, 2.05], [15.0, 1300, 800, 1.8],
             [16.2, 1300, 800, 1.8], [17.0, 1440, 920, 1.55], [27.8, 1440, 920, 1.6], [29.0, 1440, 900, 1.0]],
        cursor=[[0.4, 1500, 1100], [1.0, 319, 463], [2.4, 319, 463], [2.8, 458, 1370], [3.8, 458, 1370],
                [4.15, 712, 372], [5.1, 600, 1100], [5.5, 319, 1624], [7.0, 1000, 1300], [14.8, 830, 458],
                [16.0, 830, 458], [17.0, 1500, 1000], [28.2, 1500, 1000]],
        taps=[[1.02, 319, 463], [2.8, 458, 1370], [4.15, 712, 372], [5.5, 319, 1624], [15.8, 830, 458]],
        caps=[dict(a=0.3, b=5.9, k=k('01', 'Before'), t='A plain packshot and|one line of supplier copy.'),
              dict(a=5.9, b=9.5, k=k('02', 'Copy first'), t='Product stories, written|from your own columns.'),
              dict(a=9.5, b=14.5, k=k('03', 'Then the visuals'), t='Lifestyle shots that|match the copy.'),
              dict(a=14.5, b=28.2, k=k('04', 'After'), t='A finished product page,|ready to publish.')],
        end=dict(AUTOMMERCE['end'], at=28.2, big='Packshot in.<br><span class="warm-text">Product page<br>out.</span>',
                 vars={'etop': '420px', 'ew': '640px', 'ebig': '92px'},
                 sm='Products Visualizer writes the story and generates the lifestyle images for every row. Five products took under three&nbsp;minutes.'),
        music=dict(file='motivational-day-112790.mp3', start=6, vol=0.7))


def a4():
    d, fr, size = frames('recci2')
    return dict(AUTOMMERCE, theme='ink', logo=f'file://{W1A}/autommerce-white.png', pill='Catalog Intelligence',
        dir=d, frames=fr, size=size, dur=33.5,
        segs=[[0, 1.0, 1.2, 1.2], [1.0, 2.7, 1.25, 2.95], [2.7, 4.1, 2.95, 4.4], [4.1, 9.5, 4.4, 66.0],
              [9.5, 11.0, 66.0, 68.5], [11.0, 12.6, 68.5, 70.2], [12.6, 16.0, 70.2, 232.5],
              [16.0, 17.0, 232.5, 235.0], [17.0, 24.5, 235.0, 243.5], [24.5, 33.5, 243.5, 244.9]],
        cam=[[0, 1440, 900, 1.0], [0.5, 1440, 900, 1.0], [1.2, 960, 900, 1.5], [2.7, 960, 900, 1.5],
             [3.4, 960, 1230, 1.6], [4.3, 960, 1230, 1.6], [5.2, 2140, 780, 2.2], [10.2, 2140, 780, 2.2],
             [11.0, 960, 1100, 1.5], [12.9, 960, 1100, 1.5], [13.7, 1440, 900, 1.15], [15.5, 1440, 900, 1.15],
             [17.3, 2230, 780, 2.25], [28.6, 2250, 780, 2.35], [29.5, 1440, 900, 1.0]],
        cursor=[[0.3, 1500, 1100], [0.95, 175, 536], [1.5, 175, 536], [2.6, 1030, 319], [2.9, 1030, 319],
                [3.95, 671, 1640], [4.6, 671, 1640], [5.4, 1700, 1300], [10.3, 1700, 1300], [10.95, 175, 634],
                [11.6, 175, 634], [12.5, 671, 1640], [13.2, 671, 1640], [16.6, 2650, 1380], [29.5, 2650, 1380]],
        taps=[[1.02, 175, 536], [2.72, 1030, 319], [4.09, 671, 1640], [11.0, 175, 634], [12.64, 671, 1640]],
        caps=[dict(a=0.3, b=4.1, k=k('01', 'The supplier sheet'), t='Six SKUs. A code|and a title, nothing else.'),
              dict(a=4.1, b=11.0, k=k('02', 'Source Finder'), t="The maker's own page|for each exact model."),
              dict(a=11.0, b=17.0, k=k('03', 'Image Finder'), t='Then the real photos,|from those pages.'),
              dict(a=17.0, b=29.5, k=k('04', 'Exact, or nothing'), t='Images for 5 of 6.|The 6th says Not found.')],
        end=dict(AUTOMMERCE['end'], at=29.5, big='Exact match,<br><span class="warm-text">or nothing.</span>',
                 vars={'etop': '420px', 'ew': '640px', 'ebig': '92px'},
                 sm='Catalog Intelligence finds the pages and photos of the exact model in your sheet, and flags what it can&rsquo;t&nbsp;verify.'),
        music=dict(file='motivational-day-112790.mp3', start=40, vol=0.7))


VIDEOS = dict(P4=p4, P5=p5, M5=m5, M7=m7, A4=a4)

if __name__ == '__main__':
    key = sys.argv[1]; cfg = VIDEOS[key]()
    os.makedirs(f'{HERE}/videos', exist_ok=True)
    cp = f'/tmp/work/w2/{key}.json'; json.dump(cfg, open(cp, 'w'))
    subprocess.run([sys.executable, f'{ENGINE}/demo.py', cp, f'{HERE}/videos/{key}.mp4', *sys.argv[2:]], check=True)
