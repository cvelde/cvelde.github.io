const $ = id => document.getElementById(id);

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

// ── FILE CATEGORIES ───────────────────────────────────────────────────────────
// Each category can have `patterns` (tested against filename) and `pathPatterns`
// (tested against the full path). First match wins; 'other' is the fallback.
const FILE_CATEGORIES = [
  { id:'settings',    label:'MOD SETTINGS',          icon:'⚙',
    patterns:[/^mod_info\.json$/i, /^settings\.json$/i, /^modsettings\.json$/i],
    desc:'Mod & game configuration files' },
  { id:'lunalib',     label:'LUNALIB CONFIG',         icon:'🌙',
    patterns:[/lunasettingsconfig\.json$/i, /lunasettings\.json$/i],
    desc:'LunaLib in-game settings (LunaSettingsConfig.json)' },
  { id:'graphicslib', label:'GRAPHICSLIB / VISUALS',  icon:'✨',
    patterns:[/^engine_styles\.json$/i, /^hull_styles\.json$/i, /_texture_data\.csv$/i, /_lights?_data\.csv$/i, /^magictrail_data\.csv$/i],
    desc:'GraphicsLib shaders, engine styles & texture maps' },
  { id:'nexerelin',   label:'NEXERELIN CONFIG',       icon:'⚔',
    patterns:[/^mod_factions\.csv$/i, /^customstarts\.json$/i, /^character_backgrounds\.csv$/i],
    pathPatterns:[/\/exerelinFactionConfig\//i, /\/takenoprisonersFactionConfig\//i, /\/config\/exerelin\//i],
    desc:'Nexerelin faction warfare & diplomacy configs' },
  { id:'chatter',     label:'CHATTER / DIALOGUE',     icon:'💬',
    patterns:[/^excluded_hulls\.csv$/i],
    pathPatterns:[/\/chatter\/characters\//i, /\/chatter\//i],
    desc:'In-combat chatter character dialogue files' },
  { id:'version',     label:'VERSION CHECKER',        icon:'🔖',
    patterns:[/\.version$/i, /^version_files\.csv$/i],
    pathPatterns:[/\/config\/version\//i],
    desc:'Version Checker integration files (.version, version_files.csv)' },
  { id:'missions',    label:'MISSIONS',               icon:'🎯',
    patterns:[/^descriptor\.json$/i, /^mission_list\.csv$/i],
    desc:'Mission descriptor and list files' },
  { id:'campaign',    label:'CAMPAIGN DATA',          icon:'🗺',
    patterns:[/^abilities\.csv$/i, /^bar_events\.csv$/i, /^industries\.csv$/i, /^market_conditions\.csv$/i, /^submarkets\.csv$/i, /^special_items\.csv$/i, /^person_missions\.csv$/i, /^pings\.json$/i, /^terrain\.json$/i, /^drop_groups\.csv$/i, /^planet_gen_data\.csv$/i, /^star_gen_data\.csv$/i, /^salvage_entity_gen_data\.csv$/i, /^condition_gen_data\.csv$/i],
    desc:'Campaign abilities, markets, industries & procgen tables' },
  { id:'sounds',      label:'SOUND FILES',            icon:'🔊',
    patterns:[/\.ogg$/i, /\.wav$/i, /\.mp3$/i, /^sounds\.json$/i],
    desc:'Audio assets and sound registry' },
  { id:'graphics',    label:'GRAPHICS / SPRITES',     icon:'🖼',
    patterns:[/\.png$/i, /\.jpg$/i, /\.jpeg$/i, /\.webp$/i, /\.svg$/i],
    desc:'Image and sprite assets' },
  { id:'scripts',     label:'SCRIPTS',                icon:'📜',
    patterns:[/\.java$/i, /\.class$/i, /\.jar$/i, /\.kt$/i, /\.groovy$/i],
    desc:'Java source files and compiled code' },
  { id:'ships',       label:'SHIP FILES',             icon:'🚀',
    patterns:[/\.ship$/i],
    desc:'Ship hull definitions' },
  { id:'skins',       label:'SKIN FILES',             icon:'🎨',
    patterns:[/\.skin$/i],
    desc:'Ship skin/reskin definitions' },
  { id:'variants',    label:'VARIANT FILES',          icon:'🔩',
    patterns:[/\.variant$/i],
    desc:'Ship variant loadouts' },
  { id:'weapons',     label:'WEAPON FILES',           icon:'⚡',
    patterns:[/\.wpn$/i, /\.proj$/i],
    desc:'Weapon and projectile definitions' },
  { id:'wings',       label:'WING FILES',             icon:'✈',
    patterns:[/\.wing$/i],
    desc:'Fighter wing definitions' },
  { id:'ship_systems', label:'SHIP SYSTEMS',          icon:'⚙',
    patterns:[/\.system$/i],
    desc:'Ship system specs referenced by ship_data.csv or systemId' },
  { id:'magicbounty', label:'MAGIC BOUNTIES',          icon:'🎯',
    patterns:[/^magicbounty_data\.json$/i, /^magicbounty_intel\.json$/i],
    pathPatterns:[/\/MagicBounty\//i, /\/config\/MagicBounty/i],
    desc:'MagicLib bounty definitions' },
  { id:'faction',     label:'FACTIONS',               icon:'🚩',
    patterns:[/\.faction$/i, /^default_ship_roles\.json$/i, /^default_ranks\.json$/i, /^factions\.csv$/i],
    pathPatterns:[/\/world\/factions\//i],
    desc:'Faction definitions, ship roles & rank tables' },
  { id:'planets',     label:'PLANETS / STAR SYSTEMS', icon:'🪐',
    patterns:[/\.star_system$/i, /\.planet$/i, /^custom_entities\.json$/i, /^planets\.json$/i, /^tag_data\.json$/i, /^battle_objectives\.json$/i, /^contact_tag_data\.json$/i],
    desc:'World, planet, star system & custom entity definitions' },
  { id:'strings',     label:'STRINGS / LOCALES',      icon:'🌐',
    patterns:[/^tips\.json$/i, /lang_/i, /locale/i, /\.strings$/i, /^tips\.txt$/i],
    pathPatterns:[/\/strings\//i],
    desc:'Localisation and string tables' },
  { id:'desc',        label:'DESCRIPTIONS',           icon:'📝',
    patterns:[/^descriptions\.csv$/i, /readme/i, /\.txt$/i, /\.md$/i],
    desc:'Description text and documentation' },
  { id:'csv',         label:'DATA TABLES',            icon:'📊',
    patterns:[/\.csv$/i, /\.tsv$/i],
    desc:'CSV data tables' },
  { id:'other',       label:'UNCATEGORISED',          icon:'📁',
    patterns:[],
    desc:'Files not matching any known category' }
];

// Extensions whose files the game engine loads by directory scan — tracing
// every reference to them is impractical, so skip them in the orphan check.
const ORPHAN_EXEMPT_EXTS = new Set(['java','class','jar','kt','groovy','ogg','wav','mp3','faction','star_system','planet','txt','md','strings']);

// Exact filenames (lowercased) that are loaded by the game or library mods by
// convention (e.g. GraphicsLib scans for engine_styles.json in every mod).
// These are never orphaned even if nothing in the mod JSON references them.
const ORPHAN_EXEMPT_NAMES = new Set([
  'ship_data.csv','weapon_data.csv','wing_data.csv','fighter_data.csv',
  'abilities.csv','hullmods.csv','descriptions.csv','bar_events.csv',
  'person_missions.csv','mission_list.csv','industries.csv',
  'market_conditions.csv','submarkets.csv','special_items.csv',
  'sounds.json','planets.json','custom_entities.json','engine_styles.json',
  'hull_styles.json','tag_data.json','battle_objectives.json','contact_tag_data.json',
  'lunasettingsconfig.json','mod_info.json','settings.json','modsettings.json',
  'version_files.csv','magic_achievements.csv','magictrail_data.csv',
  'aptitude_data.csv','skill_data.csv','default_ship_roles.json',
  'default_ranks.json','pings.json','terrain.json','commands.csv',
  'command_listeners.csv','factions.csv','mod_factions.csv',
  'customstarts.json','character_backgrounds.csv','excluded_hulls.csv',
  'drop_groups.csv','planet_gen_data.csv','star_gen_data.csv',
  'salvage_entity_gen_data.csv','condition_gen_data.csv',
  'magicbounty_data.json','magicbounty_intel.json',
  'sc_skills.csv','sc_aptitudes.csv','scaptitudes.csv','scskills.csv',
  'printing_whitelist.csv','reverse_engineering_whitelist.csv',
  'industry_data.csv','market_data.csv',
]);

// Path sub-patterns for files loaded by directory scanning in library mods.
const ORPHAN_EXEMPT_PATH_PATTERNS = [
  /\/data\/config\/exerelinFactionConfig\//i,
  /\/data\/config\/takenoprisonersFactionConfig\//i,
  /\/data\/config\/exerelin\//i,
  /\/data\/config\/chatter\//i,
  /\/data\/config\/secondInCommand\//i,
  /\/data\/config\/indEvo\//i,
  /\/data\/config\/modFiles\//i,
  /\/data\/config\/version\//i,
  /\/data\/config\/ExiledSpace\//i,
  /\/data\/world\/factions\//i,
  /\/data\/strings\//i,
  /\/data\/lights\//i,
  /\/data\/missions\//i,
  /\/data\/campaign\/procgen\//i,
  /\/data\/campaign\/frontiers\//i,
  /\/data\/characters\//i,
  /\/data\/config\/MagicBounty/i,
  /\/data\/campaign\/rulecontent\//i,
  /\/data\/campaign\/rules\//i,
  /\/data\/scripts\//i,
  /_texture_data\.csv$/i,
  /_lights?_data\.csv$/i,
  /\.version$/i,
];

function categoriseFile(name, path = '') {
  for (const cat of FILE_CATEGORIES) {
    if (cat.id === 'other') continue;
    if (cat.patterns.some(p => p.test(name))) return cat;
    if (cat.pathPatterns?.some(p => p.test(path))) return cat;
  }
  return FILE_CATEGORIES.find(c => c.id === 'other');
}

// ── DRAG & DROP ───────────────────────────────────────────────────────────────
const dz = $('drop-zone');
dz.addEventListener('dragenter', e => { e.preventDefault(); dz.classList.add('drag-over'); });
dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
dz.addEventListener('drop', e => {
  e.preventDefault();
  dz.classList.remove('drag-over');
  handleDrop(e.dataTransfer);
});
dz.addEventListener('click', e => {
  if (e.target.closest('button')) return;
  $('folder-input').click();
});
$('folder-input').addEventListener('change', e => startAnalysis(Array.from(e.target.files)));

async function handleDrop(dataTransfer) {
  const itemFiles = dataTransfer?.items?.length ? await filesFromItems(dataTransfer.items) : [];
  const files = itemFiles.length ? itemFiles : Array.from(dataTransfer?.files || []);
  if (files.length) startAnalysis(files);
}

async function filesFromItems(items) {
  const files = [];
  const promises = [];
  for (const item of items) {
    if (item.kind !== 'file') continue;
    if (item.getAsFileSystemHandle) {
      const handle = await item.getAsFileSystemHandle();
      if (handle) { promises.push(traverseHandle(handle, files, '/' + handle.name)); continue; }
    }
    const entry = item.webkitGetAsEntry?.();
    if (entry) promises.push(traverseEntry(entry, files));
    else { const file = item.getAsFile?.(); if (file) files.push(file); }
  }
  await Promise.all(promises);
  return files;
}

async function traverseHandle(handle, files, path) {
  if (handle.kind === 'file') {
    const file = await handle.getFile();
    file._path = path;
    files.push(file);
  } else if (handle.kind === 'directory') {
    const sub = [];
    for await (const [name, child] of handle.entries())
      sub.push(traverseHandle(child, files, path + '/' + name));
    await Promise.all(sub);
  }
}

async function handleItems(items) {
  const files = await filesFromItems(items);
  if (files.length) startAnalysis(files);
}

function traverseEntry(entry, files) {
  return new Promise(resolve => {
    if (entry.isFile) {
      entry.file(f => { f._path = entry.fullPath || ('/' + f.name); files.push(f); resolve(); }, resolve);
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const readAll = () => {
        reader.readEntries(entries => {
          if (!entries.length) return resolve();
          Promise.all(entries.map(e => traverseEntry(e, files))).then(readAll);
        }, resolve);
      };
      readAll();
    }
  });
}

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
  $('app-upload').style.display = '';
  $('app-results').style.display = 'none';
  $('folder-input').value = '';
}

// ── ANALYSIS ─────────────────────────────────────────────────────────────────
async function startAnalysis(files) {
  $('app-upload').style.display = 'none';
  $('app-results').style.display = '';
  $('progress-wrap').style.display = '';
  $('results-content').style.display = 'none';

  setProgress(0, 'Reading file list...');

  const byPath = {};
  for (const f of files) {
    const path = f._path || (f.webkitRelativePath ? '/' + f.webkitRelativePath : '/' + f.name);
    byPath[path] = f;
  }
  _byPath = byPath;
  const allPaths = Object.keys(byPath);

  // Mod root
  let modRoot = '';
  const modInfoPath = allPaths.find(p => p.endsWith('/mod_info.json'));
  if (modInfoPath) modRoot = modInfoPath.replace('/mod_info.json', '');
  else { const parts = allPaths[0]?.split('/').filter(Boolean); if (parts) modRoot = '/' + parts[0]; }
  _modRoot = modRoot;
  $('mod-name-display').textContent = modRoot.split('/').pop() || 'Unknown Mod';

  setProgress(5, 'Parsing mod_info.json...');
  let modInfo = null;
  if (modInfoPath) { try { modInfo = parseStarsectorJson(await readText(byPath[modInfoPath])); } catch(e) {} }
  if (modInfo?.name) $('mod-name-display').textContent = modInfo.name + (modInfo.version ? ` v${modInfo.version}` : '');

  setProgress(10, 'Finding ship_data.csv...');
  const csvPath = allPaths.find(p => /ship_data\.csv$/i.test(p));
  let csvById = {};
  if (csvPath) {
    const rows = parseCSV(await readText(byPath[csvPath]));
    for (const r of rows) { if (r.id) csvById[r.id.trim()] = r; }
  }

  // ── Collect typed file paths ──────────────────────────────────────────────
  const shipPaths    = allPaths.filter(p => p.endsWith('.ship'));
  const skinPaths    = allPaths.filter(p => p.endsWith('.skin'));
  const variantPaths = allPaths.filter(p => p.endsWith('.variant'));

  // ── Parse .ship files ─────────────────────────────────────────────────────
  setProgress(18, `Parsing ${shipPaths.length} .ship files...`);
  const ships = [];
  for (let i = 0; i < shipPaths.length; i++) {
    setProgress(18 + Math.round((i/Math.max(shipPaths.length,1))*20), `Ship ${i+1}/${shipPaths.length}…`);
    const p = shipPaths[i];
    let data = null, rawText = '';
    try { rawText = await readText(byPath[p]); data = parseStarsectorJson(rawText); } catch(e) { data = {_parseError: e.message}; }
    const fileBase = p.split('/').pop().replace('.ship','');
    const hullId   = data?.hullId || data?.id || fileBase;
    ships.push({ path:p, shortName:p.split('/').pop(), fileBase, hullId, data,
                 rawText,
                 inHullsFolder:/\/hulls\//.test(p) });
  }

  // ── Parse .skin files ─────────────────────────────────────────────────────
  setProgress(38, `Parsing ${skinPaths.length} .skin files...`);
  const skins = [];
  for (let i = 0; i < skinPaths.length; i++) {
    setProgress(38 + Math.round((i/Math.max(skinPaths.length,1))*12), `Skin ${i+1}/${skinPaths.length}…`);
    const p = skinPaths[i];
    let data = null, rawText = '';
    try { rawText = await readText(byPath[p]); data = parseStarsectorJson(rawText); } catch(e) { data = {_parseError: e.message}; }
    const fileBase   = p.split('/').pop().replace('.skin','');
    // A skin's own hull ID (the reskinned version) and the base ship it extends
    const skinHullId = data?.hullId || fileBase;
    const baseHullId = data?.baseHullId || null;
    skins.push({ path:p, shortName:p.split('/').pop(), fileBase, skinHullId, baseHullId, data,
                 rawText,
                 inHullsFolder:/\/hulls\//.test(p) });
  }

  // ── Build lookup sets ─────────────────────────────────────────────────────
  setProgress(50, 'Building hull ID sets...');
  // shipById: hullId → ship object
  const shipById = {};
  for (const s of ships) shipById[s.hullId] = s;
  // skinById: skinHullId → skin object
  const skinById = {};
  for (const sk of skins) skinById[sk.skinHullId] = sk;
  // combined set of valid hull IDs (ships + skins)
  const allHullIds = new Set([...Object.keys(shipById), ...Object.keys(skinById)]);

  // Map skin → parent ship (via baseHullId chain)
  for (const sk of skins) {
    sk.parentShip = sk.baseHullId ? (shipById[sk.baseHullId] || null) : null;
  }
  // Also attach skins list to each ship for grouped display
  for (const s of ships) s.skins = [];
  for (const sk of skins) {
    if (sk.parentShip) sk.parentShip.skins.push(sk);
  }

  // ── CSV registration checks ───────────────────────────────────────────────
  for (const s of ships) {
    s.inCsv  = csvById[s.hullId] !== undefined;
    s.csvRow = csvById[s.hullId] || null;
  }
  const csvShipsNotFound = Object.keys(csvById).filter(id => !allHullIds.has(id) && id && id !== '#' && id !== 'id');

  // ── Parse .variant files ──────────────────────────────────────────────────
  setProgress(55, `Parsing ${variantPaths.length} .variant files...`);
  const variants = [];
  for (let i = 0; i < variantPaths.length; i++) {
    setProgress(55 + Math.round((i/Math.max(variantPaths.length,1))*20), `Variant ${i+1}/${variantPaths.length}…`);
    const p = variantPaths[i];
    let data = null, rawText = '';
    try { rawText = await readText(byPath[p]); data = parseStarsectorJson(rawText); } catch(e) { data = {_parseError: e.message}; }
    const refId  = data?.hullId || null;
    const isSkin = refId ? skinById[refId] !== undefined : false;
    const isShip = refId ? shipById[refId] !== undefined : false;
    const refOk  = !refId || isSkin || isShip;
    // resolve to parent ship for grouping
    let resolvedShip = null;
    if (isShip) resolvedShip = shipById[refId];
    else if (isSkin && skinById[refId]?.parentShip) resolvedShip = skinById[refId].parentShip;
    variants.push({
      path:p, shortName:p.split('/').pop(), data,
      rawText,
      refId, isSkin, isShip, refOk,
      resolvedShip,
      refType: data?._parseError ? 'parse_error' : isSkin ? 'skin' : isShip ? 'ship' : (refId ? 'missing' : 'none'),
      inVariantsFolder:/\/variants\//.test(p)
    });
  }
  // attach variants to their resolved ship
  for (const s of ships) s.variants = [];
  for (const v of variants) { if (v.resolvedShip) v.resolvedShip.variants.push(v); }

  // ── Resolve sprite paths ──────────────────────────────────────────────────
  function resolveSprite(spriteName) {
    if (!spriteName) return null;
    const rel = spriteName.replace(/^\//, '');
    if (_byPath[modRoot + '/' + rel]) return modRoot + '/' + rel;
    if (_byPath['/' + rel]) return '/' + rel;
    return null;
  }
  for (const s of ships) s.spritePath = resolveSprite(s.data?.spriteName);
  for (const sk of skins) {
    const own = resolveSprite(sk.data?.spriteName);
    sk.spritePath = own || sk.parentShip?.spritePath || null;
  }
  _variantSpriteByPath = {};
  for (const v of variants) {
    v.spritePath = (v.isSkin ? skinById[v.refId]?.spritePath : null) || v.resolvedShip?.spritePath || null;
    if (v.spritePath) _variantSpriteByPath[v.path] = v.spritePath;
  }

  // ── Orphan detection ──────────────────────────────────────────────────────
  setProgress(75, 'Detecting orphaned files...');

  // Build a set of all strings mentioned in all parsed JSON (paths, ids, filenames)
  // We collect the raw JSON text for each parsed file to do a quick substring search
  const referenceCorpus = new Set();
  const refOwners = [];

  const addRefs = (data, rawText) => {
    if (!rawText) return;
    // extract all quoted strings
    const matches = rawText.match(/"([^"]+)"/g) || [];
    for (const m of matches) referenceCorpus.add(m.replace(/^"|"$/g,'').toLowerCase());
  };

  const addDelimitedRefs = (rawText) => {
    if (!rawText) return;
    for (const token of rawText.split(/[,\t\r\n]+/)) {
      const value = token.replace(/^"|"$/g,'').trim().toLowerCase();
      if (value) referenceCorpus.add(value);
    }
  };

  const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hasStandaloneId = (rawText, id) => {
    if (!rawText || !id) return false;
    return new RegExp(`(^|[^a-z0-9_-])${escapeRegExp(id)}([^a-z0-9_-]|$)`, 'i').test(rawText);
  };

  const addOwner = (type, id, path, rawText, parentId=null) => {
    if (!rawText) return;
    refOwners.push({ type, id, path, raw: rawText.toLowerCase(), parentId });
  };

  // Add ship, skin, variant JSON content to corpus
  for (const s of ships) if (!s.data?._parseError) {
    addRefs(null, s.rawText || JSON.stringify(s.data));
    addOwner('ship', s.hullId, s.path, s.rawText || JSON.stringify(s.data));
  }
  for (const sk of skins) if (!sk.data?._parseError) {
    addRefs(null, sk.rawText || JSON.stringify(sk.data));
    addOwner('skin', sk.skinHullId, sk.path, sk.rawText || JSON.stringify(sk.data), sk.baseHullId);
  }
  for (const v of variants) if (!v.data?._parseError) {
    addRefs(null, v.rawText || JSON.stringify(v.data));
    addOwner('variant', v.shortName, v.path, v.rawText || JSON.stringify(v.data), v.refId);
  }

  // Add ship_data.csv text to the reference corpus
  if (csvPath) {
    try {
      const csvText = await readText(byPath[csvPath]);
      addRefs(null, csvText);
      addDelimitedRefs(csvText);
      addOwner('csv', 'ship_data.csv', csvPath, csvText);
    } catch(e) {}
  }
  // Also add weapon_data.csv so weapon IDs there aren't treated as unresolved
  const weaponCsvPath = allPaths.find(p => /weapon_data\.csv$/i.test(p));
  if (weaponCsvPath) {
    try {
      const weaponCsvText = await readText(byPath[weaponCsvPath]);
      addRefs(null, weaponCsvText);
      addDelimitedRefs(weaponCsvText);
      addOwner('csv', 'weapon_data.csv', weaponCsvPath, weaponCsvText);
    } catch(e) {}
  }

  // Parse .wpn files so projectile IDs referenced inside them are in the corpus.
  // This prevents .proj files from appearing orphaned.
  for (const p of allPaths.filter(p => /\.wpn$/i.test(p))) {
    try {
      const rawText = await readText(byPath[p]);
      addRefs(null, rawText);
      addOwner('weapon', p.split('/').pop().replace(/\.wpn$/i,''), p, rawText);
    } catch(e) {}
  }

  // For each file, determine whether it is referenced by anything parsed above.
  // Files in certain categories, with certain extensions, or at known game-
  // convention paths are exempt and never flagged as orphaned.
  const orphans = [];
  const fileMetaByPath = {};
  for (const p of allPaths) {
    const name = p.split('/').pop();
    const ext  = name.includes('.') ? name.split('.').pop().toLowerCase() : '';

    // Extension-level exemptions (game always loads these by type)
    if (ORPHAN_EXEMPT_EXTS.has(ext)) continue;
    // Primary data roots
    if (/mod_info\.json$/i.test(name) || /ship_data\.csv$/i.test(name)) continue;
    // Ships/skins/variants are checked elsewhere
    if (ext === 'ship' || ext === 'skin' || ext === 'variant') continue;
    // Known convention-loaded filenames
    if (ORPHAN_EXEMPT_NAMES.has(name.toLowerCase())) continue;
    // Known convention-loaded paths (library mods scan these directories)
    if (ORPHAN_EXEMPT_PATH_PATTERNS.some(pat => pat.test(p))) continue;

    const nameLower = name.toLowerCase();
    const baseLower = nameLower.includes('.') ? nameLower.slice(0, nameLower.lastIndexOf('.')) : nameLower;

    // Does the base name look like a mod-specific ID?
    // IDs contain underscores/hyphens and are ≥4 chars (e.g. "vbc_dualflak", "rat_abyssals").
    // Generic words like "sounds", "terrain", "tips" do NOT qualify and would produce
    // false-positive matches against common JSON keys.
    const looksLikeId = baseLower.length >= 4 && /[_\-]/.test(baseLower);
    const canMatchBaseId = looksLikeId || ext === 'system';

    // 1. Exact filename in corpus, or any corpus entry is a path ending in this filename
    const refByName = referenceCorpus.has(nameLower)
      || [...referenceCorpus].some(r => r.endsWith('/' + nameLower) || r.endsWith('\\' + nameLower));

    // 2. Base name is a mod ID that appears as an exact value or as a path component
    const refById = canMatchBaseId && (
      referenceCorpus.has(baseLower)
      || [...referenceCorpus].some(r => r.endsWith('/' + baseLower) || r.endsWith('.' + baseLower))
    );

    // 3. Any parsed file's raw text explicitly references this file, with precise matching
    //    to avoid false positives from short or common substrings.
    const referencingOwners = refOwners.filter(o => {
      if (o.path === p) return false;
      // Full filename anywhere in the raw text
      if (o.raw.includes(nameLower)) return true;
      // Path-style reference: /basename.ext or \basename.ext
      if (o.raw.includes('/' + baseLower + '.') || o.raw.includes('\\' + baseLower + '.')) return true;
      // ID-style reference: "basename" as a quoted standalone value
      if (looksLikeId && o.raw.includes('"' + baseLower + '"')) return true;
      if (ext === 'system' && hasStandaloneId(o.raw, baseLower)) return true;
      return false;
    });

    const referenced = refByName || refById || referencingOwners.length > 0;

    fileMetaByPath[p] = {
      orphan: !referenced,
      owners: referencingOwners.map(o => ({ type:o.type, id:o.id, parentId:o.parentId }))
    };

    if (!referenced) {
      const cat = categoriseFile(name, p);
      orphans.push({ path:p, name, ext, cat });
    }
  }
  _allOrphanPaths = new Set(orphans.map(o => o.path));

  // ── Dependency risk analysis ──────────────────────────────────────────────
  setProgress(80, 'Analysing file dependencies...');
  await buildRiskGraph({ allPaths, byPath, ships, skins, variants, shipById, skinById, modRoot });

  // ── File inventory ─────────────────────────────────────────────────────────
  setProgress(90, 'Categorising all files...');
  const primaryPathMeta = {};
  for (const s of ships) primaryPathMeta[s.path] = { orphan:false, owners:[{ type:'ship', id:s.hullId }] };
  for (const sk of skins) primaryPathMeta[sk.path] = { orphan:false, owners:[{ type:'skin', id:sk.skinHullId, parentId:sk.baseHullId }] };
  for (const v of variants) primaryPathMeta[v.path] = { orphan:false, owners:[{ type:'variant', id:v.shortName, parentId:v.refId }] };
  const allFiles = allPaths.map(p => {
    const name = p.split('/').pop();
    return { path:p, name, size:byPath[p]?.size || 0, cat:categoriseFile(name, p), ...(fileMetaByPath[p] || primaryPathMeta[p] || { orphan:false, owners:[] }) };
  });
  const allFilesByCat = {};
  for (const f of allFiles) {
    if (!allFilesByCat[f.cat.id]) allFilesByCat[f.cat.id] = [];
    allFilesByCat[f.cat.id].push(f);
  }
  const allFileBytes = allFiles.reduce((sum, f) => sum + (f.size || 0), 0);
  const orphanBytes = allFiles.filter(f => f.orphan).reduce((sum, f) => sum + (f.size || 0), 0);
  const orphanPercent = allFileBytes ? (orphanBytes / allFileBytes) * 100 : 0;

  // ── Issue list ────────────────────────────────────────────────────────────
  setProgress(92, 'Checking for issues...');
  const issues = [];
  if (!modInfoPath) issues.push({ severity:'warn', msg:'No mod_info.json found at mod root', detail:'Starsector requires mod_info.json to load the mod.' });
  if (!csvPath)     issues.push({ severity:'err',  msg:'No ship_data.csv found', detail:'Ships cannot be loaded by the game without this file.' });

  const shipsNotInCsv   = ships.filter(s => !s.inCsv && !s.data?._parseError);
  const shipParseErrors = ships.filter(s => s.data?._parseError);
  const shipsNotInHulls = ships.filter(s => !s.inHullsFolder);
  const skinParseErrors = skins.filter(sk => sk.data?._parseError);
  const skinsNoBase     = skins.filter(sk => !sk.data?._parseError && sk.baseHullId && !shipById[sk.baseHullId]);
  const variantBadRefs  = variants.filter(v => v.refType === 'missing');
  const variantParseErr = variants.filter(v => v.refType === 'parse_error');

  if (shipsNotInCsv.length)   issues.push({ severity:'err',  msg:`${shipsNotInCsv.length} ship(s) not registered in ship_data.csv`, detail:'These ships will not appear in the game.' });
  if (shipsNotInHulls.length) issues.push({ severity:'warn', msg:`${shipsNotInHulls.length} .ship file(s) outside a "hulls/" folder`, detail:'Convention: keep .ship files under /hulls/.' });
  if (shipParseErrors.length) issues.push({ severity:'err',  msg:`${shipParseErrors.length} .ship file(s) have JSON parse errors`, detail:'These files are corrupt or invalid JSON.' });
  if (skinParseErrors.length) issues.push({ severity:'err',  msg:`${skinParseErrors.length} .skin file(s) have JSON parse errors`, detail:'These skin files are corrupt.' });
  if (skinsNoBase.length)     issues.push({ severity:'err',  msg:`${skinsNoBase.length} .skin file(s) reference a missing base hull`, detail:'The baseHullId points to a .ship file that does not exist.' });
  if (variantBadRefs.length)  issues.push({ severity:'err',  msg:`${variantBadRefs.length} variant(s) reference a missing hull or skin`, detail:'These variants will fail to load in-game.' });
  if (variantParseErr.length) issues.push({ severity:'err',  msg:`${variantParseErr.length} variant file(s) have JSON parse errors`, detail:'These files are corrupt.' });
  if (csvShipsNotFound.length)issues.push({ severity:'warn', msg:`${csvShipsNotFound.length} CSV row(s) have no matching .ship or .skin file`, detail:'These CSV entries point to missing hull files.' });
  if (orphans.length)         issues.push({ severity:'warn', msg:`${orphans.length} file(s) appear to be unreferenced (orphaned)`, detail:'These files are not referenced by any parsed ship, skin, variant, or CSV.' });

  setProgress(98, 'Rendering results...');
  await sleep(40);

  renderResults({ ships, skins, variants, orphans, issues, csvById, csvShipsNotFound, allFilesByCat, allFiles, modInfo, orphanBytes, orphanPercent });

  setProgress(100, 'Done!');
  await sleep(80);
  $('progress-wrap').style.display = 'none';
  $('results-content').style.display = '';
}

// ── RENDER ────────────────────────────────────────────────────────────────────
function renderResults(d) {
  const { ships, skins, variants, orphans, issues, csvById, csvShipsNotFound, allFilesByCat, allFiles, modInfo, orphanBytes, orphanPercent } = d;

  const okShips    = ships.filter(s => s.inCsv && !s.data?._parseError).length;
  const errShips   = ships.length - okShips;
  const okVariants = variants.filter(v => v.refOk && v.refType !== 'parse_error').length;
  const errVariants= variants.length - okVariants;
  const errCount   = issues.filter(i => i.severity === 'err').length;
  const warnCount  = issues.filter(i => i.severity === 'warn').length;

  $('summary-bar').innerHTML = `
    <div class="stat-card ${errCount>0?'err':warnCount>0?'warn':'ok'}">
      <div class="stat-label">Issues</div>
      <div class="stat-value">${issues.length}</div>
      <div class="stat-sub">${errCount} errors · ${warnCount} warnings</div>
    </div>
    <div class="stat-card ${errShips>0?'err':'ok'}">
      <div class="stat-label">Ships</div>
      <div class="stat-value">${ships.length}</div>
      <div class="stat-sub">${okShips} valid · ${errShips} issues</div>
    </div>
    <div class="stat-card info">
      <div class="stat-label">Skins</div>
      <div class="stat-value">${skins.length}</div>
      <div class="stat-sub">${skins.filter(sk=>sk.parentShip).length} linked to ships</div>
    </div>
    <div class="stat-card ${errVariants>0?'warn':'ok'}">
      <div class="stat-label">Variants</div>
      <div class="stat-value">${variants.length}</div>
      <div class="stat-sub">${okVariants} valid · ${errVariants} issues</div>
    </div>
    <div class="stat-card ${csvShipsNotFound.length>0?'warn':'ok'}">
      <div class="stat-label">CSV Entries</div>
      <div class="stat-value">${Object.keys(csvById).length}</div>
      <div class="stat-sub">${csvShipsNotFound.length} unmatched</div>
    </div>
    <div class="stat-card ${orphans.length>0?'warn':'ok'}">
      <div class="stat-label">Orphaned</div>
      <div class="stat-value">${orphans.length}</div>
      <div class="stat-sub">${formatBytes(orphanBytes)} · ${formatPercent(orphanPercent)} removable</div>
    </div>
    ${modInfo ? `<div class="stat-card info">
      <div class="stat-label">Mod Version</div>
      <div class="stat-value" style="font-size:16px">${modInfo.version||'—'}</div>
      <div class="stat-sub">${modInfo.gameVersion||''}</div>
    </div>` : ''}
  `;

  const container = $('sections-container');
  container.innerHTML = '';

  addSection(container, '⚠', 'ISSUES & WARNINGS', issues.length,
    issues.length===0?'ok':errCount>0?'err':'warn',
    issues.length===0?'All checks passed':`${errCount} errors, ${warnCount} warnings`,
    renderIssues(issues), issues.length>0);

  addSection(container, '🚀', 'SHIPS & SKINS', ships.length,
    errShips>0?'err':'ok',
    `${okShips}/${ships.length} ships in CSV · ${skins.length} skins`,
    renderShipTree(ships, skins, csvById), true);

  if (csvShipsNotFound.length>0) {
    addSection(container, '📊', 'CSV ENTRIES WITHOUT HULL FILES', csvShipsNotFound.length,
      'warn', 'These IDs in ship_data.csv have no .ship or .skin file',
      renderCsvMissing(csvShipsNotFound, csvById), true);
  }

  addSection(container, '🔩', 'VARIANT FILES', variants.length,
    errVariants>0?'warn':'ok',
    `${okVariants}/${variants.length} valid`,
    renderVariantTable(variants), variants.length>0);

  addSection(container, '📁', 'FILE INVENTORY', allFiles.length,
    orphans.length>0?'warn':'info',
    orphans.length===0?'All mod files grouped by type':`${formatBytes(orphanBytes)} (${formatPercent(orphanPercent)}) potentially removable`,
    renderFileInventory(allFilesByCat), false);

  // Change-log section — appended last so it appears at the bottom, hidden until patches are queued
  const clSection = document.createElement('div');
  clSection.id = 'change-log-section';
  clSection.className = 'section';
  clSection.style.cssText = 'display:none;border-color:rgba(74,158,255,.4)';
  clSection.innerHTML = `
    <div class="section-header" style="background:rgba(74,158,255,.06)" onclick="toggleSection(this)">
      <span class="section-icon">📋</span>
      <span class="section-title">PENDING EXPORT CHANGES</span>
      <span class="section-badge badge-info change-log-count-badge"></span>
      <span class="chevron">▲</span>
    </div>
    <div class="section-body open change-log-body"></div>`;
  container.appendChild(clSection);
  renderChangeLogSection();

  scheduleThumbLoad();
  refreshRiskBadges();
}

// ── RENDER: Issues ────────────────────────────────────────────────────────────
function renderIssues(issues) {
  if (!issues.length) return '<div class="empty">✓ No issues detected</div>';
  return `<div class="table-wrap"><table>
    <thead><tr><th>SEV</th><th>ISSUE</th><th>DETAIL</th></tr></thead>
    <tbody>${issues.map(i=>`<tr>
      <td><span class="status-dot ${i.severity==='err'?'dot-err':'dot-warn'}"></span><span class="td-tag ${i.severity==='err'?'tag-missing':'tag-warn'}">${i.severity.toUpperCase()}</span></td>
      <td style="font-weight:500;color:${i.severity==='err'?'var(--red)':'var(--amber)'}">${esc(i.msg)}</td>
      <td style="color:var(--text2);font-size:12px">${esc(i.detail)}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

// ── RENDER: Ship tree (ships with nested skins) ───────────────────────────────
function spriteThumbHtml(spritePath, size = 36) {
  if (!spritePath) return `<span style="color:var(--text3);font-size:10px;opacity:.5">—</span>`;
  return `<div class="sprite-cell" data-sprite-path="${esc(spritePath)}" onmouseenter="showSpritePreview(this,event)" onmouseleave="hideSpritePreview()">
    <img class="sprite-thumb" data-path="${esc(spritePath)}" width="${size}" height="${size}" style="object-fit:contain;image-rendering:pixelated;background:rgba(0,0,0,.5);border-radius:3px;display:block;cursor:zoom-in">
  </div>`;
}

function renderShipTree(ships, skins, csvById) {
  const tid = 'ship-tbl';

  _shipPathById = {};
  _shipFilePathToHullId = {};
  for (const s of ships) {
    _shipPathById[s.hullId] = {
      path: s.path,
      spritePath: s.spritePath || null,
      skinPaths: s.skins.map(sk => sk.path),
      skinSpritePaths: s.skins.map(sk => sk.spritePath).filter(Boolean),
      variantPaths: s.variants.map(v => v.path),
    };
    _shipFilePathToHullId[s.path] = s.hullId;
  }

  const orphanSkins = skins.filter(sk => !sk.parentShip);

  const rows = ships.map(s => {
    const hasErr = !!s.data?._parseError;
    const ok = s.inCsv && !hasErr;
    const statusDot  = ok ? 'dot-ok' : 'dot-err';
    const statusTag  = ok ? 'tag-ok' : 'tag-missing';
    const statusText = hasErr ? 'PARSE ERR' : s.inCsv ? 'OK' : 'NOT IN CSV';
    const searchKey  = (s.hullId+' '+s.shortName+' '+(s.csvRow?.name||'')).toLowerCase();

    const skinRows = s.skins.map(sk => {
      const skErr = !!sk.data?._parseError;
      return `<tr class="skin-row" data-parent-ship="${esc(s.hullId)}" data-status="${skErr?'error':'ok'}" data-name="${esc(sk.skinHullId.toLowerCase())} ${esc(sk.shortName.toLowerCase())}">
        <td style="padding-left:32px"><span class="td-tag" style="color:#c87eff;border-color:rgba(200,126,255,.3);background:rgba(200,126,255,.06);font-size:9px">SKIN</span><span style="color:var(--text3);font-size:10px;margin-left:4px">with parent</span></td>
        <td>${spriteThumbHtml(sk.spritePath, 28)}</td>
        <td class="td-mono" style="color:#c87eff">${esc(sk.skinHullId)}</td>
        <td style="color:var(--text2);font-size:12px">${esc(sk.shortName)}</td>
        <td class="td-path">${esc(sk.path)}</td>
        <td style="color:var(--text3);font-size:11px">base: <span style="color:var(--text2)">${esc(sk.baseHullId||'—')}</span></td>
        <td>${sk.inHullsFolder?'<span class="td-tag tag-ok">hulls/</span>':'<span class="td-tag tag-warn">other</span>'}</td>
        <td>${skErr?`<span style="color:var(--red);font-family:var(--mono);font-size:11px">${esc(sk.data._parseError)}</span>`:'—'}</td>
      </tr>`;
    }).join('');

    return `<tr data-status="${ok?'ok':'error'}" data-name="${searchKey}" class="ship-row">
      <td><input type="checkbox" class="export-ship-cb" checked data-hull-id="${esc(s.hullId)}" onchange="onAnyCheckChange(this)" title="Include ship, skins and variants in export" style="margin-right:6px;cursor:pointer;vertical-align:middle"><span class="status-dot ${statusDot}"></span><span class="td-tag ${statusTag}">${statusText}</span>
        ${s.skins.length?`<span class="td-tag" style="color:#c87eff;border-color:rgba(200,126,255,.3);background:rgba(200,126,255,.06);margin-left:4px">${s.skins.length} skin${s.skins.length>1?'s':''}</span>`:''}
      </td>
      <td>${spriteThumbHtml(s.spritePath)}</td>
      <td class="td-mono">${esc(s.hullId)}</td>
      <td>${esc(s.shortName)}</td>
      <td class="td-path">${esc(s.path)}</td>
      <td style="font-size:12px;color:var(--text2)">${s.csvRow?esc(s.csvRow.name||'—'):'<span style="color:var(--red)">—</span>'}</td>
      <td>${s.inHullsFolder?'<span class="td-tag tag-ok">hulls/</span>':'<span class="td-tag tag-warn">other</span>'}</td>
      <td>${hasErr?`<span style="color:var(--red);font-family:var(--mono);font-size:11px">${esc(s.data._parseError)}</span>`:'—'}</td>
    </tr>${skinRows}`;
  }).join('');

  const orphanSkinRows = orphanSkins.map(sk => {
    const skErr = !!sk.data?._parseError;
    const statusText = skErr ? 'PARSE ERR' : sk.baseHullId ? 'BAD BASE' : 'NO BASE';
    const baseText = skErr ? 'not parsed' : `baseHullId: ${sk.baseHullId || 'missing'}`;
    return `<tr data-status="error" data-name="${esc(sk.skinHullId.toLowerCase())}">
      <td><input type="checkbox" class="export-skin-cb" checked data-path="${esc(sk.path)}" onchange="onAnyCheckChange(this)" title="Include in export" style="margin-right:6px;cursor:pointer;vertical-align:middle"><span class="status-dot ${skErr?'dot-err':'dot-warn'}"></span><span class="td-tag ${skErr?'tag-missing':'tag-warn'}">${statusText}</span>
        <span class="td-tag" style="color:#c87eff;border-color:rgba(200,126,255,.3);background:rgba(200,126,255,.06)">SKIN</span>
      </td>
      <td>${spriteThumbHtml(sk.spritePath, 28)}</td>
      <td class="td-mono" style="color:#c87eff">${esc(sk.skinHullId)}</td>
      <td>${esc(sk.shortName)}</td>
      <td class="td-path">${esc(sk.path)}</td>
      <td style="color:${skErr?'var(--text3)':'var(--red)'};font-size:12px">${esc(baseText)}</td>
      <td>${sk.inHullsFolder?'<span class="td-tag tag-ok">hulls/</span>':'<span class="td-tag tag-warn">other</span>'}</td>
      <td>${skErr?`<span style="color:var(--red);font-family:var(--mono);font-size:11px">${esc(sk.data._parseError)}</span>`:'—'}</td>
    </tr>`;
  }).join('');

  const total = ships.length + skins.length;
  const limitedRows = limitRows(rows + orphanSkinRows, tid, 3);
  const initialShown = Math.min(total, 3);
  return `
    <div class="filter-bar">
      <input class="filter-input" placeholder="Filter by hull ID, name…" oninput="filterTable('${tid}',this.value)" id="${tid}-search">
      <div class="filter-btns">
        <button class="filter-btn active" onclick="filterTableStatus('${tid}','all',this)">ALL</button>
        <button class="filter-btn" onclick="filterTableStatus('${tid}','ok',this)">OK</button>
        <button class="filter-btn" onclick="filterTableStatus('${tid}','error',this)">ISSUES</button>
      </div>
      <button class="btn btn-sm" onclick="toggleCheckboxes('export-ship-cb')" style="margin-left:8px">☑ Toggle All</button>
      <span class="table-count" id="${tid}-count">${total > 3 ? `${initialShown} shown · ` : ''}${ships.length} ships · ${skins.length} skins</span>
    </div>
    <div class="table-wrap"><table id="${tid}">
      <thead><tr><th>EXPORT / STATUS</th><th>SPRITE</th><th>HULL ID</th><th>FILE</th><th>PATH</th><th>CSV NAME / BASE</th><th>LOCATION</th><th>ERROR</th></tr></thead>
      <tbody>${limitedRows.html}</tbody>
    </table></div>
    ${limitedRows.control}`;
}

// ── RENDER: CSV missing ───────────────────────────────────────────────────────
function renderCsvMissing(ids, csvById) {
  return `<div class="table-wrap"><table>
    <thead><tr><th>HULL ID</th><th>NAME IN CSV</th><th>DESIGNATION</th></tr></thead>
    <tbody>${ids.map(id=>{const r=csvById[id];return`<tr>
      <td class="td-mono">${esc(id)}</td>
      <td style="color:var(--text2)">${r?esc(r.name||'—'):'—'}</td>
      <td style="font-size:12px;color:var(--text3)">${r?esc(r.designation||r.class||'—'):'—'}</td>
    </tr>`;}).join('')}</tbody></table></div>`;
}

// ── RENDER: Variants ──────────────────────────────────────────────────────────
function renderVariantTable(variants) {
  const tid = 'var-tbl';

  const byShip = {};
  const unresolved = [];
  for (const v of variants) {
    if (v.resolvedShip) {
      const key = v.resolvedShip.hullId;
      if (!byShip[key]) byShip[key] = { ship: v.resolvedShip, variants: [] };
      byShip[key].variants.push(v);
    } else {
      unresolved.push(v);
    }
  }

  let rows = '';
  for (const key of Object.keys(byShip)) {
    const group = byShip[key];
    const s = group.ship;
    rows += `<tr class="var-group-header" style="background:var(--bg3)">
      <td colspan="8" style="padding:0;border-bottom:1px solid var(--border)">
        <div style="display:flex;align-items:center;gap:8px;padding:6px 16px;font-family:var(--mono);font-size:11px;color:var(--text2)">
          ${spriteThumbHtml(s.spritePath, 24)}
          <span class="td-tag tag-ship">SHIP</span>
          <span style="color:var(--text)">${esc(s.hullId)}</span>
          <span style="color:var(--text3)">${esc(s.shortName)}</span>
          <span style="color:var(--text3);margin-left:auto">${group.variants.length} variant${group.variants.length>1?'s':''}</span>
        </div>
      </td>
    </tr>`;
    for (const v of group.variants) rows += variantRow(v);
  }
  for (const v of unresolved) rows += variantRow(v);

  const limitedRows = limitRows(rows, tid, 3);
  const initialShown = Math.min(variants.length, 3);
  return `
    <div class="filter-bar">
      <input class="filter-input" placeholder="Filter variants…" oninput="filterTable('${tid}',this.value)" id="${tid}-search">
      <div class="filter-btns">
        <button class="filter-btn active" onclick="filterTableStatus('${tid}','all',this)">ALL</button>
        <button class="filter-btn" onclick="filterTableStatus('${tid}','ok',this)">OK</button>
        <button class="filter-btn" onclick="filterTableStatus('${tid}','error',this)">ISSUES</button>
      </div>
      <button class="btn btn-sm" onclick="toggleCheckboxes('export-variant-cb')" style="margin-left:8px">☑ Toggle All</button>
      <span class="table-count" id="${tid}-count">${variants.length > 3 ? `${initialShown} shown · ` : ''}${variants.length} variants</span>
    </div>
    <div class="table-wrap"><table id="${tid}">
      <thead><tr><th>EXPORT / STATUS</th><th>SPRITE</th><th>VARIANT FILE</th><th>REFERENCES</th><th>REF TYPE</th><th>RESOLVED SHIP</th><th>PATH</th><th>ERROR</th></tr></thead>
      <tbody>${limitedRows.html}</tbody>
    </table></div>
    ${limitedRows.control}`;
}

function variantRow(v) {
  const ok = v.refOk && v.refType !== 'parse_error';
  const statusDot  = ok ? 'dot-ok' : v.refType==='missing'?'dot-err':'dot-warn';
  const statusTag  = ok ? 'tag-ok' : v.refType==='missing'?'tag-missing':'tag-warn';
  const statusText = v.refType==='parse_error'?'PARSE ERR':v.refType==='missing'?'BAD REF':ok?'OK':'NO REF';
  const refTypeBadge = v.refType==='skin'
    ? '<span class="td-tag" style="color:#c87eff;border-color:rgba(200,126,255,.3);background:rgba(200,126,255,.06)">→ SKIN</span>'
    : v.refType==='ship' ? '<span class="td-tag tag-ship">→ SHIP</span>'
    : v.refType==='missing' ? '<span class="td-tag tag-missing">MISSING</span>'
    : '<span class="td-tag badge-muted">—</span>';
  const resolvedLabel = v.resolvedShip
    ? `<span class="td-mono" style="font-size:11px">${esc(v.resolvedShip.hullId)}</span>`
    : v.refType==='missing' ? '<span style="color:var(--red);font-size:11px">unresolved</span>' : '—';

  return `<tr data-status="${ok?'ok':'error'}" data-name="${esc(v.shortName.toLowerCase())} ${esc(v.refId||'')}">
    <td><input type="checkbox" class="export-variant-cb" checked data-path="${esc(v.path)}" onchange="onAnyCheckChange(this)" title="Include variant in export" style="margin-right:6px;cursor:pointer;vertical-align:middle"><span class="status-dot ${statusDot}"></span><span class="td-tag ${statusTag}">${statusText}</span></td>
    <td>${spriteThumbHtml(v.spritePath, 28)}</td>
    <td style="font-size:12px">${esc(v.shortName)}</td>
    <td class="td-mono" style="font-size:11px">${esc(v.refId||'—')}</td>
    <td>${refTypeBadge}</td>
    <td>${resolvedLabel}</td>
    <td class="td-path">${esc(v.path)}</td>
    <td>${v.refType==='parse_error'?`<span style="color:var(--red);font-family:var(--mono);font-size:11px">${esc(v.data._parseError)}</span>`:'—'}</td>
  </tr>`;
}

// ── RENDER: File inventory ────────────────────────────────────────────────────
function renderFileInventory(allFilesByCat) {
  const totalOrphans = Object.values(allFilesByCat).flat().filter(f => f.orphan).length;
  let html = `<div class="inv-global-bar">
    <button class="btn btn-sm" onclick="toggleCheckboxes('export-file-cb')">☑ Toggle All Files</button>
    ${totalOrphans ? `<button class="btn btn-sm inv-orphan-btn" onclick="uncheckOrphanedFiles()">✕ Uncheck All ${totalOrphans} Orphaned</button>` : ''}
    <span style="color:var(--text3);font-size:11px">Checkboxes control which files go into the ZIP export.</span>
  </div>`;
  for (const cat of FILE_CATEGORIES) {
    const files = allFilesByCat[cat.id];
    if (!files?.length) continue;
    const orphanCount = files.filter(f => f.orphan).length;
    const orphanBytes = files.filter(f => f.orphan).reduce((sum, f) => sum + (f.size || 0), 0);
    const groupId = `files-${cat.id}`;
    const cbClass = `export-file-cb export-file-cb-${cat.id}`;
    html += `<div class="redund-group">
      <div class="redund-group-header" onclick="toggleGroup(event,this)">
        <span class="group-icon">${cat.icon}</span>
        <span class="group-name">${cat.label}</span>
        <span class="group-count">(${files.length} file${files.length!==1?'s':''})</span>
        ${orphanCount ? `<span class="td-tag tag-warn">${orphanCount} orphan${orphanCount!==1?'s':''} · ${formatBytes(orphanBytes)}</span>` : ''}
        <div class="group-actions">
          <button class="btn btn-sm btn-xs" onclick="toggleCategoryFiles('${cat.id}',this)">☑ Toggle</button>
          ${orphanCount ? `<button class="btn btn-sm btn-xs inv-orphan-btn" onclick="uncheckCategoryOrphans('${cat.id}')">✕ Orphans</button>` : ''}
          <span style="color:var(--text3);font-size:11px">${cat.desc}</span>
        </div>
        <span class="group-chevron">▼</span>
      </div>
      <div class="redund-group-body">
        <div class="file-chips">
          ${files.map((f, index)=>{
            const ext = f.name.includes('.')?f.name.split('.').pop().toLowerCase():'';
            const ownerText = fileOwnerText(f);
            const isImg = /^(png|jpg|jpeg|webp|svg)$/.test(ext);
            const thumbHtml = isImg
              ? `<div class="sprite-cell chip-sprite" data-sprite-path="${esc(f.path)}" onmouseenter="showSpritePreview(this,event)" onmouseleave="hideSpritePreview()"><img class="sprite-thumb" data-path="${esc(f.path)}" width="20" height="20" style="object-fit:contain;image-rendering:pixelated;display:block;cursor:zoom-in"></div>`
              : '';
            return `<div class="file-chip ${index >= 3 ? 'is-collapsed-entry' : ''}" data-collapse-group="${groupId}" data-chip-path="${esc(f.path)}" title="${esc(f.path)}">
              <input type="checkbox" class="${cbClass}" checked data-path="${esc(f.path)}" onchange="onAnyCheckChange(this)" style="margin-right:4px;cursor:pointer;flex-shrink:0">
              ${thumbHtml}
              <span class="chip-ext ${getExtClass(ext)}">.${ext||'?'}</span>
              <span>${esc(f.name)}</span>
              <span class="td-tag badge-muted">${formatBytes(f.size || 0)}</span>
              ${f.orphan ? '<span class="td-tag tag-warn">orphan</span>' : ''}
              ${ownerText ? `<span class="td-tag ${f.orphan?'tag-warn':'tag-ok'}" title="${esc(ownerText)}">${esc(ownerText)}</span>` : ''}
              <span class="risk-badge td-tag" style="display:none"></span>
            </div>`;
          }).join('')}
        </div>
        ${files.length > 3 ? showAllControl(groupId, files.length - 3) : ''}
      </div>
    </div>`;
  }
  return html || '<div class="empty">No files found</div>';
}

function getExtClass(ext) {
  const m = {
    ship:'tag-ship', skin:'tag-variant', variant:'tag-variant',
    wpn:'tag-weapon', proj:'tag-weapon', wing:'tag-wing',
    csv:'tag-ok', json:'badge-info', version:'badge-info',
    faction:'tag-ship', system:'badge-info', 'star_system':'badge-info', planet:'badge-info',
  };
  return m[ext] || 'badge-muted';
}

function fileOwnerText(file) {
  if (!file.owners?.length) return '';
  const labels = file.owners.slice(0, 2).map(o => {
    const parent = o.parentId ? ` → ${o.parentId}` : '';
    return `${o.type}: ${o.id}${parent}`;
  });
  const extra = file.owners.length > labels.length ? ` +${file.owners.length - labels.length}` : '';
  return labels.join(', ') + extra;
}

// ── UI HELPERS ────────────────────────────────────────────────────────────────
function addSection(container, icon, title, count, badgeType, badgeText, bodyHtml, open=false) {
  const div = document.createElement('div');
  div.className = 'section';
  div.innerHTML = `
    <div class="section-header" onclick="toggleSection(this)">
      <span class="section-icon">${icon}</span>
      <span class="section-title">${title}</span>
      <span class="section-badge badge-${badgeType}">${esc(badgeText)}</span>
      <span class="section-badge badge-muted" style="margin-left:4px">${count}</span>
      <span class="chevron">${open?'▲':'▼'}</span>
    </div>
    <div class="section-body ${open?'open':''}">${bodyHtml}</div>
  `;
  container.appendChild(div);
}

function toggleSection(header) {
  const body = header.nextElementSibling;
  const ch   = header.querySelector('.chevron');
  const open = body.classList.toggle('open');
  ch.textContent = open ? '▲' : '▼';
}

function toggleGroup(event, header) {
  if (event?.target?.closest('button,input,a')) return;
  const body = header.nextElementSibling;
  const ch = header.querySelector('.group-chevron');
  const open = body?.classList.toggle('open');
  if (ch) ch.textContent = open ? '▲' : '▼';
}

function filterTable(tableId, search) {
  const tbl = $(tableId);
  if (!tbl) return;
  const q = search.toLowerCase();
  if (q && !tbl._expanded) expandCollapsed(tableId);
  let vis = 0;
  for (const tr of tbl.tBodies[0].rows) {
    if (tr.classList.contains('var-group-header')) {
      tr.style.display = tr.classList.contains('is-collapsed-entry') && !tbl._expanded ? 'none' : '';
      continue;
    }
    const match = !q || tr.dataset.name?.includes(q) || tr.textContent.toLowerCase().includes(q);
    const sf = tbl._statusFilter;
    const statusMatch = !sf || sf==='all' || tr.dataset.status===sf;
    const collapsed = tr.classList.contains('is-collapsed-entry') && !tbl._expanded;
    const show = match && statusMatch && !collapsed;
    tr.style.display = show ? '' : 'none';
    if (show) vis++;
  }
  const c = $(tableId+'-count');
  if (c) c.textContent = vis + ' shown';
}

function filterTableStatus(tableId, status, btn) {
  const tbl = $(tableId);
  if (!tbl) return;
  tbl._statusFilter = status;
  btn.closest('.filter-btns').querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  filterTable(tableId, $(tableId+'-search')?.value||'');
}

function limitRows(rowsHtml, groupId, limit) {
  const rows = rowsHtml.match(/<tr[\s\S]*?<\/tr>/g) || [];
  if (rows.length <= limit) return { html: rowsHtml, control: '' };
  const html = rows.map((row, index) => index < limit ? row : markCollapsed(row, groupId)).join('');
  return { html, control: showAllControl(groupId, rows.length - limit) };
}

function markCollapsed(html, groupId) {
  return html.replace(/^<tr\b([^>]*)>/i, (match, attrs) => {
    let nextAttrs = attrs || '';
    if (/class="/i.test(nextAttrs)) nextAttrs = nextAttrs.replace(/class="([^"]*)"/i, 'class="$1 is-collapsed-entry"');
    else nextAttrs += ' class="is-collapsed-entry"';
    return `<tr${nextAttrs} data-collapse-group="${esc(groupId)}">`;
  });
}

function showAllControl(groupId, hiddenCount) {
  return `<div class="show-more-row" data-collapse-control="${esc(groupId)}">
    <button class="btn btn-sm" type="button" onclick="expandCollapsed('${esc(groupId)}', this)">Show all ${hiddenCount} more</button>
  </div>`;
}

function expandCollapsed(groupId, btn) {
  const selector = `[data-collapse-group="${groupId}"]`;
  document.querySelectorAll(selector).forEach(el => {
    el.classList.remove('is-collapsed-entry');
    if (el.tagName === 'TR') el.style.display = '';
  });
  const table = $(groupId);
  if (table && !table._expanded) {
    table._expanded = true;
    filterTable(groupId, $(groupId+'-search')?.value || '');
  }
  document.querySelectorAll(`[data-collapse-control="${groupId}"]`).forEach(el => el.remove());
  btn?.closest('.show-more-row')?.remove();
}

// ── EXPORT ───────────────────────────────────────────────────────────────────
async function exportMod() {
  if (typeof JSZip === 'undefined') {
    alert('JSZip library not loaded. Check your internet connection and reload the page.');
    return;
  }
  const btn = document.getElementById('export-btn') || document.getElementById('header-export-btn');
  const origText = btn?.textContent;
  if (btn) { btn.textContent = '⏳ Building ZIP…'; btn.disabled = true; }

  try {
    const zip = new JSZip();
    const exportPaths = new Set();

    // Collect checked ships (+ their skins automatically)
    document.querySelectorAll('.export-ship-cb:checked').forEach(cb => {
      const entry = _shipPathById[cb.dataset.hullId];
      if (entry) {
        exportPaths.add(entry.path);
        entry.skinPaths.forEach(sp => exportPaths.add(sp));
      }
    });

    // Collect checked orphan skins (those without a parent ship)
    document.querySelectorAll('.export-skin-cb:checked').forEach(cb => {
      exportPaths.add(cb.dataset.path);
    });

    // Collect checked variants
    document.querySelectorAll('.export-variant-cb:checked').forEach(cb => {
      exportPaths.add(cb.dataset.path);
    });

    // Collect checked files from the file inventory
    document.querySelectorAll('.export-file-cb:checked').forEach(cb => {
      exportPaths.add(cb.dataset.path);
    });

    // Determine mod_info.json path
    const modInfoPath = Object.keys(_byPath).find(p => p.endsWith('/mod_info.json'));

    // Add all collected files to the zip (applying pending content patches)
    for (const path of exportPaths) {
      if (path === modInfoPath) continue; // handled separately below
      const file = _byPath[path];
      if (!file) continue;
      const zipPath = _modRoot && path.startsWith(_modRoot + '/')
        ? path.slice(_modRoot.length + 1)
        : path.replace(/^\//, '');
      if (_pendingPatches[path]?.length) {
        try {
          let text = await readText(file);
          for (const patch of _pendingPatches[path]) text = patch.apply(text);
          zip.file(zipPath, text);
        } catch(e) { zip.file(zipPath, file); }
      } else {
        zip.file(zipPath, file);
      }
    }

    // Always include a modified mod_info.json
    if (modInfoPath && _byPath[modInfoPath]) {
      let modInfo;
      try { modInfo = parseStarsectorJson(await readText(_byPath[modInfoPath])); } catch(e) { modInfo = {}; }
      modInfo.name = (modInfo.name || 'Unknown Mod') + ' [SMT]';
      modInfo.version = (modInfo.version ? modInfo.version + '-' : '') + 'SMT';
      zip.file('mod_info.json', JSON.stringify(modInfo, null, 2));
    }

    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const modId = Object.keys(_byPath).length ? (_byPath[Object.keys(_byPath).find(p => p.endsWith('/mod_info.json'))] ? '' : '') : '';
    a.download = (document.getElementById('mod-name-display')?.textContent || 'mod').replace(/[^\w\-. ]/g, '_') + '_smt.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  } catch (err) {
    alert('Export failed: ' + err.message);
  } finally {
    if (btn) { btn.textContent = origText; btn.disabled = false; }
  }
}

// ── UNIFIED CHECKBOX SYSTEM ───────────────────────────────────────────────────
// Single entry point for every checkbox change in the app.
// Determines type, checks risks, shows modal when needed, then applies cascades.
function onAnyCheckChange(cb) {
  const checked = cb.checked;
  const type = cbType(cb);

  if (!checked) {
    const risks = risksForCb(cb, type);
    if (risks.length) {
      // Temporarily restore previous state while modal is open
      cb.checked = true;
      visualRestoreCb(cb, type, true);
      showRiskModal(primaryPathForCb(cb, type), risks, () => applyToggle(cb, type, false));
      return;
    }
  }
  applyToggle(cb, type, checked);
}

function cbType(cb) {
  if (cb.classList.contains('export-ship-cb'))    return 'ship';
  if (cb.classList.contains('export-variant-cb')) return 'variant';
  if (cb.classList.contains('export-skin-cb'))    return 'skin';
  return 'file';
}

function primaryPathForCb(cb, type) {
  if (type === 'ship') return _shipPathById[cb.dataset.hullId]?.path || '';
  return cb.dataset.path || '';
}

function risksForCb(cb, type) {
  if (type === 'ship') {
    const entry = _shipPathById[cb.dataset.hullId];
    if (!entry) return [];
    // Only check risks stored on the .ship file itself (e.g. faction knownShips, ship roles).
    // Sprite risks say "removing the sprite will break THIS ship" — irrelevant when the
    // ship itself is being unchecked (and would produce a circular "also exclude the ship" fix).
    return getActiveRisksForPath(entry.path);
  }
  return getActiveRisksForPath(cb.dataset.path);
}

function dedupeRisks(risks) {
  const seen = new Set();
  return risks.filter(r => { const k = r.severity + r.msg; return seen.has(k) ? false : (seen.add(k), true); });
}

function visualRestoreCb(cb, type, checked) {
  if (type === 'file') setChipDeselected(cb.closest('.file-chip'), !checked);
  else setRowDeselected(cb.closest('tr'), !checked);
}

function applyToggle(cb, type, checked) {
  if      (type === 'ship')    applyShipToggle(cb.dataset.hullId, checked, cb);
  else if (type === 'variant') applyVariantToggle(cb.dataset.path, checked, cb);
  else if (type === 'skin')    applySkinToggle(cb.dataset.path, checked, cb);
  else                         applyFileToggle(cb.dataset.path, checked, cb);
}

// Apply ship toggle: cascades to all related files and variant table rows
function applyShipToggle(hullId, checked, sourceCb) {
  const entry = _shipPathById[hullId];
  if (!entry) return;
  if (sourceCb) { sourceCb.checked = checked; setRowDeselected(sourceCb.closest('tr'), !checked); }

  // Build the full cascade set for the change log
  const cascadePaths = [entry.path];
  if (entry.spritePath) cascadePaths.push(entry.spritePath);
  entry.skinPaths.forEach(p => cascadePaths.push(p));
  entry.skinSpritePaths.forEach(p => cascadePaths.push(p));
  entry.variantPaths.forEach(vPath => {
    cascadePaths.push(vPath);
    const vs = _variantSpriteByPath[vPath];
    if (vs) cascadePaths.push(vs);
  });

  if (!checked) {
    const shipName = entry.path.split('/').pop();
    const varCount = entry.variantPaths.length;
    const skinCount = entry.skinPaths.length;
    const sub = [varCount && `${varCount} variant${varCount!==1?'s':''}`, skinCount && `${skinCount} skin${skinCount!==1?'s':''}`, entry.spritePath && 'sprite'].filter(Boolean).join(', ');
    addChangeEntry('☑', `Excluded ship: ${shipName}${sub ? ` (+${sub})` : ''}`, entry.path, { cascade: cascadePaths });
  } else {
    _changeLog = _changeLog.filter(e => !cascadePaths.includes(e.path) || e.icon === '✂️');
    renderChangeLogSection();
  }

  syncFileCbByPath(entry.path, checked);
  if (entry.spritePath) syncFileCbByPath(entry.spritePath, checked);
  entry.skinPaths.forEach(p => syncFileCbByPath(p, checked));
  entry.skinSpritePaths.forEach(p => syncFileCbByPath(p, checked));
  entry.variantPaths.forEach(vPath => {
    const safe = vPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const vCb = document.querySelector(`.export-variant-cb[data-path="${safe}"]`);
    if (vCb) { vCb.checked = checked; setRowDeselected(vCb.closest('tr'), !checked); }
    syncFileCbByPath(vPath, checked);
    const vs = _variantSpriteByPath[vPath];
    if (vs) syncFileCbByPath(vs, checked);
  });
  refreshRiskBadges();
}

// Apply variant toggle: syncs file chip and sprite
function applyVariantToggle(path, checked, sourceCb) {
  if (sourceCb) { sourceCb.checked = checked; setRowDeselected(sourceCb.closest('tr'), !checked); }
  if (!checked) addChangeEntry('☑', `Excluded variant: ${path.split('/').pop()}`, path);
  else { _changeLog = _changeLog.filter(e => e.path !== path || e.icon === '✂️'); renderChangeLogSection(); }
  syncFileCbByPath(path, checked);
  const sp = _variantSpriteByPath[path];
  if (sp) syncFileCbByPath(sp, checked);
  refreshRiskBadges();
}

// Apply orphan skin toggle: syncs file chip
function applySkinToggle(path, checked, sourceCb) {
  if (sourceCb) { sourceCb.checked = checked; setRowDeselected(sourceCb.closest('tr'), !checked); }
  if (!checked) addChangeEntry('☑', `Excluded skin: ${path.split('/').pop()}`, path);
  else { _changeLog = _changeLog.filter(e => e.path !== path || e.icon === '✂️'); renderChangeLogSection(); }
  syncFileCbByPath(path, checked);
  refreshRiskBadges();
}

// Apply file chip toggle: also reverse-syncs ship / variant / skin table rows
function applyFileToggle(path, checked, sourceCb) {
  if (sourceCb) { sourceCb.checked = checked; setChipDeselected(sourceCb.closest('.file-chip'), !checked); }
  if (!checked) addChangeEntry('☑', `Excluded file: ${path.split('/').pop()}`, path);
  else { _changeLog = _changeLog.filter(e => e.path !== path || e.icon === '✂️'); renderChangeLogSection(); }
  const safe = path.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  // Reverse sync → ship table row (only for the actual .ship file, not sprites)
  const hullId = _shipFilePathToHullId[path];
  if (hullId) {
    const escapedId = hullId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const sCb = document.querySelector(`.export-ship-cb[data-hull-id="${escapedId}"]`);
    if (sCb) { sCb.checked = checked; setRowDeselected(sCb.closest('tr'), !checked); }
  }
  // Reverse sync → variant table row
  const vCb = document.querySelector(`.export-variant-cb[data-path="${safe}"]`);
  if (vCb) { vCb.checked = checked; setRowDeselected(vCb.closest('tr'), !checked); }
  // Reverse sync → orphan skin table row
  const skCb = document.querySelector(`.export-skin-cb[data-path="${safe}"]`);
  if (skCb) { skCb.checked = checked; setRowDeselected(skCb.closest('tr'), !checked); }
  refreshRiskBadges();
}

// ── LOW-LEVEL SYNC HELPERS ───────────────────────────────────────────────────
// Update a file chip checkbox by path without triggering onAnyCheckChange
function syncFileCbByPath(path, checked) {
  if (!path) return;
  const safe = path.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const cb = document.querySelector(`.export-file-cb[data-path="${safe}"]`);
  if (cb) { cb.checked = checked; setChipDeselected(cb.closest('.file-chip'), !checked); }
}

function setChipDeselected(chip, deselected) {
  if (!chip) return;
  chip.classList.toggle('export-deselected', deselected);
}

function setRowDeselected(row, deselected) {
  if (!row) return;
  row.classList.toggle('export-deselected', deselected);
}

// ── BULK OPERATIONS ───────────────────────────────────────────────────────────
// Bulk toggles bypass the risk modal (mass operation) but still cascade correctly.
function uncheckOrphanedFiles() {
  let skipped = 0;
  document.querySelectorAll('.export-file-cb').forEach(cb => {
    if (!_allOrphanPaths.has(cb.dataset.path)) return;
    if (getActiveRisksForPath(cb.dataset.path).some(r => r.severity === 'unsafe')) { skipped++; return; }
    applyFileToggle(cb.dataset.path, false, cb);
  });
  if (skipped > 0) showNotification(`Skipped ${skipped} orphan${skipped !== 1 ? 's' : ''} flagged UNSAFE to remove.`);
}

function toggleCheckboxes(className) {
  const boxes = Array.from(document.querySelectorAll('.' + className));
  const newState = !boxes.every(cb => cb.checked);
  let skipped = 0;
  boxes.forEach(cb => {
    const type = cbType(cb);
    if (!newState && getActiveRisksForPath(primaryPathForCb(cb, type)).some(r => r.severity === 'unsafe')) { skipped++; return; }
    applyToggle(cb, type, newState);
  });
  if (skipped > 0) showNotification(`Skipped ${skipped} unsafe referenced file${skipped !== 1 ? 's' : ''}.`);
}

// ── PER-CATEGORY FILE CONTROLS ────────────────────────────────────────────────
function toggleCategoryFiles(catId) {
  const cbs = Array.from(document.querySelectorAll(`.export-file-cb-${catId}`));
  const newState = !cbs.every(cb => cb.checked);
  let skipped = 0;
  cbs.forEach(cb => {
    if (!newState && getActiveRisksForPath(cb.dataset.path).some(r => r.severity === 'unsafe')) { skipped++; return; }
    applyFileToggle(cb.dataset.path, newState, cb);
  });
  if (skipped > 0) showNotification(`Skipped ${skipped} unsafe referenced file${skipped !== 1 ? 's' : ''}.`);
}

function uncheckCategoryOrphans(catId) {
  let skipped = 0;
  document.querySelectorAll(`.export-file-cb-${catId}`).forEach(cb => {
    if (!_allOrphanPaths.has(cb.dataset.path)) return;
    if (getActiveRisksForPath(cb.dataset.path).some(r => r.severity === 'unsafe')) { skipped++; return; }
    applyFileToggle(cb.dataset.path, false, cb);
  });
  if (skipped > 0) showNotification(`Skipped ${skipped} unsafe referenced orphan${skipped !== 1 ? 's' : ''}.`);
}

// ── SPRITE PREVIEW ────────────────────────────────────────────────────────────
function getTooltip() {
  if (!_spriteTooltip) {
    _spriteTooltip = document.createElement('div');
    _spriteTooltip.id = 'sprite-tooltip';
    _spriteTooltip.style.cssText = 'position:fixed;display:none;pointer-events:none;z-index:9999;background:var(--bg2);border:1px solid var(--border2);border-radius:6px;padding:6px;box-shadow:0 4px 24px rgba(0,0,0,.7)';
    document.body.appendChild(_spriteTooltip);
    document.addEventListener('mousemove', e => {
      if (_spriteTooltip.style.display !== 'none') placeTooltip(e);
    });
  }
  return _spriteTooltip;
}

async function showSpritePreview(el, event) {
  const path = el.dataset.spritePath;
  if (!path) return;
  const url = await getSpriteUrl(path);
  if (!url) return;
  const tip = getTooltip();
  tip.innerHTML = `<img src="${url}" style="display:block;max-width:240px;max-height:240px;object-fit:contain;image-rendering:pixelated">`;
  tip.style.display = 'block';
  placeTooltip(event);
}

function hideSpritePreview() {
  if (_spriteTooltip) _spriteTooltip.style.display = 'none';
}

function placeTooltip(e) {
  const tip = _spriteTooltip;
  const x = e.clientX + 18, y = e.clientY - 12;
  tip.style.left = Math.min(x, window.innerWidth  - 270) + 'px';
  tip.style.top  = Math.max(8, Math.min(y, window.innerHeight - 270)) + 'px';
}

async function getSpriteUrl(path) {
  if (_spriteUrlCache[path]) return _spriteUrlCache[path];
  const file = _byPath[path];
  if (!file) return null;
  const url = URL.createObjectURL(file);
  _spriteUrlCache[path] = url;
  return url;
}

function scheduleThumbLoad() {
  // Eagerly load thumbnails in the background after render
  setTimeout(async () => {
    for (const img of document.querySelectorAll('img.sprite-thumb[data-path]')) {
      if (img.src && img.src !== window.location.href) continue;
      const url = await getSpriteUrl(img.dataset.path);
      if (url) img.src = url;
    }
  }, 80);
}

// ── RISK ANALYSIS ─────────────────────────────────────────────────────────────
async function buildRiskGraph({ allPaths, byPath, ships, skins, variants, shipById, skinById, modRoot }) {
  _riskGraph = {};
  _wpnPathById = {};

  const addRisk = (path, risk) => {
    if (!_riskGraph[path]) _riskGraph[path] = [];
    _riskGraph[path].push(risk);
  };

  const resolveSprite = (spriteName) => {
    if (!spriteName) return null;
    const rel = spriteName.replace(/^\//, '');
    if (byPath[modRoot + '/' + rel]) return modRoot + '/' + rel;
    if (byPath['/' + rel]) return '/' + rel;
    return null;
  };

  const systemPathById = {};
  for (const p of allPaths.filter(p => /\.system$/i.test(p))) {
    const base = p.split('/').pop().replace(/\.system$/i, '').toLowerCase();
    systemPathById[base] = p;
    try {
      const data = parseStarsectorJson(await readText(byPath[p]));
      if (data?.id) systemPathById[String(data.id).toLowerCase()] = p;
    } catch(e) {}
  }

  const csvField = (row, names) => {
    if (!row) return '';
    const want = names.map(n => n.toLowerCase());
    for (const [key, value] of Object.entries(row)) {
      if (want.includes(key.trim().toLowerCase())) return value;
    }
    return '';
  };

  // ── Parse .wpn files ───────────────────────────────────────────────────────
  const wpnParsed = {};
  for (const p of allPaths.filter(p => /\.wpn$/i.test(p))) {
    try {
      const data = parseStarsectorJson(await readText(byPath[p]));
      wpnParsed[p] = data;
      const base = p.split('/').pop().replace(/\.wpn$/i, '').toLowerCase();
      _wpnPathById[base] = p;
      if (data.id) _wpnPathById[data.id.toLowerCase()] = p;
    } catch(e) {}
  }

  // ── Weapon sprite & projectile deps ───────────────────────────────────────
  for (const [wPath, wData] of Object.entries(wpnParsed)) {
    const wName = wPath.split('/').pop().replace(/\.wpn$/i, '');
    for (const key of ['turretSprite','hardpointSprite','turretGunSprite','hardpointGunSprite','underSprite']) {
      const sp = resolveSprite(wData[key]);
      if (!sp) continue;
      addRisk(sp, {
        severity: 'unsafe',
        msg: `Weapon sprite for "${wName}" — visual corruption in game`,
        dependentPaths: [wPath],
        fixes: [{ label: `Also exclude ${wPath.split('/').pop()}`, type: 'cascade_uncheck', paths: [wPath] }]
      });
    }
    if (wData.projectileSpecId) {
      const projBase = wData.projectileSpecId.toLowerCase();
      const projPath = allPaths.find(pp => /\.proj$/i.test(pp) && pp.split('/').pop().replace(/\.proj$/i,'').toLowerCase() === projBase);
      if (projPath) {
        addRisk(projPath, {
          severity: 'unsafe',
          msg: `Projectile spec for weapon "${wName}" — weapon misfires or crashes`,
          dependentPaths: [wPath],
          fixes: [{ label: `Also exclude ${wPath.split('/').pop()}`, type: 'cascade_uncheck', paths: [wPath] }]
        });
      }
    }
  }

  // ── Ship system deps ──────────────────────────────────────────────────────
  for (const s of ships) {
    const systemId = csvField(s.csvRow, ['system id', 'systemid']) || s.data?.systemId;
    if (!systemId) continue;
    const sysPath = systemPathById[String(systemId).toLowerCase()];
    if (!sysPath) continue;
    addRisk(sysPath, {
      severity: 'unsafe',
      msg: `Ship system "${systemId}" used by "${s.hullId}" — ship may fail to load or lose its system`,
      dependentPaths: [s.path],
      fixes: [{ label: `Also exclude ${s.shortName} and variants`, type: 'cascade_uncheck',
        paths: [s.path, ...(s.variants||[]).map(v=>v.path), ...(s.skins||[]).map(sk=>sk.path)] }]
    });
  }
  for (const sk of skins) {
    const systemId = sk.data?.systemId;
    if (!systemId || typeof systemId !== 'string') continue;
    const sysPath = systemPathById[systemId.toLowerCase()];
    if (!sysPath) continue;
    addRisk(sysPath, {
      severity: 'unsafe',
      msg: `Ship system "${systemId}" used by skin "${sk.skinHullId}" — skin may fail to load or lose its system`,
      dependentPaths: [sk.path],
      fixes: [{ label: `Also exclude ${sk.shortName}`, type: 'cascade_uncheck', paths: [sk.path] }]
    });
  }

  // ── Ship sprite & built-in weapon deps ────────────────────────────────────
  for (const s of ships) {
    if (s.spritePath) {
      addRisk(s.spritePath, {
        severity: 'unsafe',
        msg: `Ship sprite for "${s.hullId}" — white-box render in game`,
        dependentPaths: [s.path],
        fixes: [{ label: `Also exclude ${s.shortName} and variants`, type: 'cascade_uncheck',
          paths: [s.path, ...(s.variants||[]).map(v=>v.path), ...(s.skins||[]).map(sk=>sk.path)] }]
      });
    }
    if (s.data?.builtInWeapons && typeof s.data.builtInWeapons === 'object') {
      for (const [slot, weaponId] of Object.entries(s.data.builtInWeapons)) {
        if (!weaponId || typeof weaponId !== 'string') continue;
        const wpnPath = _wpnPathById[weaponId.toLowerCase()];
        if (!wpnPath) continue;
        const cap = { slot, weaponId, sPath: s.path, sName: s.shortName };
        addRisk(wpnPath, {
          severity: 'unsafe',
          msg: `Built-in weapon in "${s.hullId}" (slot ${slot}) — ship will have broken slot`,
          dependentPaths: [s.path],
          fixes: [
            { label: `Also exclude ${s.shortName}`, type: 'cascade_uncheck',
              paths: [s.path, ...(s.variants||[]).map(v=>v.path), ...(s.skins||[]).map(sk=>sk.path)] },
            { label: `Patch ${s.shortName} — remove built-in slot ${slot}`,
              type: 'patch_file', targetPath: cap.sPath,
              description: `Remove built-in weapon "${cap.weaponId}" (slot ${cap.slot}) from ${cap.sName}`,
              apply: (text) => { try { const o=parseStarsectorJson(text); if(o.builtInWeapons){delete o.builtInWeapons[cap.slot]; if(!Object.keys(o.builtInWeapons).length) delete o.builtInWeapons;} return JSON.stringify(o,null,2); } catch(e){return text;} }
            }
          ]
        });
      }
    }
  }

  // ── Variant weapon slot deps ──────────────────────────────────────────────
  for (const v of variants) {
    if (!v.data?.weaponGroups) continue;
    for (let gi = 0; gi < v.data.weaponGroups.length; gi++) {
      const group = v.data.weaponGroups[gi];
      if (!group?.weapons) continue;
      for (const [slot, weaponId] of Object.entries(group.weapons)) {
        if (!weaponId || typeof weaponId !== 'string') continue;
        const wpnPath = _wpnPathById[weaponId.toLowerCase()];
        if (!wpnPath) continue;
        const cap = { gi, slot, weaponId, vPath: v.path, vName: v.shortName };
        addRisk(wpnPath, {
          severity: 'warn',
          msg: `Assigned in "${v.shortName}" (group ${gi+1}, slot ${slot}) — slot becomes empty`,
          dependentPaths: [v.path],
          fixes: [
            { label: `Also exclude ${v.shortName}`, type: 'cascade_uncheck', paths: [v.path] },
            { label: `Patch ${v.shortName} — clear slot ${slot}`,
              type: 'patch_file', targetPath: cap.vPath,
              description: `Remove "${cap.weaponId}" from slot ${cap.slot} in ${cap.vName}`,
              apply: (text) => { try { const o=parseStarsectorJson(text); if(o.weaponGroups?.[cap.gi]?.weapons) delete o.weaponGroups[cap.gi].weapons[cap.slot]; return JSON.stringify(o,null,2); } catch(e){return text;} }
            }
          ]
        });
      }
    }
  }

  // ── Faction file deps ─────────────────────────────────────────────────────
  const factionPaths = allPaths.filter(p => /\.faction$/i.test(p) || /\/world\/factions\/.*\.json$/i.test(p));
  for (const fp of factionPaths) {
    let fData; try { fData = parseStarsectorJson(await readText(byPath[fp])); } catch(e) { continue; }
    const fname = fp.split('/').pop();

    // knownShips
    const ks = fData.knownShips;
    if (ks && typeof ks === 'object') {
      const hullIds = Array.isArray(ks) ? ks : Object.keys(ks);
      for (const hullId of hullIds) {
        const ship = shipById[hullId] || shipById[hullId.toLowerCase()];
        if (!ship) continue;
        const cap = { hullId, fp, fname };
        addRisk(ship.path, {
          severity: 'warn',
          msg: `Hull "${hullId}" in ${fname} knownShips — faction loses this ship from fleet/market`,
          dependentPaths: [fp],
          fixes: [{ label: `Patch ${fname} — remove "${hullId}" from knownShips`,
            type: 'patch_file', targetPath: fp,
            description: `Remove hull "${cap.hullId}" from knownShips in ${cap.fname}`,
            apply: (text) => { try { const o=parseStarsectorJson(text); if(Array.isArray(o.knownShips)) o.knownShips=o.knownShips.filter(id=>id!==cap.hullId); else if(o.knownShips) delete o.knownShips[cap.hullId]; return JSON.stringify(o,null,2); } catch(e){return text;} }
          }]
        });
      }
    }

    // knownWeapons
    if (Array.isArray(fData.knownWeapons)) {
      for (const weaponId of fData.knownWeapons) {
        const wpnPath = _wpnPathById[weaponId?.toLowerCase?.()];
        if (!wpnPath) continue;
        const cap = { weaponId, fp, fname };
        addRisk(wpnPath, {
          severity: 'warn',
          msg: `Weapon "${weaponId}" in ${fname} knownWeapons — faction won't equip ships with it`,
          dependentPaths: [fp],
          fixes: [{ label: `Patch ${fname} — remove "${weaponId}" from knownWeapons`,
            type: 'patch_file', targetPath: fp,
            description: `Remove weapon "${cap.weaponId}" from knownWeapons in ${cap.fname}`,
            apply: (text) => { try { const o=parseStarsectorJson(text); if(Array.isArray(o.knownWeapons)) o.knownWeapons=o.knownWeapons.filter(id=>id!==cap.weaponId); return JSON.stringify(o,null,2); } catch(e){return text;} }
          }]
        });
      }
    }

    // knownFighters
    if (Array.isArray(fData.knownFighters)) {
      for (const wingId of fData.knownFighters) {
        const wingPath = allPaths.find(p => /\.wing$/i.test(p) && p.split('/').pop().replace(/\.wing$/i,'').toLowerCase() === wingId?.toLowerCase?.());
        if (!wingPath) continue;
        const cap = { wingId, fp, fname };
        addRisk(wingPath, {
          severity: 'warn',
          msg: `Fighter "${wingId}" in ${fname} knownFighters — faction won't field this wing`,
          dependentPaths: [fp],
          fixes: [{ label: `Patch ${fname} — remove "${wingId}" from knownFighters`,
            type: 'patch_file', targetPath: fp,
            description: `Remove fighter "${cap.wingId}" from knownFighters in ${cap.fname}`,
            apply: (text) => { try { const o=parseStarsectorJson(text); if(Array.isArray(o.knownFighters)) o.knownFighters=o.knownFighters.filter(id=>id!==cap.wingId); return JSON.stringify(o,null,2); } catch(e){return text;} }
          }]
        });
      }
    }

    // portraits
    const collectPortraits = (portraits) => {
      const out = [];
      if (!portraits) return out;
      if (Array.isArray(portraits)) out.push(...portraits.filter(x => typeof x === 'string'));
      else if (typeof portraits === 'object') {
        for (const v of Object.values(portraits)) {
          if (Array.isArray(v)) out.push(...v.filter(x => typeof x === 'string'));
          else if (typeof v === 'string') out.push(v);
        }
      }
      return out;
    };
    for (const ref of collectPortraits(fData.portraits)) {
      const pPath = resolveSprite(ref);
      if (!pPath) continue;
      const cap = { ref, fp, fname };
      addRisk(pPath, {
        severity: 'warn',
        msg: `Portrait "${ref}" in ${fname} — NPC will show missing portrait`,
        dependentPaths: [fp],
        fixes: [{ label: `Patch ${fname} — remove portrait entry`,
          type: 'patch_file', targetPath: fp,
          description: `Remove portrait "${cap.ref}" from ${cap.fname}`,
          apply: (text) => { try { const o=parseStarsectorJson(text); if(o.portraits){ if(Array.isArray(o.portraits)) o.portraits=o.portraits.filter(p=>p!==cap.ref); else for(const k of Object.keys(o.portraits)) if(Array.isArray(o.portraits[k])) o.portraits[k]=o.portraits[k].filter(p=>p!==cap.ref); } return JSON.stringify(o,null,2); } catch(e){return text;} }
        }]
      });
    }
  }

  // ── default_ship_roles.json ───────────────────────────────────────────────
  const rolesPath = allPaths.find(p => /default_ship_roles\.json$/i.test(p));
  if (rolesPath) {
    let rolesData; try { rolesData = parseStarsectorJson(await readText(byPath[rolesPath])); } catch(e) {}
    if (rolesData) {
      const rname = rolesPath.split('/').pop();
      for (const [role, hullArr] of Object.entries(rolesData)) {
        if (!Array.isArray(hullArr)) continue;
        for (const hullId of hullArr) {
          const ship = shipById[hullId] || shipById[hullId.toLowerCase()];
          if (!ship) continue;
          const cap = { role, hullId, rolesPath, rname };
          addRisk(ship.path, {
            severity: 'warn',
            msg: `Hull "${hullId}" in ${rname} role "${role}" — faction AI ignores this role assignment`,
            dependentPaths: [rolesPath],
            fixes: [{ label: `Patch ${rname} — remove "${hullId}" from "${role}"`,
              type: 'patch_file', targetPath: rolesPath,
              description: `Remove "${cap.hullId}" from role "${cap.role}" in ${cap.rname}`,
              apply: (text) => { try { const o=parseStarsectorJson(text); if(Array.isArray(o[cap.role])) o[cap.role]=o[cap.role].filter(id=>id!==cap.hullId); return JSON.stringify(o,null,2); } catch(e){return text;} }
            }]
          });
        }
      }
    }
  }

  // ── MagicBounty JSON ─────────────────────────────────────────────────────
  const bountyPath = allPaths.find(p => /MagicBounty_data\.json$/i.test(p));
  if (bountyPath) {
    let bountyData; try { bountyData = parseStarsectorJson(await readText(byPath[bountyPath])); } catch(e) { console.warn('[bounty] parse failed:', e.message); }
    console.log('[bounty] parsed entries:', bountyData ? Object.keys(bountyData).length : 'null');
    if (bountyData) {
      const bname = bountyPath.split('/').pop();
      for (const [bountyId, bounty] of Object.entries(bountyData)) {
        if (typeof bounty !== 'object') continue;
        const variantRefs = [
          ...(Array.isArray(bounty.fleet_preset_ships) ? bounty.fleet_preset_ships : []),
          ...(Array.isArray(bounty.fleet_preset_ships_and_escorts) ? bounty.fleet_preset_ships_and_escorts : []),
          bounty.fleet_flagship_variant,
          bounty.target_variant,
          bounty.job_fleet_flagship,
        ].filter(Boolean);
        const cap = { bountyId, bountyPath, bname };
        const bountyFix = {
          label: `Patch ${bname} — remove bounty "${bountyId}"`,
          type: 'patch_file', targetPath: bountyPath,
          description: `Remove bounty entry "${cap.bountyId}" from ${cap.bname}`,
          apply: (text) => { try { const o=parseStarsectorJson(text); delete o[cap.bountyId]; return JSON.stringify(o,null,2); } catch(e){return text;} }
        };
        for (const variantId of variantRefs) {
          const varPath = allPaths.find(p => /\.variant$/i.test(p) && p.split('/').pop().replace(/\.variant$/i,'').toLowerCase() === variantId.toLowerCase());
          if (!varPath) continue;
          addRisk(varPath, {
            severity: 'unsafe',
            msg: `Variant "${variantId}" used in bounty "${bountyId}" — bounty will crash on activation`,
            dependentPaths: [bountyPath],
            fixes: [{ label: `Also exclude ${bname}`, type: 'cascade_uncheck', paths: [bountyPath] }, bountyFix]
          });
          const parentVariant = variants.find(v => v.path === varPath);
          const parentShip = parentVariant?.resolvedShip;
          if (parentShip) {
            addRisk(parentShip.path, {
              severity: 'unsafe',
              msg: `Variant "${variantId}" (of this ship) used in bounty "${bountyId}" — bounty will crash`,
              dependentPaths: [bountyPath],
              fixes: [{ label: `Also exclude ${bname}`, type: 'cascade_uncheck', paths: [bountyPath] }, bountyFix]
            });
          }
        }
      }
    }
  }

  // ── Java source scanning ──────────────────────────────────────────────────
  const javaPaths = allPaths.filter(p => /\.java$/i.test(p));
  if (javaPaths.length) {
    const knownHullIds = Object.keys(shipById);
    const knownVariantIds = variants.map(v => v.data?.variantId || v.shortName.replace(/\.variant$/i,'')).filter(Boolean);
    for (const jp of javaPaths) {
      let jText; try { jText = await readText(byPath[jp]); } catch(e) { continue; }
      const jname = jp.split('/').pop();
      for (const hullId of knownHullIds) {
        if (!hullId || !jText.includes(`"${hullId}"`)) continue;
        addRisk(shipById[hullId].path, {
          severity: 'warn',
          msg: `Hull ID "${hullId}" is a string literal in ${jname} — script may malfunction (no auto-fix)`,
          dependentPaths: [jp],
          fixes: []
        });
      }
      for (const variantId of knownVariantIds) {
        if (!variantId || !jText.includes(`"${variantId}"`)) continue;
        const varPath = allPaths.find(p => /\.variant$/i.test(p) && p.split('/').pop().replace(/\.variant$/i,'') === variantId);
        if (!varPath) continue;
        addRisk(varPath, {
          severity: 'warn',
          msg: `Variant ID "${variantId}" is a string literal in ${jname} — script may malfunction (no auto-fix)`,
          dependentPaths: [jp],
          fixes: []
        });
      }
    }
  }

}

function getActiveRisksForPath(filePath) {
  const risks = _riskGraph[filePath];
  if (!risks?.length) return [];
  return risks.filter(r => r.dependentPaths.some(dp => isPathChecked(dp)));
}

function isPathChecked(filePath) {
  if (!filePath) return false;
  const safe = filePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const cb = document.querySelector(`.export-file-cb[data-path="${safe}"]`);
  return cb ? cb.checked : true;
}

function refreshRiskBadges() {
  document.querySelectorAll('.file-chip[data-chip-path]').forEach(chip => {
    const badge = chip.querySelector('.risk-badge');
    if (!badge) return;
    const path = chip.dataset.chipPath;
    const activeRisks = getActiveRisksForPath(path);
    if (!activeRisks.length) { badge.style.display = 'none'; badge.textContent = ''; return; }
    const sev = activeRisks.some(r => r.severity === 'unsafe') ? 'unsafe' : 'warn';
    badge.style.display = '';
    badge.className = `td-tag risk-badge risk-${sev}`;
    badge.textContent = sev.toUpperCase();
  });
}

function riskFixAppliesToPath(fix, path) {
  if (!fix || !path) return false;
  if (fix.type === 'patch_file') return fix.targetPath === path;
  if (fix.type === 'cascade_uncheck') return Array.isArray(fix.paths) && fix.paths.includes(path);
  return false;
}

function buildRiskFixGroups(activeRisks) {
  const groups = [];
  let fixIdx = 0;

  for (const risk of activeRisks) {
    const fixes = (risk.fixes || []).map(fix => ({ ...fix, _fixIndex: fixIdx++ }));
    if (!fixes.length) continue;

    const grouped = new Set();
    const dependentPaths = risk.dependentPaths || [];
    for (const depPath of dependentPaths) {
      const depFixes = fixes.filter(fix => riskFixAppliesToPath(fix, depPath));
      const hasPatch = depFixes.some(fix => fix.type === 'patch_file');
      const hasExclude = depFixes.some(fix => fix.type === 'cascade_uncheck');
      if (depFixes.length > 1 && hasPatch && hasExclude) {
        depFixes.forEach(fix => grouped.add(fix._fixIndex));
        groups.push({
          type: 'exclusive',
          label: depPath.split('/').pop(),
          fixes: depFixes.sort((a, b) => (a.type === 'patch_file' ? -1 : 1) - (b.type === 'patch_file' ? -1 : 1))
        });
      }
    }

    for (const fix of fixes) {
      if (!grouped.has(fix._fixIndex)) groups.push({ type: 'optional', fixes: [fix] });
    }
  }

  return groups;
}

function riskFixTypeLabel(fix) {
  return fix.type === 'patch_file' ? 'patches file' : 'unchecks';
}

function riskFixMatchesExistingAction(fix) {
  if (!fix) return false;
  if (fix.type === 'patch_file') return !!_pendingPatches[fix.targetPath]?.length;
  if (fix.type === 'cascade_uncheck') return Array.isArray(fix.paths) && fix.paths.some(p => !isPathChecked(p));
  return false;
}

function applyRiskFix(fix) {
  if (!fix) return;
  if (fix.type === 'cascade_uncheck') {
    for (const p of fix.paths) {
      const safe = p.replace(/\\/g,'\\\\').replace(/"/g,'\\"');
      const fileCb = document.querySelector(`.export-file-cb[data-path="${safe}"]`);
      if (fileCb) applyFileToggle(p, false, fileCb);
    }
  } else if (fix.type === 'patch_file') {
    addPatch(fix.targetPath, fix.description, fix.apply);
  }
}

// ── RISK MODAL ────────────────────────────────────────────────────────────────
function showRiskModal(filePath, activeRisks, onProceed) {
  document.getElementById('risk-modal')?.remove();
  const fixGroups = buildRiskFixGroups(activeRisks);
  const allFixes = {};
  for (const group of fixGroups) for (const fix of group.fixes) allFixes[fix._fixIndex] = fix;
  _currentModal = { filePath, activeRisks, allFixes, fixGroups, onProceed };
  const fname = filePath.split('/').pop();
  const maxSev = activeRisks.some(r => r.severity === 'unsafe') ? 'unsafe' : 'warn';
  const sevColor = maxSev === 'unsafe' ? 'var(--red)' : 'var(--amber)';
  const fixRows = fixGroups.map((group, groupIdx) => {
    if (group.type === 'exclusive') {
      const existingIdx = group.fixes.findIndex(riskFixMatchesExistingAction);
      const defaultIdx = existingIdx >= 0 ? existingIdx : 0;
      return `<div class="risk-fix-group">
        <div class="risk-fix-group-label">${esc(group.label)} fix</div>
        ${group.fixes.map((fix, optIdx) => `
          <label class="risk-fix-row">
            <input type="radio" class="risk-fix-radio" name="risk-fix-group-${groupIdx}" data-fix-index="${fix._fixIndex}" ${optIdx === defaultIdx ? 'checked' : ''} style="cursor:pointer;flex-shrink:0">
            <span style="flex:1">${esc(fix.label)}</span>
            <span class="risk-fix-type">${riskFixTypeLabel(fix)}</span>
          </label>`).join('')}
      </div>`;
    }
    const fix = group.fixes[0];
    return `<label class="risk-fix-row">
      <input type="checkbox" class="risk-fix-cb" data-fix-index="${fix._fixIndex}" checked style="cursor:pointer;flex-shrink:0">
      <span style="flex:1">${esc(fix.label)}</span>
      <span class="risk-fix-type">${riskFixTypeLabel(fix)}</span>
    </label>`;
  }).join('');
  const modal = document.createElement('div');
  modal.id = 'risk-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px';
  modal.innerHTML = `<div class="risk-modal-inner">
    <div class="risk-modal-head">
      <span style="font-size:18px">${maxSev==='unsafe'?'🔴':'🟡'}</span>
      <span style="font-weight:700;color:${sevColor};font-family:var(--head);letter-spacing:1px;text-transform:uppercase">${maxSev==='unsafe'?'Unsafe Removal':'Removal Warning'}</span>
    </div>
    <div style="padding:4px 20px 10px;color:var(--text2);font-size:13px">
      Excluding <code style="color:var(--text);background:var(--bg3);padding:1px 5px;border-radius:3px">${esc(fname)}</code> may break your mod:
    </div>
    <div class="risk-modal-reasons">
      ${activeRisks.map(r=>`<div class="risk-reason risk-reason-${r.severity}"><span class="risk-sev">${r.severity.toUpperCase()}</span><span>${esc(r.msg)}</span></div>`).join('')}
    </div>
    ${fixRows ? `<div class="risk-modal-fixes"><div class="risk-fixes-label">Available fixes (applied to file content in the exported ZIP)</div>${fixRows}</div>` : ''}
    <div class="risk-modal-footer">
      <button class="btn" onclick="modalCancel()" style="background:var(--bg3)">Cancel (keep file)</button>
      <button class="btn" onclick="modalProceedNoFix()" style="color:var(--text2);border-color:var(--border2)">Proceed, no fixes</button>
      <button class="btn" style="color:${sevColor};border-color:${sevColor}" onclick="modalApplyAndProceed()">${fixRows?'Apply selected &amp; proceed':'Proceed anyway'}</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
}

function modalCancel() {
  if (_currentModal) {
    const safe = _currentModal.filePath.replace(/\\/g,'\\\\').replace(/"/g,'\\"');
    const cb = document.querySelector(`.export-file-cb[data-path="${safe}"]`);
    if (cb) { cb.checked = true; setChipDeselected(cb.closest('.file-chip'), false); }
  }
  _currentModal = null;
  document.getElementById('risk-modal')?.remove();
}

function modalProceedNoFix() {
  const proceed = _currentModal?.onProceed;
  _currentModal = null;
  document.getElementById('risk-modal')?.remove();
  proceed?.();
  refreshRiskBadges();
}

function modalApplyAndProceed() {
  if (!_currentModal) { document.getElementById('risk-modal')?.remove(); return; }
  const { allFixes, onProceed } = _currentModal;
  document.querySelectorAll('.risk-fix-cb:checked,.risk-fix-radio:checked').forEach(cb => {
    const fix = allFixes[parseInt(cb.dataset.fixIndex)];
    applyRiskFix(fix);
  });
  _currentModal = null;
  document.getElementById('risk-modal')?.remove();
  onProceed?.();
  refreshRiskBadges();
}

// ── PATCH & CHANGE LOG ────────────────────────────────────────────────────────
function removePatchesForPath(path) {
  if (!path || !_pendingPatches[path]) return;
  delete _pendingPatches[path];
  _changeLog = _changeLog.filter(e => e.icon !== '✂️' || e.path !== path);
}

function removeExclusionsForPath(path) {
  if (!path) return [];
  const removed = [];
  _changeLog = _changeLog.filter(e => {
    if (e.icon === '✂️') return true;
    if (e.path === path || (Array.isArray(e.cascade) && e.cascade.includes(path))) {
      removed.push(e);
      return false;
    }
    return true;
  });
  return removed;
}

function setPathIncludedVisual(path) {
  if (!path) return;
  syncFileCbByPath(path, true);
  const safe = path.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const vCb = document.querySelector(`.export-variant-cb[data-path="${safe}"]`);
  if (vCb) { vCb.checked = true; setRowDeselected(vCb.closest('tr'), false); }
  const skCb = document.querySelector(`.export-skin-cb[data-path="${safe}"]`);
  if (skCb) { skCb.checked = true; setRowDeselected(skCb.closest('tr'), false); }
  const hullId = _shipFilePathToHullId[path];
  if (hullId) {
    const escapedId = hullId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const sCb = document.querySelector(`.export-ship-cb[data-hull-id="${escapedId}"]`);
    if (sCb) { sCb.checked = true; setRowDeselected(sCb.closest('tr'), false); }
  }
}

function ensurePatchTargetIncluded(path) {
  if (!path) return;
  const removedExclusions = removeExclusionsForPath(path);
  for (const entry of removedExclusions) {
    if (Array.isArray(entry.cascade)) entry.cascade.forEach(setPathIncludedVisual);
    else setPathIncludedVisual(entry.path);
  }
  setPathIncludedVisual(path);
}

function addChangeEntry(icon, title, path, meta = {}) {
  if (icon !== '✂️') {
    removePatchesForPath(path);
    if (Array.isArray(meta.cascade)) meta.cascade.forEach(removePatchesForPath);
  }
  if (_changeLog.some(e => e.title === title && e.path === path)) return;
  const id = Date.now() + Math.random();
  _changeLog.push({ icon, title, path, id, ...meta });
  renderChangeLogSection();
}

function addPatch(path, description, applyFn) {
  ensurePatchTargetIncluded(path);
  if (!_pendingPatches[path]) _pendingPatches[path] = [];
  if (_pendingPatches[path].some(p => p.description === description)) return;
  _pendingPatches[path].push({ description, apply: applyFn });
  addChangeEntry('✂️', description, path);
}

function undoChangeEntry(id) {
  const entry = _changeLog.find(e => e.id === id);
  if (!entry) return;
  _changeLog = _changeLog.filter(e => e.id !== id);
  if (entry.icon === '✂️') {
    // Undo patch: remove from pendingPatches
    if (_pendingPatches[entry.path]) {
      _pendingPatches[entry.path] = _pendingPatches[entry.path].filter(p => p.description !== entry.title);
      if (!_pendingPatches[entry.path].length) delete _pendingPatches[entry.path];
    }
  } else {
    // Undo exclusion: re-check via the appropriate toggle
    if (entry.cascade) {
      // Ship-level cascade entry — re-check via ship toggle
      const hullId = _shipFilePathToHullId[entry.path];
      if (hullId) {
        const escapedId = hullId.replace(/\\/g,'\\\\').replace(/"/g,'\\"');
        const sCb = document.querySelector(`.export-ship-cb[data-hull-id="${escapedId}"]`);
        if (sCb) applyShipToggle(hullId, true, sCb);
      }
    } else {
      const safe = entry.path.replace(/\\/g,'\\\\').replace(/"/g,'\\"');
      const cb = document.querySelector(`.export-file-cb[data-path="${safe}"]`);
      if (cb) applyFileToggle(entry.path, true, cb);
    }
  }
  renderChangeLogSection();
}

function clearAllPatches() {
  _pendingPatches = {};
  _changeLog = [];
  renderChangeLogSection();
}

function renderChangeLogSection() {
  const el = document.getElementById('change-log-section');
  if (!el) return;
  const badge = el.querySelector('.change-log-count-badge');
  const headerBtn = document.getElementById('header-export-btn');
  if (!_changeLog.length) {
    el.style.display = 'none';
    if (badge) badge.textContent = '';
    if (headerBtn) headerBtn.style.display = '';
    return;
  }
  el.style.display = 'block';
  if (headerBtn) headerBtn.style.display = 'none';
  const patches = _changeLog.filter(e => e.icon === '✂️');
  const exclusions = _changeLog.filter(e => e.icon !== '✂️');
  if (badge) badge.textContent = `${exclusions.length} excluded · ${patches.length} patched`;
  const body = el.querySelector('.change-log-body');
  if (!body) return;
  const entriesByCat = {};
  for (const entry of _changeLog) {
    const name = entry.path?.split('/').pop() || '';
    const cat = categoriseFile(name, entry.path || '');
    if (!entriesByCat[cat.id]) entriesByCat[cat.id] = { cat, entries: [] };
    entriesByCat[cat.id].entries.push(entry);
  }
  const renderEntries = (entries) => entries.map(e => {
    const sub = e.cascade?.length > 1
      ? `<div class="change-entry-cascade">${e.cascade.slice(1).map(p=>`<span class="change-entry-sub">${esc(p.split('/').pop())}</span>`).join('')}</div>`
      : '';
    return `<div class="change-entry">
      <span class="change-entry-icon">${e.icon}</span>
      <div class="change-entry-detail">
        <div class="change-entry-title">${esc(e.title)}</div>
        <div class="change-entry-path">${esc(e.path)}</div>
        ${sub}
      </div>
      <button class="btn btn-sm" onclick="undoChangeEntry(${e.id})">↩ Undo</button>
    </div>`;
  }).join('');
  const renderCategoryGroup = ({ cat, entries }) => {
    const groupPatches = entries.filter(e => e.icon === '✂️').length;
    const groupExclusions = entries.length - groupPatches;
    const bits = [
      groupExclusions ? `${groupExclusions} excluded` : '',
      groupPatches ? `${groupPatches} patched` : ''
    ].filter(Boolean).join(' · ');
    return `<div class="redund-group change-log-group">
      <div class="redund-group-header" onclick="toggleGroup(event,this)">
        <span class="group-icon">${cat.icon}</span>
        <span class="group-name">${cat.label}</span>
        <span class="group-count">(${entries.length} change${entries.length!==1?'s':''})</span>
        <span class="td-tag badge-info">${esc(bits)}</span>
        <div class="group-actions">
          <span style="color:var(--text3);font-size:11px">${cat.desc}</span>
        </div>
        <span class="group-chevron">▼</span>
      </div>
      <div class="redund-group-body change-log-group-body">${renderEntries(entries)}</div>
    </div>`;
  };
  const groupedEntries = FILE_CATEGORIES
    .map(cat => entriesByCat[cat.id])
    .filter(Boolean)
    .map(renderCategoryGroup)
    .join('');
  body.innerHTML = `<div class="change-log-wrap">
    <div class="change-log-meta"><strong>${exclusions.length} file${exclusions.length!==1?'s':''} excluded from export · ${patches.length} file content patch${patches.length!==1?'es':''}</strong> applied in the exported ZIP — originals untouched</div>
    ${groupedEntries}
    <div style="padding:12px 0 0;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-export" onclick="exportMod()" id="export-btn" title="Export selected files as a ZIP">⬇ Export Mod ZIP</button>
      <button class="btn btn-sm" onclick="clearAllPatches()" style="color:var(--red);border-color:rgba(224,85,85,.4)">✕ Clear All Changes</button>
    </div>
  </div>`;
}

function showNotification(msg) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;bottom:24px;right:24px;background:var(--bg2);border:1px solid var(--amber);border-radius:6px;padding:12px 18px;color:var(--amber);font-size:13px;z-index:9998;box-shadow:0 4px 24px rgba(0,0,0,.7);max-width:360px;font-family:var(--mono)';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ── UTILS ─────────────────────────────────────────────────────────────────────
function setProgress(pct, msg) {
  $('progress-bar').style.width = pct+'%';
  $('progress-msg').textContent = msg;
}
function readText(file) {
  return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=e=>res(e.target.result); r.onerror=rej; r.readAsText(file); });
}
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function esc(str){ if(str==null)return''; return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function formatPercent(value) {
  if (!isFinite(value) || value <= 0) return '0%';
  return value < 0.1 ? '<0.1%' : value.toFixed(value < 10 ? 1 : 0) + '%';
}
function formatBytes(bytes) {
  const units = ['B','KB','MB','GB'];
  let value = Math.max(0, Number(bytes) || 0);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  const decimals = unit === 0 || value >= 10 ? 0 : 1;
  return `${value.toFixed(decimals)} ${units[unit]}`;
}

function parseStarsectorJson(text) {
  const cleaned = stripTrailingJsonCommas(stripJsonComments(String(text || '').replace(/^\uFEFF/, '')));
  // Starsector JSON allows Python-style True/False/None outside of strings
  const normalized = cleaned.replace(/(?<!["\w])True(?!["\w])/g, 'true')
                             .replace(/(?<!["\w])False(?!["\w])/g, 'false')
                             .replace(/(?<!["\w])None(?!["\w])/g, 'null');
  return JSON.parse(normalized);
}

function stripJsonComments(text) {
  let out = '', inStr = false, quote = '', escNext = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (inStr) {
      out += c;
      if (escNext) escNext = false;
      else if (c === '\\') escNext = true;
      else if (c === quote) inStr = false;
      continue;
    }
    if (c === '"' || c === "'") { inStr = true; quote = c; out += c; continue; }
    if ((c === '/' && n === '/') || c === '#') {
      while (i < text.length && !/\r|\n/.test(text[i])) i++;
      out += text[i] || '';
      continue;
    }
    if (c === '/' && n === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++;
      continue;
    }
    out += c;
  }
  return out;
}

function stripTrailingJsonCommas(text) {
  let out = '', inStr = false, quote = '', escNext = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      out += c;
      if (escNext) escNext = false;
      else if (c === '\\') escNext = true;
      else if (c === quote) inStr = false;
      continue;
    }
    if (c === '"' || c === "'") { inStr = true; quote = c; out += c; continue; }
    if (c === ',') {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (j >= text.length || text[j] === '}' || text[j] === ']') continue;
    }
    out += c;
  }
  return out;
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/);
  if (!lines.length) return [];
  const headers = lines[0].split(',').map(h=>h.replace(/^"|"$/g,'').trim());
  const rows = [];
  for (let i=1;i<lines.length;i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;
    const vals = splitCSVLine(line);
    const obj = {};
    headers.forEach((h,j)=>{ if(h) obj[h]=(vals[j]||'').replace(/^"|"$/g,'').trim(); });
    rows.push(obj);
  }
  return rows;
}
function splitCSVLine(line) {
  const result=[]; let cur='',inQ=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(c==='"'){inQ=!inQ;}
    else if(c===','&&!inQ){result.push(cur);cur='';}
    else cur+=c;
  }
  result.push(cur); return result;
}
