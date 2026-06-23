# Starsector Core Mod File Formats

Reference for all standard Starsector mod data files. Starsector is a Java-based space combat/strategy game. Mods are placed in `starsector-core/../mods/<mod_folder>/`.

---

## mod_info.json

Located at the root of the mod folder. Required for every mod.

```json
{
  "id": "my_mod",
  "name": "My Mod Name",
  "author": "AuthorName",
  "version": "1.0",
  "description": "Short description of the mod.",
  "gameVersion": "0.98a-RC8",
  "originalGameVersion": "0.97",
  "totalConversion": false,
  "jars": ["jars/MyMod.jar"],
  "modPlugin": "mymod.plugins.MyModPlugin",
  "dependencies": [
    { "id": "lw_lazylib", "name": "LazyLib" },
    { "id": "MagicLib",   "name": "MagicLib" }
  ]
}
```

**Fields:**
- `id` — Unique mod identifier. Used in dependency lists. No spaces, use underscores.
- `name` — Display name shown in the mod manager.
- `author` — Author credit string.
- `version` — Version string. Can also be an object: `{"major":0,"minor":12,"patch":"1e"}`.
- `description` — Shown in the mod list UI.
- `gameVersion` — The Starsector version this mod targets.
- `originalGameVersion` — The version when the mod was first created (informational).
- `totalConversion` — If true, disables vanilla content. Defaults to false.
- `jars` — Array of relative paths to `.jar` files to load.
- `modPlugin` — Fully qualified Java class name of the `ModPlugin` implementation (entry point).
- `dependencies` — Array of objects with `id` and optional `name`. The game enforces these are loaded.

---

## Folder Structure

```
mods/
  my_mod/
    mod_info.json
    data/
      hulls/
        my_ship.ship          # Hull definition
        ship_data.csv         # Ship stats table
        skins/
          my_ship_skin.skin   # Hull skin/variant of a base hull
      weapons/
        my_weapon.wpn         # Weapon definition
        weapon_data.csv       # Weapon stats table
        proj/
          my_projectile.proj  # Projectile/missile definition
      variants/
        my_ship_loadout.variant  # Ship loadout/variant
      hullmods/
        hullmods.csv          # Hull modification stats
      campaign/
        abilities.csv
        bar_events.csv
        industries.csv
        market_conditions.csv
        procgen/
          drop_groups.csv
          planet_gen_data.csv
          star_gen_data.csv
      characters/
        skills/
          aptitude_data.csv
          skill_data.csv
        person_names.csv
      config/
        settings.json         # Mod settings overrides
        version/
          version_files.csv   # Version checker integration
        LunaSettingsConfig.json  # LunaLib settings (if used)
      world/
        factions/
          my_faction.faction  # Faction definition
          factions.csv
      strings/
        descriptions.csv      # Ship/weapon text descriptions
      missions/
        my_mission/
          descriptor.json
    graphics/
      ships/
        my_ship.png
      weapons/
        my_weapon_turret.png
        my_weapon_hardpoint.png
      icons/
        hullsys/
          my_system.png
    jars/
      MyMod.jar
    sounds/
      my_sound.ogg
```

---

## .ship (Hull Definition)

JSON file. Defines ship geometry, weapon slots, engine slots, and collision bounds.

```json
{
  "hullName": "My Ship",
  "hullId": "mymod_myship",
  "hullSize": "DESTROYER",
  "spriteName": "graphics/ships/mymod_myship.png",
  "style": "MIDLINE",
  "height": 200,
  "width": 120,
  "center": [60, 100],
  "collisionRadius": 110,
  "shieldCenter": [0, 0],
  "shieldRadius": 95,
  "viewOffset": 0,
  "builtInMods": ["targetingunit"],
  "builtInWings": [],
  "builtInWeapons": {
    "WS0001": "some_weapon_id"
  },
  "weaponSlots": [ ... ],
  "engineSlots": [ ... ],
  "bounds": [ ... ]
}
```

**Top-level fields:**
- `hullName` — Display name.
- `hullId` — Unique identifier; must match `ship_data.csv` `id` column.
- `hullSize` — One of: `FIGHTER`, `FRIGATE`, `DESTROYER`, `CRUISER`, `CAPITAL_SHIP`.
- `spriteName` — Path to sprite PNG relative to mod root.
- `style` — Visual style: `LOW_TECH`, `MIDLINE`, `HIGH_TECH`, `FIGHTER`, `STATION`, `REMNANT`.
- `height`, `width` — Sprite pixel dimensions.
- `center` — `[x, y]` pixel coords of the ship center within the sprite (origin for game coords).
- `collisionRadius` — Approximate collision circle radius in game units.
- `shieldCenter` — `[x, y]` offset of shield center from ship center in game units.
- `shieldRadius` — Shield arc radius.
- `viewOffset` — Camera offset for the ship in the refit screen.
- `builtInMods` — Array of hullmod IDs always present, cannot be removed.
- `builtInWeapons` — Object mapping slot ID → weapon ID for weapons locked into slots.
- `builtInWings` — Array of fighter wing IDs for built-in carrier bays.

