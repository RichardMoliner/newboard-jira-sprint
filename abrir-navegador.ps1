$ErrorActionPreference = 'SilentlyContinue'
$port = $null

for ($tentativa = 0; $tentativa -lt 60; $tentativa++) {
    for ($p = 5173; $p -le 5199; $p++) {
        $client = New-Object System.Net.Sockets.TcpClient
        try {
            $client.Connect('127.0.0.1', $p)
            if ($client.Connected) {
                $port = $p
            }
        } catch {}
        finally {
            $client.Close()
        }
        if ($port) { break }
    }
    if ($port) { break }
    Start-Sleep -Milliseconds 500
}

if (-not $port) {
    $port = 5173
}

Start-Process "http://localhost:$port"
