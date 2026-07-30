# Emberveil Pixel Asset Guide

This document defines the original placeholder art direction for Emberveil and provides practical sprite-sheet specifications for production and temporary in-engine assets.

## Style pillars

- **16-bit SNES-era fantasy inspiration** with original silhouettes and motifs.
- **Top-down three-quarter perspective** for characters, enemies, props, and architectural pieces.
- **Crisp pixel edges only**: no anti-aliasing, no filtered scaling, no fractional placement.
- **Controlled palettes**: 3–5 shades per major material.
- **Moderate contrast** with readable foreground/background separation.
- **Hand-placed highlights and shadows** instead of gradient fills.
- **Strong silhouettes** that remain readable at 1x and 2x scale.
- **Original world language**: no copied heroes, monsters, UI frames, map layouts, or iconography.

## Runtime connection

The game currently loads these runtime atlases:

- `public/assets/generated/emberveil-sprites-32.png`
- `public/assets/generated/emberveil-tileset-16.png`
- `public/assets/generated/emberveil-effects-16.png`

Additional source/reference placeholder sheets live in `public/assets/guide/`. These guide sheets are separated by category so artists can iterate independently while the packed runtime atlases remain simple for the current Phaser build.

## Global palette guidance

- Ink: `#16121B`
- Deep shadow: `#292230`
- Stone mid/light: `#707985` / `#A4A8AA`
- Grass mid/light: `#4F7950` / `#79A85E`
- Dirt mid: `#A87852`
- Water mid/light: `#2D78A0` / `#67BDD0`
- Ember mid/light: `#E76F51` / `#FFB35C`
- Aether mid/light: `#A488D6` / `#D1BBFF`
- Skin mid/shadow: `#E0A067` / `#B66E4C`
- Wood mid/light: `#80533B` / `#B57C4F`
- Ice mid/light: `#B6E0F0` / `#DFF7FF`
- Citadel mid/light: `#5B566A` / `#8B86A4`

## Rowan sprite sheet

**Export filename:** `rowan-spritesheet-32.png`  
**Placeholder:** `public/assets/guide/rowan-spritesheet-32.png`

| Field | Spec |
|---|---|
| Frame size | 32 × 32 |
| Grid | 4 columns × 12 rows |
| Pivot | 16, 24 |
| Collision | 12 × 10, offset 10, 20 |
| Palette | Brown hair, warm skin, moss cloak, ember trim, wood boots |

| Animation | Frames and order | Duration |
|---|---|---|
| Walk | Down 0–1, Left 0–1, Right 0–1, Up 0–1 | 140 ms/frame |
| Idle | Down 0–1, Left 0–1, Right 0–1, Up 0–1 | 280 ms/frame |
| Sword | Down/Left/Right/Up, 3 frames each | 72 ms/frame |
| Charged strike | Down/Left/Right/Up, 4 frames each | 90 ms/frame |
| Item raise | Down/Left/Right/Up, 3 frames each | 110 ms/frame |
| Shield | Down/Left/Right/Up, 2 frames each | 180 ms/frame |
| Hurt | Down/Left/Right/Up, 2 frames each | 80 ms/frame |
| Swim | Down/Left/Right/Up, 2 frames each | 160 ms/frame |
| Lift | Down/Left/Right/Up, 2 frames each | 120 ms/frame |
| Carry | Down/Left/Right/Up, 2 frames each | 160 ms/frame |
| Throw | Down/Left/Right/Up, 3 frames each | 90 ms/frame |
| Victory | Down 0–3 | 180 ms/frame |

Runtime frame ordering in `emberveil-sprites-32.png` remains compatible with the game: walk 0–7, idle 16–23, sword 24–35, charged 36–51, item 52–63, shield 64–71, hurt 72–79, fall/death 80–83, swim 84–91, lift 92–99, carry 100–107, throw 108–119, victory 120–123.

## Eight NPC body types

**Export filename:** `npc-body-types-32.png`  
**Placeholder:** `public/assets/guide/npc-body-types-32.png`

| Field | Spec |
|---|---|
| Frame size | 32 × 32 |
| Grid | 8 columns × 8 rows |
| Pivot | 16, 24 |
| Collision | 12 × 10 default; child 10 × 8 |
| Animation | Idle and two-frame four-direction walk |
| Timing | Walk 160 ms/frame; idle held or 300 ms breathing variation |

Body types: Mossvale Elder, Forge Smith, Woodland Scout, Village Merchant, Signal Scholar, Child Villager, Warden Guard, and Marsh Mystic. Each uses a tight 4–5 color costume palette plus shared skin and ink values.

## Eight enemy sprite sheets

**Combined export filename:** `enemy-sheets-32.png`  
**Placeholder:** `public/assets/guide/enemy-sheets-32.png`

| Enemy | Animations | Order | Duration | Collision | Palette | Individual export |
|---|---|---|---|---|---|---|
| Hollow Wisp | Float, Alert | 0–3 loop | 180 ms | 12 × 10 | Ink + aether eyes | `enemy-hollow-wisp-32.png` |
| Bramble Boar | Snort, Charge | 0–3 loop | 120 ms | 18 × 12 | Bark + thorn greens | `enemy-bramble-boar-32.png` |
| Quarry Tick | Skitter, Lunge | 0–3 loop | 100 ms | 16 × 10 | Steel + ember eyes | `enemy-quarry-tick-32.png` |
| Marsh Lamprey | Pulse, Snap | 0–3 loop | 140 ms | 14 × 12 | Reed green + ember maw | `enemy-marsh-lamprey-32.png` |
| Ridge Raptor | Hop, Peck | 0–3 loop | 120 ms | 14 × 12 | Ochre + stone brown | `enemy-ridge-raptor-32.png` |
| Frostglass Sentinel | Hover, Cast | 0–3 loop | 160 ms | 14 × 14 | Ice + aether | `enemy-frostglass-sentinel-32.png` |
| Citadel Eye | Blink, Charge | 0–3 loop | 150 ms | 12 × 12 | Violet stone + ember iris | `enemy-citadel-eye-32.png` |
| Ember Bat | Flap, Dive | 0–3 loop | 90 ms | 12 × 8 | Lava orange + maroon | `enemy-ember-bat-32.png` |

