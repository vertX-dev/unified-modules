# fontLib fonts

Builds the fonts in `modules/JavaScript/fontLib/fonts/`. It isn't part of the module and never ships in a pack.
It needs only Node: PNG decoding reuses `tools/colorLib/images.mjs`.

```sh
node tools/fontLib/build.mjs <name>                    # sources/<name>/ → fonts/<name>.js
node tools/fontLib/build.mjs --all
node tools/fontLib/preview.mjs <name> "Hello, world!"  # terminal preview
node tools/fontLib/preview.mjs <name> --charset        # every glyph
node tools/fontLib/preview.mjs <name> "Hi" --png hi.png --px 8
node tools/fontLib/test.mjs                            # importers, runtime, Commands++ parity
```

## Adding a font

1. Create `sources/<name>/` with a `font.json` and the drawing (formats below).
2. Run `build.mjs <name>`. It reports:
   - glyph count, and how many are beyond ASCII
   - the detected pixel size
   - missing printable ASCII
   - glyphs without ink, and ragged rows it padded
3. Check it with `preview.mjs <name> --charset`.
4. Add `fonts/<name>.js` to `module.toml`: in `include` for the default install, or as a `[parts]` entry.

Glyphs are keyed by character, so any Unicode works (accents, Cyrillic, Greek…). Fonts with more
than 300 glyphs are stored packed (`encoding: "bits"`) and decoded on first use.

## `font.json`

| Key | Default | Meaning |
|---|---|---|
| `type` | required | `text`, `sheet`, `glyphs` or `bdf` |
| `baseline` | auto | Rows below the baseline (descender space). Auto = empty rows under `A–Z`/`0–9`; BDF uses its descent |
| `spacing`, `lineSpacing` | 1 | Pixels between glyphs / lines |
| `caseFold` | `null` | `"upper"` / `"lower"`: use the other case when a glyph is missing |
| `fallback` | `"?"` if present | Glyph drawn for unknown characters |
| `spaceWidth` | width of `" "`, else height/2 | Width of a space when the font has no space glyph |
| `trim` | `"x"` (`"none"` for text) | Crop empty columns per glyph (proportional). `"none"` keeps the cell (monospace) |
| `encoding` | auto | `"rows"` or `"bits"` |
| `license`, `author` | | Copied into the font data. Required for third-party fonts (OFL/MIT…) |
| `notice` | | License file whose text is copied into the generated file as a comment (BSD/MIT notices) |

Image options (`sheet`, `glyphs`):

| Key | Default | Meaning |
|---|---|---|
| `channel` | `"auto"` | `"alpha"` (transparent background), `"luma"` (dark ink on light) or `"auto"` |
| `threshold` | 128 | Ink cut-off, 0–255 |
| `invert` | `false` | Light ink on dark (luma) |
| `pixelSize` | detected | Size of one font pixel in the drawing. Detected as the GCD of run lengths, so glyphs drawn at 8× come out exact |
| `height` | — | Resample to this many rows by area coverage, for drawings that aren't pixel art. Replaces `pixelSize` |
| `coverage` | 0.5 | Share of a cell that must be ink when resampling |

## Source formats

**`text`**: `file` is a text file of `#` art, easy to edit by hand:
```
== A ==
.###.
#...#
#####
== U+00C9 ==
..#..
#####
```
- Rows use `#` for ink and `.` for empty.
- An empty row must be dots; blank lines only separate glyphs.
- Headers are the character, `U+XXXX`, or a name from `names`.

**`sheet`**: `file` is one PNG with a grid of cells.
- Set `cell: [w, h]`, plus optional `gap: [x, y]` and `offset: [x, y]`.
- Then either `chars` (rows of characters, in sheet order) or `codepoints: N` (cell i = code point N + i, the Minecraft `ascii.png` layout; empty cells are skipped).

**`glyphs`**: a folder (`dir`, default `glyphs/`) with one PNG per character. The file name is either:
- the character (`A.png`)
- a code point (`U+003F.png` / `003F.png`), for characters Windows can't put in file names
- a name from `names` (`"names": { "question": "?" }`)

**`bdf`**: `file` is a BDF bitmap font; many open pixel fonts ship as BDF.
- `include` limits it to code point ranges, e.g. `["U+0020-U+007E", "U+00A0-U+017F", "U+0400-U+04FF"]`.
- The font's ascent and descent set the height and baseline.

## Fonts

| Font | Size | Source |
|---|---|---|
| `block` | 7 high, caps (`caseFold: upper`) | Commands++ `buildTextFont.js` (`D` row fixed) |
| `slim` | 5 high, caps | Commands++ (`? # $` rows fixed) |
| `spleen5x8` | 8 rows (baseline 1), full ASCII | [Spleen](https://github.com/fcambus/spleen) 2.2.0 5×8 (its Latin-1 glyphs are blank placeholders, so they're dropped) |
| `spleen6x12` | 12 rows (baseline 3), ASCII + Latin-1 + Cyrillic | Spleen 6×12 |
| `spleen8x16` | 16 rows (baseline 4), + Latin Extended-A, 13 Greek | Spleen 8×16 |

The Spleen fonts are monospace terminal fonts, trimmed to proportional widths with a narrower space.
Pass `monospace: true` to get the terminal look back. They are BSD-2-Clause:
- `LICENSE` sits next to each BDF.
- The build copies the notice into the generated file (`notice` in font.json), so it stays with the font inside packs.
- Box drawing, private-use glyphs and everything outside the `include` ranges is left out.

Inkless glyphs are dropped at build time (except whitespace), so an empty placeholder shows the fallback instead of nothing.
