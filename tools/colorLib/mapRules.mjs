// Block → map base color rules. Values follow Java's MapColor assignments, which Bedrock's blocks
// match as far as anyone has checked; biome-tinted blocks use the Bedrock plains values below.

// Java MapColor base colors, index = map color id (0 = transparent / not drawn).
export const BASE = [
    ['NONE', 0x000000],
    ['GRASS', 0x7fb238],
    ['SAND', 0xf7e9a3],
    ['WOOL', 0xc7c7c7],
    ['FIRE', 0xff0000],
    ['ICE', 0xa0a0ff],
    ['METAL', 0xa7a7a7],
    ['PLANT', 0x007c00],
    ['SNOW', 0xffffff],
    ['CLAY', 0xa4a8b8],
    ['DIRT', 0x976d4d],
    ['STONE', 0x707070],
    ['WATER', 0x4040ff],
    ['WOOD', 0x8f7748],
    ['QUARTZ', 0xfffcf5],
    ['COLOR_ORANGE', 0xd87f33],
    ['COLOR_MAGENTA', 0xb24cd8],
    ['COLOR_LIGHT_BLUE', 0x6699d8],
    ['COLOR_YELLOW', 0xe5e533],
    ['COLOR_LIGHT_GREEN', 0x7fcc19],
    ['COLOR_PINK', 0xf27fa5],
    ['COLOR_GRAY', 0x4c4c4c],
    ['COLOR_LIGHT_GRAY', 0x999999],
    ['COLOR_CYAN', 0x4c7f99],
    ['COLOR_PURPLE', 0x7f3fb2],
    ['COLOR_BLUE', 0x334cb2],
    ['COLOR_BROWN', 0x664c33],
    ['COLOR_GREEN', 0x667f33],
    ['COLOR_RED', 0x993333],
    ['COLOR_BLACK', 0x191919],
    ['GOLD', 0xfaee4d],
    ['DIAMOND', 0x5cdbd5],
    ['LAPIS', 0x4a80ff],
    ['EMERALD', 0x00d93a],
    ['PODZOL', 0x815631],
    ['NETHER', 0x700200],
    ['TERRACOTTA_WHITE', 0xd1b1a1],
    ['TERRACOTTA_ORANGE', 0x9f5224],
    ['TERRACOTTA_MAGENTA', 0x95576c],
    ['TERRACOTTA_LIGHT_BLUE', 0x706c8a],
    ['TERRACOTTA_YELLOW', 0xba8524],
    ['TERRACOTTA_LIGHT_GREEN', 0x677535],
    ['TERRACOTTA_PINK', 0xa04d4e],
    ['TERRACOTTA_GRAY', 0x392923],
    ['TERRACOTTA_LIGHT_GRAY', 0x876b62],
    ['TERRACOTTA_CYAN', 0x575c5c],
    ['TERRACOTTA_PURPLE', 0x7a4958],
    ['TERRACOTTA_BLUE', 0x4c3e5c],
    ['TERRACOTTA_BROWN', 0x4c3223],
    ['TERRACOTTA_GREEN', 0x4c522a],
    ['TERRACOTTA_RED', 0x8e3c2e],
    ['TERRACOTTA_BLACK', 0x251610],
    ['CRIMSON_NYLIUM', 0xbd3031],
    ['CRIMSON_STEM', 0x943f61],
    ['CRIMSON_HYPHAE', 0x5c191d],
    ['WARPED_NYLIUM', 0x167e86],
    ['WARPED_STEM', 0x3a8e8c],
    ['WARPED_HYPHAE', 0x562c3e],
    ['WARPED_WART_BLOCK', 0x14b485],
    ['DEEPSLATE', 0x646464],
    ['RAW_IRON', 0xd8af93],
    ['GLOW_LICHEN', 0x7fa796],
];

