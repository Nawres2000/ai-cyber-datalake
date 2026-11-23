"""
Étape DVC « evaluate » : recalcule les métriques du système retenu à partir des prédictions du notebook 06.
Sorties suivies par DVC : reports/metrics.json (dvc metrics), reports/drift_by_month.csv et reports/pr_curve.csv (dvc plots).
"""
import json
import os

import numpy as np
import pandas as pd
from sklearn.metrics import (average_precision_score, f1_score, precision_recall_curve, precision_score,
                             recall_score, roc_auc_score)

PRED = "data/predictions_test.parquet"
OUT = "reports"


def main():
    p = pd.read_parquet(PRED)
    p["ts"] = pd.to_datetime(p["ts"], utc=True)
    y, s, f = p["label"].values, p["p_final"].values, p["p_flux"].values
    thr = float(p["threshold"].iloc[0]) if "threshold" in p else 0.5
    pred = (s >= thr).astype(int)

    metrics = {
        "n_test": int(len(p)),
        "prevalence": round(float(y.mean()), 4),
        "share_http_text": round(float((p["source"] == "texte_http").mean()), 4),
        "period": [str(p["ts"].min()), str(p["ts"].max())],
        "hybrid_fusion": {
            "auc_pr": round(float(average_precision_score(y, s)), 4),
            "roc_auc": round(float(roc_auc_score(y, s)), 4),
            "precision": round(float(precision_score(y, pred, zero_division=0)), 4),
            "recall": round(float(recall_score(y, pred, zero_division=0)), 4),
            "f1": round(float(f1_score(y, pred, zero_division=0)), 4),
            "threshold": round(thr, 4),
        },
        "lightgbm_flow": {
            "auc_pr": round(float(average_precision_score(y, f)), 4),
            "roc_auc": round(float(roc_auc_score(y, f)), 4),
        },
    }

    month = p["ts"].dt.strftime("%Y-%m")
    rows = []
    for m in sorted(month.unique()):
        k = (month == m).values
        if 0 < y[k].sum() < k.sum():
            rows.append({"month": m, "alerts": int(k.sum()), "prevalence": round(float(y[k].mean()), 4),
                         "auc_pr_hybrid": round(float(average_precision_score(y[k], s[k])), 4),
                         "auc_pr_flow": round(float(average_precision_score(y[k], f[k])), 4)})
    drift = pd.DataFrame(rows)

    prec, rec, _ = precision_recall_curve(y, s)
    idx = np.unique(np.linspace(0, len(prec) - 1, num=min(400, len(prec))).astype(int))
    pr = pd.DataFrame({"recall": rec[idx].round(4), "precision": prec[idx].round(4)})

    os.makedirs(OUT, exist_ok=True)
    json.dump(metrics, open(f"{OUT}/metrics.json", "w"), indent=1)
    drift.to_csv(f"{OUT}/drift_by_month.csv", index=False)
    pr.to_csv(f"{OUT}/pr_curve.csv", index=False)
    print(json.dumps(metrics, indent=1))
    print(drift.to_string(index=False))


if __name__ == "__main__":
    main()
