"""The shareable cards.  python3 tools/make-cards.py

 Same envelope as the site, drawn with the same
stock and the same folds, so the picture in the message and the page it
links to are one object."""
import os, tempfile, numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'demo')
S = tempfile.mkdtemp(prefix='triple-invite-fonts-')   # the woff2 -> ttf scratch

VANILLA = (255, 247, 230)
ROSE    = (180, 106, 114)
LAGOON  = (45, 58, 71)

def ttf(name, out, **axes):
    p = os.path.join(S, out)
    if not os.path.exists(p):
        f = TTFont(os.path.join(D, 'assets/fonts', name)); f.flavor = None; f.save(p)
        f = instantiateVariableFont(TTFont(p), axes, inplace=True); f.save(p)
    return p

BODONI  = ttf('bodoni-moda-var.woff2', 'bod500.ttf', wght=500, opsz=72)
BODONI4 = ttf('bodoni-moda-var.woff2', 'bod400.ttf', wght=400, opsz=72)
ARCHIVO = ttf('archivo-var.woff2', 'arch700.ttf', wght=700)
ARCHIVO5= ttf('archivo-var.woff2', 'arch500.ttf', wght=500)

# ---------------------------------------------------------------- envelope
# viewBox 0..190 x 0..140, exactly as the page draws it
def q(p0, pc, p1, n=28):
    return [(( (1-t)**2*p0[0] + 2*(1-t)*t*pc[0] + t*t*p1[0] ),
             ( (1-t)**2*p0[1] + 2*(1-t)*t*pc[1] + t*t*p1[1] ))
            for t in (i/n for i in range(n+1))]

FLAP   = [(0,0), (88.85,94.68)] + q((88.85,94.68), (95,101.23), (101.15,94.68)) + [(190,0)]
BOTTOM = [(0,140), (88.67,98)]  + q((88.67,98),   (95,95),      (101.33,98))   + [(190,140)]
LEFT   = [(0,0), (95,98), (0,140)]
RIGHT  = [(190,0), (95,98), (190,140)]

def mask(poly, w, h):
    m = Image.new('L', (w, h), 0)
    ImageDraw.Draw(m).polygon([(x*w/190.0, y*h/140.0) for x, y in poly], fill=255)
    return m

def ramp(w, h, p0, p1, c0, c1):
    """linear gradient in normalised panel coords, RGBA at each end"""
    yy, xx = np.mgrid[0:h, 0:w]
    ux, uy = xx/float(w), yy/float(h)
    dx, dy = p1[0]-p0[0], p1[1]-p0[1]
    t = ((ux-p0[0])*dx + (uy-p0[1])*dy) / (dx*dx + dy*dy)
    t = np.clip(t, 0, 1)[..., None]
    g = np.array(c0, np.float32)*(1-t) + np.array(c1, np.float32)*t
    return Image.fromarray(g.astype(np.uint8), 'RGBA')

_tex = Image.open(os.path.join(D, 'assets/env-paper.jpg')).convert('RGB')

def cut(w, h, rot, off):
    """a different region of the one sheet, turned onto this fold's axis"""
    t = _tex.rotate(rot, expand=True, resample=Image.BICUBIC)
    sc = max((w*1.9)/t.width, (h*1.9)/t.height, 1.0)
    if sc > 1: t = t.resize((int(t.width*sc)+1, int(t.height*sc)+1), Image.LANCZOS)
    x = int((t.width - w)/2 + off[0]*w); y = int((t.height - h)/2 + off[1]*h)
    x = max(0, min(t.width-w, x)); y = max(0, min(t.height-h, y))
    return t.crop((x, y, x+w, y+h))

SHADE = {
    'left':   ((0.0,0.10), (1.0,0.60), (255,255,255,86), (74,56,36,30)),
    'right':  ((1.0,0.10), (0.0,0.60), (74,56,36,16),    (74,56,36,48)),
    'bottom': ((0.2,1.00), (0.5,0.00), (255,255,255,74), (74,56,36,18)),
    'flap':   ((0.15,0.0), (0.55,1.0), (255,255,255,96), (74,56,36,40)),
}
CUTS = {'left': (90, (-0.10, 0.12)), 'right': (-90, (0.14,-0.09)),
        'bottom': (180, (-0.12,-0.10)), 'flap': (0, (-0.15,-0.13))}