const COLORS = 'white|orange|magenta|light_blue|yellow|lime|pink|gray|light_gray|silver|cyan|purple|blue|brown|green|red|black';
const DYE_MAP = {
    white: 'SNOW', orange: 'COLOR_ORANGE', magenta: 'COLOR_MAGENTA', light_blue: 'COLOR_LIGHT_BLUE',
    yellow: 'COLOR_YELLOW', lime: 'COLOR_LIGHT_GREEN', pink: 'COLOR_PINK', gray: 'COLOR_GRAY',
    light_gray: 'COLOR_LIGHT_GRAY', silver: 'COLOR_LIGHT_GRAY', cyan: 'COLOR_CYAN', purple: 'COLOR_PURPLE',
    blue: 'COLOR_BLUE', brown: 'COLOR_BROWN', green: 'COLOR_GREEN', red: 'COLOR_RED', black: 'COLOR_BLACK',
};
const terracotta = (c) => 'TERRACOTTA_' + ({ silver: 'light_gray', lime: 'light_green' }[c] ?? c).toUpperCase();

// Wood type → [planks / log top color, bark color].
const WOOD = {
    oak: ['WOOD', 'PODZOL'], spruce: ['PODZOL', 'COLOR_BROWN'], birch: ['SAND', 'QUARTZ'],
    jungle: ['DIRT', 'PODZOL'], acacia: ['COLOR_ORANGE', 'STONE'], dark_oak: ['COLOR_BROWN', 'COLOR_BROWN'],
    mangrove: ['COLOR_RED', 'PODZOL'], cherry: ['TERRACOTTA_WHITE', 'TERRACOTTA_BLACK'],
    pale_oak: ['QUARTZ', 'STONE'], bamboo: ['COLOR_YELLOW', 'COLOR_GREEN'],
    crimson: ['CRIMSON_STEM', 'CRIMSON_HYPHAE'], warped: ['WARPED_STEM', 'WARPED_HYPHAE'],
};
const WOODS = Object.keys(WOOD).sort((a, b) => b.length - a.length).join('|');
const WOOD_PARTS =
    'planks|slab|double_slab|stairs|fence|fence_gate|door|trapdoor|pressure_plate|standing_sign|wall_sign|sign|hanging_sign|wall_hanging_sign|shelf|mosaic|mosaic_slab|mosaic_double_slab|mosaic_stairs';

