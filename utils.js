const $ = id => document.getElementById(id);

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

// ── KNOWN ORPHAN EXPLANATIONS ─────────────────────────────────────────────────
// Files that ARE correctly orphaned but deserve a specific explanation rather
// than a generic "unreferenced" label.
const KNOWN_ORPHAN_NOTES = [
  {
    tag: 'DYNASECTOR',
    note: 'DynaSector integration file — DynaSector is a discontinued mod; this file is a leftover and can be safely deleted',
    filePatterns: [/^weapon_categories\.csv$/i, /^ship_roles\.csv$/i, /^fighter_wings\.csv$/i],
  },
];

function getOrphanNote(name) {
  for (const entry of KNOWN_ORPHAN_NOTES) {
    if (entry.filePatterns.some(rx => rx.test(name))) return { tag: entry.tag, note: entry.note };
  }
  return null;
}

// ── LIBRARY MOD FILE DETECTORS ───────────────────────────────────────────────
// Each entry: modId (as declared in dependencies), modName, soft (true = optional integration),
// detectionReason, and file/path patterns whose presence implies the dependency.
const LIBRARY_FILE_DETECTORS = [
  {
    modId: 'shaderLib',
    modName: 'GraphicsLib',
    author: 'nicke530',
    soft: false,
    detectionReason: 'GraphicsLib shader/engine-style/texture/light config files present',
    filePatterns:   [/^engine_styles\.json$/i, /^hull_styles\.json$/i, /^magictrail_data\.csv$/i],
    pathPatterns:   [/_texture_data\.csv$/i, /_lights?_data\.csv$/i],
  },
  {
    modId: 'lunalib',
    modName: 'LunaLib',
    author: 'Lukas22041',
    soft: true,
    detectionReason: 'LunaLib settings config file present — provides optional in-game settings UI',
    filePatterns:   [/^lunasettingsconfig\.json$/i, /^lunasettings\.json$/i, /^lunasettings\.csv$/i],
    pathPatterns:   [],
  },
  {
    modId: 'MagicLib',
    modName: 'MagicLib',
    author: 'Tartiflette & Wisp',
    soft: false,
    detectionReason: 'MagicLib bounty/achievement config files present',
    filePatterns:   [/^magicbounty_data\.json$/i, /^magicbounty_intel\.json$/i, /^magic_achievements\.csv$/i, /^magic_paintjobs\.csv$/i, /^magic_weapon_paintjobs\.csv$/i],
    pathPatterns:   [/\/config\/MagicBounty\//i, /\/config\/paintjobs\//i],
  },
  {
    modId: 'nexerelin',
    modName: 'Nexerelin',
    author: 'Histidine',
    soft: true,
    detectionReason: 'Nexerelin faction-warfare/diplomacy config files present — mod likely works without Nexerelin but loses these features',
    filePatterns:   [/^mod_factions\.csv$/i, /^customstarts\.json$/i, /^character_backgrounds\.csv$/i],
    // prism/ is Nexerelin's Prism Freeport sub-feature, not a separate mod
    pathPatterns:   [/\/config\/exerelinFactionConfig\//i, /\/config\/takenoprisonersFactionConfig\//i, /\/config\/exerelin\//i, /\/config\/prism\//i],
  },
  {
    modId: 'Starsector Chatter',
    modName: 'Chatter',
    author: 'Sundog',
    soft: true,
    detectionReason: 'Chatter dialogue/character files present — mod works without Chatter but won\'t have in-combat voice lines',
    filePatterns:   [/^excluded_hulls\.csv$/i],
    pathPatterns:   [/\/chatter\/characters\//i, /\/data\/config\/chatter\//i],
  },
  {
    modId: 'version_checker',
    modName: 'Version Checker',
    author: 'DesperatePete / amoebas',
    soft: true,
    detectionReason: '.version file present — mod works without Version Checker but won\'t report update notifications',
    filePatterns:   [/\.version$/i, /^version_files\.csv$/i],
    pathPatterns:   [/\/config\/version\//i],
  },
  {
    modId: 'IndEvo',
    modName: 'Industrial Evolution',
    author: 'Boggled',
    soft: true,
    detectionReason: 'Industrial Evolution config files present',
    filePatterns:   [],
    pathPatterns:   [/\/config\/indEvo\//i],
  },
  {
    modId: 'secondInCommand',
    modName: 'Second-in-Command',
    author: 'qcwxezda',
    soft: true,
    detectionReason: 'Second-in-Command config files present',
    filePatterns:   [],
    pathPatterns:   [/\/config\/secondInCommand\//i],
  },
  {
    modId: 'ExiledSpace',
    modName: 'Exiled Space',
    author: 'Leviathan',
    soft: true,
    detectionReason: 'Exiled Space config files present',
    filePatterns:   [],
    pathPatterns:   [/\/config\/ExiledSpace\//i],
  },
  {
    modId: 'timid_commissioned_hull_mods',
    modName: 'Commissioned Crews',
    author: 'Techpriest',
    soft: true,
    detectionReason: 'Commissioned Crews faction commission file present (data/config/CommissionBonus/) — adds hullmods tied to player commission faction',
    filePatterns:   [/^TechpriestCommission\.csv$/i],
    pathPatterns:   [/\/config\/CommissionBonus\//i],
  },
  {
    modId: 'vayramerged',
    modName: 'Vayra\'s Ship Pack / Sector',
    author: 'Vayra',
    soft: true,
    detectionReason: 'Vayra bounty integration file present (data/config/vayraBounties/) — registers factions with Vayra\'s player bounty board',
    filePatterns:   [/^player_bounty_factions\.csv$/i],
    pathPatterns:   [/\/config\/vayraBounties\//i],
  },
];

// Extensions whose files the game engine loads by directory scan — tracing
// every reference to them is impractical, so skip them in the orphan check.
const ORPHAN_EXEMPT_EXTS = new Set(['java','class','jar','kt','groovy','ogg','wav','mp3','faction','star_system','planet','txt','md','strings']);

// Exact filenames (lowercased) that are loaded by the game or library mods by
// convention (e.g. GraphicsLib scans for engine_styles.json in every mod).
// These are never orphaned even if nothing in the mod JSON references them.
const ORPHAN_EXEMPT_NAMES = new Set([
  // Core ship/weapon/wing tables
  'ship_data.csv','weapon_data.csv','wing_data.csv','fighter_data.csv',
  // Hullmods — game loads hull_mods.csv from data/hullmods/ in every mod
  'hullmods.csv','hull_mods.csv',
  // Ship systems — game loads ship_systems.csv from data/shipsystems/ in every mod
  'ship_systems.csv',
  // Campaign scripting — game appends rules.csv from every mod's data/campaign/
  'rules.csv',
  // Simulator opponents — game loads sim_opponents.csv / sim_opponents_dev.csv
  'sim_opponents.csv','sim_opponents_dev.csv',
  // Title screen — game loads title_screen_variants.csv from data/config/
  'title_screen_variants.csv',
  // Standard campaign/config tables
  'abilities.csv','descriptions.csv','bar_events.csv',
  'person_missions.csv','mission_list.csv','industries.csv',
  'market_conditions.csv','submarkets.csv','special_items.csv',
  'drop_groups.csv','planet_gen_data.csv','star_gen_data.csv',
  'salvage_entity_gen_data.csv','condition_gen_data.csv',
  'commodities.csv','reports.csv',
  'factions.csv','mod_factions.csv','commands.csv','command_listeners.csv',
  'customstarts.json','character_backgrounds.csv','excluded_hulls.csv',
  'aptitude_data.csv','skill_data.csv',
  'printing_whitelist.csv','reverse_engineering_whitelist.csv',
  'industry_data.csv','market_data.csv',
  'sc_skills.csv','sc_aptitudes.csv','scaptitudes.csv','scskills.csv',
  // Campaign world/star-system definition files
  'starmap.json','channels.json','events.json',
  // Standard JSON config files
  'sounds.json','planets.json','custom_entities.json','engine_styles.json',
  'hull_styles.json','tag_data.json','battle_objectives.json','contact_tag_data.json',
  'mod_info.json','settings.json','modsettings.json',
  'default_ship_roles.json','default_ranks.json','pings.json','terrain.json',
  // Library-specific convention files
  'lunasettingsconfig.json',
  'version_files.csv',
  'magic_achievements.csv','magictrail_data.csv',
  'magicbounty_data.json','magicbounty_intel.json',
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
  /\/data\/campaign\/econ\//i,
  /\/data\/campaign\/procgen\//i,
  /\/data\/campaign\/frontiers\//i,
  /\/data\/characters\//i,
  /\/data\/config\/MagicBounty/i,
  /\/data\/config\/paintjobs\//i,
  /\/data\/campaign\/rulecontent\//i,
  /\/data\/campaign\/rules\//i,
  /\/data\/scripts\//i,
  /_texture_data\.csv$/i,
  /_lights?_data\.csv$/i,
  /\.version$/i,
  // Prism Freeport integration folder (part of Nexerelin — ships/factions opt-in to the special market)
  /\/data\/config\/prism\//i,
  // Commissioned Crews faction-hullmod integration
  /\/data\/config\/CommissionBonus\//i,
  // Vayra's bounty board faction registration
  /\/data\/config\/vayraBounties\//i,
];

function categoriseFile(name, path = '') {
  for (const cat of FILE_CATEGORIES) {
    if (cat.id === 'other') continue;
    if (cat.patterns.some(p => p.test(name))) return cat;
    if (cat.pathPatterns?.some(p => p.test(path))) return cat;
  }
  return FILE_CATEGORIES.find(c => c.id === 'other');
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
  const cleaned = stripTrailingJsonCommas(stripJsonComments(String(text || '').replace(/^﻿/, '')));
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