def envelope(width, ss=3):
    w = width*ss
    h = int(round(width/(190/140.0)))*ss
    k = w/190.0                      # one viewBox unit, in device pixels
    out = Image.new('RGBA', (w, h), (0,0,0,0))

    def panel(poly, name):
        p0, p1, c0, c1 = SHADE[name]
        rot, off = CUTS[name]
        lay = cut(w, h, rot, off).convert('RGBA')
        lay.alpha_composite(ramp(w, h, p0, p1, c0, c1))
        out.paste(lay, (0,0), mask(poly, w, h))

    def stroke(pts, units, fill, dy=0.0, blur=0.0):
        lay = Image.new('RGBA', (w, h), (0,0,0,0))
        ImageDraw.Draw(lay).line(
            [(x*k, (y+dy)*h/140.0) for x, y in pts],
            fill=fill, width=max(1, int(round(units*k))), joint='curve')
        if blur: lay = lay.filter(ImageFilter.GaussianBlur(blur*k))
        out.alpha_composite(lay)

    # the order the page stacks them in: side folds, then the bottom fold
    # over them, then the flap over everything. Each fold's crease belongs
    # to the fold that casts it, or it prints through the one above.
    panel(LEFT, 'left')
    panel(RIGHT, 'right')
    stroke(BOTTOM[1:-1], 1.5, (92,72,48,92), dy=-1.4, blur=0.75)
    panel(BOTTOM, 'bottom')
    stroke(BOTTOM[1:-1], 0.5, (255,252,246,150))
    stroke(FLAP[1:-1],  2.0, (74,56,36,72), dy=1.5, blur=1.5)
    panel(FLAP, 'flap')
    stroke(FLAP, 0.45, (120,96,70,80))
    return out.resize((width, int(round(width/(190/140.0)))), Image.LANCZOS)

# ---------------------------------------------------------------- type
def track(d, cx, y, text, font, fill, tr):
    ws = [d.textlength(c, font=font) for c in text]
    x = cx - (sum(ws) + tr*(len(text)-1))/2
    for c, wch in zip(text, ws):
        d.text((x, y), c, font=font, fill=fill); x += wch + tr
def centre(d, cx, y, text, font, fill):
    d.text((cx - d.textlength(text, font=font)/2, y), text, font=font, fill=fill)
def fit(d, text, path, target, tr=0.0, cap=400):
    lo, hi = 8, cap
    while lo < hi:
        mid = (lo+hi+1)//2
        f = ImageFont.truetype(path, mid)
        wdt = sum(d.textlength(c, font=f) for c in text) + tr*mid/100.0*(len(text)-1)
        if wdt <= target: lo = mid
        else: hi = mid-1
    return lo


# ---------------------------------------------------------------- the card
_grain = Image.open(os.path.join(D, 'assets/paper.jpg')).convert('L')

def card(W, H, env_w, layout, path, jpeg=False):
    im = Image.new('RGB', (W, H), VANILLA)
    d = ImageDraw.Draw(im)
    cx = W/2.0

    env = envelope(env_w)
    ex, ey = int(cx - env.width/2), layout['env_y']

    # the envelope's weight on the table
    sh = Image.new('RGBA', (W, H), (0,0,0,0))
    sh.paste((74,56,36,78), (ex+int(env_w*0.03), ey+int(env_w*0.055),
                             ex+env_w-int(env_w*0.03), ey+env.height+int(env_w*0.04)))
    sh = sh.filter(ImageFilter.GaussianBlur(env_w*0.04))
    im.paste(Image.alpha_composite(im.convert('RGBA'), sh).convert('RGB'), (0,0))
    im.paste(env, (ex, ey), env)
    d = ImageDraw.Draw(im)

    m = layout['margin']
    inner = W - 2*m

    f_eye = ImageFont.truetype(ARCHIVO, layout['eyebrow'])
    track(d, cx, layout['eyebrow_y'], 'YOU ARE INVITED TO', f_eye, ROSE, layout['eyebrow']*0.30)

    y = layout['head_y']
    for line in ('THANKSGIVING MASS', '& DINNER'):
        size = min(layout['head'], fit(d, line, BODONI, inner))
        f = ImageFont.truetype(BODONI if line[0] != '&' else BODONI4, size)
        centre(d, cx, y, line, f, LAGOON)
        y += int(size*layout['head_lead'])

    y = layout['foot_y']
    f_w = ImageFont.truetype(ARCHIVO, layout['when'])
    track(d, cx, y, 'SATURDAY 29 NOVEMBER', f_w, LAGOON, layout['when']*0.24)
    y += int(layout['when']*2.0)
    f_p = ImageFont.truetype(ARCHIVO5, layout['where'])
    track(d, cx, y, 'DON BOSCO SHRINE', f_p, (120,130,140), layout['where']*0.22)

    # the three reasons, so the occasion is never in doubt
    y = layout['who_y']
    d.line([(cx-layout['rule'], y), (cx+layout['rule'], y)], fill=(222,208,186), width=2)
    f_o = ImageFont.truetype(ARCHIVO5, layout['who'])
    track(d, cx, y + layout['who']*1.7,
          "MICHAEL 80   ·   SAVIO 50   ·   ORWILL & JOVITA 25", f_o, ROSE, layout['who']*0.16)

    # the same grain the page wears
    g = np.tile(np.asarray(_grain, np.float32),
                (H//_grain.height+1, W//_grain.width+1))[:H, :W]
    a = np.asarray(im, np.float32) * (g[..., None]/255.0)
    im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))

    if jpeg: im.save(path, quality=92, optimize=True)
    else:    im.save(path, optimize=True)
    return path, im.size, os.path.getsize(path)

