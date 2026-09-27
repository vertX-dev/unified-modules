// Block trait flags for colorLib. Shape comes from block states in the samples' metadata
// (slabs have `minecraft:vertical_half`, doors `upper_block_bit`, …) plus id patterns; the rest are
// id lists. Transparency comes from the textures (see generate.mjs).

export const FLAGS = {
    MAP_ESTIMATED: 1, // no map rule: nearest map color to the top texture
    TINTED: 2, // biome-tinted; plains tint baked in
    FULL_CUBE: 4, // occupies the whole block space
    TRANSPARENT: 8, // see-through or cut-out texture (glass, leaves, ice)
    GRAVITY: 16, // falls without a block under it
    NEEDS_SUPPORT: 32, // breaks or can't be placed without a supporting block (carpet, torch, flowers)
    CREATIVE_ONLY: 64, // can't be obtained and placed in survival
    LIQUID: 128,
};

// States that only partial blocks have.
const PARTIAL_STATES = new Set([
    'minecraft:vertical_half', 'weirdo_direction', 'minecraft:connection_north', 'wall_post_bit', 'upper_block_bit',
    'hanging', 'ground_sign_direction', 'button_pressed_bit', 'torch_facing_direction', 'rail_direction', 'candles',
    'growth', 'age', 'age_bit', 'growing_plant_age', 'coral_fan_direction', 'coral_direction', 'attached_bit',
    'liquid_depth', 'multi_face_direction_bits', 'in_wall_bit', 'door_hinge_bit', 'dripstone_thickness', 'attachment',
    'head_piece_bit', 'item_frame_map_bit', 'extinguished', 'sculk_sensor_phase', 'open_bit', 'bite_counter',
    'cluster_count', 'kelp_age', 'height', 'propagule_stage', 'repeater_delay', 'output_subtract_bit', 'rail_data_bit',
]);
// Full blocks that still carry one of those states.
const FULL_DESPITE_STATES = /^(barrel|composter|.*_log|.*_stem|.*_wood|.*_hyphae|bamboo_block|stripped_bamboo_block|beehive|bee_nest|melon_block|pumpkin|carved_pumpkin|lit_pumpkin|farmland|sculk_catalyst|respawn_anchor|crafter|trial_spawner|vault)$/;
// Flowers and small plants without a telling name or state.
const PLANTS =
    'allium|azure_bluet|blue_orchid|dandelion|golden_dandelion|poppy|.*_tulip|oxeye_daisy|lily_of_the_valley|wither_rose|' +
    'cornflower|torchflower|pitcher_plant|lilac|rose_bush|peony|sunflower|bush|firefly_bush|nether_sprouts|' +
    'short_dry_grass|tall_dry_grass|azalea|flowering_azalea|candle_cake';
const PARTIAL = new RegExp(
    '^(' + PLANTS + '|air|.*_carpet|carpet|.*_pane|glass_pane|.*pressure_plate|.*_sign|.*_banner|standing_banner|wall_banner|.*flower.*|' +
        '.*sapling|.*_mushroom|.*_fungus|.*_roots|snow_layer|cake|.*_bed|bed|.*chest|enchanting_table|lectern|stonecutter.*|' +
        '.*anvil|brewing_stand|cauldron|lava_cauldron|hopper|bell|(?!sea_)(.*_)?lantern|.*chain|end_rod|.*lightning_rod|flower_pot|' +
        '.*skull|.*_head|scaffolding|daylight_detector.*|grindstone|campfire|soul_campfire|conduit|.*_candle_cake|' +
        'dragon_egg|turtle_egg|sniffer_egg|sea_pickle|.*_amethyst_bud|amethyst_cluster|pointed_dripstone|big_dripleaf|' +
        'small_dripleaf_block|spore_blossom|hanging_roots|.*vines.*|vine|glow_lichen|sculk_vein|resin_clump|ladder|lever|' +
        'tripwire_hook|trip_wire|redstone_wire|.*repeater|.*comparator|.*torch|.*rail|web|short_grass|tall_grass|fern|' +
        'large_fern|deadbush|.*_bush|.*petals|wildflowers|leaf_litter|.*eyeblossom|waterlily|reeds|bamboo|kelp|seagrass|' +
        'frog_spawn|.*coral|.*coral_fan|.*coral_wall_fan|nether_wart|wheat|carrots|potatoes|beetroot|.*_crop|.*_stem|' +
        'sweet_berry_bush|cocoa|chorus_plant|chorus_flower|end_portal_frame|frame|glow_frame|decorated_pot|' +
        'piston_arm_collision|sticky_piston_arm_collision|moving_block|fire|soul_fire|portal|end_portal|end_gateway|' +
        '.*_shelf|shelf_mushroom|dried_ghast|heavy_core|calibrated_sculk_sensor|sculk_sensor|sculk_shrieker|.*_slab|' +
        '.*_stairs|.*_wall|.*_fence|.*_fence_gate|fence_gate|.*_door|wooden_door|.*trapdoor|.*_button|light_block.*|' +
        'structure_void|barrier|border_block|pale_hanging_moss|moss_carpet|pale_moss_carpet|lodestone_compass|camera)$',
);
const FULL_NAMED_PARTIAL = /^(.*_double_slab|mushroom_stem|brown_mushroom_block|red_mushroom_block|melon_block)$/;

