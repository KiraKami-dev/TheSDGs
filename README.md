# TheSDGs

Three parts:

- **`ui/`** — React + Vite front-end.
- **`backend/`** — FastAPI + agents that power the clean/analyze flow.
- **`OVERVIEW/`** — Streamlit dashboard (`app.py`) with the detailed portfolio view.

## Overview dashboard button

On the results screen (`FieldScreen`), the **"Overview dashboard"** button opens
the live Streamlit dashboard in a modal (embedded via an iframe), with an
"Open in new tab" fallback.

For it to load, the Streamlit dashboard must be running. Start it with either:

```sh
# from the repo root
./start-dashboard.ps1          # PowerShell
start-dashboard.bat            # or double-click on Windows

# or manually
cd OVERVIEW
streamlit run app.py --server.headless true --server.enableCORS false --server.enableXsrfProtection false
```

The dashboard serves at `http://localhost:8501`. To point the UI at a different
host/port, set `VITE_DASHBOARD_URL` in `ui/.env` (see `ui/.env.example`).

The `--server.enableCORS false --server.enableXsrfProtection false` flags let
Streamlit render inside the UI's iframe from a different port; if the iframe is
ever blank, use the modal's "Open in new tab" button.