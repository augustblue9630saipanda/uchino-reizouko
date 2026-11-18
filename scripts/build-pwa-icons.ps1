# Render the font-independent geometry in icons/icon.svg to opaque PNGs.
# Windows/.NET only; no downloaded dependencies or external image services.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$iconDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../icons'))
[IO.Directory]::CreateDirectory($iconDirectory) | Out-Null
$variants = @(@{Name='apple-touch-icon.png';Size=180},@{Name='icon-192.png';Size=192},@{Name='icon-512.png';Size=512})
foreach ($variant in $variants) {
    $bitmap = New-Object Drawing.Bitmap($variant.Size, $variant.Size)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([Drawing.ColorTranslator]::FromHtml('#F7F4ED'))
    $graphics.ScaleTransform(($variant.Size / 512.0), ($variant.Size / 512.0))
    $ring = New-Object Drawing.Pen([Drawing.ColorTranslator]::FromHtml('#D4BBA8'), 3)
    $terra = New-Object Drawing.Pen([Drawing.ColorTranslator]::FromHtml('#A95336'), 18)
    $terra.StartCap = $terra.EndCap = [Drawing.Drawing2D.LineCap]::Round
    $terra.LineJoin = [Drawing.Drawing2D.LineJoin]::Round
    $stem = New-Object Drawing.Pen([Drawing.ColorTranslator]::FromHtml('#526E55'), 3)
    $stem.StartCap = $stem.EndCap = [Drawing.Drawing2D.LineCap]::Round
    $terraFill = New-Object Drawing.SolidBrush([Drawing.ColorTranslator]::FromHtml('#A95336'))
    $sageFill = New-Object Drawing.SolidBrush([Drawing.ColorTranslator]::FromHtml('#A2B4A0'))
    $letter = New-Object Drawing.Drawing2D.GraphicsPath
    $letter.AddLine(198,194,177,286)
    $letter.AddBezier(177,286,168,326,183,342,207,337)
    $letter.AddBezier(207,337,232,332,249,308,260,279)
    $letter.AddLine(260,279,278,194)
    $letter.StartFigure()
    $letter.AddLine(260,279,250,320)
    $letter.AddBezier(250,320,246,337,252,341,268,329)
    $leaf = New-Object Drawing.Drawing2D.GraphicsPath
    $leaf.AddBezier(300,190,297,150,338,136,354,136)
    $leaf.AddBezier(354,136,354,170,337,193,300,190)
    $leaf.CloseFigure()
    try {
        $graphics.DrawEllipse($ring,72,72,368,368)
        $graphics.DrawPath($terra,$letter)
        $graphics.FillEllipse($terraFill,299,317,22,22)
        $graphics.FillPath($sageFill,$leaf)
        $graphics.DrawLine($stem,302,187,335,155)
        $bitmap.Save((Join-Path $iconDirectory $variant.Name),[Drawing.Imaging.ImageFormat]::Png)
    } finally {
        foreach ($resource in @($letter,$leaf,$ring,$terra,$stem,$terraFill,$sageFill,$graphics,$bitmap)) { $resource.Dispose() }
    }
    Write-Output "$($variant.Name): $($variant.Size)x$($variant.Size)"
}
