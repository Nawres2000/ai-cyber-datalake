"""
Charge les résultats du pipeline ML dans MongoDB pour le dashboard.

Entrées (dossier --data, versionné avec DVC dans le dépôt ML) :
  - predictions_hybride.parquet : une ligne par alerte entrante du test (score hybride texte / flux)
  - text_dataset.parquet        : requête HTTP associée à l'alerte (méthode, URL, user-agent)
  - ml_dataset.parquet          : adresse de destination, protocole
  - model_results.json          : métriques des modèles (fichier à côté de ce script)

Sorties (base MongoDB) : collections incidents, hosts, modelresults, metas.

Usage :
  # résultats finaux du notebook 06 (fichier unique, recommandé)
  python import_results.py --pred "../../data/predictions_test.parquet" --models "../../reports/model_results_final.json"
  # anciens résultats (notebooks 02 à 04, fichier 001)
  python import_results.py --data "../../data"
"""
import argparse
import json
import math
import os
from datetime import datetime, timezone

import numpy as np
import pandas as pd

THRESHOLD = 0.5            # seuil par défaut ; remplacé par la colonne "threshold" du fichier de prédictions si elle existe
PERIMETER = "Inbound alerts (Internet -> reverse proxy 192.168.33.9), test period of eve.json.001"


def load_single(pred_path):
    """Fichier unique produit par le notebook 06 : contient déjà URL, user-agent, destination et seuil."""
    global THRESHOLD, PERIMETER
    p = pd.read_parquet(pred_path)
    if "threshold" in p.columns:
        THRESHOLD = float(p["threshold"].iloc[0])
    PERIMETER = "Inbound alerts, test period of the 11-month Spark Gold dataset (notebook 06)"
    txt = p[["flow_id", "method", "url", "user_agent", "status"]].copy()
    ml = p[["flow_id", "dest_ip", "proto", "app_proto"]].copy()
    pred = p.drop(columns=["method", "url", "user_agent", "status", "dest_ip", "proto", "app_proto", "threshold"], errors="ignore")
    return pred, txt, ml


def load(data_dir):
    pred = pd.read_parquet(os.path.join(data_dir, "predictions_hybride.parquet"))
    txt = pd.read_parquet(os.path.join(data_dir, "text_dataset.parquet"),
                          columns=["flow_id", "method", "url", "user_agent", "status"])
    ml = pd.read_parquet(os.path.join(data_dir, "ml_dataset.parquet"),
                         columns=["flow_id", "dest_ip", "proto", "app_proto"])
    return pred, txt, ml


def none_if_nan(v):
    if v is None:
        return None
    if isinstance(v, float) and math.isnan(v):
        return None
    return v


def build_incidents(pred, txt, ml):
    for d in (pred, txt, ml):
        d["flow_id"] = d["flow_id"].astype("int64")
    df = (pred.merge(txt.drop_duplicates("flow_id"), on="flow_id", how="left")
              .merge(ml.drop_duplicates("flow_id"), on="flow_id", how="left"))
    df["ts"] = pd.to_datetime(df["ts"], utc=True)
    df["flagged"] = df["p_final"] >= THRESHOLD
    is_txt = df["source"].eq("texte_http")

    out = pd.DataFrame({
        "flowId": df["flow_id"].astype("int64"),
        "src": df["src_ip"].astype(str),
        "dst": df["dest_ip"],
        "port": df["dest_port"],
        "proto": df["proto"],
        "appProto": df["app_proto"],
        "signature": df["sig"],
        "label": df["label"].astype(int),
        "proba": df["p_final"].round(4),
        "pFlow": df["p_flux"].round(4),
        "pText": df["p_texte"].round(4),
        "risk": df["risk"].astype(float).round(1),
        "source": np.where(is_txt, "HTTP text", "Flow features"),
        "detectedBy": np.where(is_txt, "TF-IDF (HTTP text)", "LightGBM (flow)"),
        "flagged": df["flagged"].astype(bool),
        "method": df["method"],
        "url": df["url"],
        "userAgent": df["user_agent"],
        "httpStatus": df["status"],
    })
    ts = [t.to_pydatetime() for t in df["ts"]]
    records = out.astype(object).where(pd.notna(out), None).to_dict("records")
    for r, t in zip(records, ts):
        r["ts"] = t
        r["status"] = "New"
        for k in ("port", "httpStatus"):
            if r[k] is not None:
                r[k] = int(r[k])
        for k, v in list(r.items()):
            r[k] = none_if_nan(v)
    return out.assign(ts=df["ts"]), records


