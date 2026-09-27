# colorLib generator

Builds `modules/JavaScript/colorLib/data/colors.js`. It isn't part of the module and never ships in a pack. It needs no game or server.

| File | What |
|---|---|
| `generate.mjs` | Reads the vanilla textures and id lists, then writes `data/colors.js` |
| `images.mjs` | PNG + TGA decoders (Node built-ins only) |
| `mapRules.mjs` | Block → map color rules (Java's assignments) and Bedrock's plains tints |
| `package.json` | Pins `@minecraft/vanilla-data`, the list of every block and item id |

## Regenerating (after a Minecraft update)

We track the **preview** branch of [bedrock-samples](https://github.com/Mojang/bedrock-samples).

1. Update your preview checkout (`git pull` on the `preview` branch).
2. Set `@minecraft/vanilla-data` in `package.json` to the matching version, then run `npm install` in `tools/colorLib`.
   - Samples `version.json` `1.26.60.28` matches `1.26.60-preview.28` (npm dist-tag `preview`).
   - A stable `1.26.40.5` matches `1.26.40`.
   - The generator warns when they don't match.
3. Generate:
   ```sh
   node tools/colorLib/generate.mjs --samples <bedrock-samples-preview>
   ```
4. Bump `version` in `modules/JavaScript/colorLib/module.toml`.

The output lists how many map colors came from rules and how many were estimated. Estimated means
the nearest map color to the block's top texture; these are usually blocks new in that release. To
pin one down, add a rule in `mapRules.mjs` (`EXACT` for single ids, `RULES` for patterns).

## Output format

Every color is an `[r, g, b]` array; `null` means none.

- `mapPalette`: the base map colors. Index 0 (`null`) = not drawn on maps.
- `blocks`: `id → [avg, mapIndex, flags, top?, side?]`
  - `flags`: `MAP_ESTIMATED` 1, `TINTED` 2.
  - `top` and `side` only appear when the faces differ from `avg`.
- `items`: `id → avg`, only for items that aren't blocks.

## Where each value comes from

- **Block and item ids:** `@minecraft/vanilla-data`. That list is stable-only, so experimental and education blocks aren't included.
- **Texture colors:** the alpha-weighted mean in linear light of each face's texture. Aux variant 0 is
  the default state. `avg` weights the faces up 1 : down 1 : sides 4.
- **Biome tints:** grass, leaves, vines and water get the Bedrock plains tint from `TINTS` in `mapRules.mjs`.
  - It applies to their grayscale textures and to their map color.
  - These values were read once from the game's `minecraft:map_color` component (1.26.40).
  - `overlay_color` textures tint only their alpha-255 pixels.
- **Map colors:**
  1. The rules in `mapRules.mjs`.
  2. Otherwise estimated from the texture (flagged `MAP_ESTIMATED`).
- **Item icons:**
  1. The `item_texture.json` key that matches the item id.
  2. Otherwise the BP item's `minecraft:icon`.
  3. Otherwise an atlas file name that contains every word of the id.
