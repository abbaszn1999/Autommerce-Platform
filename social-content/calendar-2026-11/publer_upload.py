"""Build the Publer draft payload map for weeks 3 and 4.

Media is served from the feature branch on GitHub. Publer's Copilot API currently
requires a Business plan; when the plan allows, run this script to print the
post list, then submit one post + one account per call with when:"draft".

usage: python3 publer_upload.py
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BRANCH = 'cursor/social-visual-direction-fca7'
RAW = f'https://raw.githubusercontent.com/abbaszn1999/data-enrichment-ai/{BRANCH}/social-content/calendar-2026-11'

# account display names (ids resolved at submit time)
ABBAS = 'Abbas Zein'
LI = 'Autommerce'
FB = 'Autommerce - أوتوميرس'
IG = 'Autommerce'

POSTS = [
    # id, when ISO+02:00, where, format, asset relative, title for LinkedIn docs
    ('A7', '2026-11-16T08:30:00+02:00', 'abbas', 'document', 'week-3/A7-nine-fields', 'Nine fields between your product and ChatGPT'),
    ('M9', '2026-11-16T10:00:00+02:00', 'company', 'photo', 'week-3/M9-hours/poster.png', None),
    ('A8', '2026-11-17T08:30:00+02:00', 'abbas', 'photo', 'week-3/A8-why-persona/poster.png', None),
    ('M10', '2026-11-17T10:00:00+02:00', 'company', 'photo', 'week-3/M10-approval/poster.png', None),
    ('P8', '2026-11-17T17:00:00+02:00', 'company', 'photo', 'week-3/P8-live-mirror/poster.png', None),
    ('A9', '2026-11-18T08:30:00+02:00', 'abbas', 'photo', 'week-3/A9-three-readers/poster.png', None),
    ('M11', '2026-11-18T10:00:00+02:00', 'company', 'document', 'week-3/M11-seo-aeo-geo', 'SEO, AEO and GEO in plain words'),
    ('P9', '2026-11-18T17:00:00+02:00', 'company', 'photo', 'week-3/P9-sell-the-outfit/P9_poster.png', None),
    ('A10', '2026-11-19T08:30:00+02:00', 'abbas', 'photo', 'week-3/A10-not-found/poster.png', None),
    ('M12', '2026-11-19T10:00:00+02:00', 'company', 'photo', 'week-3/M12-menu/poster.png', None),
    ('P10', '2026-11-19T17:00:00+02:00', 'company', 'document', 'week-3/P10-tryon-mainstream', 'Try-on went mainstream'),
    ('M13', '2026-11-20T10:00:00+02:00', 'company', 'document', 'week-3/M13-who', 'Who Autommerce is for'),
    ('P11', '2026-11-22T17:00:00+02:00', 'company', 'photo', 'week-3/P11-size/poster.png', None),
    ('A11', '2026-11-23T08:30:00+02:00', 'abbas', 'photo', 'week-4/A11-peak-week/poster.png', None),
    ('M14', '2026-11-23T10:00:00+02:00', 'company', 'photo', 'week-4/M14-top-50/poster.png', None),
    ('A12', '2026-11-24T08:30:00+02:00', 'abbas', 'photo', 'week-4/A12-open-closed/poster.png', None),
    ('M15', '2026-11-24T10:00:00+02:00', 'company', 'photo', 'week-4/M15-growth/poster.png', None),
    ('P12', '2026-11-24T17:00:00+02:00', 'company', 'photo', 'week-4/P12-returns/poster.png', None),
    ('A13', '2026-11-25T08:30:00+02:00', 'abbas', 'photo', 'week-4/A13-first-question/poster.png', None),
    ('M16', '2026-11-25T10:00:00+02:00', 'company', 'photo', 'week-4/M16-sync/poster.png', None),
    ('P13', '2026-11-25T17:00:00+02:00', 'company', 'photo', 'week-4/P13-to-cart/poster.png', None),
    ('A14', '2026-11-26T08:30:00+02:00', 'abbas', 'document', 'week-4/A14-three-numbers', 'Three numbers next to revenue'),
    ('M17', '2026-11-26T10:00:00+02:00', 'company', 'photo', 'week-4/M17-gallery/poster.png', None),
    ('P14', '2026-11-26T17:00:00+02:00', 'company', 'photo', 'week-4/P14-dashboard/poster.png', None),
    ('M18', '2026-11-27T10:00:00+02:00', 'company', 'photo', 'week-4/M18-all-night/poster.png', None),
    ('P15', '2026-11-29T17:00:00+02:00', 'company', 'photo', 'week-4/P15-stylist/poster.png', None),
]


def media_urls(rel, fmt):
    p = ROOT / rel
    if fmt == 'document':
        slides = sorted(p.glob('slide_*.png'))
        return [f'{RAW}/{rel}/{s.name}' for s in slides]
    return [f'{RAW}/{rel}']


def main():
    missing = []
    for pid, when, where, fmt, rel, title in POSTS:
        if fmt == 'document':
            if not list((ROOT / rel).glob('slide_*.png')):
                missing.append(rel)
        elif not (ROOT / rel).exists():
            missing.append(rel)
    if missing:
        print('MISSING', *missing, sep='\n  ')
    print(f'{len(POSTS)} posts ready')
    for pid, when, where, fmt, rel, title in POSTS:
        urls = media_urls(rel, fmt)
        accounts = [ABBAS] if where == 'abbas' else [LI, FB, IG]
        print(f'{pid} {when} {fmt} x{len(accounts)} media={len(urls)} {title or rel}')


if __name__ == '__main__':
    main()
