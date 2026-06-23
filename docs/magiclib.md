# MagicLib

**Mod ID:** `MagicLib`  
**Author:** Wisp, Nicke535, and contributors  
**Purpose:** General-purpose utility library for Starsector modders. Provides systems for achievements, bounties, intel items, projectile trails, auto-fitting, and many Java utility methods.

MagicLib is a dependency for Nexerelin and many other mods.

---

## Dependency Declaration

```json
"dependencies": [
    { "id": "MagicLib", "name": "MagicLib" }
]
```

---

## Achievements System

MagicLib provides a cross-mod achievement framework with a UI accessible from the campaign screen.

### magic_achievements.csv

`data/config/magic_achievements.csv`

Registers achievements for your mod. Each row defines one achievement.

**Columns:**

| Column | Description |
|--------|-------------|
| `id` | Unique achievement ID |
| `mod` | Your mod's ID |
| `name` | Display name |
| `description` | Text shown in the achievement log |
| `sprite` | Path to achievement icon PNG |
| `hidden` | `TRUE`/`FALSE` — hidden until unlocked |
| `hasCounter` | `TRUE`/`FALSE` — shows a progress counter |
| `counterMax` | Target count for counter achievements |
| `script` | Fully qualified Java class for tracking logic (optional) |

**Example:**
```csv
id,mod,name,description,sprite,hidden,hasCounter,counterMax,script
mymod_first_kill,mymod,First Blood,Destroy an enemy ship.,graphics/icons/achievements/first_kill.png,FALSE,FALSE,,mymod.achievements.FirstKillAchievement
mymod_kills_100,mymod,Centurion,Destroy 100 enemy ships.,graphics/icons/achievements/centurion.png,FALSE,TRUE,100,mymod.achievements.KillCountAchievement
```

### Java API for Achievements

```java
import magiclib.achievements.MagicAchievement;
import magiclib.achievements.MagicAchievementManager;

// Grant an achievement
MagicAchievementManager.getInstance().completeAchievement("mymod_first_kill");

// Increment a counter achievement
MagicAchievementManager.getInstance().incrementAchievementCounter("mymod_kills_100", 1);

// Check if achieved
boolean done = MagicAchievementManager.getInstance().isAchieved("mymod_first_kill");
```

To create a tracked achievement, extend `MagicAchievement`:

```java
public class FirstKillAchievement extends MagicAchievement {
    @Override
    public void onGameLoad(boolean isNewGame) {
        // Register listeners here
    }
    
    @Override
    public void advanceInCampaign(float amount) {
        // Per-frame campaign logic
    }
}
```

---

## Bounty System

MagicLib provides a flexible bounty board system.

### Java API for Bounties

```java
import magiclib.bounty.MagicBountyCoordinator;
import magiclib.bounty.MagicBountyData;
import magiclib.bounty.ActiveBounty;

// Create a bounty programmatically
MagicBountyData data = new MagicBountyData();
data.job_name = "My Bounty";
data.job_description = "Hunt down the target.";
data.fleet_faction = "pirates";
data.fleet_preset_ships = Arrays.asList("my_target_variant");
data.job_credit_reward = 100000;
data.job_reputation_reward = 10;
data.target_faction = "pirates";
```

Bounties can also be defined in JSON files in `data/config/MagicBounty_data.json`.

---

## Auto-Fitting System

MagicLib provides `MagicAutofit` for programmatically equipping ships.

```java
import magiclib.autofit.MagicAutofit;

// Autofit a ship using MagicLib's algorithm
MagicAutofit.autofit(
    ship,           // FleetMemberAPI
    weapons,        // Map<String, String> slot ID -> weapon ID
    hullmods,       // List<String> hullmod IDs
    true,           // Fill remaining slots
    0.5f            // Quality (0–1)
);
```

---

## Projectile Trails (MagicTrail)

MagicLib includes the MagicTrail system, which GraphicsLib also exposes. Use it for visual weapon trails in combat.

```java
import magiclib.projectile.MagicTrailPlugin;

// In a weapon's onFire or a projectile's advance method:
MagicTrailPlugin.AddTrailMemberSimple(
    projectile,     // DamagingProjectileAPI
    textureID,      // Sprite ID for the trail texture
    width,          // float — trail width
    opacity,        // float — starting opacity (0–1)
    endOpacity,     // float — fade-to opacity
    color,          // Color
    additive,       // boolean — additive blending
    duration,       // float — seconds trail persists
    minLength       // float — minimum segment length
);
```

---

## Campaign Intel

MagicLib provides helpers for creating intel items (entries in the Intel tab on the campaign screen).

```java
import magiclib.intel.MagicMissionIntel;

// Extend MagicMissionIntel to create custom intel entries
public class MyIntelItem extends MagicMissionIntel {
    @Override
    public String getName() { return "My Intel Item"; }
    
    @Override
    public String getDescription(TooltipMakerAPI info, boolean isUpdate, boolean addTitle) {
        info.addPara("Details...", 0);
        return null;
    }
}
```

---

## Utility Methods

MagicLib's `MagicCampaign` and `MagicCombat` classes contain a large collection of static utility methods.

### MagicCampaign

```java
import magiclib.campaign.MagicCampaign;

// Create a fleet at a location
CampaignFleetAPI fleet = MagicCampaign.createFleet(
    "Fleet Name",
    "fleet_commander_name",
    "hegemony",         // faction ID
    null,               // flagship variant ID (or null for auto)
    "hammerhead_Attack",// flagship variant
    true,               // flagship is not recoverable
    8,                  // officer level
    20,                 // fleet points min
    30,                 // fleet points max
    true,               // add escort
    -1,                 // quality override (-1 = faction quality)
    null,               // variant list override
    null,               // variant weights
    FleetTypes.TASK_FORCE,
    100, 200,           // x, y map coords
    systemOrPlanet      // spawn location entity
);

// Spawn the fleet in the sector
MagicCampaign.addFleetToLocation(fleet, systemOrPlanet);
```

### MagicCombat

```java
import magiclib.combat.MagicCombat;

// Get the closest enemy ship
ShipAPI closest = MagicCombat.getClosestEnemyShip(myShip, 1000f);

// Apply an explosion effect
MagicCombat.applyExplosionForce(location, radius, force, damageSource);
```

### MagicRender

```java
import magiclib.render.MagicRender;

// Draw a sprite in combat (great for custom effects)
MagicRender.singleframe(
    sprite,         // SpriteAPI
    location,       // Vector2f
    velocity,       // Vector2f (can be zero)
    size,           // Vector2f width/height
    angle,          // float degrees
    color,          // Color
    additive,       // boolean blending mode
    CombatEngineLayers.BELOW_SHIPS_LAYER
);
```

---

## Notes

- MagicLib is actively maintained and its API changes between versions; check the MagicLib changelog when updating.
- Most MagicLib APIs require your mod to list MagicLib as a dependency in `mod_info.json`.
- The achievement icons should be square PNGs; 64×64 is standard.
- MagicTrail textures should be horizontal gradient PNGs (left = trail start/bright, right = trail end/fade).
