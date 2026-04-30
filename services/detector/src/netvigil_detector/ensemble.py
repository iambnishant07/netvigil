"""AI ensemble: Isolation Forest + Autoencoder + XGBoost.

On first run, models are trained on synthetic data if no pre-trained files are
found in `settings.model_dir`.  In production, pre-trained models (trained on
CICIDS2017 cleaned — Engelen et al. 2021) are loaded from that directory.
"""
from __future__ import annotations

import logging
import os
import pickle
from typing import Any

import numpy as np
import torch
import torch.nn as nn
from sklearn.ensemble import IsolationForest

from netvigil_detector.config import settings
from netvigil_detector.features import N_FEATURES, FEATURE_NAMES, extract

log = logging.getLogger(__name__)

LABELS = ["port_scan", "ddos", "brute_force", "c2_beaconing",
          "data_exfil", "lateral_movement", "unknown_anomaly"]


# ── Autoencoder ────────────────────────────────────────────────────────────────

class _Autoencoder(nn.Module):
    def __init__(self, n_features: int = N_FEATURES) -> None:
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Linear(n_features, 8), nn.ReLU(),
            nn.Linear(8, 4), nn.ReLU(),
        )
        self.decoder = nn.Sequential(
            nn.Linear(4, 8), nn.ReLU(),
            nn.Linear(8, n_features),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.decoder(self.encoder(x))


# ── Model loading / training ───────────────────────────────────────────────────

def _if_path() -> str:
    return os.path.join(settings.model_dir, "isolation_forest.pkl")

def _ae_path() -> str:
    return os.path.join(settings.model_dir, "autoencoder.pt")

def _xgb_path() -> str:
    return os.path.join(settings.model_dir, "xgboost.pkl")


def _train_defaults() -> tuple[IsolationForest, _Autoencoder, Any]:
    log.warning("No pre-trained models found — training on synthetic baseline data.")
    rng = np.random.default_rng(42)
    X = rng.standard_normal((500, N_FEATURES)).astype(np.float32)

    iso = IsolationForest(contamination=0.1, random_state=42)
    iso.fit(X)

    ae = _Autoencoder()
    opt = torch.optim.Adam(ae.parameters(), lr=1e-3)
    t = torch.tensor(X)
    for _ in range(50):
        loss = nn.MSELoss()(ae(t), t)
        opt.zero_grad(); loss.backward(); opt.step()

    try:
        import xgboost as xgb  # type: ignore[import-untyped]
        y = rng.integers(0, len(LABELS), size=500)
        clf = xgb.XGBClassifier(n_estimators=50, max_depth=4, eval_metric="mlogloss", verbosity=0)
        clf.fit(X, y)
    except ImportError:
        clf = None

    return iso, ae, clf


_iso: IsolationForest | None = None
_ae: _Autoencoder | None = None
_xgb: Any | None = None


def load_models() -> None:
    global _iso, _ae, _xgb
    os.makedirs(settings.model_dir, exist_ok=True)

    if os.path.exists(_if_path()) and os.path.exists(_ae_path()) and os.path.exists(_xgb_path()):
        with open(_if_path(), "rb") as f:
            _iso = pickle.load(f)  # noqa: S301
        _ae = _Autoencoder()
        _ae.load_state_dict(torch.load(_ae_path(), weights_only=True))
        with open(_xgb_path(), "rb") as f:
            _xgb = pickle.load(f)  # noqa: S301
        log.info("Loaded pre-trained models from %s", settings.model_dir)
    else:
        _iso, _ae, _xgb = _train_defaults()
        with open(_if_path(), "wb") as f:
            pickle.dump(_iso, f)
        torch.save(_ae.state_dict(), _ae_path())
        if _xgb is not None:
            with open(_xgb_path(), "wb") as f:
                pickle.dump(_xgb, f)
        log.info("Saved default models to %s", settings.model_dir)


# ── Scoring ────────────────────────────────────────────────────────────────────

def score(record: dict[str, Any]) -> tuple[float, str, list[dict[str, Any]]]:
    """Return (anomaly_score 0–1, attack_label, top_features)."""
    assert _iso is not None and _ae is not None

    feat = extract(record)
    x = feat.reshape(1, -1)

    # Isolation Forest: score_samples returns lower = more anomalous, scale to [0,1]
    if_score = float(-_iso.score_samples(x)[0])
    if_score = min(max((if_score + 0.5), 0.0), 1.0)

    # Autoencoder reconstruction error normalised to [0,1]
    t = torch.tensor(x)
    with torch.no_grad():
        recon = _ae(t)
    ae_err = float(nn.MSELoss()(recon, t))
    ae_score = min(ae_err / 5.0, 1.0)

    # Ensemble average
    anomaly_score = float(0.6 * if_score + 0.4 * ae_score)

    # XGBoost classifier
    label = "unknown_anomaly"
    if _xgb is not None:
        try:
            pred = int(_xgb.predict(x)[0])
            label = LABELS[pred] if pred < len(LABELS) else "unknown_anomaly"
        except Exception:
            pass

    # Top-3 features by contribution (absolute value)
    top_features = sorted(
        [{"name": FEATURE_NAMES[i], "value": float(feat[i])} for i in range(N_FEATURES)],
        key=lambda d: abs(d["value"]),
        reverse=True,
    )[:3]

    return anomaly_score, label, top_features
