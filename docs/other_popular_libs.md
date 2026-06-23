# Other Popular Starsector Library Mods

---

## Second-in-Command (SiC)

**Mod ID:** `second_in_command`  
**Author:** Sundog  
**Purpose:** Adds a second officer slot ("XO") with a separate skill tree to the player fleet.

### Mod Integration

`data/config/secondInCommand/SCAptitudes.csv` — Register custom aptitude categories.
`data/config/secondInCommand/SCSkills.csv` — Register custom skills in the SiC skill tree.

**SCAptitudes.csv columns:** `id`, `name`, `description`, `icon`

**SCSkills.csv columns:** `id`, `name`, `description`, `icon`, `aptitude`, `tier`, `script`

- `aptitude` — References an aptitude `id` from `SCAptitudes.csv`.
- `tier` — 1–5, unlock tier within the aptitude.
- `script` — Fully qualified Java class implementing the skill effect.

---

## Version Checker

**Mod ID:** `version_checker`  
**Author:** LazyWizard  
**Purpose:** Notifies players in-game when an update is available for installed mods by checking a remote `.version` file URL.

### Integration

**1. Create a `.version` file** (any name, e.g., `my_mod.version`):

```json
{
    "masterVersionFile": "https://raw.githubusercontent.com/myuser/mymod/main/my_mod.version",
    "modName": "My Mod",
    "modThreadId": "12345",
    "modVersion": {
        "major": 1,
        "minor": 2,
        "patch": 0
    }
}
```

- `masterVersionFile` — URL of the authoritative version file online. Must be a direct link, not a redirect.
- `modThreadId` — Fractal Softworks forum thread ID number (for the "Check for update" link).
- `modVersion` — Current version. Can also be a string: `"modVersion": "1.2.0"`.

**2. Register in `data/config/version/version_files.csv`:**

```csv
id,filename
my_mod,my_mod.version
```

- `filename` — Path to the `.version` file relative to the mod root.

---

## Console Commands

**Mod ID:** `console`  
**Author:** LazyWizard  
**Purpose:** Adds an in-game console (default: Backslash key) for debugging and testing mods. Mods can register custom commands.

### Registering Commands

`data/console/commands.csv`:

```csv
command,class
MyCommand,mymod.commands.MyCommand
```

```java
import org.lazywizard.console.BaseCommand;
import org.lazywizard.console.Console;

public class MyCommand implements BaseCommand {
    @Override
    public CommandResult runCommand(String args, CommandContext context) {
        if (args.isEmpty()) {
            Console.showMessage("Usage: MyCommand <argument>");
            return CommandResult.WRONG_USAGE;
        }
        // Do something
        Console.showMessage("Done!");
        return CommandResult.SUCCESS;
    }
}
```

Built-in commands useful during development: `AddShip`, `AddWeapon`, `AddCredits`, `ForceMarketUpdate`, `RunCode` (execute arbitrary Java), `SetRelationship`, `Teleport`.

### command_listeners.csv

Some mods use `data/console/command_listeners.csv` to hook into when specific commands are run:

```csv
command,class
AddShip,mymod.listeners.AddShipListener
```

---

## Industrial Evolution (IndEvo)

**Mod ID:** `IndEvo`  
**Author:** Avanitia  
**Purpose:** Adds complex industry chains, production facilities, and a deep economy system to colonies.

### Integration Files

`data/config/indEvo/printing_whitelist.csv` — Ship/weapon IDs that can be printed by Industrial Evolution facilities.

```csv
id
mymod_myship
mymod_myweapon
```

`data/config/indEvo/reverse_engineering_whitelist.csv` — IDs that can be reverse-engineered.

Same format — one `id` column with one entry per row.

---

## Exiled Space

**Mod ID:** (varies)  
**Purpose:** Adds banished/exiled faction mechanics.

### Integration

`data/config/ExiledSpace/factions.csv` — Registers factions for Exiled Space faction mechanics.

```csv
id
mymod_faction
```

---

## Taken No Prisoners (TNP)

**Mod ID:** `takenoprisoners`  
**Purpose:** Modifies prisoner/crew capture mechanics.

### Integration