**weaponSlots array — each entry:**
```json
{
  "id": "WS0001",
  "size": "MEDIUM",
  "type": "BALLISTIC",
  "mount": "TURRET",
  "arc": 180,
  "angle": 0,
  "locations": [50, 0],
  "renderOrderMod": 0
}
```
- `id` — Slot identifier string. Must match `builtInWeapons` keys if built-in.
- `size` — `SMALL`, `MEDIUM`, `LARGE`.
- `type` — `BALLISTIC`, `ENERGY`, `MISSILE`, `COMPOSITE`, `UNIVERSAL`, `BUILT_IN`, `LAUNCH_BAY`, `STATION_MODULE`.
- `mount` — `TURRET`, `HARDPOINT`, `HIDDEN`.
- `arc` — Firing arc in degrees. `0` = no rotation (hardpoints typically use 0-4).
- `angle` — Default facing angle in degrees from bow (0 = forward).
- `locations` — `[x, y]` in game units from center, OR for LAUNCH_BAY: flat array of multiple x/y pairs.
- `renderOrderMod` — Render layer adjustment; higher = drawn on top of other slots.

**engineSlots array — each entry:**
```json
{
  "location": [-80, 0],
  "length": 60,
  "width": 14,
  "angle": 180,
  "contrailSize": 14,
  "style": "MIDLINE"
}
```
- `location` — `[x, y]` in game units.
- `length` — Engine flame length.
- `width` — Engine flame width.
- `angle` — Direction the engine faces (180 = thrusting forward, toward bow).
- `contrailSize` — Width of the engine contrail trail.
- `style` — `LOW_TECH`, `MIDLINE`, `HIGH_TECH`, `FIGHTER`, `SPECIAL`.

**bounds array:**
Flat array of x/y pairs forming a convex polygon: `[x1, y1, x2, y2, ...]`. Defines the exact collision hull.

---

## ship_data.csv

Defines numerical stats for all ships. Tab-separated or comma-separated CSV. First row is the header.

**Required columns (partial list):**

| Column | Description |
|--------|-------------|
| `name` | Display name |
| `id` | Hull ID (matches `.ship` hullId) |
| `designation` | Ship role label (e.g., "Cruiser", "Destroyer") |
| `tech/manufacturer` | Faction/tech label for the codex |
| `system id` | Ship system ID (e.g., `maneuveringjets`, `burndrive`) |
| `fleet pts` | Deployment point cost |
| `hitpoints` | Hull HP |
| `armor rating` | Armor stat |
| `max flux` | Maximum flux capacity |
| `8/6/5/4%` | Overload protection percentages (can be blank) |
| `flux dissipation` | Flux dissipation per second |
| `ordnance points` | OP budget for weapons/hullmods in the refit screen |
| `fighter bays` | Number of fighter bays (blank = 0) |
| `max speed` | Top speed |
| `acceleration` | Acceleration stat |
| `deceleration` | Deceleration stat |
| `max turn rate` | Max turn rate in degrees/sec |
| `turn acceleration` | Turn acceleration |
| `mass` | Ship mass (affects collision/push) |
| `shield type` | `FRONT`, `OMNI`, `NONE`, `PHASE` |
| `defense id` | ID of the shield/defense system spec |
| `shield arc` | Shield arc width in degrees |
| `shield upkeep` | Flux cost per second while shield is up |
| `shield efficiency` | Flux per damage blocked (e.g., `1.0` = 1 flux per 1 damage) |
| `phase cost` | Flux cost to activate phase cloak |
| `phase upkeep` | Flux per second while phased |
| `min crew` | Minimum crew to operate |
| `max crew` | Maximum crew capacity |
| `cargo` | Cargo capacity |
| `fuel` | Fuel capacity |
| `fuel/ly` | Fuel burned per light-year |
| `range` | Max range in light-years before needing fuel |
| `max burn` | Maximum burn drive level |
| `base value` | Credit value |
| `cr %/day` | Combat readiness recovery per day |
| `CR to deploy` | CR cost to deploy |
| `peak CR sec` | Seconds at peak combat readiness |
| `CR loss/sec` | CR lost per second while deployed |
| `supplies/rec` | Supplies to recover CR to full |
| `supplies/mo` | Monthly supply maintenance cost |
| `hints` | Comma-separated behavior hints: `CARRIER`, `COMBAT`, `CIVILIAN`, `NO_AUTO_ESCORT`, `UNBOARDABLE`, `HIDE_IN_CODEX`, `SHIP_WITH_MODULES` |
| `tags` | Comma-separated blueprint tags: `XIV_bp`, `rare_bp`, `no_autofit`, `restricted`, `omega`, etc. |
| `rarity` | Spawn rarity in markets (0.0–1.0) |
| `breakProb` | Probability of breaking into pieces on death |
| `minPieces` / `maxPieces` | Min/max debris pieces |
| `travel drive` | Travel drive variant ID |
| `number` | Internal ordering number (informational) |

