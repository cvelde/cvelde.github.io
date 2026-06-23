const $ = id => document.getElementById(id);

// ── EXPORT STATE ──────────────────────────────────────────────────────────────
let _byPath = {};
let _modRoot = '';
let _shipPathById = {};       // hullId → { path, skinPaths[], spritePath }
let _allOrphanPaths = new Set();
let _spriteUrlCache = {};     // file path → blob URL
let _variantSpriteByPath = {};// variant path → sprite file path
let _spriteTooltip = null;

// ── FILE CATEGORIES ───────────────────────────────────────────────────────────
const FILE_CATEGORIES = [
  { id:'settings',  label:'MOD SETTINGS',      icon:'⚙',  patterns:[/mod_info\.json$/i,/settings\.json$/i,/config\.json$/i,/options\.json$/i], desc:'Top-level configuration files' },
  { id:'lunalib',   label:'LUNALIB CONFIG',     icon:'🌙', patterns:[/lunaSettings\.json$/i,/lunalib.*\.json$/i,/\.lunasettings$/i,/lunaConf/i], desc:'LunaLib plugin settings' },
  { id:'sounds',    label:'SOUND FILES',        icon:'🔊', patterns:[/\.ogg$/i,/\.wav$/i,/\.mp3$/i], desc:'Audio assets' },
  { id:'graphics',  label:'GRAPHICS / SPRITES', icon:'🖼', patterns:[/\.png$/i,/\.jpg$/i,/\.jpeg$/i,/\.webp$/i,/\.svg$/i], desc:'Image and sprite assets' },
  { id:'scripts',   label:'SCRIPTS',            icon:'📜', patterns:[/\.java$/i,/\.class$/i,/\.jar$/i,/\.kt$/i,/\.groovy$/i], desc:'Java/script source files' },
  { id:'csv',       label:'DATA TABLES',        icon:'📊', patterns:[/\.csv$/i,/\.tsv$/i], desc:'CSV data tables' },
  { id:'ships',     label:'SHIP FILES',         icon:'🚀', patterns:[/\.ship$/i], desc:'Ship definition files' },
  { id:'skins',     label:'SKIN FILES',         icon:'🎨', patterns:[/\.skin$/i], desc:'Ship skin/reskin definitions' },
  { id:'variants',  label:'VARIANT FILES',      icon:'🔩', patterns:[/\.variant$/i], desc:'Ship variant loadouts' },
  { id:'weapons',   label:'WEAPON FILES',       icon:'⚡', patterns:[/\.wpn$/i,/\.proj$/i], desc:'Weapon definitions' },
  { id:'wings',     label:'WING FILES',         icon:'✈',  patterns:[/\.wing$/i], desc:'Fighter wing definitions' },
  { id:'strings',   label:'STRINGS / LOCALES',  icon:'🌐', patterns:[/strings\.json$/i,/lang_/i,/locale/i,/\.strings$/i], desc:'Localisation and string files' },
  { id:'desc',      label:'DESCRIPTIONS',       icon:'📝', patterns:[/descriptions\.csv$/i,/tips\.txt$/i,/readme/i,/\.txt$/i,/\.md$/i], desc:'Description text and documentation' },
  { id:'faction',   label:'FACTIONS',           icon:'🚩', patterns:[/\.faction$/i], desc:'Faction definition files' },
  { id:'planets',   label:'PLANETS / SYSTEMS',  icon:'🪐', patterns:[/\.star_system$/i,/\.planet$/i,/custom_entities\.json$/i], desc:'Planet and star system definitions' },
  { id:'other',     label:'UNCATEGORISED',      icon:'📁', patterns:[], desc:'Files not matching any known category' }
];

// These extensions are always "referenced by the game engine" – we can't easily
// trace every reference to them, so they are excluded from the orphan check.
const ORPHAN_EXEMPT_EXTS = new Set(['java','class','jar','kt','groovy','ogg','wav','mp3','faction','star_system','planet','txt','md','strings']);