The Hollow runtime placeholder remains frames 8–11 in `emberveil-sprites-32.png`.

## Gravemaw boss

**Export filename:** `gravemaw-boss-64.png`  
**Placeholder:** `public/assets/guide/gravemaw-boss-64.png`

| Field | Spec |
|---|---|
| Frame size | 64 × 64 |
| Grid | 4 × 4 |
| Pivot | 32, 44 |
| Collision | 34 × 24 main body; optional separate maw/claw hurtboxes |
| Palette | Dark stone plates, purple flesh, ember maw, aether crystal ribs |

| Animation | Frames | Duration |
|---|---|---|
| Idle heave | 0–3 | 200 ms/frame |
| Roar / maw flare | 4–7 | 90 ms/frame |
| Burrow / erupt | 8–11 | 110 ms/frame |
| Stagger / overload | 12–15 | 100 ms/frame |

## Regional tilesets

Every region placeholder uses 16 × 16 tiles in a 4 × 4 guide sheet, pivot 8,8. Tile collision is map metadata rather than pixel-perfect geometry. Water uses four frames at 160–200 ms each; flowers use two frames at 400–450 ms.

| Region | Export filename | Palette and motifs |
|---|---|---|
| Mossvale Village | `village-tiles-16.png` | Warm grass, dirt, stone, wood; cottages, wells, bridges, shrines |
| Whispering Woodland | `forest-tiles-16.png` | Dense green, bark, cool water; canopy, roots, glades, hidden paths |
| Sunken Quarry | `quarry-tiles-16.png` | Grey/ochre/wet blue; rails, cracked platforms, lifts, channels |
| Moonwater Marsh | `marsh-tiles-16.png` | Reeds, muddy green, dark water; walkways, wells, standing stones |
| Emberpeak Highlands | `mountain-tiles-16.png` | Volcanic brown, cliff grey, ember channels; stairs and high bridges |
| Frostglass Ruins | `ice-ruin-tiles-16.png` | Pale ice and glass white; crystalline floors and ruin blocks |
| Veiled Citadel | `citadel-tiles-16.png` | Violet stone and aether trim; severe masonry, sealed doors, hidden seams |

## Item icons

**Export filename:** `item-icons-16.png`  
**Placeholder:** `public/assets/guide/item-icons-16.png`

- Frame: 16 × 16
- Grid: 8 × 4
- Pivot: 8,8
- Collision: none
- Included silhouettes: sword, shield, lantern, bomb, hook, flute, key, gem, potion, leaf charm, coin, map, tower shard, herb, skull token, spark sigil.

## UI borders

**Export filename:** `ui-borders-8.png`  
**Placeholder:** `public/assets/guide/ui-borders-8.png`

- Frame: 8 × 8 slices
- Grid: 3 × 3 nine-slice
- Order: top-left, top, top-right, left, center, right, bottom-left, bottom, bottom-right
- Palette: deep fill, citadel frame, cream/aether highlights

## Health and magic indicators

**Export filename:** `health-magic-indicators-8.png`  
**Placeholder:** `public/assets/guide/health-magic-indicators-8.png`

- Frame: 8 × 8
- Pivot: 4,4
- Health uses ember shapes; magic uses aether shapes.
- Order: heart empty/full/low/critical, orb empty/full/charging/boosted.

## Particle effects

**Export filename:** `particle-effects-16.png`  
**Placeholder:** `public/assets/guide/particle-effects-16.png`

- Frame: 16 × 16
- Grid: 8 × 4
- Pivot: 8,8
- Four frames each: torch, signal, splash, leaf, impact spark, heal, mist, dust.
- Runtime atlas `emberveil-effects-16.png` packs torch frames 0–3 and signal frames 4–7.

## Doors, chests, switches, and puzzle objects

**Export filename:** `props-puzzle-objects-16.png`  
**Placeholder:** `public/assets/guide/props-puzzle-objects-16.png`

- Frame: 16 × 16
- Grid: 8 × 4
- Pivot: 8,12 for tall props; 8,8 for flat props
- Collision: 12 × 12 default, shorter for bridges/switches
- Included: door, chest, switch, well, signal tower, altar, tree, bush, bridge, cliff, stairs, rail, cracked stone, secret marker, ice ruin block, citadel wall.

## Implementation rules

1. Keep runtime atlases compact and use the guide sheets as source/reference art.
2. Reserve empty frame space around wide attacks and boss VFX.
3. Use simple foot/body collision rather than matching every visible pixel.
4. Differentiate important pickups and hazards by silhouette as well as color.
5. Keep high-contrast outlines and color-blind symbols possible in every UI asset.
6. Preserve regional environmental storytelling: repaired Mossvale wood, root-grown Woodland ruins, broken Quarry rails, sinking Marsh posts, exposed Emberpeak geology, fractured Frostglass observatory forms, and disciplined Citadel geometry.
