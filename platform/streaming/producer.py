"""
Producteur Kafka : rejoue les alertes Suricata dans l'ordre chronologique, comme si la sonde les envoyait en direct.

Deux sources possibles :
  --source gold         : alertes brutes de la couche Gold Spark (variables de flux + requête HTTP), SANS score.
                          Le service de scoring applique les modèles exportés par le notebook 06.  -> mode recommandé
  --source predictions  : alertes déjà notées (anciens résultats, notebook 04). Utile tant que le notebook 06 n'a pas tourné.

Exemples :
  python producer.py --source gold --gold ..\\..\\data\\gold_ml_entrant.parquet --models ..\\..\\models --rate 20
  python producer.py --source predictions --data ..\\..\\data --rate 20
"""
import argparse
import json
import os
import time

import joblib
import pandas as pd
from confluent_kafka import Producer

from common import TOPIC, clean_value, make_text


def events_from_gold(gold_path, models_dir, limit):
    df = pd.read_parquet(gold_path)
    df["ts"] = pd.to_datetime(df["ts"], utc=True)
    if "source_file" in df:
        df = df[df["source_file"].astype(str) != "008"]          # tempête d'alertes exclue
    cfg_path = os.path.join(models_dir, "lgbm_flow.joblib") if models_dir else None
    if cfg_path and os.path.exists(cfg_path):
        meta = joblib.load(cfg_path)
        until = pd.Timestamp(meta["trained_until"])
        until = until.tz_localize("UTC") if until.tzinfo is None else until
        df = df[df["ts"] > until]                      # uniquement la période de TEST (jamais vue par le modèle)
        num, cat = meta["num"], meta["cat"]
        print(f"Période de test (après {until:%Y-%m-%d %H:%M}) : {len(df):,} alertes")
    else:
        df = df.sort_values("ts").iloc[int(len(df) * 0.8):]
        num = ["dest_port", "pkts_toserver", "pkts_toclient", "bytes_toserver", "bytes_toclient", "age", "bytes_ratio",
               "pkts_total", "hour", "dow", "ip_prev_alerts", "ip_gap_s", "hist_flows", "hist_alerted", "hist_alert_rate",
               "is_new_host", "prev1h_flows", "prev1h_alerted", "prev1h_ports"]
        cat = ["proto", "app_proto", "state", "reason"]
        print(f"Modèles introuvables : rejeu des 20 % les plus récents ({len(df):,} alertes)")
    df = df.sort_values(["ts", "flow_id"], kind="mergesort")
    if limit:
        df = df.head(limit)
    keep = ["flow_id", "ts", "src_ip", "dest_ip", "dest_port", "sig", "label", "method", "url", "user_agent", "status"]
    for row in df[list(dict.fromkeys(keep + num + cat))].itertuples(index=False):
        r = row._asdict()
        ev = {k: clean_value(v) for k, v in r.items()}
        ev["kind"] = "raw"
        yield ev


def events_from_predictions(data_dir, limit):
    pred = pd.read_parquet(os.path.join(data_dir, "predictions_hybride.parquet"))
    txt = pd.read_parquet(os.path.join(data_dir, "text_dataset.parquet"),
                          columns=["flow_id", "method", "url", "user_agent", "status"]).drop_duplicates("flow_id")
    df = pred.merge(txt, on="flow_id", how="left")
    df["ts"] = pd.to_datetime(df["ts"], utc=True)
    df = df.sort_values(["ts", "flow_id"], kind="mergesort")
    if limit:
        df = df.head(limit)
    for row in df.itertuples(index=False):
        ev = {k: clean_value(v) for k, v in row._asdict().items()}
        ev["kind"] = "scored"
        yield ev


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", choices=["gold", "predictions"], required=True)
    ap.add_argument("--gold", help="gold_ml_entrant.parquet (notebook 05)")
    ap.add_argument("--models", help="dossier des modèles du notebook 06 (lgbm_flow.joblib)")
    ap.add_argument("--data", help="dossier des anciens résultats (predictions_hybride, text_dataset)")
    ap.add_argument("--rate", type=float, default=20, help="alertes par seconde (0 = le plus vite possible)")
    ap.add_argument("--limit", type=int, default=0, help="nombre maximal d'alertes (0 = toutes)")
    ap.add_argument("--bootstrap", default="localhost:9092")
    ap.add_argument("--topic", default=TOPIC)
    a = ap.parse_args()

    if a.source == "gold":
        if not a.gold:
            ap.error("--gold est obligatoire avec --source gold")
        events = events_from_gold(a.gold, a.models, a.limit)
    else:
        if not a.data:
            ap.error("--data est obligatoire avec --source predictions")
        events = events_from_predictions(a.data, a.limit)

    producer = Producer({"bootstrap.servers": a.bootstrap, "linger.ms": 20, "client.id": "suricata-replay"})
    delay = 1.0 / a.rate if a.rate > 0 else 0
    sent, t0 = 0, time.time()
    try:
        for ev in events:
            producer.produce(a.topic, key=str(ev.get("src_ip", "")), value=json.dumps(ev).encode("utf-8"))
            producer.poll(0)
            sent += 1
            if sent % 500 == 0:
                print(f"{sent:,} alertes envoyées | {sent / (time.time() - t0):.1f}/s | dernière : {ev['ts']}")
            if delay:
                time.sleep(delay)
    except KeyboardInterrupt:
        print("Arrêt demandé.")
    finally:
        producer.flush(10)
        print(f"Terminé : {sent:,} alertes envoyées sur le topic '{a.topic}' en {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
