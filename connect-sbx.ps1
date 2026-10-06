$ErrorActionPreference = 'Stop'

if ($args.Count -ge 1 -and ($args[0] -eq '-h' -or $args[0] -eq '--help')) {
    exit 0
}

$CertDeadline = 1791378196
$Now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
if ($Now -ge $CertDeadline) {
    Write-Error 'Expired'
    exit 1
}

$D = New-Item -ItemType Directory -Path (Join-Path $env:TEMP ([System.Guid]::NewGuid().ToString()))
try {
    Set-Content -NoNewline -Path "$D\cert.pub" -Value @'
ssh-ed25519-cert-v01@openssh.com AAAAIHNzaC1lZDI1NTE5LWNlcnQtdjAxQG9wZW5zc2guY29tAAAAIFRjT5aO6ahOHkWTb10tTTQi4uHnD9DXmWtbrfYni84NAAAAIA46YUDxEyMtaXJhnvfyj8tJY+TJrXnP3YThDxi62FTCepMLVXzHEfwAAAABAAAARGJiYWU5MWIyLTdhOWYtNDMyNy05MDljLTAwMzk5YmUxZWIzODpzYnhfMDAxbTQ4ZDk1M2puOTQzbmVlcWs2ejM4NWV5AAAASAAAAERiYmFlOTFiMi03YTlmLTQzMjctOTA5Yy0wMDM5OWJlMWViMzg6c2J4XzAwMW00OGQ5NTNqbjk0M25lZXFrNnozODVleQAAAABqxPCGAAAAAGrGQzIAAAAAAAAAEgAAAApwZXJtaXQtcHR5AAAAAAAAAAAAAABoAAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBAYA296ZmtLkwNnl6yMAAGCKfkUnDC1EHfirE1N8G4rwQlKRVOsJDXb+FBUwM4oVptpJaYUhFG1HjjXAdpkEL3YAAABkAAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAABJAAAAIQCvTZNLODilyXZoZsIlFLC24+8TWtDMJLNxXxRb7v8SUQAAACAWhE1Eacx/kMiDb1a/VmBgjHE0MRff6yvMzWDnvfRR5w==
'@
    Set-Content -NoNewline -Path "$D\known_hosts" -Value @'
ssh.sandboxes-cloud.docker.com ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBGW2iR9lK9z4uiSFkUyL+IK4vvRAfkojeGqZRiGQUwGGJVscBbP01vtUuIhv/LJ4Ht0vQFWbe2mKxIzu2MzNbIw=
'@
    Set-Content -NoNewline -Path "$D\id.pub" -Value @'
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIA46YUDxEyMtaXJhnvfyj8tJY+TJrXnP3YThDxi62FTC ayman@Aiman
'@

    if ($args.Count -ge 1) {
        $Identity = $args[0]
        $AgentOpt = @()
    } else {
        $Identity = "$D\id.pub"
        $AgentOpt = @()
    }

    $sshArgs = @("-F", "NUL", "-i", $Identity)
    if ($AgentOpt.Length -gt 0) { $sshArgs += $AgentOpt }
    $sshArgs += @("-o", "CertificateFile=$D\cert.pub", "-o", "UserKnownHostsFile=$D\known_hosts", "-o", "IdentitiesOnly=yes", "-o", "StrictHostKeyChecking=yes", "-p", "22", "user@ssh.sandboxes-cloud.docker.com")
    
    if ($args.Count -gt 1) {
        $sshArgs += $args[1..($args.Count-1)]
    }

    & ssh @sshArgs
} finally {
    Remove-Item -Recurse -Force $D
}