`data/config/takenoprisonersFactionConfig/<faction_id>.json` — Faction config for TNP mechanics. Similar to Nexerelin's faction config format with TNP-specific behavior fields.

---

## Frontiers (Hazard Mining Incorporated / HMI)

**Mod ID:** varies  
**Purpose:** Adds frontier colonies and special facilities.

### Integration

`data/campaign/frontiers/` — CSV files for frontier-specific facilities and modifiers:
- `rat_frontiers_facilities.csv` — Custom facility entries.
- `rat_frontiers_modifers.csv` — Custom modifier entries.

---

## Chatter

Built into vanilla Starsector but extended by mods. Adds dialogue that plays in combat.

### Chatter Config

`data/config/chatter/characters/<character_id>.json` — Defines what a named character says in various combat situations.

```json
{
    "id": "my_character",
    "name": "Admiral Smith",
    "lines": {
        "FIGHTER_LAUNCHED": ["Fighters away!"],
        "SHIP_DISABLED": ["We've lost power!"],
        "TAKING_FIRE": ["Shields holding!"],
        "ENEMY_DISABLED": ["Target neutralized."],
        "SHIP_DESTROYED_ALLY": ["We've lost a ship!"]
    }
}
```

`data/config/chatter/excluded_hulls.csv` — Hull IDs that should not use chatter.

```csv
id
mymod_drone
mymod_station
```

---

## Ship/Weapon Pack (SWP)

**Mod ID:** `swp`  
**Author:** Tartiflette  
**Purpose:** Large collection of vanilla-style ships and weapons. Many mods list SWP as a dependency because they use SWP weapons on their ships.

No integration files needed — just list as a dependency if your mod uses SWP content:

```json
"dependencies": [
    { "id": "swp", "name": "Ship/Weapon Pack" }
]
```

---

## Procedural Generation Files (vanilla extended)

### planet_gen_data.csv

`data/campaign/procgen/planet_gen_data.csv` — Adds custom planet types to procedural generation.

**Columns:** `name`, `id`, `tags`, `star_type`, `habitability`, `hazard`, `conditions`, `specId`

### star_gen_data.csv

`data/campaign/procgen/star_gen_data.csv` — Adds custom star types.

**Columns:** `name`, `id`, `radius`, `coronaRadius`, `lightColor`, `type`, `tags`

### drop_groups.csv

`data/campaign/procgen/drop_groups.csv` / `data/campaign/procgen/salvage_entity_gen_data.csv` — Defines loot drop groups for salvage.

---

## Hull Styles and Tags

### hull_styles.json

`data/config/hull_styles.json` — Registers custom hull styles used by the `.ship` `style` field and for automatic engine style assignment.

```json
{
    "MYMOD_STYLE": {
        "engineStyleId": "MYMOD_ENGINE",
        "engineColor": [150, 200, 255, 255],
        "contrailColor": [100, 160, 220, 150]
    }
}
```

### tag_data.json

`data/config/tag_data.json` — Registers custom tags shown in the ship codex UI.

```json
{
    "mymod_custom_tag": {
        "name": "My Tag",
        "description": "Description of what this tag means.",
        "color": [200, 150, 50, 255]
    }
}
```

---

## Custom Entities

`data/config/custom_entities.json` — Defines custom objects that can appear in star systems (derelicts, stations, special items, etc.).

```json
{
    "mymod_ruin": {
        "name": "Ancient Ruin",
        "tooltip": "The remains of a pre-Collapse installation.",
        "radius": 50,
        "defaultStyle": "LOW_TECH",
        "sprite": "graphics/entities/mymod_ruin.png",
        "category": "DERELICT",
        "tags": []
    }
}
```

---

## Battle Objectives

`data/config/battle_objectives.json` — Registers custom battle objectives for combat missions.

```json
{
    "mymod_nav_buoy": {
        "sprite": "graphics/objectives/nav_buoy.png",
        "name": "Navigation Buoy",
        "desc": "Provides navigation bonuses.",
        "captureRange": 300,
        "captureTime": 5,
        "capturePoints": 3,
        "effect": "NAV_BONUS"
    }
}
```
