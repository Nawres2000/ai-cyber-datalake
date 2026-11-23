# Streaming : rejeu Kafka + scoring en temps réel

```
Alertes Gold (période de test)        Kafka (Docker)            Service de scoring             MongoDB          Dashboard
  producer.py  ── JSON ──►  topic suricata.alerts  ──►  scorer.py (TF-IDF / LightGBM)  ──►  incidents  ──►  page Live
                                                                                     └─►  hosts (score mis à jour)
```

- **producer.py** rejoue les alertes dans l'ordre chronologique (`--rate` alertes/seconde), clé Kafka = IP source.
- **scorer.py** lit le topic par lots, applique le système hybride exporté par le notebook 06 (texte si requête HTTP, sinon flux), écrit chaque alerte notée dans `incidents` et met à jour le score de l'hôte (pipeline d'agrégation MongoDB, atomique).
- Le topic peut être inspecté dans **Kafka UI** : http://localhost:8080.

## Lancer (Windows, 4 terminaux)

Prérequis : Docker Desktop démarré, MongoDB local (service Windows), l'API et le site lancés (`npm run dev` dans `backend` et `frontend`).

```powershell
# 1. Kafka
cd platform\streaming
docker compose up -d
docker compose ps                     # kafka "healthy", kafka-ui "running"

# 2. Dépendances Python (une fois)
py -m pip install -r requirements.txt

# 3. Service de scoring (terminal A) : --fresh vide les alertes et les hôtes pour une démo en direct
py scorer.py --models ..\..\models --fresh

# 4. Producteur (terminal B)
py producer.py --source gold --gold ..\..\data\gold_ml_entrant.parquet --models ..\..\models --rate 20
```

Ouvrir http://localhost:3000/live : les alertes arrivent, le débit et le classement des hôtes se mettent à jour toutes les 2 secondes.

**Avant le notebook 06** (pas encore de modèles exportés) : rejouer les anciens résultats déjà notés.

```powershell
py scorer.py --fresh
py producer.py --source predictions --data ..\..\data --rate 20
```

**Revenir aux résultats complets** après la démo : `py ..\ml\import_results.py --pred ..\..\data\predictions_test.parquet --models ..\..\reports\model_results_final.json`.

## Arrêter

Ctrl+C dans les terminaux du producteur et du scoring, puis `docker compose down`.

## Limites

- C'est un **rejeu** de logs historiques, pas une connexion à une sonde Suricata en production ; les variables de profil d'hôte viennent de la couche Gold (calculées par Spark), elles ne sont pas recalculées en flux.
- Un seul broker Kafka, sans réplication : suffisant pour démontrer le pipeline, pas pour la production.