// Exact ids (Bedrock names) → color name.
const EXACT = {
    // wood leftovers with legacy Bedrock names
    wooden_door: 'WOOD', trapdoor: 'WOOD', wooden_pressure_plate: 'WOOD', fence_gate: 'WOOD',
    standing_sign: 'WOOD', wall_sign: 'WOOD', oak_hanging_sign: 'WOOD', bookshelf: 'WOOD', chiseled_bookshelf: 'WOOD',
    crafting_table: 'WOOD', noteblock: 'WOOD', beehive: 'WOOD', loom: 'WOOD', cartography_table: 'WOOD',
    fletching_table: 'WOOD', smithing_table: 'WOOD', barrel: 'WOOD', composter: 'WOOD', lectern: 'WOOD',
    chest: 'WOOD', trapped_chest: 'WOOD', daylight_detector: 'WOOD', daylight_detector_inverted: 'WOOD',
    jukebox: 'DIRT', bee_nest: 'COLOR_YELLOW', campfire: 'PODZOL', soul_campfire: 'PODZOL',
    // stone
    stone: 'STONE', cobblestone: 'STONE', mossy_cobblestone: 'STONE', stone_bricks: 'STONE', mossy_stone_bricks: 'STONE',
    cracked_stone_bricks: 'STONE', chiseled_stone_bricks: 'STONE', smooth_stone: 'STONE', andesite: 'STONE',
    polished_andesite: 'STONE', gravel: 'STONE', bedrock: 'STONE', furnace: 'STONE', lit_furnace: 'STONE',
    blast_furnace: 'STONE', lit_blast_furnace: 'STONE', smoker: 'WOOD', lit_smoker: 'WOOD', dispenser: 'STONE',
    dropper: 'STONE', observer: 'STONE', stonecutter_block: 'STONE', piston: 'STONE', sticky_piston: 'STONE',
    cauldron: 'STONE', hopper: 'STONE', infested_stone: 'CLAY', infested_cobblestone: 'CLAY',
    granite: 'DIRT', polished_granite: 'DIRT', diorite: 'QUARTZ', polished_diorite: 'QUARTZ',
    tuff: 'TERRACOTTA_GRAY', polished_tuff: 'TERRACOTTA_GRAY', tuff_bricks: 'TERRACOTTA_GRAY', chiseled_tuff: 'TERRACOTTA_GRAY',
    chiseled_tuff_bricks: 'TERRACOTTA_GRAY', calcite: 'TERRACOTTA_WHITE', dripstone_block: 'TERRACOTTA_BROWN',
    pointed_dripstone: 'TERRACOTTA_BROWN', smooth_basalt: 'COLOR_BLACK', amethyst_block: 'COLOR_PURPLE',
    budding_amethyst: 'COLOR_PURPLE',
    // sand / dirt / soil
    sand: 'SAND', suspicious_sand: 'SAND', sandstone: 'SAND', chiseled_sandstone: 'SAND', cut_sandstone: 'SAND',
    smooth_sandstone: 'SAND', red_sand: 'COLOR_ORANGE', red_sandstone: 'COLOR_ORANGE', chiseled_red_sandstone: 'COLOR_ORANGE',
    cut_red_sandstone: 'COLOR_ORANGE', smooth_red_sandstone: 'COLOR_ORANGE', suspicious_gravel: 'STONE',
    dirt: 'DIRT', coarse_dirt: 'DIRT', rooted_dirt: 'DIRT', farmland: 'DIRT', grass_path: 'DIRT', dirt_with_roots: 'DIRT',
    podzol: 'PODZOL', mycelium: 'COLOR_PURPLE', mud: 'TERRACOTTA_CYAN', packed_mud: 'DIRT', mud_bricks: 'TERRACOTTA_LIGHT_GRAY',
    clay: 'CLAY', snow: 'SNOW', snow_layer: 'SNOW', powder_snow: 'SNOW', ice: 'ICE', packed_ice: 'ICE', blue_ice: 'ICE',
    frosted_ice: 'ICE', lava: 'FIRE', flowing_lava: 'FIRE', web: 'WOOL',
    // ore and metal blocks
    iron_block: 'METAL', gold_block: 'GOLD', diamond_block: 'DIAMOND', emerald_block: 'EMERALD', lapis_block: 'LAPIS',
    redstone_block: 'FIRE', coal_block: 'COLOR_BLACK', netherite_block: 'COLOR_BLACK', raw_iron_block: 'RAW_IRON',
    raw_copper_block: 'COLOR_ORANGE', raw_gold_block: 'GOLD', anvil: 'METAL', chipped_anvil: 'METAL', damaged_anvil: 'METAL',
    iron_door: 'METAL', iron_trapdoor: 'METAL', heavy_weighted_pressure_plate: 'METAL', light_weighted_pressure_plate: 'GOLD',
    beacon: 'DIAMOND', enchanting_table: 'COLOR_RED', lodestone: 'METAL', quartz_block: 'QUARTZ', quartz_bricks: 'QUARTZ',
    chiseled_quartz_block: 'QUARTZ', quartz_pillar: 'QUARTZ', smooth_quartz: 'QUARTZ', target: 'QUARTZ', sea_lantern: 'QUARTZ',
    // nether / end
    netherrack: 'NETHER', nether_brick: 'NETHER', red_nether_brick: 'NETHER', chiseled_nether_bricks: 'NETHER',
    cracked_nether_bricks: 'NETHER', nether_wart_block: 'COLOR_RED', warped_wart_block: 'WARPED_WART_BLOCK',
    soul_sand: 'COLOR_BROWN', soul_soil: 'COLOR_BROWN', basalt: 'COLOR_BLACK', polished_basalt: 'COLOR_BLACK',
    blackstone: 'COLOR_BLACK', polished_blackstone: 'COLOR_BLACK', polished_blackstone_bricks: 'COLOR_BLACK',
    chiseled_polished_blackstone: 'COLOR_BLACK', cracked_polished_blackstone_bricks: 'COLOR_BLACK',
    gilded_blackstone: 'COLOR_BLACK', glowstone: 'SAND', magma: 'NETHER', crimson_nylium: 'CRIMSON_NYLIUM',
    warped_nylium: 'WARPED_NYLIUM', shroomlight: 'COLOR_RED', obsidian: 'COLOR_BLACK', crying_obsidian: 'COLOR_BLACK',
    respawn_anchor: 'COLOR_BLACK', ancient_debris: 'COLOR_BLACK', nether_gold_ore: 'NETHER', quartz_ore: 'NETHER',
    end_stone: 'SAND', end_bricks: 'SAND', end_stone_bricks: 'SAND', purpur_block: 'COLOR_MAGENTA', purpur_pillar: 'COLOR_MAGENTA',
    chorus_plant: 'COLOR_PURPLE', chorus_flower: 'COLOR_PURPLE', end_portal_frame: 'COLOR_GREEN', dragon_egg: 'COLOR_BLACK',
    // ocean
    prismarine: 'COLOR_CYAN', prismarine_bricks: 'DIAMOND', dark_prismarine: 'DIAMOND', sponge: 'COLOR_YELLOW',
    wet_sponge: 'COLOR_YELLOW', kelp: 'WATER', seagrass: 'WATER', dried_kelp_block: 'COLOR_GREEN',
    tube_coral_block: 'COLOR_BLUE', brain_coral_block: 'COLOR_PINK', bubble_coral_block: 'COLOR_PURPLE',
    fire_coral_block: 'COLOR_RED', horn_coral_block: 'COLOR_YELLOW', conduit: 'DIAMOND',
    // plants and organic
    pumpkin: 'COLOR_ORANGE', carved_pumpkin: 'COLOR_ORANGE', lit_pumpkin: 'COLOR_ORANGE', melon_block: 'COLOR_LIGHT_GREEN',
    hay_block: 'COLOR_YELLOW', slime: 'GRASS', honey_block: 'COLOR_ORANGE', honeycomb_block: 'COLOR_ORANGE',
    moss_block: 'COLOR_GREEN', moss_carpet: 'COLOR_GREEN', pale_moss_block: 'COLOR_LIGHT_GRAY', pale_moss_carpet: 'COLOR_LIGHT_GRAY',
    bone_block: 'SAND', brown_mushroom_block: 'DIRT', red_mushroom_block: 'COLOR_RED', mushroom_stem: 'WOOL',
    cactus: 'PLANT', sculk: 'COLOR_BLACK', sculk_catalyst: 'COLOR_BLACK', sculk_shrieker: 'COLOR_BLACK',
    sculk_sensor: 'COLOR_CYAN', calibrated_sculk_sensor: 'COLOR_CYAN', brick_block: 'COLOR_RED', tnt: 'FIRE',
    glow_lichen: 'GLOW_LICHEN', azalea: 'PLANT', flowering_azalea: 'PLANT', big_dripleaf: 'PLANT', small_dripleaf_block: 'PLANT',
    waterlily: 'PLANT', reeds: 'PLANT', bamboo: 'PLANT', sweet_berry_bush: 'PLANT', cocoa: 'PLANT', pitcher_plant: 'PLANT',
    torchflower: 'PLANT', spore_blossom: 'PLANT', hanging_roots: 'DIRT', crimson_roots: 'NETHER', warped_roots: 'WARPED_NYLIUM',
    crimson_fungus: 'NETHER', warped_fungus: 'WARPED_NYLIUM', nether_sprouts: 'WARPED_NYLIUM', weeping_vines: 'NETHER',
    twisting_vines: 'WARPED_NYLIUM', wheat: 'PLANT', carrots: 'PLANT', potatoes: 'PLANT', beetroot: 'PLANT', melon_stem: 'PLANT',
    pumpkin_stem: 'PLANT', nether_wart: 'COLOR_RED', frog_spawn: 'WATER', undyed_shulker_box: 'COLOR_PURPLE', candle: 'SAND',
    cake: 'NONE', resin_block: 'TERRACOTTA_ORANGE', resin_bricks: 'TERRACOTTA_ORANGE', chiseled_resin_bricks: 'TERRACOTTA_ORANGE',
    creaking_heart: 'COLOR_ORANGE', crafter: 'STONE', vault: 'STONE', trial_spawner: 'STONE', mob_spawner: 'STONE',
    heavy_core: 'METAL', command_block: 'COLOR_BROWN', repeating_command_block: 'COLOR_PURPLE',
    chain_command_block: 'COLOR_GREEN', structure_block: 'COLOR_LIGHT_GRAY', jigsaw: 'COLOR_LIGHT_GRAY',
    ochre_froglight: 'SAND', verdant_froglight: 'GLOW_LICHEN', pearlescent_froglight: 'COLOR_PINK',
    darkoak_standing_sign: 'COLOR_BROWN', darkoak_wall_sign: 'COLOR_BROWN', petrified_oak: 'WOOD',
    azalea_leaves_flowered: 'PLANT', pale_hanging_moss: 'COLOR_LIGHT_GRAY', pitcher_crop: 'PLANT',
    torchflower_crop: 'PLANT', sculk_vein: 'COLOR_BLACK', short_dry_grass: 'COLOR_YELLOW', tall_dry_grass: 'COLOR_YELLOW', normal_stone: 'STONE', brown_mushroom: 'COLOR_BROWN', red_mushroom: 'COLOR_RED',
    redstone_lamp: 'NONE', lit_redstone_lamp: 'NONE', mangrove_roots: 'PODZOL', muddy_mangrove_roots: 'PODZOL',
    deadbush: 'WOOD', tall_grass: 'PLANT', sea_pickle: 'COLOR_GREEN', turtle_egg: 'SAND', sniffer_egg: 'COLOR_RED',
    grindstone: 'METAL', stonecutter: 'STONE', ender_chest: 'STONE', brewing_stand: 'METAL', skeleton_skull: 'NONE',
    wither_skeleton_skull: 'NONE', standing_banner: 'WOOD', wall_banner: 'WOOD', bed: 'WOOL', copper_bulb: 'COLOR_ORANGE', tinted_glass: 'COLOR_GRAY',
};

