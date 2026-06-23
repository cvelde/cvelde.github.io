# LunaLib

**Mod ID:** `lunaLib`  
**Author:** Lukas22041  
**Purpose:** Library mod providing a settings/configuration UI framework for other mods, plus various utility APIs.

LunaLib is a dependency for many mods. It lets players change mod settings in-game through a unified menu accessible from the main menu or campaign screen.

---

## LunaSettingsConfig.json

Located at `data/config/LunaSettingsConfig.json` in the mod folder.

This file registers settings entries that appear in the LunaLib settings menu. It uses a **relaxed JSON** format that allows single-line comments with `#`.

### Top-level structure

```json
{
    "your_mod_id": {

        "iconPath": "graphics/icons/my_mod_icon.png",

        "setting_key_1": { ... },
        "setting_key_2": { ... }
    }
}
```

- The top-level key must match your mod's `id` from `mod_info.json`.
- `iconPath` — Optional. Path (relative to mod root) to a 40×40 PNG shown next to your mod in the settings menu. The image must already be loaded by the game (e.g., referenced in a ship, weapon, commodity, or via `settings.json` graphics).

---

### Setting Entry Types

Each key under the mod ID object defines one setting. The key becomes the setting's identifier used in Java code.

#### Boolean (toggle)

```json
"enable_feature": {
    "type": "Boolean",
    "name": "Enable My Feature",
    "description": "Turns the feature on or off.",
    "defaultValue": true
}
```

#### Integer

```json
"spawn_count": {
    "type": "Int",
    "name": "Spawn Count",
    "description": "How many ships to spawn.",
    "defaultValue": 3,
    "minValue": 1,
    "maxValue": 20
}
```

#### Float / Double

```json
"difficulty_multiplier": {
    "type": "Double",
    "name": "Difficulty Multiplier",
    "description": "Multiplies enemy fleet strength.",
    "defaultValue": 1.0,
    "minValue": 0.1,
    "maxValue": 5.0
}
```

#### String

```json
"faction_id": {
    "type": "String",
    "name": "Target Faction",
    "description": "ID of the faction to affect.",
    "defaultValue": "hegemony"
}
```

#### Enum (dropdown)

```json
"difficulty_preset": {
    "type": "Enum",
    "name": "Difficulty Preset",
    "description": "Choose a preset difficulty level.",
    "defaultValue": "NORMAL",
    "options": ["EASY", "NORMAL", "HARD", "BRUTAL"]
}
```

#### Header / Divider (UI decoration only, no value)

```json
"section_header": {
    "type": "Header",
    "name": "Combat Settings"
}
```

---

### Common Fields for All Setting Types

| Field | Required | Description |
|-------|----------|-------------|
| `type` | Yes | Setting type: `Boolean`, `Int`, `Double`, `String`, `Enum`, `Header` |
| `name` | Yes | Display label shown in the settings menu |
| `description` | No | Tooltip/description text shown below the label |
| `defaultValue` | Yes (except Header) | Value used on first load or reset |
| `minValue` | No | For numeric types: minimum allowed value |
| `maxValue` | No | For numeric types: maximum allowed value |
| `options` | Yes for Enum | Array of string options |
| `reloadListener` | No | If true, a reload button appears to apply changes mid-game |

---

## Reading Settings in Java

LunaLib provides a static API class. Import and usage:

```java
import lunalib.lunaSettings.LunaSettings;

// Boolean
Boolean enabled = LunaSettings.getBoolean("your_mod_id", "enable_feature");

// Integer
Integer count = LunaSettings.getInt("your_mod_id", "spawn_count");

// Double / Float
Double mult = LunaSettings.getDouble("your_mod_id", "difficulty_multiplier");

// String
String faction = LunaSettings.getString("your_mod_id", "faction_id");
```

All getters return boxed types and may return `null` if the key is not found, so null-check as needed.

---

## Listening for Setting Changes

Implement `LunaSettingsListener` to react when the player changes a value:

```java
import lunalib.lunaSettings.LunaSettingsListener;

public class MySettingsListener implements LunaSettingsListener {
    @Override
    public void settingsChanged(String modID) {
        if (modID.equals("your_mod_id")) {
            // Re-read and apply settings
        }
    }
}
```

Register the listener in your `ModPlugin.onApplicationLoad()`:

```java
LunaSettings.addSettingsListener(new MySettingsListener());
```

---

## Other LunaLib Utilities

LunaLib exposes additional APIs beyond settings. Key packages:

### lunalib.lunaUtil.ui
UI helper utilities for rendering custom campaign-layer panels and tooltips.

### lunalib.lunaUtil.fleet
Fleet utilities: `LunaFleetUtils` provides helpers for fleet spawning, fleet point calculations, and officer generation.

### lunalib.lunaUtil.campaign
Campaign utilities: market and faction helpers.

### lunalib.lunaUtil.stock
Item/blueprint stock utilities.

---

## Dependency Declaration

In `mod_info.json`:
```json
"dependencies": [
    { "id": "lunaLib", "name": "LunaLib" }
]
```

---

## Notes

- LunaLib settings are stored in `saves/common/lunaSettings.json` in the Starsector saves folder.
- Settings persist across saves by default.
- The `#` comment syntax in `LunaSettingsConfig.json` is non-standard JSON; standard parsers will reject it. LunaLib uses its own lenient parser.
- Settings keys are case-sensitive and must be consistent between the JSON file and Java calls.
