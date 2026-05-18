#!/usr/bin/env python3
"""Train the AankhaNet AI ensemble on CICIDS2017 (Engelen et al. 2021 cleaned).

Usage
-----
    cd services/detector
    uv pip install -e ".[dev]" pandas
    python scripts/train_cicids.py /path/to/cicids2017/csvs/ --output models/

The script accepts the MachineLearningCVE directory from the UNB dataset, or
the Engelen 2021 cleaned CSV files from Kaggle.  It will glob all *.csv files
in the given directory, so any mix of the daily CSV files is fine.

After running, commit the four files in models/:
    isolation_forest.pkl   (~2 MB)
    autoencoder.pt         (~15 KB)
    xgboost.pkl            (~3 MB)
    scaler.pkl             (~1 KB)

Railway will load these on startup and skip synthetic training.

Dataset sources
---------------
  UNB original : https://www.unb.ca/cic/datasets/ids-2017.html
  Engelen 2021 : https://www.kaggle.com/datasets/cicdataset/cicids2017
                 (preferred — corrects mislabelled rows and infinity values)

Reference: Engelen et al. (2021) "Troubleshooting an Intrusion Detection
Dataset: the CICIDS2017 Case Study." IEEE S&P Workshops.
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

# ── Feature mapping ────────────────────────────────────────────────────────────
# Maps stripped CICIDS2017 column names → our internal feature names.
# duration_ms: CICIDS stores microseconds — converted to ms in prepare().
# bytes_per_pkt: derived from in_bytes / in_pkts (not a raw CICIDS column).

CICIDS_COLS: dict[str, str] = {
    "Flow Duration":                "duration_ms",
    "Total Fwd Packets":            "in_pkts",
    "Total Backward Packets":       "out_pkts",
    "Total Length of Fwd Packets":  "in_bytes",
    "Total Length of Bwd Packets":  "out_bytes",
    "Flow Packets/s":               "pkt_rate",
    "Flow Bytes/s":                 "byte_rate",
    "Protocol":                     "protocol",
    "Source Port":                  "src_port",
    "Destination Port":             "dst_port",
    "Fwd PSH Flags":                "tcp_flags",
}

# Must match FEATURE_NAMES in features.py exactly.
FEATURE_ORDER: list[str] = [
    "duration_ms", "in_bytes", "out_bytes", "in_pkts", "out_pkts",
    "bytes_per_pkt", "pkt_rate", "byte_rate",
    "protocol", "src_port", "dst_port", "tcp_flags",
]

# Must match LABELS in ensemble.py exactly.
LABELS: list[str] = [
    "port_scan", "ddos", "brute_force", "c2_beaconing",
    "data_exfil", "lateral_movement", "unknown_anomaly",
]
LABEL_IDX: dict[str, int] = {lbl: i for i, lbl in enumerate(LABELS)}

# ── Label mapping ──────────────────────────────────────────────────────────────
# None  → benign (used for IF + AE training, excluded from XGBoost)
# CICIDS2017 uses both Windows-1252 (0x96) and Unicode en-dash (U+2013).
RAW_LABEL_MAP: dict[str, str | None] = {
    "BENIGN":                                  None,
    "PortScan":                                "port_scan",
    "DoS Hulk":                                "ddos",
    "DDoS":                                    "ddos",
    "DoS GoldenEye":                           "ddos",
    "DoS slowloris":                           "ddos",
    "DoS Slowhttptest":                        "ddos",
    "FTP-Patator":                             "brute_force",
    "SSH-Patator":                             "brute_force",
    "Web Attack \x96 Brute Force":            "brute_force",
    "Web Attack – Brute Force":          "brute_force",
    "Web Attack \x96 XSS":                    "unknown_anomaly",
    "Web Attack – XSS":                  "unknown_anomaly",
    "Web Attack \x96 Sql Injection":          "unknown_anomaly",
    "Web Attack – Sql Injection":        "unknown_anomaly",
    "Bot":                                     "c2_beaconing",
    "Infiltration":                            "data_exfil",
    "Heartbleed":                              "unknown_anomaly",
}


# ── Autoencoder (must mirror ensemble.py exactly) ─────────────────────────────

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
    """Glob all *.csv files in data_dir, concat into one DataFrame."""
    files = sorted(data_dir.glob("*.csv"))
    if not files:
        sys.exit(f"[error] No CSV files found in {data_dir}")

    frames: list[pd.DataFrame] = []
    for f in files:
        log.info("Loading %s …", f.name)
        df = pd.read_csv(f, low_memory=False, encoding="utf-8", encoding_errors="replace")
        # Strip whitespace from all column names — CICIDS has leading spaces
        df.columns = df.columns.str.strip()
        frames.append(df)

    combined = pd.concat(frames, ignore_index=True)
    log.info("Total rows loaded: %d", len(combined))
    return combined


# ── Feature preparation ────────────────────────────────────────────────────────

def prepare(df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Map CICIDS2017 columns to our feature vector.

    Returns
    -------
    X        float32 (N, 12) — raw (unscaled) feature matrix
    y        int32   (N,)    — label index; -1 = benign
    is_ben   bool    (N,)    — True for benign rows
    """
    # Rename known columns
    rename = {k: v for k, v in CICIDS_COLS.items() if k in df.columns}
    missing = set(CICIDS_COLS.values()) - set(rename.values())
    if missing:
        log.warning("Missing columns after rename (will use zeros): %s", missing)
    df = df.rename(columns=rename)

    # Derived feature
    df["bytes_per_pkt"] = df["in_bytes"] / df["in_pkts"].clip(lower=1)

    # CICIDS Flow Duration is in microseconds → convert to milliseconds
    df["duration_ms"] = df["duration_ms"] / 1000.0

    # Fill any missing feature columns with 0
    for col in FEATURE_ORDER:
        if col not in df.columns:
            df[col] = 0.0

    # Drop rows with Inf / NaN in feature columns
    df = df.replace([np.inf, -np.inf], np.nan)
    before = len(df)
    df = df.dropna(subset=FEATURE_ORDER)
    dropped = before - len(df)
    if dropped:
        log.info("Dropped %d rows with Inf/NaN values", dropped)

    X = df[FEATURE_ORDER].values.astype(np.float32)

    # Map labels — strip whitespace, handle encoding variants
    label_col = "Label" if "Label" in df.columns else None
    if label_col is None:
        sys.exit("[error] No 'Label' column found — check column stripping above")

    raw_labels = df[label_col].str.strip()
    mapped = raw_labels.map(lambda lbl: RAW_LABEL_MAP.get(lbl, "unknown_anomaly"))

    # None = benign
    is_benign: np.ndarray = mapped.isna().values

    y = mapped.fillna("__benign__").map(
        lambda lbl: -1 if lbl == "__benign__" else LABEL_IDX.get(str(lbl), 6)
    ).values.astype(np.int32)

    unique, counts = np.unique(raw_labels, return_counts=True)
    log.info("Label distribution:")
    for u, c in sorted(zip(counts, unique), reverse=True):
        mapped_to = RAW_LABEL_MAP.get(str(u), "?unmapped?")
        log.info("  %-40s %7d → %s", u, c, mapped_to)

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

    X_benign  = X[is_benign]
    X_attack  = X[~is_benign]
    y_attack  = y[~is_benign]

    log.info("Benign rows: %d  |  Attack rows: %d", len(X_benign), len(X_attack))

    # Subsample for training efficiency (CICIDS has ~2M rows; 100k benign is plenty)
    rng = np.random.default_rng(42)
    if len(X_benign) > 100_000:
        idx = rng.choice(len(X_benign), 100_000, replace=False)
        X_benign = X_benign[idx]
    if len(X_attack) > 80_000:
        idx = rng.choice(len(X_attack), 80_000, replace=False)
        X_attack = X_attack[idx]
        y_attack = y_attack[idx]

    # ── 1. StandardScaler ────────────────────────────────────────────────────
    # Fit on benign only (normal traffic defines the "normal" scale).
    # Saved so ensemble.py can apply the same transform at inference time.
    log.info("Fitting StandardScaler on %d benign samples …", len(X_benign))
    scaler = StandardScaler()
    X_ben_s = scaler.fit_transform(X_benign).astype(np.float32)
    X_att_s = scaler.transform(X_attack).astype(np.float32)

    with open(output_dir / "scaler.pkl", "wb") as f:
        pickle.dump(scaler, f)
    log.info("Saved scaler.pkl")

    # ── 2. Isolation Forest (trained on benign only) ─────────────────────────
    log.info("Training Isolation Forest (n_estimators=200) …")
    iso = IsolationForest(
        n_estimators=200,
        contamination=0.05,
        random_state=42,
        n_jobs=-1,
    )
    iso.fit(X_ben_s)
    with open(output_dir / "isolation_forest.pkl", "wb") as f:
        pickle.dump(iso, f)
    log.info("Saved isolation_forest.pkl")

    # ── 3. Autoencoder (trained on benign only) ──────────────────────────────
    log.info("Training Autoencoder (%d epochs) …", ae_epochs)
    ae = _Autoencoder(n_features=len(FEATURE_ORDER))
    opt = torch.optim.Adam(ae.parameters(), lr=1e-3)
    t_ben = torch.tensor(X_ben_s)
    batch_size = 512

    for epoch in range(ae_epochs):
        perm = torch.randperm(len(t_ben))
        epoch_loss = 0.0
        for i in range(0, len(t_ben), batch_size):
            batch = t_ben[perm[i : i + batch_size]]
            loss = nn.MSELoss()(ae(batch), batch)
            opt.zero_grad()
            loss.backward()
            opt.step()
            epoch_loss += loss.item()
        if (epoch + 1) % 10 == 0:
            log.info("  AE epoch %2d/%d  loss=%.6f", epoch + 1, ae_epochs, epoch_loss)

    torch.save(ae.state_dict(), output_dir / "autoencoder.pt")
    log.info("Saved autoencoder.pt")

    # Threshold calibration: 95th-percentile reconstruction error on benign
    ae.eval()
    with torch.no_grad():
        recon = ae(t_ben)
        errors = nn.MSELoss(reduction="none")(recon, t_ben).mean(dim=1).numpy()
    ae_threshold = float(np.percentile(errors, 95))
    log.info("AE 95th-percentile reconstruction error on benign: %.6f", ae_threshold)

    # ── 4. XGBoost (trained on attacks only) ─────────────────────────────────
    try:
        import xgboost as xgb  # type: ignore[import-untyped]
        from sklearn.metrics import classification_report

        log.info("Training XGBoost classifier on %d attack samples …", len(X_attack))
        clf = xgb.XGBClassifier(
            n_estimators=300,
            max_depth=6,
            learning_rate=0.1,
            subsample=0.8,
            colsample_bytree=0.8,
            eval_metric="mlogloss",
            verbosity=0,
            n_jobs=-1,
            random_state=42,
        )
        clf.fit(X_att_s, y_attack)
        with open(output_dir / "xgboost.pkl", "wb") as f:
            pickle.dump(clf, f)
        log.info("Saved xgboost.pkl")

        preds = clf.predict(X_att_s)
        report = classification_report(
            y_attack, preds,
            labels=list(range(len(LABELS))),
            target_names=LABELS,
            zero_division=0,
        )
        log.info("XGBoost training-set classification report:\n%s", report)

    except ImportError:
        log.warning("xgboost not installed — skipping XGBoost training")

    log.info("Done. Commit these files:\n  %s", "\n  ".join(
        str(output_dir / f) for f in
        ["scaler.pkl", "isolation_forest.pkl", "autoencoder.pt", "xgboost.pkl"]
    ))


# ── Entry point ────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Train AankhaNet AI ensemble on CICIDS2017",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "data_dir", type=Path,
        help="Directory containing CICIDS2017 CSV files (MachineLearningCVE/)",
    )
    parser.add_argument(
        "--output", type=Path, default=Path("models"),
        help="Output directory for model files (default: models/)",
    )
    parser.add_argument(
        "--ae-epochs", type=int, default=30,
        help="Autoencoder training epochs (default: 30)",
    )
    args = parser.parse_args()

    if not args.data_dir.exists():
        sys.exit(f"[error] Directory not found: {args.data_dir}")

    df = load_csvs(args.data_dir)
    X, y, is_benign = prepare(df)
    train(X, y, is_benign, args.output, ae_epochs=args.ae_epochs)


if __name__ == "__main__":
    main()
