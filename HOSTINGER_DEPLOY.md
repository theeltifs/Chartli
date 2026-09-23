# Deploying Chartli on Hostinger

Chartli includes a React frontend and a Python/FastAPI backend. Hostinger Web and Cloud hosting do not run Python applications; use a Hostinger VPS with the Docker template.

## Required GitHub configuration

In the GitHub repository, open **Settings → Secrets and variables → Actions**.

Add repository secrets:

- `HOSTINGER_API_KEY` — generated in the Hostinger dashboard under API.
- `GROQ_API_KEY` — the production Groq API key.
- `CHARTLI_PIN` — a clinic PIN with at least six characters.

Add a repository variable:

- `HOSTINGER_VM_ID` — the numeric ID from the VPS hostname or overview URL. For `srv123456.hstgr.cloud`, use `123456`.

Do not upload or commit the local `.env` file.

## Deploy

1. Ensure the VPS uses Hostinger's Docker template.
2. Open the GitHub repository's **Actions** tab.
3. Select **Deploy to Hostinger VPS**.
4. Choose **Run workflow** on the `main` branch.
5. In Hostinger, open **VPS → Manage → Docker Manager → Projects** to monitor the deployment and inspect logs.

The container exposes port `8000`. The React app and API are served from the same origin. SQLite data is stored in the persistent `chartli_data` Docker volume, so redeployments do not erase patient records.

## Domain and HTTPS

Point the chosen domain or subdomain to the VPS IP with an A record. Then assign that domain to the Docker project in Hostinger Docker Manager. Hostinger's reverse proxy terminates HTTPS and forwards traffic to the application on port 8000.

## Local verification

```bash
npm --prefix frontend-react run build
pytest backend/test_main.py -q
docker compose up --build -d
```

Verify `http://localhost:8000/health` returns `{"status":"ok","version":"1.0.0"}`.