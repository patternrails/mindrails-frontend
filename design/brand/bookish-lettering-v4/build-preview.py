"""Bookish, light serif wordmark studies from original open-source font files."""
from pathlib import Path
from html import escape
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.transformPen import TransformPen

ROOT = Path(__file__).resolve().parent
ICON = (ROOT.parent / 'neat-lettering-v2/brain-circuit-source.svg').read_text().split('>', 1)[1].rsplit('</svg>', 1)[0]
LABEL = TTFont('/System/Library/Fonts/Supplemental/Arial.ttf')


def pair_adjustments(font, names):
    adjustments = [0] * len(names)
    if 'kern' in font:
        for table in font['kern'].kernTables:
            for i in range(1, len(names)):
                adjustments[i] += getattr(table, 'kernTable', {}).get((names[i-1], names[i]), 0)
        return adjustments
    if 'GPOS' not in font: return adjustments
    gpos = font['GPOS'].table
    indices = {i for feature in gpos.FeatureList.FeatureRecord if feature.FeatureTag == 'kern' for i in feature.Feature.LookupListIndex}
    for idx in indices:
        lookup = gpos.LookupList.Lookup[idx]
        for wrapper in lookup.SubTable:
            kind = wrapper.ExtensionLookupType if lookup.LookupType == 9 else lookup.LookupType
            sub = wrapper.ExtSubTable if lookup.LookupType == 9 else wrapper
            if kind != 2: continue
            for i in range(1, len(names)):
                left, right = names[i-1:i+1]
                if left not in sub.Coverage.glyphs: continue
                value = None
                if sub.Format == 1:
                    pairs = sub.PairSet[sub.Coverage.glyphs.index(left)].PairValueRecord
                    value = next((p.Value1 for p in pairs if p.SecondGlyph == right), None)
                elif sub.Format == 2:
                    c1 = sub.ClassDef1.classDefs.get(left, 0); c2 = sub.ClassDef2.classDefs.get(right, 0)
                    value = sub.Class1Record[c1].Class2Record[c2].Value1
                adjustments[i] += getattr(value, 'XAdvance', 0) if value else 0
    return adjustments

def outline(font, text):
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    names = [cmap[ord(c)] for c in text]
    adjustments = pair_adjustments(font, names)
    pen = SVGPathPen(glyphs)
    bounds = BoundsPen(glyphs)
    x = 0
    for i, name in enumerate(names):
        x += adjustments[i]
        matrix = (1, 0, 0, -1, x, 0)
        glyphs[name].draw(TransformPen(pen, matrix))
        glyphs[name].draw(TransformPen(bounds, matrix))
        x += font['hmtx'][name][0]
    return pen.getCommands(), bounds.bounds


def label(text, x, y, size=16, color='#66717b'):
    path, (left, top, right, bottom) = outline(LABEL, text)
    scale = size / LABEL['head'].unitsPerEm
    return f'<path fill="{color}" transform="translate({x-left*scale:.3f} {y-(top+bottom)*scale/2:.3f}) scale({scale})" d="{path}"/>'


def mark(font, x, y, scale=1, color='#252a32'):
    path, (left, top, right, bottom) = outline(font, 'MindRails')
    fit = 100 / (right - left)
    text = f'<path transform="translate({38-left*fit:.3f} {15-(top+bottom)*fit/2:.3f}) scale({fit})" fill="{color}" d="{path}"/>'
    icon = f'<g fill="none" stroke="{color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" transform="scale(1.25) rotate(90 12 12)">{ICON}</g>'
    return f'<g transform="translate({x} {y}) scale({scale})">{icon}{text}</g>'


def svg(body, width, height, title):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img"><title>{escape(title)}</title>{body}</svg>'


FACES = [
    ('A', 'Cormorant Garamond Light', 'cormorantgaramond/CormorantGaramond[wght].ttf', {'wght': 300}, '300 / elegant, airy, literary'),
    ('B', 'Spectral ExtraLight', 'spectral/Spectral-ExtraLight.ttf', {}, '200 / finely drawn, calm, humanist'),
    ('C', 'Source Serif 4 Light', 'sourceserif4/SourceSerif4[opsz,wght].ttf', {'wght': 300, 'opsz': 32}, '300 / optical size 32 / warm, measured'),
]
board = ['<rect width="2128" height="920" fill="#fafbf9"/>',
         label('MindRails', 64, 67, 30, '#252a32'),
         label('LOGO TYPE STUDY  /  LIGHT, BOOKISH SERIFS', 64, 109, 13),
         '<path d="M64 145H2064" stroke="#dce1df"/>']
for i, (key, name, path, axes, description) in enumerate(FACES):
    original = TTFont(ROOT / 'fonts' / path)
    font = instantiateVariableFont(original, axes, inplace=False) if axes else original
    x = 64 + i * 688
    board += [label(key, x, 193, 14, '#5b7468'),
              label(name, x + 30, 193, 23, '#252a32'),
              label(description, x, 232, 14)]
    board.append(f'<rect x="{x}" y="270" width="624" height="235" rx="16" fill="#f0f3ef"/>')
    board.append(mark(font, x + 77.4, 326.5, 3.4))
    board += [label('ENLARGED  /  3.4x', x + 24, 480, 11, '#7b857d'),
              label('SIDEBAR SIZE  /  30px icon + 100px wordmark', x, 548, 12)]
    for y, bg, fg, subtitle, muted in [
        (577, '#f5f6f8', '#252a32', 'LIGHT', '#7b8590'),
        (710, '#20242b', '#e6e8ed', 'DARK', '#aeb7c6'),
    ]:
        board.append(f'<rect x="{x}" y="{y}" width="624" height="111" rx="12" fill="{bg}" stroke="#e1e5e5" stroke-width="0.6"/>')
        board.append(mark(font, x + 28, y + 40.5, 1, fg))
        board.append(label(subtitle, x + 540, y + 55.5, 11, muted))
    stem = f'{key.lower()}-{name.lower().replace(" ", "-")}'
    for suffix, color in [('ink', '#252a32'), ('light', '#e6e8ed'), ('current', 'currentColor')]:
        (ROOT / f'{stem}-{suffix}.svg').write_text(svg(mark(font, 8, 8, 1, color), 154, 46, f'MindRails / {name}'))
board += ['<path d="M64 857H2064" stroke="#dce1df"/>',
          label('Same icon and 100px wordmark width. Original font outlines at true 200 / 300 weights; light and dark samples.', 64, 887, 12)]
(ROOT / 'comparison.svg').write_text(svg(''.join(board), 2128, 920, 'MindRails / Cormorant Garamond Light, Spectral ExtraLight and Source Serif 4 Light'))
print('Built comparison.svg and nine outlined logo variants.')