---

## .wpn (Weapon Definition)

JSON file. Defines weapon visuals and behavior references. Stats are in `weapon_data.csv`.

```json
{
  "id": "mymod_myweapon",
  "specClass": "projectile",
  "projectileSpecId": "mymod_myweapon_shot",
  "type": "BALLISTIC",
  "size": "MEDIUM",
  "displayArcRadius": 600,
  "turretSprite": "graphics/weapons/mymod_myweapon_t.png",
  "turretGunSprite": "graphics/weapons/mymod_myweapon_tg.png",
  "hardpointSprite": "graphics/weapons/mymod_myweapon_h.png",
  "hardpointGunSprite": "graphics/weapons/mymod_myweapon_hg.png",
  "visualRecoil": 5,
  "renderHints": ["RENDER_BARREL_BELOW"],
  "turretOffsets": [20, -5, 20, 5],
  "turretAngleOffsets": [0, 0],
  "hardpointOffsets": [25, -5, 25, 5],
  "hardpointAngleOffsets": [0, 0],
  "barrelMode": "ALTERNATING",
  "animationType": "MUZZLE_FLASH",
  "muzzleFlashSpec": {
    "length": 30,
    "spread": 20,
    "particleSizeMin": 5,
    "particleSizeRange": 5,
    "particleDuration": 0.1,
    "particleCount": 20,
    "particleColor": [255, 200, 100, 255]
  },
  "fireSound": "my_fire_sound",
  "fireSoundTwo": "my_fire_sound_2"
}
```

**Fields:**
- `id` — Weapon ID; must match `weapon_data.csv` `id` column.
- `specClass` — `projectile`, `beam`, `missile`, or custom class path.
- `projectileSpecId` — ID of the `.proj` file for projectile weapons.
- `type` — `BALLISTIC`, `ENERGY`, `MISSILE`.
- `size` — `SMALL`, `MEDIUM`, `LARGE`.
- `displayArcRadius` — Visual range ring radius in game units.
- `turretSprite` / `hardpointSprite` — Base/base images for the weapon mount.
- `turretGunSprite` / `hardpointGunSprite` — Barrel images that recoil.
- `visualRecoil` — Pixels the gun sprite moves back on fire.
- `renderHints` — Array of hints: `RENDER_BARREL_BELOW` draws the gun below the turret base.
- `turretOffsets` — Flat array of barrel tip positions: `[x1, y1, x2, y2, ...]` relative to mount center.
- `turretAngleOffsets` — Per-barrel angle offsets.
- `hardpointOffsets` / `hardpointAngleOffsets` — Same but for hardpoint mounts.
- `barrelMode` — `ALTERNATING` (barrels fire in turn) or `LINKED` (all fire simultaneously).
- `animationType` — `MUZZLE_FLASH`, `GLOW`, `NONE`.
- `muzzleFlashSpec` — Particle burst config on fire.
- `fireSound` / `fireSoundTwo` — Sound IDs from the game's sound system.

---

## weapon_data.csv

Stats table for all weapons. CSV with one row per weapon.

**Key columns:**