def build_hosts(inc):
    """Score d'hôte (choix de conception, voir notebook 02) :
    0,4 × risque moyen + 0,3 × part d'alertes suspectes + 0,3 × volume (log10, 1 000 alertes suspectes = maximum)."""
    g = inc.groupby("src")
    h = g.agg(nAlerts=("flowId", "size"), nFlagged=("flagged", "sum"), riskMean=("risk", "mean"),
              riskMax=("risk", "max"), nPorts=("port", "nunique"),
              firstSeen=("ts", "min"), lastSeen=("ts", "max"),
              httpShare=("source", lambda s: float((s == "HTTP text").mean())))
    h["flagRate"] = 100 * h["nFlagged"] / h["nAlerts"]
    h["volume"] = 100 * np.minimum(1, np.log10(h["nFlagged"] + 1) / 3)
    h["risk"] = (0.4 * h["riskMean"] + 0.3 * h["flagRate"] + 0.3 * h["volume"]).round(1)

    top = (inc[inc["flagged"]].groupby(["src", "signature"]).size()
             .rename("n").reset_index().sort_values(["src", "n"], ascending=[True, False]))
    top_map = {ip: list(zip(grp["signature"].head(3), grp["n"].head(3))) for ip, grp in top.groupby("src")}

    docs = []
    for ip, r in h.iterrows():
        sigs = top_map.get(ip, [])
        parts = [f"{int(r.nFlagged)}/{int(r.nAlerts)} alerts flagged"]
        if sigs:
            parts.append(", ".join(f"{s} ({n})" for s, n in sigs[:2]))
        parts.append("mostly HTTP content" if r.httpShare >= 0.5 else "mostly flow features")
        risk = float(r.risk)
        docs.append({
            "ip": ip, "risk": risk,
            "status": "Investigate" if risk >= 85 else "Review" if risk >= 60 else "Monitor",
            "factors": " · ".join(parts),
            "nAlerts": int(r.nAlerts), "nFlagged": int(r.nFlagged),
            "flagRate": round(float(r.flagRate), 1), "riskMean": round(float(r.riskMean), 1),
            "riskMax": float(r.riskMax), "nPorts": int(r.nPorts),
            "httpShare": round(float(r.httpShare), 3),
            "topSignatures": [{"signature": s, "count": int(n)} for s, n in sigs],
            "firstSeen": r.firstSeen.to_pydatetime(), "lastSeen": r.lastSeen.to_pydatetime(),
        })
    return docs


def build_meta(inc):
    return {
        "periodStart": inc["ts"].min().to_pydatetime(), "periodEnd": inc["ts"].max().to_pydatetime(),
        "nAlerts": int(len(inc)), "nFlagged": int(inc["flagged"].sum()), "nHosts": int(inc["src"].nunique()),
        "threshold": THRESHOLD,
        "perimeter": PERIMETER,
        "label": "Weak label v1: Suricata severity <= 2 or network-scan category",
        "system": "Hybrid: TF-IDF on HTTP request text when available, otherwise LightGBM on flow features",
        "generatedAt": datetime.now(timezone.utc),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pred", help="fichier unique predictions_test.parquet (notebook 06)")
    ap.add_argument("--data", help="dossier des anciens fichiers (predictions_hybride, text_dataset, ml_dataset)")
    ap.add_argument("--mongo", default=os.environ.get("MONGO_URI", "mongodb://127.0.0.1:27017/ai_cyber_datalake"))
    ap.add_argument("--models", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "model_results.json"))
    a = ap.parse_args()

    from pymongo import MongoClient, ASCENDING, DESCENDING, ReplaceOne

    if not (a.pred or a.data):
        ap.error("donner --pred (notebook 06) ou --data (anciens résultats)")
    pred, txt, ml = load_single(a.pred) if a.pred else load(a.data)
    inc, inc_docs = build_incidents(pred, txt, ml)
    host_docs = build_hosts(inc)
    meta = build_meta(inc)
    models = json.load(open(a.models, encoding="utf-8"))

    db = MongoClient(a.mongo).get_default_database()
    for name in ("incidents", "hosts", "modelresults", "metas"):
        db[name].delete_many({})
    db.incidents.insert_many(inc_docs, ordered=False)
    # upsert par IP : robuste si le service de scoring Kafka écrit des hôtes en même temps
    db.hosts.bulk_write([ReplaceOne({"ip": h["ip"]}, h, upsert=True) for h in host_docs], ordered=False)
    db.modelresults.insert_many(models, ordered=False)
    db.metas.insert_one(meta)

    db.incidents.create_index([("ts", DESCENDING)])
    db.incidents.create_index([("risk", DESCENDING)])
    db.incidents.create_index([("src", ASCENDING), ("ts", DESCENDING)])
    db.incidents.create_index([("flagged", ASCENDING)])
    db.hosts.create_index([("risk", DESCENDING)])

    print(f"incidents : {len(inc_docs):,} (suspectes : {meta['nFlagged']:,})")
    print(f"hosts     : {len(host_docs):,} (risque >= 80 : {sum(h['risk'] >= 80 for h in host_docs)})")
    print(f"modèles   : {len(models)}")
    print(f"période   : {meta['periodStart']} -> {meta['periodEnd']}")


if __name__ == "__main__":
    main()
