# SuriLake — mini-SOC assisté par IA sur logs Suricata

Projet de module **Deep Learning & Big Data** — TEK-UP.

Une plateforme de type mini-SOC qui stocke **11 mois de logs Suricata réels** (≈ 193 Go) dans un data lake **Bronze / Silver / Gold** (PySpark), note chaque alerte avec un **modèle hybride texte + flux**, rejoue le trafic **en temps réel via Kafka** et présente les résultats dans un **dashboard web** (triage des alertes, risque par hôte, comparaison des modèles).

```
Logs Suricata EVE JSON (8 × 24 Go)
   │  PySpark (notebook 05)
   ▼
Bronze (alert, flow, http) ─► Silver (1 ligne par flux alerté, labels, direction) ─► Gold (variables + texte HTTP)
   │  notebook 06
   ▼
Modèles : LightGBM (flux) + TF-IDF (texte HTTP) ─► fusion  ──► MLflow (suivi + Model Registry)
   │                                                     │
   │ DVC (dvc.yaml : lignée, métriques, graphiques)       ▼
   ▼                                              Kafka ─► service de scoring ─► MongoDB ─► API Express ─► Next.js
predictions_test.parquet ─► import ──────────────────────────────────────────────┘
```

---

## Résultats principaux

Test temporel : **22 déc. 2024 → 11 févr. 2025**, 196 290 alertes entrantes, prévalence 0,242 (AUC-PR d'un modèle sans information).

| Modèle | AUC-PR [IC 95 %] | Précision | Rappel |
|---|---|---|---|
| **Fusion texte + flux (production)** | **0,987 [0,980 ; 0,994]** | **0,999** | **0,895** |
| Aiguillage (texte seul si requête HTTP) | 0,985 [0,978 ; 0,992] | 0,999 | 0,790 |
| TF-IDF + régression logistique (alertes HTTP) | 0,981 | 1,000 | 0,750 |
| Random Forest (flux) | 0,804 | 0,538 | 0,931 |
| LightGBM (flux) | 0,783 [0,662 ; 0,952] | 0,535 | 0,939 |
| Régression logistique (flux) | 0,666 | 0,525 | 0,622 |
| Isolation Forest (non supervisé) | 0,269 | — | — |
| Baseline | 0,242 | — | — |

IC 95 % : bootstrap en rééchantillonnant les **IP sources** (les alertes d'une même IP sont corrélées).

**Constats clés**
- **Dérive** : LightGBM sur les variables de flux passe de 0,944 (déc.) à 0,607 (févr.) ; la fusion reste à 0,996 → 0,980. Le contenu de la requête HTTP résiste à la dérive, les tailles de flux non.
- **Fusion** (w_flux = 0,1, choisi sur la validation) : +10 points de rappel à précision égale par rapport à l'aiguillage, grâce aux attaques cachées dans le corps des requêtes POST (invisibles dans l'URL) que les tailles de flux trahissent.
- **Généralisation** : 38 % des textes du test n'ont jamais été vus à l'entraînement ; AUC-PR 0,968 sur ces alertes.
- **Deep learning** : un MLP (flux) et un Char-CNN (texte, PyTorch) ont été comparés ; ils n'apportent pas de gain significatif face à LightGBM / TF-IDF pour un coût bien supérieur (notebooks 02 et 04).
- **Temps réel** : le service de scoring Kafka reproduit les décisions du notebook à **100 %** (écart de probabilité max 5·10⁻⁵, dû à l'arrondi), en local comme dans Docker.

**Limites** (détaillées dans la page *Models* de la plateforme)
- **Label faible** : dérivé de Suricata (sévérité ≤ 2 ou scan). Un score élevé signifie que le système reproduit et priorise les verdicts de Suricata, pas qu'il découvre des attaques inconnues ; le modèle texte réapprend en partie les règles qui lisent les mêmes URL.
- **Reverse proxy** : `192.168.33.9` retransmet le trafic vers `192.168.33.8` ; ce trajet duplique les alertes entrantes, seul le trafic **entrant** est modélisé.
- Le seuil choisi sur la validation (0,903) est conservateur sur la période de test ; un recalibrage périodique améliorerait le rappel.
- Fichier 008 exclu : tempête de 27,9 M d'alertes TCP en 51 min sur une session défaillante (99,999 % de bruit, 9,7 M doublons).

---

## Données

- Source : Kaggle `muttaqien19/dataset-suricata-logs` — 8 fichiers `eve.json.001…008` (EVE JSON), serveur web d'une université, **12 mars 2024 → 11 février 2025**.
- Bronze : 51,5 M alertes, 81,7 M flux, 30,4 M requêtes HTTP (4,4 Go en Parquet).
- Gold (trafic entrant, hors flux 100 % bruit) : **981 662 alertes**, 28 049 IP, 84 % avec requête HTTP lisible.
- Validation du pipeline Spark contre le prototype pandas : 100 % des positifs retrouvés, labels et variables identiques.

---

## Structure du dépôt

```
ai-cyber-datalake/
├── notebooks/
│   ├── 01_suricata_crisp_dm.ipynb      prototype CRISP-DM (pandas, fichier 001), 5 modèles, diagnostics
│   ├── 02_deep_learning_mlp.ipynb      MLP PyTorch vs LightGBM, bootstrap apparié, score de risque
│   ├── 03_entrant_sortant.ipynb        découverte du reverse proxy, périmètre « trafic entrant »
│   ├── 04_http_deep_learning.ipynb     texte HTTP : TF-IDF, Char-CNN, familles jamais vues, robustesse
│   ├── 05_spark_lakehouse.ipynb        PySpark Bronze / Silver / Gold sur les 8 fichiers
│   └── 06_modeles_finaux.ipynb         modèles finaux 11 mois, fusion, MLflow Registry, exports
├── data/            (DVC)  gold_ml_entrant.parquet, predictions_test.parquet, jeux du prototype
├── models/          (DVC)  lgbm_flow.joblib, tfidf_text.joblib ; hybrid_config.json (Git)
├── reports/                metrics.json, drift_by_month.csv, pr_curve.csv, model_results_final.json
├── scripts/evaluate.py     étape DVC « evaluate »
├── dvc.yaml, dvc.lock      pipeline de reproductibilité
└── platform/
    ├── backend/            API Express (auth JWT, alertes, hôtes, modèles, live)
    ├── frontend/           Next.js (dashboard, triage, fiche hôte, modèles, live)
    ├── ml/                 import_results.py : résultats ML -> MongoDB
    ├── streaming/          Kafka : producer.py, scorer.py, check_live.py
    └── docker-compose.yml  déploiement complet
```

---

## Reproduire

### 1. Données et modèles (Kaggle + DVC)

```powershell
git clone https://github.com/Nawres2000/ai-cyber-datalake.git
cd ai-cyber-datalake
py -m pip install dvc
py -m dvc pull                 # récupère data/ et models/ depuis le stockage DVC
```

Les étapes lourdes tournent sur **Kaggle** (CPU, Internet activé) :
1. `notebooks/05_spark_lakehouse.ipynb` avec le dataset `dataset-suricata-logs` en Input → `gold_ml_entrant.parquet` (~80 min).
2. `notebooks/06_modeles_finaux.ipynb` avec `gold_ml_entrant.parquet` en Input → modèles, prédictions, métriques, base MLflow (~30 min).

### 2. Pipeline DVC (local)

```powershell
py -m dvc dag            # lignée : Spark -> modèles -> évaluation / plateforme
py -m dvc repro          # recalcule les métriques et alimente la plateforme (Docker démarré)
py -m dvc metrics show
py -m dvc plots show     # courbe précision-rappel et dérive mensuelle (dvc_plots/index.html)
```

Les étapes `spark_lakehouse` et `train_models` sont *frozen* (exécutées sur Kaggle) : DVC trace leurs entrées et sorties dans `dvc.lock`.

### 3. Suivi des expériences (MLflow)

```powershell
py -m pip install mlflow
py -m mlflow ui --backend-store-uri sqlite:///mlflow_final.db
```

http://127.0.0.1:5000 : expérience `suricata-final` (8 runs) et **Model Registry** (`suricata-lgbm-flow`, `suricata-tfidf-text`). Les artefacts pointent vers les chemins Kaggle : métriques, paramètres et registre s'affichent, les fichiers de modèles sont dans `models/`.

### 4. Plateforme complète (Docker)

```powershell
cd platform
copy .env.example .env          # mettre une longue chaîne aléatoire dans JWT_SECRET
docker compose up -d --build    # MongoDB, API, site, Kafka, Kafka UI, scoring
docker compose --profile import run --rm importer     # charge les résultats du notebook 06
```

- Site : http://localhost:3000 (créer un compte) — Dashboard, Alerts, Live, Models
- Kafka UI : http://localhost:8080

### 5. Temps réel (rejeu Kafka)

```powershell
docker compose exec mongo mongosh ai_cyber_datalake --quiet --eval "db.incidents.deleteMany({}); db.hosts.deleteMany({})"
docker compose --profile replay up producer           # page Live : alertes notées en direct
cd streaming
py check_live.py --mongo mongodb://127.0.0.1:27018/ai_cyber_datalake   # 100 % de décisions identiques au notebook
```

Mode développement sans Docker pour l'API et le site : voir `platform/README.md` et `platform/streaming/README.md`.

---

## Outils exigés

| Outil | Utilisation |
|---|---|
| **GitHub** | code, notebooks, configuration, historique et contributions de l'équipe |
| **DVC** | versionnement des données et modèles (`dvc add`, `dvc push`) et **pipeline** `dvc.yaml` (lignée, `dvc repro`, métriques, graphiques) |
| **MLflow** | suivi des expériences (paramètres, métriques, artefacts) et **Model Registry** des modèles déployés |

Autres technologies : PySpark, LightGBM, scikit-learn, PyTorch, Kafka, MongoDB, Express, Next.js, Docker.

---

## Équipe

| Membre | Rôle |
|---|---|
| Naoures | IA / ML : modèles, évaluation, MLflow, DVC, pipeline Spark, scoring Kafka |
| *(à compléter)* | Backend & Dashboard : plateforme web initiale (Next.js, Express, MongoDB) |
| *(à compléter)* | Data & Pipeline |