| Column | Description |
|--------|-------------|
| `name` | Display name |
| `id` | Weapon ID (matches `.wpn` id) |
| `tier` | Quality tier (0–4, affects market rarity) |
| `rarity` | Market spawn rarity |
| `base value` | Credit value |
| `range` | Weapon range in game units |
| `damage/shot` | Damage per projectile |
| `emp/shot` | EMP damage per projectile |
| `shots/burst` | Projectiles per burst |
| `burst delay` | Seconds between burst shots |
| `burst size` | Number of bursts before reload |
| `reload time` | Reload time in seconds |
| `OPs` | Ordnance point cost |
| `ammo` | Ammo capacity (blank = unlimited) |
| `ammo/reload` | Ammo restored per reload |
| `ammo regen` | Ammo regenerated per second |
| `flux/shot` | Flux generated per shot |
| `flux/sec` | Flux per second while firing (beams) |
| `speed` | Projectile speed |
| `turn rate` | Missile turn rate |
| `hints` | `BURST`, `GUIDED`, `STRIKE`, `PD`, `ANTI_FTR` |
| `tags` | Comma-separated tags |
| `tech/manufacturer` | Faction label |
| `for weapon tooltip, beta tooltip text, manual` | Tooltip display text |

---

## .variant (Ship Loadout)

JSON file. Defines a specific loadout/configuration for a hull.

```json
{
  "variantId": "mymod_myship_assault",
  "hullId": "mymod_myship",
  "displayName": "Assault",
  "goalVariant": true,
  "fluxCapacitors": 4,
  "fluxVents": 6,
  "quality": 1.0,
  "permaMods": [],
  "hullMods": ["targetingunit", "armoredweapons"],
  "weaponGroups": [
    {
      "autofire": false,
      "mode": "LINKED",
      "weapons": {
        "WS0001": "heavyac",
        "WS0002": "heavyac"
      }
    },
    {
      "autofire": true,
      "mode": "ALTERNATING",
      "weapons": {
        "WS0003": "flak"
      }
    }
  ],
  "modules": [],
  "wings": ["broadsword_wing", "wasp_wing"]
}
```

**Fields:**
- `variantId` — Unique variant ID; used in fleet compositions and missions.
- `hullId` — The hull this variant is based on.
- `displayName` — Short label shown in the UI.
- `goalVariant` — If true, the AI uses this as a "goal" loadout when fitting ships.
- `fluxCapacitors` — Number of flux capacitor upgrades installed.
- `fluxVents` — Number of flux vent upgrades installed.
- `quality` — Overall quality factor (0.0–1.0), affects CR and weapon condition.
- `permaMods` — Hullmods that cannot be removed (rare, mainly for special NPC ships).
- `hullMods` — Array of hullmod IDs installed.
- `weaponGroups` — Array of weapon groups; each group fires together or in sequence.
  - `autofire` — Whether this group fires automatically.
  - `mode` — `LINKED` (all fire at once) or `ALTERNATING` (cycle through weapons).
  - `weapons` — Object mapping slot ID → weapon ID.
- `modules` — Array of module variant IDs for modular ships.
- `wings` — Array of fighter wing IDs for each carrier bay.

---

## .proj (Projectile Definition)

JSON file. Defines the visual and behavior of a projectile or missile.

```json
{
  "id": "mymod_myshot",
  "specClass": "projectile",
  "hitGlowRadius": 30,
  "hitParticleColor": [255, 200, 100, 255],
  "hitParticleSizeMin": 5,
  "hitParticleSizeRange": 8,
  "hitParticleCount": 12,
  "hitParticleDuration": 0.2,
  "sprite": "graphics/projectiles/mymod_myshot.png",
  "width": 8,
  "length": 32,
  "glowRadius": 0,
  "glowColor": [255, 200, 100, 100],
  "trailEnabled": true,
  "trailWidth": 4,
  "trailColor": [255, 200, 100, 200],
  "trailDuration": 0.3
}
```

For missiles, specClass is typically `MissileSpecAPI` subclass or a built-in type, with additional fields for guidance (`turnAcceleration`, `maxTurnRate`, `launchSpeed`, `maxSpeed`, `hitPoints`, etc.).

---

## .skin (Hull Skin)

JSON file. Modifies a base hull with visual/stat changes without creating a new hull entry.

```json
{
  "baseHullId": "omen",
  "skinHullId": "omen_pirates",
  "systemId": "phasecloak",
  "hullName": "Shade",
  "descriptionId": "omen_pirates",
  "restoreToBase": false,
  "removeBuiltInMods": ["safetyoverrides"],
  "addBuiltInMods": ["converted_hangar"],
  "builtInWeapons": {},
  "removeWeaponSlots": [],
  "weaponSlotChanges": {},
  "spriteOverride": "graphics/ships/omen_pirates.png",
  "coversColor": false,
  "tags": []
}
```

---

## .faction (Faction Definition)

JSON file defining a faction's properties, fleets, and market behavior.

