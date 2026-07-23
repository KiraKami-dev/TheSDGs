@echo off
REM ============================================================
REM  Starts the Streamlit dashboard (OVERVIEW/app.py) that the
REM  UI's "Overview dashboard" button opens.
REM  Run the backend + UI separately (see README).
REM ============================================================

set ROOT=%~dp0

echo Starting Streamlit dashboard (OVERVIEW) on http://localhost:8501 ...
cd /d "%ROOT%OVERVIEW"

REM Use `streamlit` if on PATH, otherwise fall back to `python -m streamlit`.
where streamlit >nul 2>nul
if %ERRORLEVEL%==0 (
  streamlit run app.py --server.headless true --server.enableCORS false --server.enableXsrfProtection false
) else (
  python -m streamlit run app.py --server.headless true --server.enableCORS false --server.enableXsrfProtection false
)
