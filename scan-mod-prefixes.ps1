<#
.SYNOPSIS
    Scans a Starsector modpack folder and maps shorthand ID prefixes to mod IDs and names.

.DESCRIPTION
    Reads every mod's mod_info.json, then mines weapon_data.csv, ship_data.csv, etc.
    to extract the prefix pattern (e.g. "aiv_" -> Aivona mod).
    Outputs a sorted table to the console and a JSON file.

.PARAMETER ModpackDir
    Path to the folder containing all your mod subfolders.
    Defaults to C:\Games\Starsector Modpack

.PARAMETER OutFile
    Path for the JSON output file.
    Defaults to mod-prefixes.json in the same directory as this script.

.PARAMETER JsonOnly
    Skip the console table and only write the JSON file.

.EXAMPLE
    .\scan-mod-prefixes.ps1
    .\scan-mod-prefixes.ps1 -ModpackDir "D:\Starsector\mods" -OutFile "D:\prefixes.json"
#>

param(
    [string]$ModpackDir = 'C:\Games\Starsector Modpack',
    [string]$OutFile    = (Join-Path $PSScriptRoot 'mod-prefixes.json'),
    [switch]$JsonOnly
)

$ErrorActionPreference = 'Continue'

# CSV data files that carry an "id" column
$DataCsvNames = @(
    'weapon_data.csv', 'ship_data.csv', 'hullmod_data.csv',
    'wing_data.csv', 'fighter_data.csv', 'special_items.csv',
    'abilities.csv', 'industry_data.csv', 'industries.csv',
    'shipsystems.csv', 'ship_systems.csv'
)

# ── HELPERS ───────────────────────────────────────────────────────────────────

function Read-ModInfoJson([string]$FilePath) {
    try {
        $raw = Get-Content $FilePath -Raw -Encoding UTF8
        # Strip // comments
        $raw = $raw -replace '//[^\n]*', ''
        # Strip trailing commas before } or ]
        $raw = $raw -replace ',(\s*[}\]])', '$1'
        return $raw | ConvertFrom-Json
    } catch {
        return $null
    }
}

function Get-IdPrefixes([string[]]$Ids) {
    $freq = @{}
    foreach ($id in $Ids) {
        if (-not $id -or $id.StartsWith('#')) { continue }
        $under = $id.IndexOf('_')
        if ($under -le 0) { continue }
        $prefix = $id.Substring(0, $under)
        if ($freq.Contains($prefix)) { $freq[$prefix]++ } else { $freq[$prefix] = 1 }
    }
    return $freq
}

function Parse-CsvIds([string]$FilePath) {
    try {
        $lines = @(Get-Content $FilePath -Encoding UTF8)
    } catch { return @() }
    if ($lines.Count -lt 2) { return @() }

    # Find the "id" column index from the header
    $header = $lines[0] -split ',' | ForEach-Object { $_.Trim().Trim('"').ToLower() }
    $idCol  = [Array]::IndexOf($header, 'id')
    if ($idCol -eq -1) { return @() }

    $ids = [System.Collections.Generic.List[string]]::new()
    for ($r = 1; $r -lt $lines.Count; $r++) {
        # Simple split — good enough for the id column which doesn't contain commas
        $cols = $lines[$r] -split ','
        if ($cols.Count -le $idCol) { continue }
        $cell = $cols[$idCol].Trim().Trim('"')
        if ($cell -and -not $cell.StartsWith('#')) {
            $ids.Add($cell)
        }
    }
    return $ids.ToArray()
}

# ── MAIN ──────────────────────────────────────────────────────────────────────

if (-not (Test-Path $ModpackDir)) {
    Write-Error "Modpack folder not found: $ModpackDir"
    exit 1
}

Write-Host "Scanning: $ModpackDir`n"

$modDirs = Get-ChildItem $ModpackDir -Directory

# prefix  -> { modId, modName, author, count, conflicts[] }
$prefixMap = [ordered]@{}
# modId   -> { modName, author, prefixes[] }
$modMap    = [ordered]@{}

$modsScanned = 0