function categoriseFile(name) {
  for (const cat of FILE_CATEGORIES) {
    if (cat.id === 'other') continue;
    if (cat.patterns.some(p => p.test(name))) return cat;
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

  // Also add CSV text
  if (csvPath) {
    try { addRefs(null, await readText(byPath[csvPath])); } catch(e) {}
  }

  // For each file, determine if its filename (or basename without ext) appears anywhere
  // in the reference corpus. Files in certain categories are exempt.
  const orphans = [];
  const fileMetaByPath = {};
  for (const p of allPaths) {
    const name = p.split('/').pop();
    const ext  = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
    // Skip files that are themselves primary data or are system files
    if (ORPHAN_EXEMPT_EXTS.has(ext)) continue;
    // Skip mod_info.json and ship_data.csv — they ARE the reference roots
    if (/mod_info\.json$/i.test(name) || /ship_data\.csv$/i.test(name)) continue;
    // Skip .ship, .skin, .variant — they are checked elsewhere
    if (ext === 'ship' || ext === 'skin' || ext === 'variant') continue;

    const nameLower  = name.toLowerCase();
    const baseLower  = nameLower.includes('.') ? nameLower.slice(0, nameLower.lastIndexOf('.')) : nameLower;

    // Is this file referenced anywhere?
    const referencingOwners = refOwners.filter(o =>
      o.path !== p && (o.raw.includes(nameLower) || o.raw.includes(baseLower))
    );
    const referenced = referenceCorpus.has(nameLower) || referenceCorpus.has(baseLower)
      || [...referenceCorpus].some(r => r.includes(baseLower) || r.endsWith(nameLower))
      || referencingOwners.length > 0;

    fileMetaByPath[p] = {
      orphan: !referenced,
      owners: referencingOwners.map(o => ({
        type: o.type,
        id: o.id,
        parentId: o.parentId
      }))
    };

    if (!referenced) {
      const cat = categoriseFile(name);
      orphans.push({ path:p, name, ext, cat });
    }
  }
  _allOrphanPaths = new Set(orphans.map(o => o.path));

  // ── File inventory ─────────────────────────────────────────────────────────
  setProgress(85, 'Categorising all files...');
  const primaryPathMeta = {};
  for (const s of ships) primaryPathMeta[s.path] = { orphan:false, owners:[{ type:'ship', id:s.hullId }] };
  for (const sk of skins) primaryPathMeta[sk.path] = { orphan:false, owners:[{ type:'skin', id:sk.skinHullId, parentId:sk.baseHullId }] };
  for (const v of variants) primaryPathMeta[v.path] = { orphan:false, owners:[{ type:'variant', id:v.shortName, parentId:v.refId }] };
  const allFiles = allPaths.map(p => {
    const name = p.split('/').pop();
    return { path:p, name, size:byPath[p]?.size || 0, cat:categoriseFile(name), ...(fileMetaByPath[p] || primaryPathMeta[p] || { orphan:false, owners:[] }) };
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

  scheduleThumbLoad();
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
  for (const s of ships) {
    _shipPathById[s.hullId] = { path: s.path, skinPaths: s.skins.map(sk => sk.path), spritePath: s.spritePath || null };
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
      <td><input type="checkbox" class="export-ship-cb" checked data-hull-id="${esc(s.hullId)}" onchange="syncShipFiles(this)" title="Include in export (also syncs .ship and sprite in File Inventory)" style="margin-right:6px;cursor:pointer;vertical-align:middle"><span class="status-dot ${statusDot}"></span><span class="td-tag ${statusTag}">${statusText}</span>
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
      <td><input type="checkbox" class="export-skin-cb" checked data-path="${esc(sk.path)}" onchange="syncOrphanSkinFiles(this)" title="Include in export" style="margin-right:6px;cursor:pointer;vertical-align:middle"><span class="status-dot ${skErr?'dot-err':'dot-warn'}"></span><span class="td-tag ${skErr?'tag-missing':'tag-warn'}">${statusText}</span>
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
  const limitedRows = limitRows(rows + orphanSkinRows, tid, 15);
  const initialShown = Math.min(total, 15);
  return `
    <div class="filter-bar">
      <input class="filter-input" placeholder="Filter by hull ID, name…" oninput="filterTable('${tid}',this.value)" id="${tid}-search">
      <div class="filter-btns">
        <button class="filter-btn active" onclick="filterTableStatus('${tid}','all',this)">ALL</button>
        <button class="filter-btn" onclick="filterTableStatus('${tid}','ok',this)">OK</button>
        <button class="filter-btn" onclick="filterTableStatus('${tid}','error',this)">ISSUES</button>
      </div>
      <button class="btn btn-sm" onclick="toggleCheckboxes('export-ship-cb')" style="margin-left:8px">☑ Toggle All</button>
      <span class="table-count" id="${tid}-count">${total > 15 ? `${initialShown} shown · ` : ''}${ships.length} ships · ${skins.length} skins</span>
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
      <td colspan="8" style="padding:6px 16px;font-family:var(--mono);font-size:11px;color:var(--text2);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:0">
        ${spriteThumbHtml(s.spritePath, 24)}
        <span class="td-tag tag-ship" style="margin-left:6px">SHIP</span>
        <span style="color:var(--text);margin-left:6px">${esc(s.hullId)}</span>
        <span style="color:var(--text3);margin-left:6px">${esc(s.shortName)}</span>
        <span style="color:var(--text3);margin-left:auto;float:right">${group.variants.length} variant${group.variants.length>1?'s':''}</span>
      </td>
    </tr>`;
    for (const v of group.variants) rows += variantRow(v);
  }
  for (const v of unresolved) rows += variantRow(v);

  const limitedRows = limitRows(rows, tid, 15);
  const initialShown = Math.min(variants.length, 15);
  return `
    <div class="filter-bar">
      <input class="filter-input" placeholder="Filter variants…" oninput="filterTable('${tid}',this.value)" id="${tid}-search">
      <div class="filter-btns">
        <button class="filter-btn active" onclick="filterTableStatus('${tid}','all',this)">ALL</button>
        <button class="filter-btn" onclick="filterTableStatus('${tid}','ok',this)">OK</button>
        <button class="filter-btn" onclick="filterTableStatus('${tid}','error',this)">ISSUES</button>
      </div>
      <button class="btn btn-sm" onclick="toggleCheckboxes('export-variant-cb')" style="margin-left:8px">☑ Toggle All</button>
      <span class="table-count" id="${tid}-count">${variants.length > 15 ? `${initialShown} shown · ` : ''}${variants.length} variants</span>
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
    <td><input type="checkbox" class="export-variant-cb" checked data-path="${esc(v.path)}" onchange="syncVariantFiles(this)" title="Include in export (also syncs .variant and sprite in File Inventory)" style="margin-right:6px;cursor:pointer;vertical-align:middle"><span class="status-dot ${statusDot}"></span><span class="td-tag ${statusTag}">${statusText}</span></td>
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
      <div class="redund-group-header">
        <span class="group-icon">${cat.icon}</span>
        <span class="group-name">${cat.label}</span>
        <span class="group-count">(${files.length} file${files.length!==1?'s':''})</span>
        ${orphanCount ? `<span class="td-tag tag-warn">${orphanCount} orphan${orphanCount!==1?'s':''} · ${formatBytes(orphanBytes)}</span>` : ''}
        <div class="group-actions">
          <button class="btn btn-sm btn-xs" onclick="toggleCategoryFiles('${cat.id}',this)">☑ Toggle</button>
          ${orphanCount ? `<button class="btn btn-sm btn-xs inv-orphan-btn" onclick="uncheckCategoryOrphans('${cat.id}')">✕ Orphans</button>` : ''}
          <span style="color:var(--text3);font-size:11px">${cat.desc}</span>
        </div>
      </div>
      <div class="file-chips">
        ${files.map((f, index)=>{
          const ext = f.name.includes('.')?f.name.split('.').pop().toLowerCase():'';
          const ownerText = fileOwnerText(f);
          const isImg = /^(png|jpg|jpeg|webp|svg)$/.test(ext);
          const thumbHtml = isImg
            ? `<div class="sprite-cell chip-sprite" data-sprite-path="${esc(f.path)}" onmouseenter="showSpritePreview(this,event)" onmouseleave="hideSpritePreview()"><img class="sprite-thumb" data-path="${esc(f.path)}" width="20" height="20" style="object-fit:contain;image-rendering:pixelated;display:block;cursor:zoom-in"></div>`
            : '';
          return `<div class="file-chip ${index >= 15 ? 'is-collapsed-entry' : ''}" data-collapse-group="${groupId}" title="${esc(f.path)}">
            <input type="checkbox" class="${cbClass}" checked data-path="${esc(f.path)}" onchange="onFileCbChange(this)" style="margin-right:4px;cursor:pointer;flex-shrink:0">
            ${thumbHtml}
            <span class="chip-ext ${getExtClass(ext)}">.${ext||'?'}</span>
            <span>${esc(f.name)}</span>
            <span class="td-tag badge-muted">${formatBytes(f.size || 0)}</span>
            ${f.orphan ? '<span class="td-tag tag-warn">orphan</span>' : ''}
            ${ownerText ? `<span class="td-tag ${f.orphan?'tag-warn':'tag-ok'}" title="${esc(ownerText)}">${esc(ownerText)}</span>` : ''}
          </div>`;
        }).join('')}
      </div>
      ${files.length > 15 ? showAllControl(groupId, files.length - 15) : ''}
    </div>`;
  }
  return html || '<div class="empty">No files found</div>';
}

function getExtClass(ext) {
  const m = {ship:'tag-ship',skin:'tag-variant',variant:'tag-variant',wpn:'tag-weapon',wing:'tag-wing',csv:'tag-ok',json:'badge-info'};
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

function filterTable(tableId, search) {
  const tbl = $(tableId);
  if (!tbl) return;
  const q = search.toLowerCase();
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
  return `<div class="show-more-row">
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
  if (table) {
    table._expanded = true;
    filterTable(groupId, $(groupId+'-search')?.value || '');
  }
  btn?.closest('.show-more-row')?.remove();
}

// ── EXPORT ───────────────────────────────────────────────────────────────────
async function exportMod() {
  if (typeof JSZip === 'undefined') {
    alert('JSZip library not loaded. Check your internet connection and reload the page.');
    return;
  }
  const btn = $('export-btn');
  const origText = btn.textContent;
  btn.textContent = '⏳ Building ZIP…';
  btn.disabled = true;

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

    // Add all collected files to the zip
    for (const path of exportPaths) {
      if (path === modInfoPath) continue; // handled separately below
      const file = _byPath[path];
      if (!file) continue;
      const zipPath = _modRoot && path.startsWith(_modRoot + '/')
        ? path.slice(_modRoot.length + 1)
        : path.replace(/^\//, '');
      zip.file(zipPath, file);
    }

    // Always include a modified mod_info.json
    if (modInfoPath && _byPath[modInfoPath]) {
      let modInfo;
      try { modInfo = parseStarsectorJson(await readText(_byPath[modInfoPath])); } catch(e) { modInfo = {}; }
      const origName = modInfo.name || 'Unknown Mod';
      const origId   = modInfo.id   || 'unknown';
      modInfo.name = origName + ' [SMT]';
      modInfo.id   = origId + '_smt';
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
    btn.textContent = origText;
    btn.disabled = false;
  }
}

function uncheckOrphanedFiles() {
  document.querySelectorAll('.export-file-cb').forEach(cb => {
    if (_allOrphanPaths.has(cb.dataset.path)) {
      cb.checked = false;
      setChipDeselected(cb.closest('.file-chip'), true);
    }
  });
}

function toggleCheckboxes(className) {
  const boxes = Array.from(document.querySelectorAll('.' + className));
  const allChecked = boxes.every(cb => cb.checked);
  boxes.forEach(cb => { cb.checked = !allChecked; });
}

// ── PER-CATEGORY FILE CONTROLS ────────────────────────────────────────────────
function toggleCategoryFiles(catId) {
  const cbs = Array.from(document.querySelectorAll(`.export-file-cb-${catId}`));
  const allChecked = cbs.every(cb => cb.checked);
  cbs.forEach(cb => {
    cb.checked = !allChecked;
    setChipDeselected(cb.closest('.file-chip'), allChecked);
  });
}

function uncheckCategoryOrphans(catId) {
  document.querySelectorAll(`.export-file-cb-${catId}`).forEach(cb => {
    if (_allOrphanPaths.has(cb.dataset.path)) {
      cb.checked = false;
      setChipDeselected(cb.closest('.file-chip'), true);
    }
  });
}

function onFileCbChange(cb) {
  setChipDeselected(cb.closest('.file-chip'), !cb.checked);
}

function setChipDeselected(chip, deselected) {
  if (!chip) return;
  chip.classList.toggle('export-deselected', deselected);
}

// ── SHIP / VARIANT ↔ FILE INVENTORY SYNC ─────────────────────────────────────
function syncShipFiles(cb) {
  const entry = _shipPathById[cb.dataset.hullId];
  if (!entry) return;
  const checked = cb.checked;
  syncFileCbByPath(entry.path, checked);
  if (entry.spritePath) syncFileCbByPath(entry.spritePath, checked);
  setRowDeselected(cb.closest('tr'), !checked);
}

function syncOrphanSkinFiles(cb) {
  syncFileCbByPath(cb.dataset.path, cb.checked);
  setRowDeselected(cb.closest('tr'), !cb.checked);
}

function syncVariantFiles(cb) {
  const varPath = cb.dataset.path;
  const checked = cb.checked;
  syncFileCbByPath(varPath, checked);
  const spritePath = _variantSpriteByPath[varPath];
  if (spritePath) syncFileCbByPath(spritePath, checked);
  setRowDeselected(cb.closest('tr'), !checked);
}

function syncFileCbByPath(path, checked) {
  if (!path) return;
  const safe = path.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const fileCb = document.querySelector(`.export-file-cb[data-path="${safe}"]`);
  if (fileCb) {
    fileCb.checked = checked;
    setChipDeselected(fileCb.closest('.file-chip'), !checked);
  }
}

function setRowDeselected(row, deselected) {
  if (!row) return;
  row.classList.toggle('export-deselected', deselected);
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
  return JSON.parse(stripTrailingJsonCommas(stripJsonComments(String(text || '').replace(/^\uFEFF/, ''))));
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
    if (c === '/' && n === '/') {
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
      if (text[j] === '}' || text[j] === ']') continue;
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
