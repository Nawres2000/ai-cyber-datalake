"""Compare les scores calculés en direct (Kafka -> scorer) avec ceux du notebook 06.

  py check_live.py                                   (MongoDB local, port 27017)
  py check_live.py --mongo mongodb://127.0.0.1:27018/ai_cyber_datalake   (MongoDB du docker-compose)
"""
import argparse
import pandas as pd
from pymongo import MongoClient

ap = argparse.ArgumentParser()
ap.add_argument("--mongo", default="mongodb://127.0.0.1:27017/ai_cyber_datalake")
ap.add_argument("--pred", default=r"..\..\data\predictions_test.parquet")
a = ap.parse_args()

db = MongoClient(a.mongo).get_default_database()
live = pd.DataFrame(list(db.incidents.find({"streamed": True}, {"flowId": 1, "proba": 1, "flagged": 1, "_id": 0})))
ref = pd.read_parquet(a.pred, columns=["flow_id", "p_final", "threshold"])
m = live.merge(ref, left_on="flowId", right_on="flow_id", how="inner")

diff = (m["proba"] - m["p_final"]).abs()
print(f"Alertes notées en direct : {len(live):,} | retrouvées dans le notebook : {len(m):,}")
print(f"Écart de probabilité : max {diff.max():.6f} | moyen {diff.mean():.6f}")
print(f"Écart > 0,001 : {(diff > 0.001).mean():.2%} des alertes")
print(f"Décisions identiques (suspect / non suspect) : {((m['p_final'] >= m['threshold']) == m['flagged']).mean():.2%}")