```json
{
  "id": "mymod_faction",
  "displayName": "My Faction",
  "displayNameWithArticle": "the My Faction",
  "displayNameLong": "The My Faction Empire",
  "entityNamePrefix": "MF",
  "logo": "graphics/factions/mymod_faction.png",
  "crest": "graphics/factions/mymod_faction_crest.png",
  "color": [200, 100, 50, 255],
  "secondaryUIColor": [150, 75, 25, 255],
  "gridColor": [200, 100, 50, 80],
  "relations": {
    "player": 0,
    "hegemony": -50
  },
  "alliedWith": [],
  "hostileTo": ["luddic_path"],
  "knownShips": {
    "mymod_myship": "DEFAULT",
    "hammerhead": "RARE"
  },
  "priorityShips": {},
  "knownWeapons": ["heavyac", "flak"],
  "knownFighters": ["broadsword_wing"],
  "shipsWhenDefeated": {},
  "music": {
    "encounter_hostile": "music_hegemony_encounter_hostile",
    "encounter_neutral": "music_hegemony_encounter_neutral",
    "market_neutral": "music_hegemony_market_neutral",
    "market_hostile": "music_hegemony_market_hostile",
    "market_friendly": "music_hegemony_market_friendly"
  },
  "shipNamePrefix": "MFS",
  "shipNameSources": {
    "WARRIORS": 2,
    "SPACE": 1
  },
  "portraits": {
    "standard_male": ["graphics/portraits/portrait_generic_male.png"],
    "standard_female": ["graphics/portraits/portrait_generic_female.png"]
  },
  "ranks": {},
  "posts": {}
}
```

---

## descriptions.csv

CSV with text for ships, weapons, and other items shown in the UI.

**Columns:** `id`, `type`, `text1`, `text2`, `text3`, `notes`

- `type` — `SHIP`, `WEAPON`, `FIGHTER`, `HULLMOD`, `SPECIAL`, etc.
- `text1` — Primary description shown in codex.
- `text2` / `text3` — Additional text blocks (some types use multiple).

---

## settings.json (in data/config/)

Partial JSON file. Used to override game settings and define custom entries. Only include keys you want to change—the game merges with the base settings.

Common uses:
- Adding custom hullmods to base ships: `"addHullmodsToAllShips": ["my_hullmod"]`
- Setting plugin class: `"campaignPlugin": "mymod.MyCampaignPlugin"`
- Graphics paths: `"graphics": {"backgrounds": ["graphics/backgrounds/my_bg.png"]}`

---

## hullmods.csv

CSV defining hull modifications that can be installed on ships.

**Key columns:** `name`, `id`, `tier`, `rarity`, `base value`, `cost`, `tech/manufacturer`, `tags`, `uiTags`, `desc`, `script`

- `cost` — OP cost to install.
- `script` — Fully qualified Java class implementing `HullModEffect`.

---

## abilities.csv

CSV defining campaign abilities (shown on the campaign map toolbar).

**Key columns:** `name`, `id`, `tier`, `rarity`, `base value`, `desc`, `tags`, `script`, `icon`

---

## Version Checker (version_files.csv + .version file)

`version_files.csv` lists `.version` JSON files for the Version Checker mod.

`.version` file format:
```json
{
  "masterVersionFile": "https://example.com/my_mod.version",
  "modName": "My Mod",
  "modThreadId": "12345",
  "modVersion": {
    "major": 1,
    "minor": 0,
    "patch": 0
  }
}
```

`version_files.csv` columns: `id`, `filename`
- `filename` — Path relative to mod root to the `.version` file.

---

## Coordinate System

- Origin (0,0) is the ship center as defined in `center` in the `.ship` file.
- **X-axis** points toward the **bow** (front) of the ship.
- **Y-axis** points to the **port side** (left from the pilot's view / right in normal screen orientation).
- Angles are in **degrees**, measured counter-clockwise from the positive X-axis (bow = 0°, port = 90°).
- In the sprite, the ship bow faces **right** (positive X in sprite space before flipping).

---

## Common Hull System IDs

| ID | Name |
|----|------|
| `maneuveringjets` | Maneuvering Jets |
| `burndrive` | Burn Drive |
| `phasecloak` | Phase Cloak |
| `temporalshell` | Temporal Shell |
| `ammofeed` | Accelerated Ammo Feeder |
| `damper` | Damper Field |
| `fortressshield` | Fortress Shield |
| `reservewing` | Reserve Deployment |
| `plasmajets` | Plasma Jets |
| `microburn_omega` | Microburn (Omega) |
| `damper_omega` | Damper (Omega) |
| `acausaldisruptor` | Acausal Disruptor |
| `entropyamplifier` | Entropy Amplifier |
| `displacer` | Displacer |
| `forgevats` | Forge Vats |