// Ordered pattern rules; `m` is the regex match. First hit wins.
const RULES = [
    // not drawn on maps
    [/^(air|light_block.*|structure_void|barrier|glass|glass_pane|hard_glass(_pane)?|.*torch|.*rail|.*button|lever|redstone_wire|tripwire|tripwire_hook|ladder|flower_pot|skull|.*_head|scaffolding|end_rod|.*_carpet_under|end_gateway|end_portal|portal|fire|soul_fire|unlit_redstone_torch|redstone_torch|.*repeater|.*comparator|frame|glow_frame|chain|iron_chain|trip_wire|.*lantern|iron_bars|.*candle_cake|bell|string|.*_coral_fan_dead|moving_block|piston_arm_collision|sticky_piston_arm_collision|pistonArmCollision|stickyPistonArmCollision|decorated_pot|.*_bars)$/, () => 'NONE'],
    [new RegExp(`^(${COLORS})_(glazed_terracotta)$`), (m) => DYE_MAP[m[1]]],
    [new RegExp(`^(${COLORS})_terracotta$`), (m) => terracotta(m[1])],
    [/^(hardened_clay|terracotta)$/, () => 'COLOR_ORANGE'],
    [new RegExp(`^(?:hard_)?(${COLORS})_(wool|carpet|concrete|concrete_powder|stained_glass|stained_glass_pane|shulker_box|candle|bed|banner)$`), (m) => DYE_MAP[m[1]]],
    [/^(stripped_)?(\w+)_(log|stem)$/, (m) => WOOD[m[2]]?.[0]],
    [/^stripped_(\w+)_(wood|hyphae)$/, (m) => WOOD[m[1]]?.[0]],
    [/^(\w+)_(wood|hyphae)$/, (m) => WOOD[m[1]]?.[1]],
    [/^bamboo_block$/, () => 'COLOR_YELLOW'],
    [/^stripped_bamboo_block$/, () => 'COLOR_YELLOW'],
    [new RegExp(`^(${WOODS})_(${WOOD_PARTS})$`), (m) => WOOD[m[1]][0]],
    [/^(\w+_)?leaves$/, () => 'PLANT'],
    [/^(deepslate|cobbled_deepslate|polished_deepslate|deepslate_bricks|deepslate_tiles|chiseled_deepslate|cracked_deepslate_bricks|cracked_deepslate_tiles|reinforced_deepslate|infested_deepslate)$/, () => 'DEEPSLATE'],
    [/^deepslate_\w+_ore$|^lit_deepslate_redstone_ore$/, () => 'DEEPSLATE'],
    [/^(lit_)?\w*_ore$/, () => 'STONE'],
    [/^(waxed_)?(cut_|chiseled_)?copper(_block)?$/, () => 'COLOR_ORANGE'],
    [/^(waxed_)?(double_)?cut_copper_(slab|stairs)$/, () => 'COLOR_ORANGE'],
    [/^infested_/, () => 'CLAY'],
    [/^(waxed_)?exposed_/, () => 'TERRACOTTA_LIGHT_GRAY'],
    [/^(waxed_)?weathered_/, () => 'WARPED_STEM'],
    [/^(waxed_)?oxidized_/, () => 'WARPED_NYLIUM'],
    [/^(waxed_)?copper_/, () => 'COLOR_ORANGE'],
    [/^dead_\w+_coral(_block|_fan|_wall_fan)?$/, () => 'COLOR_GRAY'],
    [/^(waxed_)?lightning_rod$/, () => 'COLOR_ORANGE'],
    [/^(small|medium|large)_amethyst_bud$|^amethyst_cluster$/, () => 'COLOR_PURPLE'],
    [/^cave_vines/, () => 'PLANT'],
    [/^(\w+_)?(flower|tulip|orchid|allium|azure_bluet|oxeye_daisy|cornflower|lily_of_the_valley|wither_rose|dandelion|poppy|sunflower|lilac|rose_bush|peony|sapling|propagule|fern|bush|petals|eyeblossom|wildflowers|leaf_litter|cactus_flower|firefly_bush)$/, () => 'PLANT'],
];

