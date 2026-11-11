$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$assets = Join-Path $PSScriptRoot 'assets'
New-Item -ItemType Directory -Path $assets -Force | Out-Null
$bitmap = [Drawing.Bitmap]::new(256,256)
$g = [Drawing.Graphics]::FromImage($bitmap)
$g.Clear([Drawing.Color]::FromArgb(18,20,23))
$white = [Drawing.SolidBrush]::new([Drawing.Color]::FromArgb(237,239,234))
$gold = [Drawing.SolidBrush]::new([Drawing.Color]::FromArgb(223,178,115))
$g.FillRectangle($white,40,40,76,76)
$g.FillRectangle($white,140,40,76,76)
$g.FillRectangle($white,40,140,76,76)
$g.FillRectangle($gold,140,140,76,76)
$bitmap.Save((Join-Path $assets 'workbench-icon.png'),[Drawing.Imaging.ImageFormat]::Png)
$stream = [IO.MemoryStream]::new()
$bitmap.Save($stream,[Drawing.Imaging.ImageFormat]::Png)
$bytes = $stream.ToArray()
$file = [IO.File]::Create((Join-Path $assets 'workbench.ico'))
$writer = [IO.BinaryWriter]::new($file)
$writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]1)
$writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0)
$writer.Write([uint16]1); $writer.Write([uint16]32)
$writer.Write([uint32]$bytes.Length); $writer.Write([uint32]22); $writer.Write($bytes)
$writer.Dispose(); $stream.Dispose(); $g.Dispose(); $bitmap.Dispose(); $white.Dispose(); $gold.Dispose()
$name = ([char]0x5c79).ToString() + [char]0x7acb + [char]0x5de5 + [char]0x4f5c + [char]0x53f0
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) ($name + '.lnk')))
$shortcut.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $PSScriptRoot 'start-workbench.ps1') + '"'
$shortcut.WorkingDirectory = $PSScriptRoot
$shortcut.IconLocation = (Join-Path $assets 'workbench.ico') + ',0'
$shortcut.Description = 'Open local workbench; start service if needed'
$shortcut.Save()
Write-Output $shortcut.FullName
