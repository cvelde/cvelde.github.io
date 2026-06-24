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
  _modInfoPath = modInfoPath || '';

  // Load mod prefix registry for dependency analysis
  let modPrefixRegistry = {};
  try { const r = await fetch('./mod-prefixes.json'); if (r.ok) modPrefixRegistry = await r.json(); } catch(e) {}

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
    const orphanNote = referenced ? null : getOrphanNote(name);

    fileMetaByPath[p] = {
      orphan: !referenced,
      orphanNote,
      owners: referencingOwners.map(o => ({ type:o.type, id:o.id, parentId:o.parentId }))
    };

    if (!referenced) {
      const cat = categoriseFile(name, p);
      orphans.push({ path:p, name, ext, cat, orphanNote });
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

  // ── Mod dependency analysis ───────────────────────────────────────────────
  setProgress(91, 'Analysing mod dependencies...');

  // Build prefix → mod registry lookup
  const prefixToMod = {};
  for (const [modId, info] of Object.entries(modPrefixRegistry)) {
    for (const prefix of (info.prefixes || [])) {
      const pl = prefix.toLowerCase();
      if (pl) prefixToMod[pl] = { modId, modName: (info.modName || '').trim(), author: info.author || '', prefixes: info.prefixes };
    }
  }

  // Determine the mod's own prefixes from hull IDs
  const ownPrefixes = new Set();
  for (const s of ships) { const p = s.hullId.split('_')[0].toLowerCase(); if (p) ownPrefixes.add(p); }
  for (const sk of skins) { const p = sk.skinHullId.split('_')[0].toLowerCase(); if (p) ownPrefixes.add(p); }
  if (modInfo?.id) ownPrefixes.add(modInfo.id.toLowerCase());

  // Collect all IDs referenced in ship/skin/variant data that cross into other mods
  const referencedIds = new Set();
  const addRefId = id => { if (id && typeof id === 'string' && id.includes('_')) referencedIds.add(id); };
  for (const s of ships) {
    if (s.data?._parseError) continue;
    addRefId(s.data?.systemId);
    (s.data?.builtInMods || []).forEach(addRefId);
    (s.data?.builtInWings || []).forEach(addRefId);
    if (s.data?.builtInWeapons) Object.values(s.data.builtInWeapons).forEach(addRefId);
  }
  for (const sk of skins) {
    if (sk.data?._parseError) continue;
    addRefId(sk.data?.systemId);
    (sk.data?.addBuiltInMods || []).forEach(addRefId);
    (sk.data?.removeBuiltInMods || []).forEach(addRefId);
    if (sk.data?.builtInWeapons) Object.values(sk.data.builtInWeapons).forEach(addRefId);
  }
  for (const v of variants) {
    if (v.data?._parseError) continue;
    (v.data?.wings || []).forEach(addRefId);
    if (v.data?.weaponGroups) {
      for (const g of v.data.weaponGroups) {
        if (g.weapons) Object.values(g.weapons).forEach(addRefId);
      }
    }
  }

  // Map foreign prefixes → mod info
  const usedForeignMods = {}; // modId → { modName, author, usedPrefixes: Set, exampleIds: [] }
  for (const id of referencedIds) {
    const prefix = id.split('_')[0].toLowerCase();
    if (!prefix || ownPrefixes.has(prefix)) continue;
    const entry = prefixToMod[prefix];
    if (!entry) continue;
    const key = entry.modId;
    if (!usedForeignMods[key]) usedForeignMods[key] = { ...entry, usedPrefixes: new Set(), exampleIds: [] };
    usedForeignMods[key].usedPrefixes.add(prefix);
    if (usedForeignMods[key].exampleIds.length < 5) usedForeignMods[key].exampleIds.push(id);
  }

  // Split prefix-based findings into declared vs undeclared
  const declaredDeps = modInfo?.dependencies || [];
  const declaredDepIds = new Set(declaredDeps.map(d => (d.id || '').toLowerCase()));
  const undeclaredDeps = [];
  for (const [modId, info] of Object.entries(usedForeignMods)) {
    if (!declaredDepIds.has(modId.toLowerCase())) {
      undeclaredDeps.push({ modId, ...info, usedPrefixes: [...info.usedPrefixes], soft: false, detectedVia: 'prefix' });
    }
  }

  // File-presence based library detection
  for (const detector of LIBRARY_FILE_DETECTORS) {
    if (declaredDepIds.has(detector.modId.toLowerCase())) continue;
    const hit = allPaths.find(p => {
      const name = p.split('/').pop();
      return detector.filePatterns.some(rx => rx.test(name))
          || detector.pathPatterns.some(rx => rx.test(p));
    });
    if (!hit) continue;
    // Avoid duplicate if prefix detection already found this mod
    if (undeclaredDeps.some(d => d.modId.toLowerCase() === detector.modId.toLowerCase())) continue;
    undeclaredDeps.push({
      modId: detector.modId,
      modName: detector.modName,
      author: detector.author,
      usedPrefixes: [],
      exampleIds: [hit.split('/').pop()],
      soft: detector.soft,
      detectedVia: 'file',
      detectionReason: detector.detectionReason,
    });
  }

  _undeclaredDepData = undeclaredDeps;

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
  const hardUndeclared = undeclaredDeps.filter(d => !d.soft);
  const softUndeclared = undeclaredDeps.filter(d => d.soft);
  if (hardUndeclared.length) issues.push({ severity:'err',  msg:`${hardUndeclared.length} undeclared hard dependenc${hardUndeclared.length>1?'ies':'y'} — likely to crash`, detail:`Missing from mod_info.json: ${hardUndeclared.map(d=>d.modName?.trim()||d.modId).join(', ')}` });
  if (softUndeclared.length) issues.push({ severity:'warn', msg:`${softUndeclared.length} undeclared soft dependenc${softUndeclared.length>1?'ies':'y'} detected`, detail:`Optional integrations not declared in mod_info.json: ${softUndeclared.map(d=>d.modName?.trim()||d.modId).join(', ')}` });

  setProgress(98, 'Rendering results...');
  await sleep(40);

  renderModInfoPanel(modInfo, declaredDeps, undeclaredDeps);
  renderResults({ ships, skins, variants, orphans, issues, csvById, csvShipsNotFound, allFilesByCat, allFiles, modInfo, orphanBytes, orphanPercent });

  setProgress(100, 'Done!');
  await sleep(80);
  $('progress-wrap').style.display = 'none';
  $('results-content').style.display = '';
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
