param(
    [string]$SourcePath = (Join-Path $PSScriptRoot '../../templates/eoe 1100/ModuleData/snowballs_in_use.xml')
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
            $records.Add([ordered]@{ id=$id; name=$name; category=$category; hd=$hd; code=$child.GetAttribute('banner'); commented=$commented })
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
$label = 'Built-in snapshot: ' + $source.Substring($repositoryRoot.Length + 1).Replace('\', '/')
$data = [ordered]@{ source=$label; records=@($records.ToArray()) } | ConvertTo-Json -Depth 5 -Compress
# Escape HTML-sensitive characters so XML names cannot terminate the JSON script element.
$data = $data.Replace('&', '\u0026').Replace('<', '\u003c').Replace('>', '\u003e')
$nativeJson = $native.Groups[1].Value
$html = [regex]::Replace($html, '(<script id="native-data" type="application/json">)[\s\S]*?(</script>)', [Text.RegularExpressions.MatchEvaluator]{ param($m) $m.Groups[1].Value + $nativeJson + $m.Groups[2].Value })
$html = [regex]::Replace($html, '(<script id="gallery-data" type="application/json">)[\s\S]*?(</script>)', [Text.RegularExpressions.MatchEvaluator]{ param($m) $m.Groups[1].Value + $data + $m.Groups[2].Value })
[IO.File]::WriteAllText($galleryPath, $html, (New-Object Text.UTF8Encoding($false)))
Write-Output ('Updated banner-gallery.html: {0} banners, embedded native masks and palette.' -f $records.Count)