// Biome-tinted blocks. Bedrock tints their grayscale textures and their map color by biome; these
// are the plains values, read once from `minecraft:map_color` (color → tintedColor) on 1.26.40.
const TINTS = {
    grass: { base: [255, 255, 255], plains: [146, 188, 88] },
    foliage: { base: [138, 138, 138], plains: [64, 92, 25] },
    birch: { base: [138, 138, 138], plains: [69, 90, 46] },
    evergreen: { base: [138, 138, 138], plains: [52, 83, 52] },
    vine: { base: [170, 170, 170], plains: [79, 113, 31] },
    water: { base: [113, 132, 255], plains: [30, 91, 245] },
};
const TINTED = [
    [/^(grass_block|short_grass|tall_grass|fern|large_fern)$/, 'grass'],
    // The game reports living corals as grass-tinted on maps, even though their textures aren't.
    [/^(tube|brain|bubble|fire|horn)_coral(_fan|_wall_fan)?$/, 'grass'],
    [/^birch_leaves$/, 'birch'],
    [/^spruce_leaves$/, 'evergreen'],
    [/^(oak|acacia|dark_oak|jungle|mangrove)_leaves$/, 'foliage'],
    [/^vine$/, 'vine'],
    [/^(flowing_)?water$|^bubble_column$/, 'water'],
];

