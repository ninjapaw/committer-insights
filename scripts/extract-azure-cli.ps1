$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($env:COMMITTER_AZ_ARCHIVE)
try {
    if ($zip.Entries.Count -gt 25000) { throw 'Azure CLI archive has too many entries' }
    $names = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    $total = 0L
    foreach ($entry in $zip.Entries) {
        $name = $entry.FullName.TrimEnd('/')
        if (-not $name -or $name -match '[\\:]' -or $name.StartsWith('/')) { throw 'Invalid Azure CLI archive path' }
        foreach ($part in $name.Split('/')) {
            if (-not $part -or $part -in @('.', '..') -or $part -match '[. ]$|[<>"|?*\x00-\x1f]' -or $part -match '^(?i:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)') { throw 'Unsafe Azure CLI archive path' }
        }
        if (-not $names.Add($name) -or (($entry.ExternalAttributes -shr 16) -band 61440) -eq 40960 -or ($entry.ExternalAttributes -band 1024)) { throw 'Duplicate or linked Azure CLI archive entry' }
        $total += $entry.Length
        if ($entry.Length -gt 134217728 -or $total -gt 629145600) { throw 'Azure CLI archive exceeds extraction limits' }
    }
    foreach ($entry in $zip.Entries) {
        $target = Join-Path $env:COMMITTER_AZ_OUTPUT $entry.FullName
        if ($entry.FullName.EndsWith('/')) {
            [System.IO.Directory]::CreateDirectory($target) | Out-Null
        } else {
            [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($target)) | Out-Null
            [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target)
        }
    }
} finally { $zip.Dispose() }