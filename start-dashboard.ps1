# ============================================================
#  Starts the Streamlit dashboard (OVERVIEW/app.py) that the
#  UI's "Overview dashboard" button opens.
#  Run the backend + UI separately (see README).
# ============================================================

Set-Location "$PSScriptRoot\OVERVIEW"

Write-Host "Starting Streamlit dashboard on http://localhost:8501 ..." -ForegroundColor Cyan

# Use `streamlit` if on PATH, otherwise fall back to `python -m streamlit`.
if (Get-Command streamlit -ErrorAction SilentlyContinue) {
  streamlit run app.py --server.headless true --server.enableCORS false --server.enableXsrfProtection false
} else {
  python -m streamlit run app.py --server.headless true --server.enableCORS false --server.enableXsrfProtection false
}
