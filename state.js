// ── EXPORT STATE ──────────────────────────────────────────────────────────────
let _byPath = {};
let _modRoot = '';
let _shipPathById = {};       // hullId → { path, skinPaths[], spritePath }
let _allOrphanPaths = new Set();
let _spriteUrlCache = {};     // file path → blob URL
let _variantSpriteByPath = {};// variant path → sprite file path
let _spriteTooltip = null;

// ── RISK ANALYSIS STATE ───────────────────────────────────────────────────────
let _riskGraph = {};          // path → [{severity, msg, dependentPaths, fixes}]
let _pendingPatches = {};     // path → [{description, apply: text→text}]
let _changeLog = [];          // [{icon, title, path, id}]
let _wpnPathById = {};        // weaponId (lowercase) → .wpn file path
let _currentModal = null;     // { filePath, activeRisks, allFixes, onProceed }
let _shipFilePathToHullId = {};// .ship file path → hull ID (for reverse sync)
let _modInfoPath = '';         // path to mod_info.json (for dep patching)
let _undeclaredDepData = [];   // [{modId, modName, author, usedPrefixes, exampleIds}] – undeclared foreign deps

function resetApp() {
  Object.values(_spriteUrlCache).forEach(u => URL.revokeObjectURL(u));
  _spriteUrlCache = {};
  _variantSpriteByPath = {};
  _shipPathById = {};
  _allOrphanPaths = new Set();
  _byPath = {};
  _modRoot = '';
  _riskGraph = {};
  _pendingPatches = {};
  _changeLog = [];
  _wpnPathById = {};
  _currentModal = null;
  _shipFilePathToHullId = {};
  _modInfoPath = '';
  _undeclaredDepData = [];
  $('app-upload').style.display = '';
  $('app-results').style.display = 'none';
  $('folder-input').value = '';
}
