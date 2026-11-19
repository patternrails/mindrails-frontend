"""Vector logo studies: real font outlines and the existing Lucide brain mark."""
from pathlib import Path
from html import escape
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

ROOT = Path(__file__).resolve().parent
FONTS = [('A', 'Sacramento', 'sacramento/Sacramento-Regular.ttf', 'Flowing and delicate'),
         ('B', 'Bad Script', 'badscript/BadScript-Regular.ttf', 'Natural pen handwriting'),
         ('C', 'Nothing You Could Do', 'nothingyoucoulddo/NothingYouCouldDo.ttf', 'Open and unhurried')]
ICON = (ROOT / 'brain-circuit-source.svg').read_text().split('>', 1)[1].rsplit('</svg>', 1)[0]
SANS = TTFont('/System/Library/Fonts/Supplemental/Arial.ttf')

def outlines(font, text, size):
    glyphs = font.getGlyphSet(); cmap = font.getBestCmap(); scale = size / font['head'].unitsPerEm
    names = [cmap[ord(ch)] for ch in text]
    kerning = {}
    if 'kern' in font:
        for table in font['kern'].kernTables:
            if hasattr(table, 'kernTable'): kerning.update(table.kernTable)
    # Apply horizontal pair positioning from GPOS, which modern script fonts prefer.
    if not kerning and 'GPOS' in font:
        for lookup in font['GPOS'].table.LookupList.Lookup:
            if lookup.LookupType != 2: continue
            for sub in lookup.SubTable:
                if sub.Format != 1: continue
                for left, pairs in zip(sub.Coverage.glyphs, sub.PairSet):
                    for pair in pairs.PairValueRecord:
                        advance = getattr(pair.Value1, 'XAdvance', 0) if pair.Value1 else 0
                        if advance: kerning[left, pair.SecondGlyph] = advance
    x = 0; pen = SVGPathPen(glyphs); bounds = BoundsPen(glyphs)
    for index, name in enumerate(names):
        if index: x += kerning.get((names[index-1], name), 0)
        glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, x*scale, 0)))
        glyphs[name].draw(TransformPen(bounds, (scale, 0, 0, -scale, x*scale, 0)))
        x += font['hmtx'][name][0]
    return pen.getCommands(), bounds.bounds

def lettering(font, text, x, center_y, size, color):
    path, (left, top, right, bottom) = outlines(font, text, size)
    baseline = center_y - (top+bottom)/2
    return f'<path fill="{color}" transform="translate({x-left:.3f} {baseline:.3f})" d="{path}"/>'

def brain(x, y, size, color, stroke=1.4):
    return f'<g fill="none" stroke="{color}" stroke-width="{stroke}" stroke-linecap="round" stroke-linejoin="round" transform="translate({x} {y}) scale({size/24}) rotate(90 12 12)">{ICON}</g>'

def svg(content, width, height, title):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img"><title>{escape(title)}</title>{content}</svg>'

board = ['<rect width="1400" height="1170" fill="#faf7f1"/>']
board += [lettering(SANS, 'MindRails / pen lettering studies', 76, 65, 25, '#343d38'),
          lettering(SANS, 'The existing brain mark, paired with three fine-line handwriting styles.', 76, 106, 16, '#737b72')]
for index, (letter, family, path, description) in enumerate(FONTS):
    font = TTFont(ROOT/'fonts'/path); y = 150 + index*325
    board.append(f'<path d="M76 {y}H1324" stroke="#deded3"/>')
    board += [lettering(SANS, f'{letter}   {family}', 76, y+38, 17, '#58675c'),
              lettering(SANS, description, 76, y+66, 13, '#83867c')]
    board.append(brain(110, y+126, 70, '#506c60'))
    board.append(lettering(font, 'MindRails', 222, y+162, 116 if index == 0 else 98, '#343d38'))
    for tile_y, bg, fg in [(y+94, '#eeeee5', '#445a4d'), (y+192, '#26362e', '#eee9dd')]:
        board.append(f'<rect x="1000" y="{tile_y}" width="324" height="80" rx="12" fill="{bg}"/>')
        board.append(brain(1021, tile_y+25, 27, fg, 1.5))
        board.append(lettering(font, 'MindRails', 1063, tile_y+40, 39 if index == 0 else 33, fg))
    # Transparent, usable outlines; neither SVG needs an installed font.
    for suffix, color in [('ink', '#343d38'), ('light', '#eee9dd')]:
        content = brain(20, 42, 55, color) + lettering(font, 'MindRails', 104, 71, 84 if index == 0 else 72, color)
        (ROOT/f'{letter.lower()}-{path.split("/")[0]}-{suffix}.svg').write_text(svg(content, 740, 150, f'MindRails — {family} — concept {letter}'))
board.append(lettering(SANS, 'Concept studies / brain contour retained; stroke weight tuned for the lettering.', 76, 1140, 13, '#83867c'))
(ROOT/'comparison.svg').write_text(svg(''.join(board), 1400, 1170, 'MindRails: current brain logo with fine pen handwriting'))
print('Built comparison.svg and six outlined logo variants.')
