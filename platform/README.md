# AI Cybersecurity Data Lake

**An AI-assisted Mini-SOC platform.** It turns thousands of raw network alerts into a short, prioritized and explained list of risky hosts.

Big Data & Deep Learning project, TEK-UP University.

---

## Table of contents

1. [The problem](#the-problem)
2. [The solution](#the-solution)
3. [Architecture](#architecture)
4. [Tech stack](#tech-stack)
5. [Project structure](#project-structure)
6. [Getting started](#getting-started)
7. [Environment variables](#environment-variables)
8. [API reference](#api-reference)
9. [Connecting the ML pipeline](#connecting-the-ml-pipeline)
10. [Troubleshooting](#troubleshooting)
11. [Team](#team)

---

## The problem

Modern infrastructures generate huge volumes of security data: network connections, authentications, DNS queries and system logs. Analysts cannot read it all.

> How can we automatically detect known **and** unknown malicious behavior, and turn it into incidents an analyst can act on?

## The solution

A Mini-SOC platform that collects, stores, processes and analyzes security data to detect, correlate and visualize incidents.

| Capability | What it gives the analyst |
|---|---|
| **Centralized events** | One place for all security events |
| **Data lake** | Bronze (raw), Silver (cleaned and normalized), Gold (ready for analysis) tiers |
| **Known attack detection** | XGBoost / LightGBM classification of labeled attacks |
| **Unknown behavior detection** | Autoencoder / Isolation Forest anomaly detection |
| **Host risk score** | Automatic prioritization: what to handle first |
| **Explainable decisions** | The factors that made a host dangerous, so each decision can be justified |

The model work uses **real Suricata EVE JSON logs** (Kaggle `muttaqien19/dataset-suricata-logs`): 8 files of about 24 GB each, from a university web server, March 2024 to February 2025. There is no attack label in the logs: a **weak label** is derived from Suricata (severity ≤ 2 or network-scan category).

The deployed model is **hybrid**: a TF-IDF model reads the HTTP request (URL and user-agent) when it is visible (about 60% of inbound alerts), otherwise LightGBM scores the flow features. On the test period it reaches an AUC-PR of 0.996 [0.993; 0.998]. Because the label comes from Suricata rules, this measures how well the system **reproduces and prioritizes** Suricata's verdicts, not its ability to find unknown attacks; see the **Models** page in the app.

## Architecture

```
Suricata logs (Kaggle)
        |
    Ingestion
        |
   Data Lake:  Bronze  ->  Silver  ->  Gold
        |
 Feature engineering
     /          \
Classification   Anomaly detection
(known attacks)  (unknown behavior)
     \          /
  Host risk score
        |
   SOC dashboard   <-- this web application
```

This repository contains the **web application** (the last block). It reads hosts and incidents from MongoDB and displays them in the dashboard.

```
Browser (Next.js)  <--HTTP + cookie-->  Express API  <-->  MongoDB
   localhost:3000                       localhost:5000
```

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router), React, plain CSS, Canvas animations |
| Backend | Node.js, Express |
| Database | MongoDB with Mongoose |
| Auth | JWT stored in an httpOnly cookie, passwords hashed with bcrypt |
| Security middleware | Helmet, CORS (restricted to the frontend origin) |
| Project tooling | Git and GitHub, DVC, MLflow, Docker |

## Project structure

```
.
├── backend/
│   ├── server.js              # Express app and MongoDB connection
│   ├── seed.js                # Loads demo hosts and incidents
│   ├── middleware/auth.js     # Protects routes (checks the session cookie)
│   ├── models/                # User, Host, Incident
│   └── routes/
│       ├── auth.js            # signup, login, me, logout
│       └── dashboard.js       # KPIs, hosts, distribution, incidents
└── frontend/
    ├── app/
    │   ├── page.js            # Home page
    │   ├── login/page.js
    │   ├── signup/page.js
    │   ├── dashboard/page.js
    │   ├── layout.js
    │   └── globals.css
    ├── components/            # Navbar, AuthProvider, NetworkCanvas,
    │                          # LiveFeed, CountUp, Reveal
    └── lib/api.js             # Fetch helper (sends the session cookie)
```

## Getting started

### Prerequisites

- **Node.js 20.9 or newer** (`node -v`)
- **MongoDB** running on `mongodb://127.0.0.1:27017` (Community Server installed as a Windows service), or a MongoDB Atlas connection string
- **Python 3.10+** with `pandas`, `pyarrow`, `pymongo` (only to import the real ML results)

### 1. Backend (terminal 1)

```powershell
cd backend
npm install
copy .env.example .env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Paste the generated string after `JWT_SECRET=` in `backend/.env`.

### 2. Load data into MongoDB (choose one)

**Real results of the ML pipeline** (recommended):

```powershell
cd ..\ml
py -m pip install -r requirements.txt
py import_results.py --pred "..\..\data\predictions_test.parquet" --models "..\..\reports\model_results_final.json"
```

Older results of the first prototype (file 001 only): `py import_results.py --data "..\..\data"`.

**Demo data** (no ML outputs needed): `npm run seed` in `backend`.

Then start the API:

```powershell
cd ..\backend
npm run dev
```

You should see `API running on http://localhost:5000`; http://localhost:5000/api/health returns `{"ok":true}`.

### 3. Frontend (terminal 2)

```powershell
cd frontend
npm install
copy .env.local.example .env.local
npm run dev
```

### 4. Use the app

Open http://localhost:3000, **Sign up**, then explore **Dashboard**, **Alerts** (search, filters, triage), a host page (click an IP) and **Models**.

## Real-time streaming (Kafka)

`streaming/` replays the test alerts into a Kafka topic (Docker), scores them on the fly with the exported hybrid model and writes them to MongoDB; the **Live** page shows them every 2 seconds. See `streaming/README.md`.

## Environment variables

**`backend/.env`**

| Variable | Example | Description |
|---|---|---|
| `PORT` | `5000` | Port of the API |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/ai_cyber_datalake` | MongoDB connection string |
| `JWT_SECRET` | *(long random string)* | Secret used to sign session tokens. Never commit it. |
| `CLIENT_URL` | `http://localhost:3000` | Frontend origin allowed by CORS |

Generate a secret with: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

**`frontend/.env.local`**

| Variable | Example | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:5000/api` | Base URL of the API |

## API reference

| Method | Route | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/health` | no | Check that the API is up |
| `POST` | `/api/auth/signup` | no | Create an account and start a session |
| `POST` | `/api/auth/login` | no | Log in and start a session |
| `GET` | `/api/auth/me` | yes | Get the current user |
| `POST` | `/api/auth/logout` | yes | End the session |
| `GET` | `/api/dashboard` | yes | KPIs, riskiest hosts, flagged signature families, alerts per day, latest flagged alerts |
| `GET` | `/api/alerts` | yes | Paginated alerts. Query: `page`, `limit`, `q` (IP, signature, URL, user-agent), `minRisk`, `source`, `flagged`, `status`, `sort` (`risk` or `ts`) |
| `PATCH` | `/api/alerts/:id` | yes | Triage: set `status` to `New`, `Investigating` or `Closed` |
| `GET` | `/api/hosts/:ip` | yes | Host detail: risk, signatures, scoring source, activity per day, latest alerts |
| `GET` | `/api/live` | yes | Alerts written by the Kafka scoring service: throughput, recent alerts, live host ranking |
| `GET` | `/api/models` | yes | Model comparison (AUC-PR, CI, precision, recall, unseen-family recall) and metadata |

## Connecting the ML pipeline

The dashboard reads four MongoDB collections filled by `ml/import_results.py` from the outputs of the ML notebooks (versioned with DVC in the ML repository):

| Input file | Content |
|---|---|
| `predictions_hybride.parquet` | one row per inbound test alert: flow and text probabilities, final score, source |
| `text_dataset.parquet` | HTTP request linked to the alert (method, URL, user-agent) |
| `ml_dataset.parquet` | destination address and protocol |
| `ml/model_results.json` | measured metrics of every compared model |

```powershell
cd ml
pip install -r requirements.txt
python import_results.py --data "C:/path/to/ai-cyber-datalake/data"
```

| Collection | One document per | Main fields |
|---|---|---|
| `incidents` | scored alert | `ts`, `src`, `dst`, `port`, `signature`, `label`, `proba`, `risk`, `source`, `detectedBy`, `flagged`, `url`, `userAgent`, `status` |
| `hosts` | source IP | `risk`, `status`, `factors`, `nAlerts`, `nFlagged`, `flagRate`, `topSignatures`, `firstSeen`, `lastSeen` |
| `modelresults` | compared model | `perimeter`, `aucPr`, `ciLow`, `ciHigh`, `precision`, `recall`, `lofoRecall`, `role`, `note` |
| `metas` | import | period, perimeter, label definition, decision threshold |

Host risk = 0.4 × mean alert risk + 0.3 × share of flagged alerts + 0.3 × volume of flagged alerts (log scale, 1,000 = max). These weights are a design choice.

`npm run seed` still loads **demo** data with the same schema, for running the app without the ML outputs.

## Troubleshooting

**`npm audit` reports vulnerabilities in Next.js.** Upgrade Next and React together, from `frontend/`:
```powershell
npm install next@latest react@latest react-dom@latest
```
Avoid `npm audit fix --force` on its own: it upgrades Next without React.

**The dashboard shows "Check that the API is running and the database is seeded."** Make sure the backend terminal is running, `MONGO_URI` is correct, and you ran `npm run seed`.

**`MongoDB connection failed`.** Start the MongoDB service (or check your Atlas IP allow-list and credentials).

**Login works but you are sent back to the login page.** `CLIENT_URL` in `backend/.env` must exactly match the address in your browser (`http://localhost:3000`), and `NEXT_PUBLIC_API_URL` must point to the API. Restart both servers after changing `.env` files.

**Port already in use.** Change `PORT` in `backend/.env` and update `NEXT_PUBLIC_API_URL` to match.

## Team

- Nawres Ben Mustapha
- Mariem Baalouch
- Rayen Aribi

Presented at TEK-UP University, International Office.
