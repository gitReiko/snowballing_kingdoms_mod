param(
    [string]$SourcePath = (Join-Path $PSScriptRoot '../../templates/eoe 1100/ModuleData/snowballs_in_use.xml'),
    [string]$IndexPath = (Join-Path $PSScriptRoot '../../index.html')
)
$ErrorActionPreference = 'Stop'
$galleryPath = Join-Path $PSScriptRoot 'banner-gallery.html'
$recolorPath = Join-Path $PSScriptRoot '../banner-recolor.html'
$html = [IO.File]::ReadAllText($galleryPath)
$recolor = [IO.File]::ReadAllText($recolorPath)
$native = [regex]::Match($recolor, '<script id="native-data" type="application/json">([\s\S]*?)</script>')
if (-not $native.Success) { throw 'Native banner masks were not found in banner-recolor.html.' }
$source = (Resolve-Path -LiteralPath $SourcePath).Path
$xml = New-Object System.Xml.XmlDocument
$xml.Load($source)
$records = New-Object 'System.Collections.Generic.List[object]'
function Add-Records($root, [bool]$commented) {
    foreach ($child in $root.ChildNodes) {
        if ($child.NodeType -eq [Xml.XmlNodeType]::Element -and $child.LocalName -eq 'Snowball') {
            if (-not $child.GetAttribute('banner').Trim()) { continue }
            $id = $child.GetAttribute('id')
            $name = $child.GetAttribute('name') -replace '^\{=[^}]*\}', ''
            if (-not $name) { $name = $id }
            $category = $child.GetAttribute('web-category-id')
            if (-not $category) { $category = '__uncategorized__' }
            $hd = $null
            if ($child.GetAttribute('web-hd') -eq 'true') { $hd = $true }
            elseif ($child.GetAttribute('web-hd') -eq 'false') { $hd = $false }
            $fictional = $null
            $rawFictional = $child.GetAttribute('web-is-fictional').Trim().ToLowerInvariant()
            if ($rawFictional -eq 'true') { $fictional = $true }
            elseif ($rawFictional -eq 'false') { $fictional = $false }
            $records.Add([ordered]@{ id=$id; name=$name; category=$category; hd=$hd; fictional=$fictional; description=$child.GetAttribute('web-coat-of-arms-desc'); code=$child.GetAttribute('banner'); commented=$commented })
        } elseif ($child.NodeType -eq [Xml.XmlNodeType]::Comment -and $child.Value -match '<Snowball\b') {
            $fragment = New-Object System.Xml.XmlDocument
            $fragment.LoadXml('<Snowballs>' + $child.Value + '</Snowballs>')
            Add-Records $fragment.DocumentElement $true
        }
    }
}
Add-Records $xml.DocumentElement $false
if ($records.Count -eq 0) { throw 'No Snowball records found.' }
$repositoryRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$sourceUri = New-Object Uri($source)
$rootUri = New-Object Uri($repositoryRoot.TrimEnd('\') + '\')
$label = 'Built-in snapshot: ' + [Uri]::UnescapeDataString($rootUri.MakeRelativeUri($sourceUri).ToString())
$data = [ordered]@{ source=$label; records=@($records.ToArray()) } | ConvertTo-Json -Depth 5 -Compress
# Base64 gzip preserves the complete snapshot without repeating long banner layers
# in the HTML. The browser decompresses it locally; no server or network is needed.
$buffer = New-Object IO.MemoryStream
$gzip = New-Object IO.Compression.GZipStream($buffer, [IO.Compression.CompressionLevel]::Optimal, $true)
try {
    $bytes = [Text.Encoding]::UTF8.GetBytes($data)
    $gzip.Write($bytes, 0, $bytes.Length)
} finally { $gzip.Dispose() }
$compressedData = [Convert]::ToBase64String($buffer.ToArray())
$buffer.Dispose()
$nativeJson = $native.Groups[1].Value
$html = [regex]::Replace($html, '(<script id="native-data" type="application/json">)[\s\S]*?(</script>)', [Text.RegularExpressions.MatchEvaluator]{ param($m) $m.Groups[1].Value + $nativeJson + $m.Groups[2].Value })
$html = [regex]::Replace($html, '<script id="gallery-data" type="application/(?:json|gzip)">[\s\S]*?</script>', [Text.RegularExpressions.MatchEvaluator]{ param($m) '<script id="gallery-data" type="application/gzip">' + $compressedData + '</script>' })
[IO.File]::WriteAllText($galleryPath, $html, (New-Object Text.UTF8Encoding($false)))
# The root copy is the publication entry point; its social image lives beside the
# maintained gallery source, so its relative URL differs from the standalone copy.
$index = $html.Replace('content="banner-gallery-preview.png"', 'content="support/banner-gallery/banner-gallery-preview.png"')
[IO.File]::WriteAllText([IO.Path]::GetFullPath($IndexPath), $index, (New-Object Text.UTF8Encoding($false)))
Write-Output ('Updated banner-gallery.html and index.html: {0} banners, {1:N2} MB per page.' -f $records.Count, ([Text.Encoding]::UTF8.GetByteCount($html) / 1000000))
