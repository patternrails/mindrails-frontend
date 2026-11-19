"""Upright, light wordmark studies using unchanged BrainCircuit outlines."""
from pathlib import Path
from html import escape
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

ROOT = Path(__file__).resolve().parent
FONTS = [('A', 'Manrope Light', 'manrope/Manrope[wght].ttf', 'Soft geometry / light and balanced'),
         ('B', 'Plus Jakarta Sans Light', 'plusjakartasans/PlusJakartaSans[wght].ttf', 'Orderly / subtly rounded'),
         ('C', 'Open Sans Light', 'opensans/OpenSans[wdth,wght].ttf', 'Humanist / open and familiar')]
ICON = (ROOT / 'brain-circuit-source.svg').read_text().split('>', 1)[1].rsplit('</svg>', 1)[0]
SANS = TTFont('/System/Library/Fonts/Supplemental/Arial.ttf')

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

def outlines(font, text, size):
    glyphs = font.getGlyphSet(); cmap = font.getBestCmap(); scale = size / font['head'].unitsPerEm
    names = [cmap[ord(ch)] for ch in text]; adjustments = pair_adjustments(font, names)
    x = 0; pen = SVGPathPen(glyphs); bounds = BoundsPen(glyphs)
    for index, name in enumerate(names):
        x += adjustments[index]
        matrix = (scale, 0, 0, -scale, x*scale, 0)
        glyphs[name].draw(TransformPen(pen, matrix)); glyphs[name].draw(TransformPen(bounds, matrix))
        x += font['hmtx'][name][0]
    return pen.getCommands(), bounds.bounds

def lettering(font, text, x, center_y, size, color):
    path, (left, top, right, bottom) = outlines(font, text, size)
    return f'<path fill="{color}" transform="translate({x-left:.3f} {center_y-(top+bottom)/2:.3f})" d="{path}"/>'

def brain(x, y, size, color, stroke=1.4):
    return f'<g fill="none" stroke="{color}" stroke-width="{stroke}" stroke-linecap="round" stroke-linejoin="round" transform="translate({x} {y}) scale({size/24}) rotate(90 12 12)">{ICON}</g>'

def svg(content, width, height, title):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img"><title>{escape(title)}</title>{content}</svg>'

board = ['<rect width="1400" height="1170" fill="#faf7f1"/>',
         lettering(SANS, 'MindRails / refined upright lettering', 76, 65, 25, '#343d38'),
         lettering(SANS, 'A little more presence for the brain. A calmer, more orderly wordmark.', 76, 106, 16, '#737b72')]
for index, (letter, family, path, description) in enumerate(FONTS):
    variable = TTFont(ROOT/'fonts'/path)
    axes = {axis.axisTag: (300 if axis.axisTag == 'wght' else axis.defaultValue) for axis in variable['fvar'].axes}
    font = instantiateVariableFont(variable, axes, inplace=False); y = 150 + index*325
    board.append(f'<path d="M76 {y}H1324" stroke="#deded3"/>')
    board += [lettering(SANS, f'{letter}   {family}', 76, y+38, 17, '#58675c'),
              lettering(SANS, description, 76, y+66, 13, '#83867c')]
    board.append(brain(100, y+120, 84, '#506c60'))
    board.append(lettering(font, 'MindRails', 230, y+162, 94, '#343d38'))
    for tile_y, bg, fg in [(y+94, '#eeeee5', '#445a4d'), (y+192, '#26362e', '#eee9dd')]:
        board.append(f'<rect x="1000" y="{tile_y}" width="324" height="80" rx="12" fill="{bg}"/>')
        board.append(brain(1030, tile_y+25, 30, fg, 1.5))
        board.append(lettering(font, 'MindRails', 1072, tile_y+40, 24, fg))
    for suffix, color in [('ink', '#343d38'), ('light', '#eee9dd'), ('current', 'currentColor')]:
        content = brain(20, 36, 66, color) + lettering(font, 'MindRails', 116, 70, 72, color)
        (ROOT/f'{letter.lower()}-{path.split("/")[0]}-{suffix}.svg').write_text(svg(content, 560, 140, f'MindRails — {family} — concept {letter}'))
board.append(lettering(SANS, 'Same brain contour and orientation / larger icon / upright light lettering / light and dark samples', 76, 1140, 13, '#83867c'))
(ROOT/'comparison.svg').write_text(svg(''.join(board), 1400, 1170, 'MindRails: larger brain mark and upright light wordmarks'))
print('Built comparison.svg and nine transparent outlined variants.')
