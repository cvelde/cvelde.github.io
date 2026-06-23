# Nexerelin

**Mod ID:** `nexerelin`  
**Author:** Histidine (original by Zaphide)  
**Purpose:** Total faction warfare overhaul — factions conquer and lose star systems, the player can join factions, diplomacy and invasions occur dynamically throughout a campaign.

Nexerelin is one of the most popular Starsector mods and the center of a large ecosystem of compatibility files. Many mods ship Nexerelin integration configs.

---

## Dependencies

- `lw_lazylib` (LazyLib)
- `MagicLib` (MagicLib)

---

## Faction Integration Files

Located in `data/config/exerelinFactionConfig/` in your mod folder.

### mod_factions.csv

Lists which faction JSON files Nexerelin should load from your mod. Without this file, Nexerelin ignores your faction configs.

```csv
id,filename
mymod_faction,data/config/exerelinFactionConfig/mymod_faction.json
```

**Columns:**
- `id` — Your faction's in-game ID (matches the faction's `id` field).
- `filename` — Path from the Starsector install root (or relative to mods root) to the JSON file.

### Faction Config JSON

`data/config/exerelinFactionConfig/<faction_id>.json`

```json
{
    "startRelationships": {
        "hegemony": -25,
        "persean": 10,
        "player": 0
    },
    "diplomacyConfig": {
        "friendliness": 0,
        "aggression": 50,
        "trustfulness": 25,
        "warExhaustionDivisor": 100
    },
    "npcMembers": [],
    "startSystems": [],
    "startWithMarket": true,
    "marketShare": 1.0,
    "fleetProperties": {
        "attackFleetSizeMult": 1.0,
        "invasionFleetSizeMult": 1.0,
        "responseFleetSizeMult": 1.0,
        "defenseFleetSizeMult": 1.0
    },
    "spawnFleets": true,
    "isHiddenFaction": false,
    "isDerelict": false,
    "isPirateOrIndependent": false,
    "noStartingColonies": false,
    "skipForMissions": false,
    "canBeHostile": true,
    "canBeAllied": true,
    "canAttack": true,
    "canBeInvaded": true,
    "alwaysAllowPeace": false,
    "alwaysAllowWar": false,
    "commissionBonusCredits": 0,
    "joinFactionReputationReq": -50
}
```

**Key fields:**

| Field | Description |
|-------|-------------|
| `startRelationships` | Initial relationship values with other factions (-100 to 100) |
| `diplomacyConfig.friendliness` | How willing to seek peace/alliances (0–100) |
| `diplomacyConfig.aggression` | How likely to start wars (0–100) |
| `diplomacyConfig.trustfulness` | How much they honor agreements (0–100) |
| `marketShare` | Relative share of market presence compared to vanilla factions |
| `fleetProperties` | Multipliers on fleet sizes for various fleet types |
| `spawnFleets` | Whether Nexerelin spawns patrol/attack fleets for this faction |
| `isHiddenFaction` | If true, faction does not appear in diplomacy/faction lists |
| `isDerelict` | Faction is inactive (no fleets, no markets) |
| `isPirateOrIndependent` | Treated as pirate/independent for diplomacy rules |
| `canBeHostile` / `canBeAllied` | Whether other factions can go to war/ally with this faction |
| `canAttack` / `canBeInvaded` | Whether this faction launches attacks / can have markets captured |
| `joinFactionReputationReq` | Minimum reputation to commission with this faction (-100 to 100) |

---

## Custom Starts

`data/config/exerelin/customStarts.json`

Defines custom starting scenarios the player can pick at new game creation.

```json
{
    "mymod_start": {
        "name": "My Custom Start",
        "description": "Start as an agent of My Faction.",
        "startFaction": "mymod_faction",
        "startCredits": 50000,
        "startFleet": "mymod_starter_fleet",
        "startLocation": "mymod_system",
        "startRelationshipOverrides": {
            "hegemony": 25
        },
        "startHullIds": ["mymod_myship"],
        "startHullMods": ["safetyoverrides"],
        "skills": ["helmsmanship", "combat_endurance"],
        "levelBonusXP": 0,
        "iconPath": "graphics/icons/mymod_start_icon.png"
    }
}
```

**Key fields:**

| Field | Description |
|-------|-------------|
| `name` | Display name in the start selection screen |
| `description` | Flavor text |
| `startFaction` | Faction the player starts commissioned with |
| `startCredits` | Starting credit amount |
| `startFleet` | Variant ID of the starting fleet (or starting ship hull ID) |
| `startLocation` | System or planet ID where player starts |
| `startRelationshipOverrides` | Override specific faction starting relationships |
| `startHullIds` | Additional hull IDs to give at start |
| `startHullMods` | HullMod IDs applied to starting ships |
| `skills` | Array of skill IDs the player starts with |
| `iconPath` | Icon shown in the start selection screen |

---

## Character Backgrounds

`data/config/exerelin/character_backgrounds.csv`

Defines player character background options for the Nexerelin new game screen.

**Columns:** `id`, `name`, `description`, `skills`, `startCredits`, `bonus`

---

## Invasion Fleet Configs

Nexerelin reads from `data/config/exerelinFactionConfig/` to determine which factions participate in invasions and how. The main `mod_factions.csv` controls registration; individual faction JSONs control behavior.

---

## Compatibility Files for Other Mods

### Industrial Evolution (`data/config/indEvo/`)

```
printing_whitelist.csv
reverse_engineering_whitelist.csv
```

These CSV files list hull/weapon IDs that Industrial Evolution allows to be printed or reverse-engineered. Format: single column `id`.

### Second-in-Command (`data/config/secondInCommand/`)

```
SCAptitudes.csv
SCSkills.csv
```

Registers custom aptitudes and skills for the Second-in-Command mod.

### Taken No Prisoners (`data/config/takenoprisonersFactionConfig/`)

Faction integration for the Taken No Prisoners mod. Same format as `exerelinFactionConfig` JSON but with TNP-specific fields.

---

## Nexerelin API (Java)

Key classes available when Nexerelin is a dependency:

```java
import exerelin.campaign.ExerelinSetupData;
import exerelin.utilities.ExerelinUtils;
import exerelin.utilities.ExerelinFactionConfig;
import exerelin.campaign.DiplomacyManager;
import exerelin.campaign.ColonyManager;
import exerelin.campaign.SectorManager;
```

**Common methods:**

```java
// Check if Nexerelin is active
boolean nexActive = Misc.isModEnabled("nexerelin");

// Get faction config
ExerelinFactionConfig config = ExerelinFactionConfig.getConfig("my_faction_id");

// Check if two factions are at war
boolean atWar = DiplomacyManager.getManager().isAtWar("faction_a", "faction_b");

// Get current sector ownership state
SectorManager sm = SectorManager.getManager();
```

---

## Notes

- Nexerelin replaces the vanilla campaign setup. If `totalConversion` is false in the Nexerelin `mod_info.json`, it adds its systems on top of vanilla.
- The Exerelin "Random Sector" start procedurally generates the galaxy without vanilla star systems.
- Without a `mod_factions.csv` entry, your mod's factions still exist but Nexerelin won't spawn invasion/attack fleets for them or include them in diplomacy.
- The faction JSON `startRelationships` sets relationships at world generation; they can change during play.
