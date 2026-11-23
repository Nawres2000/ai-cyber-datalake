"""
Service de scoring en flux : lit le topic Kafka, applique le système hybride, écrit dans MongoDB.

  - alerte avec requête HTTP  -> fusion : w_flow × LightGBM (flux) + (1 − w_flow) × TF-IDF (texte)
  - alerte sans requête HTTP  -> LightGBM sur les variables de flux
  (w_flow et le seuil sont lus dans hybrid_config.json, exporté par le notebook 06)
  - le score d'hôte est mis à jour à chaque alerte (même formule que import_results.py)

Le dashboard (pages Dashboard et Live) affiche les résultats au fur et à mesure.

Exemples :
  python scorer.py --models ..\\..\\models --fresh        # repart d'une base vide (démo « temps réel »)
  python scorer.py                                        # sans modèles : utilise les scores déjà présents (--source predictions)
"""
import argparse
import json
import os
import time
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
from confluent_kafka import Consumer
from pymongo import MongoClient, UpdateOne, InsertOne

from common import TOPIC, make_text, make_X


class HybridModel:
    def __init__(self, models_dir):
        self.flow = joblib.load(os.path.join(models_dir, "lgbm_flow.joblib"))
        self.text = joblib.load(os.path.join(models_dir, "tfidf_text.joblib"))
        cfg_path = os.path.join(models_dir, "hybrid_config.json")
        cfg = json.load(open(cfg_path)) if os.path.exists(cfg_path) else {}
        self.threshold = cfg.get("threshold", self.text.get("threshold", 0.5))
        self.w_flow = float(cfg.get("w_flow", self.text.get("w_flow", 0.0)))   # 0 = aiguillage pur (ancienne version)

    def score(self, events):
        df = pd.DataFrame(events)
        X = make_X(df, self.flow["num"], self.flow["cat"], self.flow["features"])
        p_flow = self.flow["model"].predict_proba(X)[:, 1]
        texts = [make_text(e.get("method"), e.get("url"), e.get("user_agent")) for e in events]
        has = np.array([t is not None for t in texts])
        p_text = np.full(len(events), np.nan)
        if has.any():
            p_text[has] = self.text["model"].predict_proba([t for t in texts if t is not None])[:, 1]
        p_final = np.where(has, self.w_flow * p_flow + (1 - self.w_flow) * np.nan_to_num(p_text), p_flow)
        return p_flow, p_text, p_final, has


def host_update(ip, ts, risk, flagged):
    """Mise à jour incrémentale du score d'hôte (pipeline d'agrégation MongoDB, une seule opération atomique)."""
    f = 1 if flagged else 0
    return UpdateOne({"ip": ip}, [
        {"$set": {
            "sumRisk": {"$add": [{"$ifNull": ["$sumRisk", {"$multiply": [{"$ifNull": ["$riskMean", 0]},
                                                                          {"$ifNull": ["$nAlerts", 0]}]}]}, risk]},
            "nAlerts": {"$add": [{"$ifNull": ["$nAlerts", 0]}, 1]},
            "nFlagged": {"$add": [{"$ifNull": ["$nFlagged", 0]}, f]},
            "riskMax": {"$max": [{"$ifNull": ["$riskMax", 0]}, risk]},
            "firstSeen": {"$ifNull": ["$firstSeen", ts]},
            "lastSeen": ts,
        }},
        {"$set": {"riskMean": {"$round": [{"$divide": ["$sumRisk", "$nAlerts"]}, 1]},
                  "flagRate": {"$round": [{"$multiply": [100, {"$divide": ["$nFlagged", "$nAlerts"]}]}, 1]}}},
        {"$set": {"risk": {"$round": [{"$add": [
            {"$multiply": [0.4, "$riskMean"]}, {"$multiply": [0.3, "$flagRate"]},
            {"$multiply": [30, {"$min": [1, {"$divide": [{"$log10": {"$add": ["$nFlagged", 1]}}, 3]}]}]}]}, 1]}}},
        {"$set": {"status": {"$switch": {"branches": [{"case": {"$gte": ["$risk", 85]}, "then": "Investigate"},
                                                       {"case": {"$gte": ["$risk", 60]}, "then": "Review"}],
                                          "default": "Monitor"}},
                  "factors": {"$concat": ["live: ", {"$toString": "$nFlagged"}, "/", {"$toString": "$nAlerts"},
                                          " alerts flagged"]}}},
    ], upsert=True)


