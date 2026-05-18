#!/usr/bin/env python3
"""Train the AankhaNet AI ensemble on CICIDS2017 (UNB original).

Usage
-----
    cd services/detector
    uv pip install -e ".[dev]" pandas
    python scripts/train_cicids.py C:/path/to/TrainingDatas/MachineLearningCVE/ --output models/

After running, commit the four output files:
    models/scaler.pkl           (~1 KB)
    models/isolation_forest.pkl (~2 MB)
    models/autoencoder.pt       (~15 KB)
    models/xgboost.pkl          (~3 MB)

Railway will find them on startup and log "Loaded pre-trained models"
instead of the synthetic-training warning.

Dataset: https://www.unb.ca/cic/datasets/ids-2017.html
Reference: ISCX / CIC-IDS-2017, UNB Canadian Institute for Cybersecurity.
Label quality issues documented in Engelen et al. (2021) "Troubleshooting
an Intrusion Detection Dataset: the CICIDS2017 Case Study," IEEE S&P.
"""
from __future__ import annotations

import argparse
import logging
import os
import pickle
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.getLogger(__name__)

# ── Column mapping ─────────────────────────────────────────────────────────────
# Verified against actual UNB MachineLearningCVE headers (all stripped).
# "Source Port" and "Protocol" are absent from this UNB release; those two
# features remain 0 during training (models learn to down-weight them) and are
# populated from live NetFlow records at inference time.
CICIDS_COLS: dict[str, str] = {
    "Flow Duration":                "duration_raw",  # microseconds → converted below
    "Total Length of Fwd Packets":  "in_bytes",
    "Total Length of Bwd Packets":  "out_bytes",
    "Total Fwd Packets":            "in_pkts",
    "Total Backward Packets":       "out_pkts",
    "Flow Packets/s":               "pkt_rate",
    "Flow Bytes/s":                 "byte_rate",
    "Destination Port":             "dst_port",
    "SYN Flag Count":               "tcp_flags",    # more discriminative than Fwd PSH Flags
}

# Must match FEATURE_NAMES in features.py exactly — order matters.
FEATURE_ORDER: list[str] = [
    "duration_ms",   # derived: duration_raw / 1000
    "in_bytes",
    "out_bytes",
    "in_pkts",
    "out_pkts",
    "bytes_per_pkt", # derived: in_bytes / max(in_pkts, 1)
    "pkt_rate",
    "byte_rate",
    "protocol",      # absent in CICIDS → 0; live NetFlow supplies actual value
    "src_port",      # absent in CICIDS → 0; live NetFlow supplies actual value
    "dst_port",
    "tcp_flags",
]

# Must match LABELS in ensemble.py exactly.
LABELS: list[str] = [
    "port_scan", "ddos", "brute_force", "c2_beaconing",
    "data_exfil", "lateral_movement", "unknown_anomaly",
]

# ── Label mapping ──────────────────────────────────────────────────────────────
# None → benign (used for IF + AE training, excluded from XGBoost).
# UNB files use Windows-1252 encoding (read with cp1252 so \x96 → en-dash –).
RAW_LABEL_MAP: dict[str, str | None] = {
    "BENIGN":                        None,
    "PortScan":                      "port_scan",
    "DDoS":                          "ddos",
    "DoS Hulk":                      "ddos",
    "DoS GoldenEye":                 "ddos",
    "DoS slowloris":                 "ddos",
    "DoS Slowhttptest":              "ddos",
    "FTP-Patator":                   "brute_force",
    "SSH-Patator":                   "brute_force",
    # UNB CSVs store U+FFFD where en-dash should be; normalized before lookup below
    "Web Attack – Brute Force":   "brute_force",
    "Web Attack – XSS":           "unknown_anomaly",
    "Web Attack – Sql Injection": "unknown_anomaly",
    "Bot":                           "c2_beaconing",
    "Infiltration":                  "data_exfil",
    "Heartbleed":                    "unknown_anomaly",
}


# ── Autoencoder — must mirror ensemble.py exactly ─────────────────────────────

