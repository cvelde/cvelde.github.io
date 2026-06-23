# GraphicsLib

**Mod ID:** `shaderLib`  
**Author:** Tartiflette  
**Purpose:** Graphics enhancement library that adds normal mapping, material shaders, distortion effects, and advanced lighting to ships and weapons. Also provides an API for custom visual effects.

GraphicsLib is a pure visuals/rendering library with no gameplay impact. Mods can optionally ship texture data files to take advantage of it when it's installed.

---

## Dependency Declaration

In `mod_info.json` — GraphicsLib is typically an **optional** dependency (not required to run):

```json
"dependencies": [
    { "id": "shaderLib", "name": "GraphicsLib" }
]
```

If you want it optional, do not list it as a dependency at all — just provide the data files and GraphicsLib will pick them up if it's loaded.

---

## Texture Data Files

### engine_styles.json

`data/config/engine_styles.json`

Overrides or adds engine glow styles for ships in your mod. GraphicsLib enhances engine effects when this file is present.

```json
{
    "mymod_myship": {
        "engineColor": [100, 180, 255, 255],
        "contrailColor": [80, 150, 220, 150],
        "contrailDuration": 3.0,
        "contrailMinSeg": 50,
        "contrailSpawnDistMult": 1.0,
        "contrailWidthMult": 1.0,
        "contrailWidthAddedFragments": 0.0,
        "type": "GLOW",
        "glowAlternateColor": [200, 220, 255, 255],
        "glowSizeMult": 1.0,
        "mode": "BUILT_IN"
    }
}
```

**Fields:**
- `engineColor` — RGBA color of the engine flame glow `[r, g, b, a]` (0–255).
- `contrailColor` — RGBA color of the engine contrail trail.
- `contrailDuration` — How long contrail segments persist in seconds.
- `contrailMinSeg` — Minimum pixels between contrail segments.
- `contrailSpawnDistMult` — Multiplier on the distance between contrail spawn points.
- `contrailWidthMult` — Multiplier on contrail segment width.
- `contrailWidthAddedFragments` — Additional width for fragment particles.
- `type` — Effect type: `GLOW`, `PARTICLES`, `SMOKE`, `NONE`.
- `glowAlternateColor` — Secondary color that pulses/alternates with `engineColor`.
- `glowSizeMult` — Multiplier on engine glow size.
- `mode` — `BUILT_IN` uses GraphicsLib rendering; `VANILLA` falls back to standard engine.

---

### nsp_texture_data.csv / rat_texture_data.csv / (mod prefix)_texture_data.csv

`data/config/<prefix>_texture_data.csv`

Maps ship hull IDs to their GraphicsLib texture sheets (normal maps, material maps, surface maps). The filename prefix can be anything; GraphicsLib scans all CSV files in `data/config/` that match the expected format.

**Columns:**

| Column | Description |
|--------|-------------|
| `id` | Hull ID this row applies to |
| `map` | `normal`, `material`, or `surface` — which texture type |
| `texture` | Path to the texture PNG relative to mod root |

**Example:**
```
id,map,texture
mymod_myship,normal,graphics/ships/mymod_myship_normal.png
mymod_myship,material,graphics/ships/mymod_myship_material.png
mymod_myship,surface,graphics/ships/mymod_myship_surface.png
```

#### Texture Types Explained

- **normal map** — RGB encodes surface normal directions (X=R, Y=G, Z=B). Creates the illusion of 3D surface detail and directional lighting. Standard DirectX or OpenGL normal map conventions; GraphicsLib uses OpenGL (green channel up).
- **material map** — Encodes surface material properties per-pixel:
  - R channel: Specular intensity (how shiny/reflective)
  - G channel: Glossiness/roughness
  - B channel: Emissive glow intensity (self-illumination not affected by lighting)
  - A channel: (sometimes) additional mask
- **surface map** — An alternate/additional diffuse layer or detail texture blended over the ship sprite.

#### Texture Size and Format

- Textures must be power-of-two dimensions (e.g., 512×512, 1024×1024, 2048×2048).
- PNG format, RGBA.
- Should match the ship sprite dimensions or be a power-of-two that covers it.

---

### Lights Data

`data/config/rat_lights_data.csv` (or `data/lights/<prefix>_light_data.csv`)

Some mods store this in `data/lights/`. Defines point lights attached to ships for GraphicsLib's lighting system.

**Columns:**

| Column | Description |
|--------|-------------|
| `id` | Hull ID |
| `x` | X offset from ship center in game units |
| `y` | Y offset from ship center in game units |
| `r` | Red channel (0–255) |
| `g` | Green channel (0–255) |
| `b` | Blue channel (0–255) |
| `intensity` | Light intensity multiplier |
| `radius` | Radius of the light in game units |
| `flicker` | If > 0, the light flickers with this amplitude |
| `flickerSpeed` | Speed of flicker oscillation |

---

## GraphicsLib API (Java)

Available when GraphicsLib is a dependency. Key classes:

```java
import shaderLib.ShaderLib;
import shaderLib.distortion.DistortionAPI;
import shaderLib.distortion.RippleDistortion;
import shaderLib.distortion.WaveDistortion;
```

### Adding Distortion Effects

```java
// Ripple distortion (e.g., for explosions)
RippleDistortion ripple = new RippleDistortion(location, velocity);
ripple.setIntensity(20f);
ripple.setSize(200f);
ripple.setFrameRate(60f);
ripple.setArc(360f);
ripple.setRenderRange(500f);
ShaderLib.addDistortion(ripple);

// Wave distortion (e.g., for phase effects)
WaveDistortion wave = new WaveDistortion(location, velocity);
wave.setIntensity(10f);
wave.setSize(150f);
ShaderLib.addDistortion(wave);
```

### Checking if GraphicsLib is Active

```java
boolean glActive = ShaderLib.isAABBVisible(/* ... */);
// Or safer: check via class loading
boolean glLoaded = Global.getSettings().getModManager().isModEnabled("shaderLib");
```

---

## MagicTrail Integration

GraphicsLib includes the MagicTrail system for projectile trails. Weapon trail data is registered via:

`data/config/modFiles/magicTrail_data.csv`

**Columns:**

| Column | Description |
|--------|-------------|
| `weaponId` | Weapon ID this trail applies to |
| `textureId` | Texture sprite ID for the trail |
| `width` | Trail width in game units |
| `duration` | Trail persistence duration in seconds |
| `minLength` | Minimum trail segment length |
| `maxLength` | Maximum trail length |
| `color` | `r,g,b,a` packed or hex color |
| `blendSrc` | OpenGL blend source factor |
| `blendDest` | OpenGL blend destination factor |

Trail textures are registered as sprites in `settings.json` under `graphics.sprites`.

---

## Notes

- GraphicsLib has **no gameplay effects** — mods don't need it to function.
- Normal maps are the highest-value asset: they make ships look dramatically better under directional lighting.
- The `shaderLib` mod ID is kept from the original "ShaderLib" naming; despite the name change to GraphicsLib, the ID didn't change.
- When creating normal maps, tools like Laigter, SpriteIlluminator, or GIMP's normal map plugin work well for ship sprites.
- GraphicsLib applies lighting from the sun(s) in the star system; ships in deep space receive ambient light only.