foreach ($modDir in $modDirs) {
    $infoPath = Join-Path $modDir.FullName 'mod_info.json'
    if (-not (Test-Path $infoPath)) { continue }

    $info = Read-ModInfoJson $infoPath
    if (-not $info -or -not $info.id) { continue }

    $modId   = $info.id
    $modName = if ($info.PSObject.Properties['name']   -and $info.name)   { [string]$info.name }   else { $modId }
    $author  = if ($info.PSObject.Properties['author'] -and $info.author) { [string]$info.author } else { '' }

    $modsScanned++

    # Find matching CSV files anywhere under this mod folder
    $csvFiles = Get-ChildItem $modDir.FullName -Recurse -File |
        Where-Object { $DataCsvNames -contains $_.Name.ToLower() }

    $allIds = [System.Collections.Generic.List[string]]::new()
    foreach ($csv in $csvFiles) {
        $ids = Parse-CsvIds $csv.FullName
        foreach ($id in $ids) { $allIds.Add($id) | Out-Null }
    }

    if ($allIds.Count -eq 0) { continue }

    $freqMap = Get-IdPrefixes $allIds.ToArray()
    if ($freqMap.Count -eq 0) { continue }

    # Keep only prefixes that account for a meaningful share
    $topCount = ($freqMap.Values | Measure-Object -Maximum).Maximum
    $threshold = [Math]::Max(2, [Math]::Floor($topCount / 2))
    $modPrefixes = $freqMap.GetEnumerator() |
        Where-Object { $_.Value -ge $threshold } |
        Sort-Object Value -Descending |
        Select-Object -ExpandProperty Key

    $modMap[$modId] = [PSCustomObject]@{
        modName  = $modName
        author   = $author
        prefixes = @($modPrefixes)
    }

    foreach ($prefix in $modPrefixes) {
        if (-not $prefixMap.Contains($prefix)) {
            $prefixMap[$prefix] = [PSCustomObject]@{
                modId     = $modId
                modName   = $modName
                author    = $author
                count     = $freqMap[$prefix]
                conflicts = @()
            }
        } else {
            $existing = $prefixMap[$prefix]
            if ($existing.modId -ne $modId) {
                $existing.conflicts += [PSCustomObject]@{
                    modId   = $modId
                    modName = $modName
                    author  = $author
                    count   = $freqMap[$prefix]
                }
            }
        }
    }
}

$sortedMods = [ordered]@{}
$modMap.GetEnumerator() | Sort-Object { $_.Value.modName } | ForEach-Object { $sortedMods[$_.Key] = $_.Value }

# ── WRITE JSON ────────────────────────────────────────────────────────────────

$sortedMods | ConvertTo-Json -Depth 4 | Set-Content $OutFile -Encoding UTF8
Write-Host "Written: $OutFile ($($sortedMods.Count) mods)"

# ── CONSOLE TABLE ─────────────────────────────────────────────────────────────

if (-not $JsonOnly) {
    $rows = $sortedMods.GetEnumerator() | ForEach-Object {
        [PSCustomObject]@{
            Prefixes = ($_.Value.prefixes -join ', ')
            ModId    = $_.Key
            ModName  = $_.Value.modName
        }
    }

    $pw = [Math]::Max(8,  ($rows | ForEach-Object { $_.Prefixes.Length } | Measure-Object -Maximum).Maximum)
    $iw = [Math]::Max(6,  ($rows | ForEach-Object { $_.ModId.Length    } | Measure-Object -Maximum).Maximum)
    $nw = [Math]::Max(8,  ($rows | ForEach-Object { $_.ModName.Length  } | Measure-Object -Maximum).Maximum)

    $hr  = ('-' * ($pw + 2)) + '+' + ('-' * ($iw + 2)) + '+' + ('-' * ($nw + 2))
    $hdr = " $('PREFIXES'.PadRight($pw)) | $('MOD ID'.PadRight($iw)) | $('MOD NAME'.PadRight($nw))"

    Write-Host $hdr
    Write-Host $hr
    foreach ($r in $rows) {
        Write-Host " $($r.Prefixes.PadRight($pw)) | $($r.ModId.PadRight($iw)) | $($r.ModName.PadRight($nw))"
    }
    Write-Host ''
}

Write-Host 'Done.'