OUT = os.path.join(D, 'assets')

# 4:5 -- the tallest a photo may be before WhatsApp crops it in the bubble,
# so it is the biggest the card can ever render in a chat.
print(card(1080, 1350, 620, dict(margin=96, env_y=214, eyebrow=30, eyebrow_y=126,
      head=104, head_y=760, head_lead=1.06, foot_y=1010, when=27, where=23,
      who_y=1176, who=21, rule=300), os.path.join(OUT,'share-chat.jpg'), jpeg=True))

# 1:1 -- never cropped anywhere: chat, profile, a forwarded post
print(card(1080, 1080, 496, dict(margin=96, env_y=172, eyebrow=27, eyebrow_y=98,
      head=86, head_y=620, head_lead=1.06, foot_y=866, when=25, where=21,
      who_y=976, who=20, rule=270), os.path.join(OUT,'share-square.jpg'), jpeg=True))

# 9:16 -- Status
print(card(1080, 1920, 640, dict(margin=110, env_y=372, eyebrow=32, eyebrow_y=250,
      head=110, head_y=960, head_lead=1.06, foot_y=1240, when=29, where=25,
      who_y=1400, who=23, rule=320), os.path.join(OUT,'share-status.jpg'), jpeg=True))


# ------------------------------------------------- the link preview, 1.91:1
# Wide, so the envelope stands beside the words rather than above them.
def wide(path):
    W, H = 1200, 630
    im = Image.new('RGB', (W, H), VANILLA)
    env_w = 330
    env = envelope(env_w)
    ex, ey = 96, (H - env.height)//2
    sh = Image.new('RGBA', (W, H), (0,0,0,0))
    sh.paste((74,56,36,78), (ex+10, ey+18, ex+env_w-10, ey+env.height+14))
    sh = sh.filter(ImageFilter.GaussianBlur(env_w*0.04))
    im = Image.alpha_composite(im.convert('RGBA'), sh).convert('RGB')
    im.paste(env, (ex, ey), env)
    d = ImageDraw.Draw(im)

    x = 520; right = W - 84; inner = right - x
    def ltrack(y, text, font, fill, tr):
        cx = x
        for c in text:
            d.text((cx, y), c, font=font, fill=fill)
            cx += d.textlength(c, font=font) + tr

    f_eye = ImageFont.truetype(ARCHIVO, 23)
    ltrack(150, 'YOU ARE INVITED TO', f_eye, ROSE, 23*0.30)

    y = 198
    for line in ('THANKSGIVING MASS', '& DINNER'):
        size = min(62, fit(d, line, BODONI, inner))
        f = ImageFont.truetype(BODONI if line[0] != '&' else BODONI4, size)
        d.text((x, y), line, font=f, fill=LAGOON)
        y += int(size*1.08)

    f_w = ImageFont.truetype(ARCHIVO, 24)
    ltrack(378, 'SATURDAY 29 NOVEMBER', f_w, LAGOON, 24*0.24)
    f_p = ImageFont.truetype(ARCHIVO5, 21)
    ltrack(426, 'DON BOSCO SHRINE', f_p, (120,130,140), 21*0.22)

    d.line([(x, 486), (right, 486)], fill=(222,208,186), width=2)
    f_o = ImageFont.truetype(ARCHIVO5, 19)
    ltrack(516, 'MICHAEL 80   ·   SAVIO 50   ·   ORWILL & JOVITA 25', f_o, ROSE, 19*0.16)

    g = np.tile(np.asarray(_grain, np.float32),
                (H//_grain.height+1, W//_grain.width+1))[:H, :W]
    im = Image.fromarray(np.clip(np.asarray(im, np.float32)*(g[...,None]/255.0),0,255).astype(np.uint8))
    im.save(path, quality=88, optimize=True)
    return path, im.size, os.path.getsize(path)

print(wide(os.path.join(OUT, 'preview.jpg')))
