# AI Cybersecurity Data Lake — mini-SOC assisté par IA

Projet de module TEK-UP (Deep Learning & Big Data), trinôme.

## Équipe et rôles
- Naoures : IA / ML (modèles, comparaison, MLflow)
- ... : Data & Pipeline (ingestion, Bronze/Silver/Gold, DVC)
- ... : Backend & Dashboard (API, interface)

## Données
Logs Suricata EVE JSON (Kaggle : muttaqien19/dataset-suricata-logs), serveur web universitaire.
Les données et modèles sont versionnés avec **DVC** (pas dans Git).

## Structure
- `notebooks/` : notebook CRISP-DM (extraction, features, modèles, évaluation, score de risque)
- `data/` : jeu ML (suivi DVC)
- `models/` : modèle final (suivi DVC)
- `reports/` : rapports de validation

## Outils
GitHub (code, issues) · DVC (données) · MLflow (expériences)

## Reproduire
pip install -r requirements.txt
dvc pull