class _Autoencoder(nn.Module):
    def __init__(self, n_features: int = 12) -> None:
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Linear(n_features, 8), nn.ReLU(),
            nn.Linear(8, 4),          nn.ReLU(),
        )
        self.decoder = nn.Sequential(
            nn.Linear(4, 8),          nn.ReLU(),
            nn.Linear(8, n_features),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.decoder(self.encoder(x))


# ── Data loading ───────────────────────────────────────────────────────────────

def load_csvs(data_dir: Path) -> pd.DataFrame:
    """Glob all *.csv files, decode as Windows-1252, strip column whitespace."""
    files = sorted(data_dir.glob("*.csv"))
    if not files:
        sys.exit(f"[error] No CSV files found in {data_dir}")

    frames: list[pd.DataFrame] = []
    for f in files:
        log.info("Loading %s …", f.name)
        df = pd.read_csv(f, low_memory=False, encoding="utf-8", encoding_errors="replace")
        df.columns = df.columns.str.strip()
        frames.append(df)

    combined = pd.concat(frames, ignore_index=True)
    log.info("Loaded %d total rows from %d files", len(combined), len(files))
    return combined


# ── Feature preparation ────────────────────────────────────────────────────────

def prepare(df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Map CICIDS2017 columns to the 12-feature vector used at inference.

    Returns
    -------
    X       float32 (N, 12)  raw (unscaled) feature matrix
    y       int32   (N,)     label index; -1 = benign
    is_ben  bool    (N,)     True for benign rows
    """
    rename = {k: v for k, v in CICIDS_COLS.items() if k in df.columns}
    not_found = [k for k in CICIDS_COLS if k not in df.columns]
    if not_found:
        log.warning("Columns not in data (zero-filled): %s", not_found)
    df = df.rename(columns=rename)

    # Derived features
    df["duration_ms"]   = df.get("duration_raw", pd.Series(0.0, index=df.index)) / 1000.0
    df["bytes_per_pkt"] = df["in_bytes"] / df["in_pkts"].clip(lower=1)

    # Features absent from this CICIDS release
    df["protocol"] = 0.0
    df["src_port"]  = 0.0

    for col in FEATURE_ORDER:
        if col not in df.columns:
            df[col] = 0.0

    df = df.replace([np.inf, -np.inf], np.nan)
    before = len(df)
    df = df.dropna(subset=FEATURE_ORDER)
    if dropped := before - len(df):
        log.info("Dropped %d rows with Inf/NaN", dropped)

    X = df[FEATURE_ORDER].values.astype(np.float32)

    # Labels
    if "Label" not in df.columns:
        sys.exit("[error] No 'Label' column found")

    # UNB CSVs encode what should be an en-dash as U+FFFD; normalise before lookup
    raw_labels = df["Label"].str.strip().str.replace("�", "–", regex=False)

    unique, counts = np.unique(raw_labels, return_counts=True)
    log.info("Label distribution:")
    for u, c in sorted(zip(unique, counts), key=lambda t: -t[1]):
        log.info("  %-44s %8d → %s", u, c, RAW_LABEL_MAP.get(u, "?unmapped?"))

    mapped = raw_labels.map(lambda lbl: RAW_LABEL_MAP.get(lbl, "unknown_anomaly"))
    is_benign: np.ndarray = mapped.isna().values

    label_idx = {lbl: i for i, lbl in enumerate(LABELS)}
    y = mapped.fillna("__benign__").map(
        lambda lbl: -1 if lbl == "__benign__" else label_idx.get(str(lbl), 6)
    ).values.astype(np.int32)

    log.info(
        "Prepared: %d benign, %d attack, %d features",
        int(is_benign.sum()), int((~is_benign).sum()), len(FEATURE_ORDER),
    )
    return X, y, is_benign


# ── Training ───────────────────────────────────────────────────────────────────

def train(
    X: np.ndarray,
    y: np.ndarray,
    is_benign: np.ndarray,
    output_dir: Path,
    ae_epochs: int = 30,
) -> None:
    os.makedirs(output_dir, exist_ok=True)

    X_benign = X[is_benign]
    X_attack = X[~is_benign]
    y_attack  = y[~is_benign]

    rng = np.random.default_rng(42)
    if len(X_benign) > 100_000:
        idx = rng.choice(len(X_benign), 100_000, replace=False)
        X_benign = X_benign[idx]
    if len(X_attack) > 80_000:
        idx = rng.choice(len(X_attack), 80_000, replace=False)
        X_attack = X_attack[idx]
        y_attack  = y_attack[idx]

    log.info("Training on %d benign + %d attack samples", len(X_benign), len(X_attack))

    # ── 1. StandardScaler ────────────────────────────────────────────────────
    log.info("Fitting StandardScaler …")
    scaler = StandardScaler()
    X_ben_s = scaler.fit_transform(X_benign).astype(np.float32)
    X_att_s = scaler.transform(X_attack).astype(np.float32)
    with open(output_dir / "scaler.pkl", "wb") as f:
        pickle.dump(scaler, f)
    log.info("Saved scaler.pkl")

    # ── 2. Isolation Forest ──────────────────────────────────────────────────
    log.info("Training Isolation Forest (n_estimators=200) …")
    iso = IsolationForest(n_estimators=200, contamination=0.05, random_state=42, n_jobs=-1)
    iso.fit(X_ben_s)
    with open(output_dir / "isolation_forest.pkl", "wb") as f:
        pickle.dump(iso, f)
    log.info("Saved isolation_forest.pkl")

    ben_preds = iso.predict(X_ben_s)
    att_preds = iso.predict(X_att_s)
    log.info(
        "IF sanity: %.1f%% benign flagged (target ~5%%), %.1f%% attacks flagged",
        100 * (ben_preds == -1).mean(), 100 * (att_preds == -1).mean(),
    )

    # ── 3. Autoencoder ───────────────────────────────────────────────────────
    log.info("Training Autoencoder (%d epochs) …", ae_epochs)
    ae = _Autoencoder(n_features=len(FEATURE_ORDER))
    opt = torch.optim.Adam(ae.parameters(), lr=1e-3)
    t_ben = torch.tensor(X_ben_s)

    for epoch in range(ae_epochs):
        perm = torch.randperm(len(t_ben))
        epoch_loss = 0.0
        for i in range(0, len(t_ben), 512):
            batch = t_ben[perm[i : i + 512]]
            loss  = nn.MSELoss()(ae(batch), batch)
            opt.zero_grad(); loss.backward(); opt.step()
            epoch_loss += loss.item()
        if (epoch + 1) % 10 == 0:
            log.info("  AE epoch %2d/%d  loss=%.6f", epoch + 1, ae_epochs, epoch_loss)

    torch.save(ae.state_dict(), output_dir / "autoencoder.pt")
    log.info("Saved autoencoder.pt")

    ae.eval()
    with torch.no_grad():
        ben_err = nn.MSELoss(reduction="none")(ae(t_ben), t_ben).mean(1).numpy()
        att_t   = torch.tensor(X_att_s)
        att_err = nn.MSELoss(reduction="none")(ae(att_t), att_t).mean(1).numpy()
    log.info(
        "AE recon error — benign p50=%.4f p95=%.4f | attack p50=%.4f p95=%.4f",
        np.percentile(ben_err, 50), np.percentile(ben_err, 95),
        np.percentile(att_err, 50), np.percentile(att_err, 95),
    )

    # ── 4. XGBoost ───────────────────────────────────────────────────────────
    # The dataset has no "lateral_movement" samples, so class indices are not
    # contiguous (e.g. [0,1,2,3,4,6]).  We remap to 0..K and save the
    # class-name decoder so ensemble.py can recover the original label string.
    try:
        import xgboost as xgb  # type: ignore[import-untyped]
        from sklearn.metrics import classification_report

        present = sorted(set(y_attack.tolist()))
        class_names = [LABELS[i] for i in present]  # string label for each XGB class
        remap  = {orig: new for new, orig in enumerate(present)}
        y_xgb  = np.array([remap[yi] for yi in y_attack], dtype=np.int32)

        log.info(
            "Training XGBoost: %d samples, %d classes: %s",
            len(X_attack), len(present), class_names,
        )
        clf = xgb.XGBClassifier(
            n_estimators=300, max_depth=6, learning_rate=0.1,
            subsample=0.8, colsample_bytree=0.8,
            eval_metric="mlogloss", verbosity=0, n_jobs=-1, random_state=42,
        )
        clf.fit(X_att_s, y_xgb)

        # Bundle model + class-name decoder so ensemble.py can use it directly
        bundle = {"clf": clf, "class_names": class_names}
        with open(output_dir / "xgboost.pkl", "wb") as f:
            pickle.dump(bundle, f)
        log.info("Saved xgboost.pkl  (classes: %s)", class_names)

        preds  = clf.predict(X_att_s)
        report = classification_report(
            y_xgb, preds,
            labels=list(range(len(present))),
            target_names=class_names,
            zero_division=0,
        )
        log.info("XGBoost training-set report:\n%s", report)

    except ImportError:
        log.warning("xgboost not installed — skipping")

    log.info(
        "\nDone. Commit these files:\n  %s",
        "\n  ".join(str(output_dir / f)
                    for f in ["scaler.pkl", "isolation_forest.pkl",
                               "autoencoder.pt", "xgboost.pkl"]),
    )


# ── Entry point ────────────────────────────────────────────────────────────────

def main() -> None:
    p = argparse.ArgumentParser(description="Train AankhaNet ensemble on CICIDS2017")
    p.add_argument("data_dir", type=Path,
                   help="Directory containing CICIDS2017 CSV files")
    p.add_argument("--output", type=Path, default=Path("models"))
    p.add_argument("--ae-epochs", type=int, default=30)
    args = p.parse_args()

    if not args.data_dir.is_dir():
        sys.exit(f"[error] Not a directory: {args.data_dir}")

    df        = load_csvs(args.data_dir)
    X, y, ben = prepare(df)
    train(X, y, ben, args.output, ae_epochs=args.ae_epochs)


if __name__ == "__main__":
    main()
