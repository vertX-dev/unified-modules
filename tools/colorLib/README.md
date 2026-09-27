# colorLib generator

Builds `modules/JavaScript/colorLib/data/colors.js` and `data/colorsDetailed.js`. It isn't part of
the module and never ships in a pack. It needs only a bedrock-samples checkout: no game, server or
npm packages.

| File | What |
|---|---|
| `generate.mjs` | Reads textures + metadata, writes both data files |
| `images.mjs` | PNG + TGA decoders (Node built-ins only) |
| `mapRules.mjs` | Block → map color rules (Java's assignments) and Bedrock's plains tints |
| `blockFlags.mjs` | Block traits: full cube, gravity, needs support, creative-only, liquid |

## Regenerating (after a Minecraft update)

We track the **preview** branch of [bedrock-samples](https://github.com/Mojang/bedrock-samples).

1. Update the preview checkout (`git pull`).
2. Generate:
   ```sh
   node tools/colorLib/generate.mjs --samples <bedrock-samples-preview>
   ```
3. Check the summary it prints, then bump `version` in `modules/JavaScript/colorLib/module.toml`.

The summary counts map colors by source (rule, biome tint, estimated) and blocks per flag.
Estimated map colors are usually blocks new in that release. To pin one down, add a rule in
`mapRules.mjs` (`EXACT` for single ids, `RULES` for patterns). Flags are adjusted in `blockFlags.mjs`.

## Output format

Every color is an `[r, g, b]` array; `null` means none.

- `colors.js`:
  - `mapPalette`: the base map colors. Index 0 (`null`) = not drawn on maps.
  - `blocks`: `id → [avg, mapIndex, flags, top?, side?]`. `top` and `side` only appear when the faces differ from `avg`.
  - `items`: `id → avg`, only for items that aren't blocks.
  - Flag constants:

    | Flag | Value |
    |---|---|
    | `MAP_ESTIMATED` | 1 |
    | `TINTED` | 2 |
    | `FULL_CUBE` | 4 |
    | `TRANSPARENT` | 8 |
    | `GRAVITY` | 16 |
    | `NEEDS_SUPPORT` | 32 |
    | `CREATIVE_ONLY` | 64 |
    | `LIQUID` | 128 |

- `colorsDetailed.js`: `noise`, `id → texture noise`. This is the OKLab standard deviation of the pixels × 100, with faces weighted like `avg`.

## Where each value comes from

- **Block and item ids, block states:** `metadata/vanilladata_modules/mojang-{blocks,items}.json` in the samples.
- **Texture colors:** the alpha-weighted mean in linear light of each face's texture. Aux variant 0 is
  the default state. `avg` weights the faces up 1 : down 1 : sides 4.
- **Biome tints:** grass, leaves, vines and water get the Bedrock plains tint (`TINTS` in `mapRules.mjs`,
  read once from the game's `minecraft:map_color` on 1.26.40). `overlay_color` textures tint only their alpha-255 pixels.
- **Map colors:** from the rules in `mapRules.mjs`. Otherwise estimated from the texture (flagged `MAP_ESTIMATED`).
- **Flags:**
  - `FULL_CUBE`: false for blocks with shape states (`minecraft:vertical_half`, `upper_block_bit`, `rail_direction`, …) or partial-block names.
  - `TRANSPARENT`: any face texture with see-through pixels.
  - The rest come from the id lists in `blockFlags.mjs`.
- **Item icons:**
  1. The `item_texture.json` key that matches the item id.
  2. Otherwise the BP item's `minecraft:icon`.
  3. Otherwise an atlas file name that contains every word of the id.
