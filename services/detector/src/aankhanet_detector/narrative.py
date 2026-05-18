"""LLM-generated incident narrative using Anthropic Claude API.

Generates a plain-English summary ≤ 1200 characters.  Falls back to a
deterministic template if the API key is absent or the call fails.
"""
from __future__ import annotations

import logging
from typing import Any

log = logging.getLogger(__name__)

_TEMPLATES = {
    "port_scan": (
        "A network scan was detected from {src} targeting {dst}. "
        "The anomaly score is {score:.2f}, suggesting {severity} threat level."
    ),
    "ddos": (
        "Volumetric traffic from {src} towards {dst} matches a DDoS pattern. "
        "Packet rate is significantly elevated. Anomaly score: {score:.2f}."
    ),
    "brute_force": (
        "Repeated authentication attempts from {src} to {dst} indicate a brute-force attack. "
        "Anomaly score: {score:.2f}."
    ),
    "c2_beaconing": (
        "Periodic outbound connections from {src} to {dst} are consistent with command-and-control "
        "beaconing. Anomaly score: {score:.2f}. Immediate investigation recommended."
    ),
    "data_exfil": (
        "Unusually large data transfer from {src} to external host {dst} detected. "
        "Possible data exfiltration. Anomaly score: {score:.2f}."
    ),
    "lateral_movement": (
        "Internal host {src} is connecting to multiple internal targets ({dst}), "
        "consistent with lateral movement. Anomaly score: {score:.2f}."
    ),
    "unknown_anomaly": (
        "An anomalous network flow was detected between {src} and {dst}. "
        "Anomaly score: {score:.2f}. Manual review recommended."
    ),
}


async def generate(
    label: str,
    src: str,
    dst: str,
    score: float,
    severity: str,
    top_features: list[dict[str, Any]],
    api_key: str,
) -> str:
    if api_key:
        try:
            return await _llm_narrative(label, src, dst, score, severity, top_features, api_key)
        except Exception as exc:
            log.warning("LLM narrative failed, using template: %s", exc)

    template = _TEMPLATES.get(label, _TEMPLATES["unknown_anomaly"])
    return template.format(src=src, dst=dst, score=score, severity=severity)


async def _llm_narrative(
    label: str,
    src: str,
    dst: str,
    score: float,
    severity: str,
    top_features: list[dict[str, Any]],
    api_key: str,
) -> str:
    import anthropic

    feat_summary = ", ".join(
        f"{f['name']}={f['value']:.1f}" for f in top_features[:3]
    )
    prompt = (
        f"You are a network security analyst. Write a concise plain-English incident summary "
        f"(maximum 200 words, no markdown) for a {severity} severity {label.replace('_', ' ')} "
        f"detected between {src} and {dst}. "
        f"Anomaly score: {score:.2f}. "
        f"Top contributing features: {feat_summary}. "
        f"Focus on what happened and what the analyst should do next."
    )

    client = anthropic.AsyncAnthropic(api_key=api_key)
    message = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=300,
        messages=[{"role": "user", "content": prompt}],
    )
    block = message.content[0]
    text = block.text if hasattr(block, "text") else ""
    return str(text)[:1200]