// { base, plains } tint for a biome-tinted block, else undefined.
export function tintOf(id) {
    const hit = TINTED.find(([re]) => re.test(id));
    return hit && TINTS[hit[1]];
}

// Suffixes that don't change a block's map color: `polished_andesite_stairs` → `polished_andesite`.
const SUFFIX = /_(slab|double_slab|stairs|wall|fence|fence_gate|pressure_plate|trapdoor|door)$/;

function lookup(id) {
    if (id in EXACT) return EXACT[id];
    for (const [re, pick] of RULES) {
        const m = id.match(re);
        if (m) {
            const name = pick(m);
            if (name) return name;
        }
    }
    return undefined;
}

// Returns a map color index from BASE, or undefined when no rule knows the block.
export function ruleColor(id) {
    let name = lookup(id);
    if (name === undefined && SUFFIX.test(id)) {
        const base = id.replace(SUFFIX, '');
        // Bedrock uses singular `brick` in derived blocks (`stone_brick_slab`, `nether_brick_fence`).
        name = lookup(base) ?? lookup(base + 's') ?? lookup(base.replace(/_brick$/, '_bricks')) ?? lookup(base + '_block');
    }
    if (name === undefined) return undefined;
    const index = BASE.findIndex(([n]) => n === name);
    if (index < 0) throw new Error(`mapRules: unknown color ${name} for ${id}`);
    return index;
}
