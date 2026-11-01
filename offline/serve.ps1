# Serve the offline JOI Forge build on this computer only (Windows; nothing to install).
# Started by "Start JOI Forge (Windows).bat". Close the window to stop.
#
# - Listens on http://localhost:5224 only; nothing on your network can reach it.
# - Serves the files in .\app and nothing else (no paths outside .\app).
# - Unknown routes fall back to index.html so links like /forge work.
# - Always port 5224: the browser stores your library per address.
$ErrorActionPreference = 'Stop'
$Port = 5224
$Root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'app'))
$StartUrl = "http://localhost:$Port/forge"
$Types = @{
  '.html' = 'text/html; charset=utf-8'
  '.js' = 'text/javascript; charset=utf-8'
  '.mjs' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json'
  '.webmanifest' = 'application/manifest+json'
  '.svg' = 'image/svg+xml'
  '.png' = 'image/png'
  '.ico' = 'image/x-icon'
  '.txt' = 'text/plain; charset=utf-8'
  '.woff2' = 'font/woff2'
  '.wasm' = 'application/wasm'
}

if (-not (Test-Path (Join-Path $Root 'index.html'))) {
  Write-Host "Cannot find the app files in $Root"
  Read-Host 'Press Enter to close'
  exit 1
}

# Already running (e.g. started twice)? Just open the browser.
$probe = New-Object System.Net.Sockets.TcpClient
try {
  $probe.Connect('127.0.0.1', $Port)
  $probe.Close()
  Write-Host "JOI Forge is already running. Opening $StartUrl"
  Start-Process $StartUrl
  exit 0
} catch {
  $probe.Close()
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try {
  $listener.Start()
} catch {
  Write-Host "Could not start on port ${Port}: $($_.Exception.Message)"
  Read-Host 'Press Enter to close'
  exit 1
}

Write-Host "JOI Forge (offline) is running at $StartUrl"
Write-Host 'Only this computer can reach it. Close this window to stop.'
Start-Process $StartUrl

$sep = [System.IO.Path]::DirectorySeparatorChar
try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $res = $ctx.Response
    try {
      $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
      $file = $null
      try {
        $rel = $path.TrimStart('/').Replace('/', $sep)
        $full = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($Root, $rel))
        $inside = $full.Equals($Root, [StringComparison]::OrdinalIgnoreCase) -or
          $full.StartsWith($Root + $sep, [StringComparison]::OrdinalIgnoreCase)
        if ($inside) {
          if (Test-Path -LiteralPath $full -PathType Container) { $full = Join-Path $full 'index.html' }
          if (Test-Path -LiteralPath $full -PathType Leaf) {
            $file = $full
          } elseif (-not ([System.IO.Path]::GetFileName($path)).Contains('.')) {
            $file = Join-Path $Root 'index.html'  # app route, e.g. /forge
          }
        }
      } catch {
        $file = $null  # malformed path
      }

      if ($null -eq $file) {
        $res.StatusCode = 404
        $res.ContentType = 'text/plain'
        $bytes = [System.Text.Encoding]::UTF8.GetBytes('Not found')
      } else {
        $ext = [System.IO.Path]::GetExtension($file).ToLowerInvariant()
        if ($Types.ContainsKey($ext)) { $res.ContentType = $Types[$ext] } else { $res.ContentType = 'application/octet-stream' }
        $res.AddHeader('Cache-Control', 'no-cache')
        $res.AddHeader('X-Content-Type-Options', 'nosniff')
        $bytes = [System.IO.File]::ReadAllBytes($file)
      }
      $res.ContentLength64 = $bytes.Length
      if ($ctx.Request.HttpMethod -ne 'HEAD') { $res.OutputStream.Write($bytes, 0, $bytes.Length) }
    } catch {
      # A browser closing a connection early is harmless; keep serving.
    } finally {
      $res.Close()
    }
  }
} finally {
  $listener.Stop()
}