const GRAVITY = /^(sand|red_sand|suspicious_sand|gravel|suspicious_gravel|.*_concrete_powder|anvil|chipped_anvil|damaged_anvil|dragon_egg|scaffolding|pointed_dripstone)$/;

const NEEDS_SUPPORT = new RegExp(
    '^(' + PLANTS + '|.*_carpet|moss_carpet|pale_moss_carpet|.*pressure_plate|.*flower.*|.*sapling|.*_mushroom|.*_fungus|.*_roots|' +
        'snow_layer|cake|.*_candle_cake|.*_bed|bed|.*torch|.*rail|redstone_wire|.*repeater|.*comparator|lever|' +
        'tripwire_hook|ladder|.*_button|.*_door|wooden_door|short_grass|tall_grass|fern|large_fern|deadbush|.*_bush|' +
        '.*petals|wildflowers|leaf_litter|.*eyeblossom|waterlily|reeds|bamboo|kelp|seagrass|sea_pickle|.*coral|' +
        '.*coral_fan|.*coral_wall_fan|nether_wart|wheat|carrots|potatoes|beetroot|.*_crop|melon_stem|pumpkin_stem|' +
        'sweet_berry_bush|cocoa|cactus|azalea|flowering_azalea|big_dripleaf|small_dripleaf_block|spore_blossom|' +
        'hanging_roots|.*vines.*|vine|glow_lichen|sculk_vein|resin_clump|.*_amethyst_bud|amethyst_cluster|' +
        'pointed_dripstone|frog_spawn|.*_sign|standing_banner|wall_banner|(?!sea_)(.*_)?lantern|bell|pale_hanging_moss|' +
        'chorus_plant|chorus_flower|.*_shelf)$',
);

// Can't be obtained in survival, even through another item. The repeater item places
// unpowered_repeater, seeds place crops and two slabs make a double slab, so those count as survival.
const CREATIVE_ONLY = new RegExp(
    '^(air|bedrock|invisible_bedrock|barrier|structure_block|structure_void|jigsaw|.*command_block|light_block.*|' +
        'border_block|allow|deny|camera|reinforced_deepslate|budding_amethyst|mob_spawner|trial_spawner|vault|' +
        'end_portal_frame|infested_.*|petrified_oak.*|frosted_ice|chorus_plant|suspicious_sand|suspicious_gravel|' +
        'portal|end_portal|end_gateway|moving_block|piston_arm_collision|sticky_piston_arm_collision|lit_.*|' +
        'deprecated_.*|info_update.*|reserved6|netherreactor|glowingobsidian|unknown|client_request_placeholder_block|' +
        'element_.*|hard_.*|chemical_heat|compound_creator|lab_table|material_reducer|colored_torch_.*|underwater_t.*|' +
        'chalkboard)$',
);
// lit_pumpkin is the jack o'lantern, an ordinary item.
const NOT_CREATIVE = /^lit_pumpkin$/;

const LIQUID = /^(water|flowing_water|lava|flowing_lava|bubble_column)$/;

/** Flag bits (FULL_CUBE … LIQUID) for a block id, given its state names and texture transparency. */
export function blockFlags(id, states, transparent) {
    let flags = 0;
    const partialState = states.some((s) => PARTIAL_STATES.has(s)) && !FULL_DESPITE_STATES.test(id);
    if (FULL_NAMED_PARTIAL.test(id) || !(partialState || PARTIAL.test(id) || LIQUID.test(id))) flags |= FLAGS.FULL_CUBE;
    if (transparent) flags |= FLAGS.TRANSPARENT;
    if (GRAVITY.test(id)) flags |= FLAGS.GRAVITY;
    if (NEEDS_SUPPORT.test(id)) flags |= FLAGS.NEEDS_SUPPORT;
    if (CREATIVE_ONLY.test(id) && !NOT_CREATIVE.test(id)) flags |= FLAGS.CREATIVE_ONLY;
    if (LIQUID.test(id)) flags |= FLAGS.LIQUID;
    return flags;
}
