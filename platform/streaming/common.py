"""Fonctions partagées par le producteur et le service de scoring."""
import math
import re

import numpy as np
import pandas as pd

TOPIC = "suricata.alerts"


def clean_value(v):
    """Convertit les types numpy / pandas en types JSON simples."""
    if v is None:
        return None
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating, float)):
        return None if math.isnan(float(v)) else float(v)
    if isinstance(v, (np.bool_,)):
        return bool(v)
    if isinstance(v, pd.Timestamp):
        return v.isoformat()
    return v


def make_text(method, url, user_agent):
    """Même format que l'entraînement (notebooks 04, 05, 06) : 'METHODE URL || USER-AGENT'."""
    if not url:
        return None
    return f"{method or ''} {str(url)[:500]} || {str(user_agent or '')[:300]}".strip()


def make_X(df, num, cat, features):
    """Même encodage que l'entraînement : one-hot des catégorielles, colonnes alignées sur le train."""
    X = pd.get_dummies(df.reindex(columns=num + cat), columns=cat, dummy_na=True).astype("float32").fillna(0)
    X.columns = [re.sub(r"[^0-9a-zA-Z_]", "_", c) for c in X.columns]
    return X.reindex(columns=features, fill_value=0)
