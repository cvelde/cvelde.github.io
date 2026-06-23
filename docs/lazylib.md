# LazyLib

**Mod ID:** `lw_lazylib`  
**Author:** LazyWizard  
**Purpose:** Foundational utility library for Starsector modding. Provides combat and campaign utility methods, console command support, and is a dependency for many major mods including Nexerelin.

LazyLib itself has no user-facing content — it exists purely as a code library.

---

## Dependency Declaration

```json
"dependencies": [
    { "id": "lw_lazylib", "name": "LazyLib" }
]
```

---

## Key Packages and Classes

### org.lazywizard.lazylib.CollisionUtils

Geometric/collision utility methods.

```java
import org.lazywizard.lazylib.CollisionUtils;

// Check if a point is inside a circle
boolean inside = CollisionUtils.isPointWithinCircle(point, center, radius);

// Get closest point on a line segment to a point
Vector2f closest = CollisionUtils.getClosestPointOnSegment(lineStart, lineEnd, point);

// Check if two circles overlap
boolean overlap = CollisionUtils.doCirclesCollide(center1, radius1, center2, radius2);
```

---

### org.lazywizard.lazylib.MathUtils

Math helpers beyond what Java/LWJGL provide.

```java
import org.lazywizard.lazylib.MathUtils;

// Get a random point within a circle
Vector2f randomPoint = MathUtils.getRandomPointInCircle(center, radius);

// Get a point at a specific angle and distance from another point
Vector2f point = MathUtils.getPointOnCircumference(center, radius, angleDegrees);

// Clamp a value
float clamped = MathUtils.clamp(value, min, max);

// Get distance between two vectors
float dist = MathUtils.getDistance(v1, v2);
float distSq = MathUtils.getDistanceSquared(v1, v2); // Faster, no sqrt

// Interpolate between two angles (handles wrap-around)
float angle = MathUtils.interpolateAngle(from, to, t);

// Check if an angle is between two other angles (arc containment)
boolean inArc = MathUtils.isAngleBetween(angle, start, end);
```

---

### org.lazywizard.lazylib.VectorUtils

Vector2f operations.

```java
import org.lazywizard.lazylib.VectorUtils;

// Get the angle of a vector in degrees
float angle = VectorUtils.getAngle(origin, target);

// Rotate a vector by an angle
Vector2f rotated = VectorUtils.rotate(vector, angleDegrees);

// Resize (normalize and scale) a vector
Vector2f sized = VectorUtils.resize(vector, newLength);

// Get facing angle between two locations
float facing = VectorUtils.getFacing(from, to);
```

---

### org.lazywizard.lazylib.combat.CombatUtils

Combat-specific utilities.

```java
import org.lazywizard.lazylib.combat.CombatUtils;

// Get all ships within a radius
List<ShipAPI> nearby = CombatUtils.getShipsWithinRange(location, range);

// Get all ships within range on a specific side
List<ShipAPI> enemies = CombatUtils.getShipsWithinRange(location, range);
// Filter by side yourself using ship.getOwner()

// Get all projectiles within range
List<DamagingProjectileAPI> projs = CombatUtils.getProjectilesWithinRange(location, range);

// Get all missiles within range
List<MissileAPI> missiles = CombatUtils.getMissilesWithinRange(location, range);

// Apply force to a ship
CombatUtils.applyForce(ship, angle, force);
```

---

### org.lazywizard.lazylib.campaign.CampaignUtils

Campaign map utilities.

```java
import org.lazywizard.lazylib.campaign.CampaignUtils;

// Get all fleets within range of a location in the current system
List<CampaignFleetAPI> fleets = CampaignUtils.getNearbyFleets(entity, maxRange);

// Check if a fleet is friendly/hostile
boolean hostile = CampaignUtils.isHostileTo(fleet, Global.getSector().getPlayerFleet());
```

---

### org.lazywizard.lazylib.combat.AIUtils

AI targeting helpers used in combat AI scripts.

```java
import org.lazywizard.lazylib.combat.AIUtils;

// Get the closest enemy ship to a given ship
ShipAPI target = AIUtils.getNearestEnemy(ship);

// Get the closest ally
ShipAPI ally = AIUtils.getNearestAlly(ship);

// Get all enemies in range
List<ShipAPI> enemies = AIUtils.getNearbyEnemies(ship, range);

// Check if a ship can be targeted (alive, not retreating, etc.)
boolean targetable = AIUtils.canUseSystemThisFrame(ship);
```

---

## Console Commands Integration

LazyLib integrates with the Console Commands mod to allow mods to register custom console commands.

```java
import org.lazywizard.console.BaseCommand;
import org.lazywizard.console.Console;

public class MyCommand implements BaseCommand {
    @Override
    public CommandResult runCommand(String args, CommandContext context) {
        Console.showMessage("Hello from MyCommand! Args: " + args);
        return CommandResult.SUCCESS;
    }
}
```

Register commands in `data/console/commands.csv`:

```csv
command,class
MyCommand,mymod.commands.MyCommand
```

**CommandResult values:** `SUCCESS`, `ERROR`, `WRONG_USAGE`, `BAD_SYNTAX`

**CommandContext values:** `CAMPAIGN_MAP`, `COMBAT`, `ANY`

---

## Notes

- LazyLib's utility methods are safe to call even without LazyLib as a dependency in some cases, but you should always declare it properly.
- `MathUtils.getDistanceSquared` is frequently preferred over `getDistance` in performance-sensitive loops (avoiding `sqrt`).
- LazyLib is one of the oldest Starsector libraries and its API is very stable — code written against older versions generally still works.
- The Console Commands mod (`console`) is a separate mod from LazyLib but uses LazyLib for command registration.