def to_doc(ev, p_flow, p_text, p_final, has, threshold, now):
    risk = round(float(p_final) * 100, 1)
    ts = pd.Timestamp(ev["ts"]).to_pydatetime()
    return {
        "flowId": ev.get("flow_id"), "ts": ts, "src": ev.get("src_ip"), "dst": ev.get("dest_ip"),
        "port": int(ev["dest_port"]) if ev.get("dest_port") is not None else None,
        "proto": ev.get("proto"), "appProto": ev.get("app_proto"), "signature": ev.get("sig"),
        "label": ev.get("label"), "proba": round(float(p_final), 4),
        "pFlow": None if p_flow is None or np.isnan(p_flow) else round(float(p_flow), 4),
        "pText": None if p_text is None or np.isnan(p_text) else round(float(p_text), 4),
        "risk": risk, "flagged": bool(p_final >= threshold),
        "source": "HTTP text" if has else "Flow features",
        "detectedBy": "TF-IDF (HTTP text)" if has else "LightGBM (flow)",
        "method": ev.get("method"), "url": ev.get("url"), "userAgent": ev.get("user_agent"),
        "httpStatus": int(ev["status"]) if ev.get("status") is not None else None,
        "status": "New", "streamed": True, "ingestedAt": now,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", help="dossier contenant lgbm_flow.joblib, tfidf_text.joblib, hybrid_config.json")
    ap.add_argument("--mongo", default=os.environ.get("MONGO_URI", "mongodb://127.0.0.1:27017/ai_cyber_datalake"))
    ap.add_argument("--bootstrap", default="localhost:9092")
    ap.add_argument("--topic", default=TOPIC)
    ap.add_argument("--group", default="suricata-scorer")
    ap.add_argument("--fresh", action="store_true", help="vide les alertes et les hôtes avant de commencer")
    ap.add_argument("--threshold", type=float, help="seuil de décision (par défaut : celui du notebook 06, sinon 0,5)")
    a = ap.parse_args()

    model = HybridModel(a.models) if a.models and os.path.exists(os.path.join(a.models, "lgbm_flow.joblib")) else None
    threshold = a.threshold or (model.threshold if model else 0.5)
    print("Modèles :", "chargés depuis " + a.models if model else "aucun (scores fournis par le producteur)",
          f"| seuil : {threshold:.3f}" + (f" | fusion w_flow = {model.w_flow}" if model else ""))

    db = MongoClient(a.mongo).get_default_database()
    if a.fresh:
        db.incidents.delete_many({})
        db.hosts.delete_many({})
        db.metas.update_one({}, {"$set": {"perimeter": "Live stream from Kafka (replay of the test period)",
                                          "threshold": threshold, "generatedAt": datetime.now(timezone.utc)},
                                 "$unset": {"periodStart": "", "periodEnd": ""}}, upsert=True)
        print("Base vidée (alertes et hôtes) : le dashboard va se remplir en direct.")

    consumer = Consumer({"bootstrap.servers": a.bootstrap, "group.id": a.group,
                         "auto.offset.reset": "earliest", "enable.auto.commit": True})
    consumer.subscribe([a.topic])
    n, n_flag, t0, last = 0, 0, time.time(), time.time()
    print(f"En écoute sur '{a.topic}' ({a.bootstrap})… Ctrl+C pour arrêter.")
    try:
        while True:
            msgs = consumer.consume(num_messages=200, timeout=1.0)
            events = [json.loads(m.value()) for m in msgs if m.error() is None]
            if not events:
                continue
            now = datetime.now(timezone.utc)
            raw = model is not None and events[0].get("kind") == "raw"
            if raw:
                p_flow, p_text, p_final, has = model.score(events)
            else:                                   # alertes déjà notées (ou pas de modèle chargé)
                p_final = np.array([e.get("p_final", 0.0) or 0.0 for e in events], dtype=float)
                p_flow = np.array([np.nan if e.get("p_flux") is None else e["p_flux"] for e in events], dtype=float)
                p_text = np.array([np.nan if e.get("p_texte") is None else e["p_texte"] for e in events], dtype=float)
                has = np.array([e.get("source") == "texte_http" or bool(e.get("url")) for e in events])
            docs = [to_doc(e, p_flow[i], p_text[i], p_final[i], bool(has[i]), threshold, now) for i, e in enumerate(events)]
            db.incidents.bulk_write([InsertOne(d) for d in docs], ordered=False)
            db.hosts.bulk_write([host_update(d["src"], d["ts"], d["risk"], d["flagged"]) for d in docs], ordered=True)
            ts_list = [d["ts"] for d in docs]
            db.metas.update_one({}, {"$min": {"periodStart": min(ts_list)}, "$max": {"periodEnd": max(ts_list)},
                                     "$inc": {"nAlerts": len(docs), "nFlagged": sum(d["flagged"] for d in docs)}},
                                upsert=True)
            n += len(docs); n_flag += sum(d["flagged"] for d in docs)
            if time.time() - last > 5:
                print(f"{n:,} alertes notées ({n_flag:,} suspectes) | {n / (time.time() - t0):.1f}/s | dernière : {ts_list[-1]}")
                last = time.time()
    except KeyboardInterrupt:
        print("Arrêt demandé.")
    finally:
        consumer.close()
        print(f"Total : {n:,} alertes notées, {n_flag:,} suspectes.")


if __name__ == "__main__":
    main()
