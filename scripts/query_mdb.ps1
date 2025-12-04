$conn = New-Object System.Data.OleDb.OleDbConnection
$conn.ConnectionString = 'Provider=Microsoft.Jet.OLEDB.4.0;Data Source=C:\IENERGY\WESM2511\Databases\SysWESM25.94.mdb'

try {
    $conn.Open()
    Write-Host "Connected successfully!"

    # Get table names
    $schema = $conn.GetSchema('Tables')
    Write-Host "`nTables in database:"
    $schema | Where-Object { $_.TABLE_TYPE -eq 'TABLE' } | ForEach-Object { Write-Host ("  " + $_.TABLE_NAME) }

    $conn.Close()
} catch {
    Write-Host ("Error: " + $_.Exception.Message)
}
