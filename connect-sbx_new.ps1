# Sandbox:     sbx_001m490q6b7k2058ymnq8rpb6yw
$ErrorActionPreference = 'Stop'

$CertDeadline = 1791390535
$Now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
if ($Now -ge $CertDeadline) { exit 1 }

$D = New-Item -ItemType Directory -Path (Join-Path $env:TEMP ([System.Guid]::NewGuid().ToString()))
try {
    Set-Content -NoNewline -Path "$D\cert.pub" -Value 'ssh-ed25519-cert-v01@openssh.com AAAAIHNzaC1lZDI1NTE5LWNlcnQtdjAxQG9wZW5zc2guY29tAAAAIARG49Q31ykGB3uoHzrIrWHrIig6NhogvpJ9iGdbf7EXAAAAIA46YUDxEyMtaXJhnvfyj8tJY+TJrXnP3YThDxi62FTCZTQW7g9MPH0AAAABAAAARGJiYWU5MWIyLTdhOWYtNDMyNy05MDljLTAwMzk5YmUxZWIzODpzYnhfMDAxbTQ5MHE2YjdrMjA1OHltbnE4cnBiNnl3AAAASAAAAERiYmFlOTFiMi03YTlmLTQzMjctOTA5Yy0wMDM5OWJlMWViMzg6c2J4XzAwMW00OTBxNmI3azIwNTh5bW5xOHJwYjZ5dwAAAABqxSC5AAAAAGrGc2UAAAAAAAAAEgAAAApwZXJtaXQtcHR5AAAAAAAAAAAAAABoAAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBAYA296ZmtLkwNnl6yMAAGCKfkUnDC1EHfirE1N8G4rwQlKRVOsJDXb+FBUwM4oVptpJaYUhFG1HjjXAdpkEL3YAAABlAAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAABKAAAAIQDZqikSBxcXS6EEBhVDCJRPdbkOvUcbVg4QZg9T13S97gAAACEAuhKsHTx+TnHAlpAtE5kGSjbGXYp2bjF2KVNXmt5ijHI='
    Set-Content -NoNewline -Path "$D\known_hosts" -Value 'ssh.sandboxes-cloud.docker.com ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBGW2iR9lK9z4uiSFkUyL+IK4vvRAfkojeGqZRiGQUwGGJVscBbP01vtUuIhv/LJ4Ht0vQFWbe2mKxIzu2MzNbIw='
    Set-Content -NoNewline -Path "$D\id.pub" -Value 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIA46YUDxEyMtaXJhnvfyj8tJY+TJrXnP3YThDxi62FTC ayman@Aiman'
    
    $Identity = $args[0]
    $Command = $args[1]
    
    ssh -F NUL -i "$Identity" -o CertificateFile="$D\cert.pub" -o UserKnownHostsFile="$D\known_hosts" -o IdentitiesOnly=yes -p 22 "user@ssh.sandboxes-cloud.docker.com" $Command
} finally {
    Remove-Item -Recurse -Force $D
}
