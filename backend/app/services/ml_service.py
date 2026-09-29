from __future__ import annotations

import csv
import os
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import joblib
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

MODEL_NAME = "isolation_forest"
MODEL_VERSION = "1.0"
LIVE_MODEL_NAME = "ringbreak_live_fraud_model"
LIVE_MODEL_VERSION = "2.0"
LIVE_MODEL_KEYS = [
    "step",
    "type",
    "amount",
    "oldbalanceOrg",
    "newbalanceOrig",
    "oldbalanceDest",
    "newbalanceDest",
]
FEATURE_KEYS = [
    "amount",
    "transactionHour",
    "dayOfWeek",
    "unusualHour",
    "amountSignal",
    "deviceSignal",
    "locationSignal",
    "ipSignal",
    "transactionTypeSignal",
]


class MLService:
    FEATURE_KEYS = FEATURE_KEYS
    _model: IsolationForest | None = None
    _feature_stats_cache: dict[str, dict[str, float]] | None = None
    _baseline_path = Path(__file__).resolve().parents[1] / "data" / "transaction_baseline.csv"
    _scaler: StandardScaler | None = None
    _live_model: Any | None = None
    _live_model_path = Path(__file__).resolve().parents[2] / "models" / "ringbreak_fraud_model.joblib"

    @classmethod
    def ensure_baseline_dataset(cls) -> Path:
        baseline_dir = cls._baseline_path.parent
        baseline_dir.mkdir(parents=True, exist_ok=True)
        rows = [
            [18000, 9, 1, 0, 18, 18, 18, 22, 30],
            [22000, 10, 2, 0, 20, 18, 19, 24, 30],
            [26000, 11, 3, 0, 22, 18, 20, 25, 31],
            [31000, 12, 4, 0, 25, 19, 19, 26, 32],
            [35000, 13, 5, 0, 27, 20, 19, 27, 33],
            [39000, 14, 0, 0, 30, 20, 20, 28, 34],
            [43000, 15, 1, 0, 32, 21, 20, 29, 35],
            [47000, 16, 2, 0, 34, 22, 21, 30, 36],
            [52000, 17, 3, 0, 36, 22, 21, 31, 37],
            [56000, 8, 4, 0, 39, 23, 22, 32, 38],
            [61000, 9, 5, 0, 42, 24, 22, 33, 39],
            [65000, 10, 6, 0, 45, 25, 23, 34, 40],
            [69000, 11, 0, 0, 48, 25, 23, 35, 41],
            [72000, 12, 1, 0, 50, 26, 24, 36, 42],
            [75000, 13, 2, 0, 52, 26, 24, 37, 43],
            [48000, 14, 0, 0, 48, 25, 30, 40, 75],
            [50000, 15, 1, 0, 49, 26, 31, 41, 76],
            [53000, 16, 2, 0, 51, 27, 32, 42, 77],
            [56000, 17, 3, 0, 53, 28, 33, 43, 78],
            [60000, 8, 4, 0, 55, 29, 34, 44, 79],
            [62000, 9, 5, 0, 57, 30, 35, 45, 80],
            [64000, 10, 6, 0, 59, 31, 36, 46, 81],
            [67000, 11, 0, 0, 61, 32, 37, 47, 82],
            [70000, 12, 1, 0, 63, 33, 38, 48, 83],
            [73000, 13, 2, 0, 65, 34, 39, 49, 84],
            [76000, 14, 3, 0, 67, 35, 40, 50, 85],
            [78000, 15, 4, 0, 69, 36, 41, 51, 86],
            [80000, 16, 5, 0, 71, 37, 42, 52, 87],
            [82000, 17, 6, 0, 73, 38, 43, 53, 88],
            [86000, 8, 0, 0, 75, 39, 44, 54, 89],
            [90000, 9, 1, 0, 77, 40, 45, 55, 90],
            [95000, 10, 2, 0, 79, 41, 46, 56, 91],
            [98000, 11, 3, 0, 82, 42, 47, 57, 92],
            [102000, 12, 4, 0, 84, 43, 48, 58, 93],
            [106000, 13, 5, 0, 86, 44, 49, 59, 94],
            [110000, 14, 6, 0, 88, 45, 50, 60, 95],
            [115000, 15, 0, 0, 90, 46, 51, 61, 96],
            [120000, 16, 1, 0, 92, 47, 52, 62, 97],
            [125000, 17, 2, 0, 94, 48, 53, 63, 98],
            [130000, 8, 3, 0, 96, 49, 54, 64, 99],
            [135000, 9, 4, 0, 98, 50, 55, 65, 100],
            [140000, 10, 5, 0, 100, 51, 56, 66, 101],
            [145000, 11, 6, 0, 100, 52, 57, 67, 102],
            [150000, 12, 0, 0, 100, 53, 58, 68, 103],
            [155000, 13, 1, 0, 100, 54, 59, 69, 104],
            [160000, 14, 2, 0, 100, 55, 60, 70, 105],
            [165000, 15, 3, 0, 100, 56, 61, 71, 106],
            [170000, 16, 4, 0, 100, 57, 62, 72, 107],
            [175000, 17, 5, 0, 100, 58, 63, 73, 108],
            [180000, 8, 6, 0, 100, 59, 64, 74, 109],
            [185000, 9, 0, 0, 100, 60, 65, 75, 110],
            [190000, 10, 1, 0, 100, 61, 66, 76, 111],
            [200000, 11, 2, 0, 100, 62, 67, 77, 112],
            [210000, 12, 3, 0, 100, 63, 68, 78, 113],
            [220000, 13, 4, 0, 100, 64, 69, 79, 114],
            [230000, 14, 5, 0, 100, 65, 70, 80, 115],
            [240000, 15, 6, 0, 100, 66, 71, 81, 116],
            [250000, 16, 0, 0, 100, 67, 72, 82, 117],
            [260000, 17, 1, 0, 100, 68, 73, 83, 118],
            [270000, 8, 2, 0, 100, 69, 74, 84, 119],
            [280000, 9, 3, 0, 100, 70, 75, 85, 120],
            [290000, 10, 4, 0, 100, 71, 76, 86, 121],
            [300000, 11, 5, 0, 100, 72, 77, 87, 122],
            [310000, 12, 6, 0, 100, 73, 78, 88, 123],
            [320000, 13, 0, 0, 100, 74, 79, 89, 124],
            [350000, 14, 1, 0, 100, 75, 80, 90, 125],
            [400000, 15, 2, 0, 100, 76, 81, 91, 126],
            [450000, 16, 3, 0, 100, 77, 82, 92, 127],
            [500000, 17, 4, 0, 100, 78, 83, 93, 128],
            [550000, 8, 5, 0, 100, 79, 84, 94, 129],
            [600000, 9, 6, 0, 100, 80, 85, 95, 130],
            [650000, 10, 0, 0, 100, 81, 86, 96, 131],
            [700000, 11, 1, 0, 100, 82, 87, 97, 132],
            [750000, 12, 2, 0, 100, 83, 88, 98, 133],
            [800000, 13, 3, 0, 100, 84, 89, 99, 134],
            [850000, 14, 4, 0, 100, 85, 90, 100, 135],
            [900000, 15, 5, 0, 100, 86, 91, 101, 140],
            [1250000, 16, 6, 0, 100, 87, 92, 102, 145],
        ]
        with cls._baseline_path.open("w", newline="", encoding="utf-8") as csv_file:
            writer = csv.writer(csv_file)
            writer.writerow(FEATURE_KEYS)
            writer.writerows(rows)
        return cls._baseline_path

    @classmethod
    def _read_baseline_rows(cls) -> list[dict[str, float]]:
        cls.ensure_baseline_dataset()
        with cls._baseline_path.open("r", newline="", encoding="utf-8") as csv_file:
            reader = csv.DictReader(csv_file)
            return [{key: float(value) for key, value in row.items()} for row in reader]

    @classmethod
    def load_model(cls) -> IsolationForest:
        if cls._model is not None:
            return cls._model

        rows = cls._read_baseline_rows()
        X = np.array([[row[key] for key in FEATURE_KEYS] for row in rows], dtype=float)
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)
        model = IsolationForest(
            n_estimators=300,
            contamination=0.10,
            random_state=42,
        )
        model.fit(X_scaled)
        cls._model = model
        cls._scaler = scaler
        return model

    @classmethod
    def _feature_stats(cls) -> dict[str, dict[str, float]]:
        if cls._feature_stats_cache is not None:
            return cls._feature_stats_cache

        rows = cls._read_baseline_rows()
        stats: dict[str, dict[str, float]] = {}
        for key in FEATURE_KEYS:
            values = np.array([row[key] for row in rows], dtype=float)
            stats[key] = {
                "mean": float(np.mean(values)),
                "std": float(np.std(values) if np.std(values) > 0 else 1.0),
            }
        cls._feature_stats_cache = stats
        return stats

    @classmethod
    def build_feature_vector(cls, features: dict[str, Any]) -> list[float]:
        ordered: list[float] = []
        for key in FEATURE_KEYS:
            value = features.get(key, 0)
            if value is None:
                value = 0
            if isinstance(value, bool):
                value = float(value)
            if not isinstance(value, (int, float)):
                candidate = str(value)
                if candidate.replace(".", "", 1).replace("-", "", 1).isdigit():
                    ordered.append(float(candidate))
                    continue
                ordered.append(0.0)
                continue
            ordered.append(float(value))
        return ordered

    @classmethod
    def _load_live_model(cls) -> Any:
        if cls._live_model is not None:
            return cls._live_model
        if not cls._live_model_path.exists():
            raise RuntimeError(f"LIVE ML model not found: {cls._live_model_path}")

        import sklearn.compose._column_transformer as column_transformer

        if not hasattr(column_transformer, "_RemainderColsList"):
            column_transformer._RemainderColsList = type("_RemainderColsList", (list,), {})
        try:
            cls._live_model = joblib.load(cls._live_model_path)
        except Exception as exc:
            raise RuntimeError(f"LIVE ML model could not be loaded: {cls._live_model_path}") from exc
        return cls._live_model

    @staticmethod
    def _live_input(features: dict[str, Any]) -> pd.DataFrame:
        transaction_type = {
            "WIRE": "TRANSFER",
            "P2P": "PAYMENT",
            "CARD": "PAYMENT",
            "ACH": "TRANSFER",
            "CRYPTO": "TRANSFER",
            "INTERNAL": "CASH",
        }.get(str(features.get("transactionType", "PAYMENT")).upper(), "PAYMENT")
        values = {
            "step": features.get("step", features.get("transactionHour", 0)),
            "type": features.get("type", transaction_type),
            "amount": features.get("amount", 0),
            "oldbalanceOrg": features.get("oldbalanceOrg", 0),
            "newbalanceOrig": features.get("newbalanceOrig", 0),
            "oldbalanceDest": features.get("oldbalanceDest", 0),
            "newbalanceDest": features.get("newbalanceDest", 0),
        }
        return pd.DataFrame([{key: values[key] for key in LIVE_MODEL_KEYS}], columns=LIVE_MODEL_KEYS)

    @classmethod
    def _analyze_live(cls, features: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        model = cls._load_live_model()
        model_input = cls._live_input(features)
        probabilities = model.predict_proba(model_input)[0]
        classes = list(getattr(model, "classes_", []))
        if 1 not in classes:
            raise RuntimeError("LIVE ML model does not expose fraud class 1")
        fraud_probability = float(probabilities[classes.index(1)])
        classification = "FRAUD" if fraud_probability >= 0.5 else "NORMAL"
        timestamp = features.get("timestamp") or next(
            (item.get("timestamp") for item in features.get("evidence", []) if isinstance(item, dict) and item.get("timestamp")),
            "1970-01-01T00:00:00Z",
        )
        evidence = [{
            "id": "ml-fraud-probability",
            "label": "Fraud probability",
            "description": f"The live fraud classifier assigned a {fraud_probability:.4f} probability to fraud.",
            "strength": int(round(fraud_probability * 100)),
            "source": "ml_intelligence",
            "timestamp": timestamp,
            "relationship": "transaction",
        }]
        return {
            "model": {"name": LIVE_MODEL_NAME, "version": LIVE_MODEL_VERSION},
            "anomalyScore": fraud_probability,
            "fraudProbability": fraud_probability,
            "normalityScore": 1.0 - fraud_probability,
            "classification": classification,
            "confidence": max(fraud_probability, 1.0 - fraud_probability),
            "signals": [{
                "feature": "fraudProbability",
                "value": fraud_probability,
                "contribution": fraud_probability,
            }],
        }, evidence

    @classmethod
    def _normalise_score(cls, value: float, minimum: float, maximum: float) -> float:
        if maximum == minimum:
            return 0.0
        return float(np.clip((value - minimum) / (maximum - minimum), 0.0, 1.0))

    @classmethod
    def analyze(cls, features: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        if os.getenv("RINGBREAK_ML_MODE", "LIVE").strip().upper() == "LIVE":
            return cls._analyze_live(features)
        model = cls.load_model()
        feature_vector = np.array([cls.build_feature_vector(features)], dtype=float)
        baseline_matrix = np.array(
            [[row[key] for key in FEATURE_KEYS] for row in cls._read_baseline_rows()],
            dtype=float,
        )
        scaler = cls._scaler or StandardScaler()
        if cls._scaler is None:
            baseline_scaled = scaler.fit_transform(baseline_matrix)
            cls._scaler = scaler
        else:
            baseline_scaled = scaler.transform(baseline_matrix)
        feature_scaled = scaler.transform(feature_vector)
        baseline_decisions = model.decision_function(baseline_scaled)
        sample_decision = float(model.decision_function(feature_scaled)[0])
        decision_scale = max(float(np.max(np.abs(baseline_decisions))), 1e-6)
        decision_ratio = sample_decision / decision_scale
        model_anomaly = float(np.clip(max(0.0, -decision_ratio) * 0.9 + 0.1, 0.0, 1.0))

        feature_deviation = 0.0
        for key in FEATURE_KEYS:
            value = float(features.get(key, 0.0) or 0.0)
            stats = cls._feature_stats()[key]
            feature_deviation = max(
                feature_deviation,
                min(1.0, abs(value - stats["mean"]) / max(stats["std"], 1.0)),
            )

        anomaly_score = float(np.clip((0.6 * model_anomaly) + (0.4 * feature_deviation), 0.0, 1.0))
        normality_score = 1.0 - anomaly_score
        classification = "ANOMALOUS" if sample_decision <= 0.0 or anomaly_score >= 0.55 else "NORMAL"
        confidence = float(np.clip(0.55 + (anomaly_score - 0.5) * 0.9, 0.0, 0.99))

        signals: list[dict[str, Any]] = []
        for key in FEATURE_KEYS:
            value = float(features.get(key, 0.0) or 0.0)
            stats = cls._feature_stats()[key]
            deviation = abs(value - stats["mean"]) / max(stats["std"], 1.0)
            contribution = float(np.clip(deviation / 5.0, 0.0, 1.0))
            if contribution >= 0.15:
                signals.append({
                    "feature": key,
                    "value": round(value, 4),
                    "contribution": round(contribution, 4),
                })

        signals.sort(key=lambda signal: signal["contribution"], reverse=True)
        top_signals = signals[:4]

        evidence: list[dict[str, Any]] = []
        for signal in top_signals:
            key = signal["feature"]
            human_label = {
                "amount": "Unusual transaction amount",
                "transactionHour": "Unusual transaction timing",
                "dayOfWeek": "Unusual transaction day",
                "unusualHour": "Unusual hour behaviour",
                "amountSignal": "Amount deviation",
                "deviceSignal": "Device-related anomaly",
                "locationSignal": "Location-based anomaly",
                "ipSignal": "Network/IP-related anomaly",
                "transactionTypeSignal": "Transaction type anomaly",
            }.get(key, "Behavioural anomaly")
            relationship = {
                "amount": "transaction",
                "transactionHour": "temporal",
                "dayOfWeek": "temporal",
                "unusualHour": "temporal",
                "amountSignal": "transaction",
                "deviceSignal": "device",
                "locationSignal": "location",
                "ipSignal": "network",
                "transactionTypeSignal": "transaction",
            }.get(key, "transaction")
            evidence.append({
                "id": f"ml-{key}",
                "label": human_label,
                "description": f"Feature {key} deviated from the learned baseline with a contribution of {signal['contribution']:.2f}.",
                "strength": int(round(signal["contribution"] * 100)),
                "source": "ml_intelligence",
                "timestamp": features.get("timestamp", "1970-01-01T00:00:00Z"),
                "relationship": relationship,
            })

        result = {
            "model": {"name": MODEL_NAME, "version": MODEL_VERSION},
            "anomalyScore": round(anomaly_score, 4),
            "normalityScore": round(normality_score, 4),
            "classification": classification,
            "confidence": round(confidence, 4),
            "signals": [
                {"feature": signal["feature"], "value": signal["value"], "contribution": signal["contribution"]}
                for signal in top_signals
            ],
        }
        return result, evidence


if __name__ == "__main__":
    print(MLService.ensure_baseline_dataset())


if os.getenv("RINGBREAK_ML_MODE", "LIVE").strip().upper() == "LIVE":
    MLService._load_live_model()
