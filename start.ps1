param(
    [switch]$ClientOnly,
    [switch]$ServerOnly,
    [switch]$NoClient
)

$root = $PSScriptRoot

function Start-InNewWindow($title, $workDir, $command) {
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "& { Set-Location '$workDir'; $command }" -WindowStyle Normal
}

if (-not $ClientOnly) {
    Write-Host "Starting Docker containers (Postgres + Redis)..."
    docker-compose -f "$root\docker-compose.yml" up -d
    if ($LASTEXITCODE -ne 0) {
        Write-Error "docker-compose failed. Is Docker Desktop running?"
        exit 1
    }

    Write-Host "Waiting for services to be ready..."
    Start-Sleep -Seconds 2

    Write-Host "Starting server..."
    Start-InNewWindow "Idle RPG - Server" "$root\server" "npm run dev"
}

if (-not $ServerOnly -and -not $NoClient) {
    Write-Host "Starting client..."
    Start-InNewWindow "Idle RPG - Client" "$root\client" "npm run dev"
}

Write-Host ""
Write-Host "Done. Server: http://localhost:3000 | Client: http://localhost:5173"
