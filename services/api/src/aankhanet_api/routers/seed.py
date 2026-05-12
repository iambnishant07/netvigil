from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, status

from aankhanet_api import database as db
from aankhanet_api.deps import CurrentUser

router = APIRouter(tags=["seed"])

_N1 = (
    "A sustained port scan was detected originating from an external host, "
    "systematically probing TCP ports across the target subnet. The scan "
    "pattern matches known reconnaissance techniques (MITRE T1046). Recommend "
    "blocking the source IP and reviewing firewall ingress rules immediately."
)
_N2 = (
    "High-volume DDoS traffic detected targeting the public-facing firewall. "
    "Packet rates exceeded 200 kpps with spoofed source IPs consistent with an "
    "NTP amplification vector (MITRE T1498). Upstream ISP rate-limiting has been "
    "requested. Monitor for service degradation."
)
_N3 = (
    "Anomalous outbound traffic from an internal host to a threat-intel-flagged "
    "IP. Regular beaconing at 60-second intervals suggests active C2 communication "
    "(MITRE T1071.001). Isolate the affected host and perform memory forensics "
    "before reimaging."
)

# (label, mitre, severity, status, src_ip, dst_ip, score, narrative, hours_ago, top_features)
_INCIDENTS: list[tuple] = [
    ("PortScan",        "T1046",     "critical", "open",          "185.220.101.45", "10.0.0.1",     0.97, _N1,  1,   [{"name":"flow_duration","value":0.12},{"name":"fwd_packet_length_max","value":64.0},{"name":"flow_iat_std","value":1.45}]),
    ("DDoS",            "T1498",     "critical", "confirmed",     "198.51.100.23",  "203.0.113.1",  0.99, _N2,  3,   [{"name":"fwd_packets_per_second","value":98234.0},{"name":"bwd_packet_length_max","value":1472.0},{"name":"flow_bytes_per_second","value":142000000.0}]),
    ("BruteForce_SSH",  "T1110.003", "high",     "open",          "45.33.32.156",   "192.168.1.22", 0.89, None, 6,   [{"name":"flow_duration","value":120.5},{"name":"fwd_iat_total","value":0.34},{"name":"psh_flag_count","value":0.0}]),
    ("BruteForce_FTP",  "T1110.001", "high",     "acknowledged",  "185.220.101.46", "192.168.1.15", 0.84, None, 12,  [{"name":"flow_duration","value":89.2},{"name":"fwd_packets_per_second","value":4.1},{"name":"fin_flag_count","value":1.0}]),
    ("Web_Attack_SQLi", "T1190",     "high",     "open",          "198.51.100.5",   "10.0.0.80",    0.91, None, 18,  [{"name":"fwd_packet_length_max","value":1024.0},{"name":"bwd_packet_length_mean","value":8192.0},{"name":"urg_flag_count","value":0.0}]),
    ("Web_Attack_XSS",  "T1059.007", "high",     "open",          "203.0.113.50",   "10.0.0.80",    0.76, None, 24,  [{"name":"fwd_header_length","value":320.0},{"name":"bwd_header_length","value":480.0},{"name":"flow_iat_mean","value":0.02}]),
    ("Botnet_ARES",     "T1071.001", "high",     "confirmed",     "192.168.1.55",   "45.33.32.200", 0.94, _N3,  36,  [{"name":"flow_duration","value":3600.0},{"name":"fwd_iat_std","value":0.1},{"name":"fwd_packets_per_second","value":0.016}]),
    ("DoS_Hulk",        "T1499",     "medium",   "open",          "192.168.1.30",   "10.0.0.5",     0.72, None, 2,   [{"name":"fwd_packets_per_second","value":55000.0},{"name":"flow_bytes_per_second","value":890000.0},{"name":"psh_flag_count","value":1.0}]),
    ("DoS_Slowloris",   "T1499",     "medium",   "open",          "192.168.1.31",   "10.0.0.5",     0.68, None, 5,   [{"name":"flow_duration","value":90.0},{"name":"fwd_iat_max","value":30.0},{"name":"active_mean","value":45000.0}]),
    ("Infiltration",    "T1041",     "medium",   "acknowledged",  "192.168.1.10",   "198.51.100.1", 0.81, None, 8,   [{"name":"flow_bytes_per_second","value":125000.0},{"name":"fwd_packet_length_mean","value":800.0},{"name":"flow_duration","value":60.0}]),
    ("PortScan",        "T1046",     "medium",   "open",          "185.220.101.47", "192.168.1.0",  0.65, None, 15,  [{"name":"flow_duration","value":0.08},{"name":"fwd_packet_length_max","value":64.0},{"name":"syn_flag_count","value":1.0}]),
    ("BruteForce_SSH",  "T1110.003", "medium",   "false_positive","192.168.1.50",   "192.168.1.22", 0.61, None, 30,  [{"name":"flow_duration","value":45.0},{"name":"fwd_packets_per_second","value":2.1},{"name":"psh_flag_count","value":0.0}]),
    ("Web_Attack_XSS",  "T1059.007", "medium",   "acknowledged",  "198.51.100.10",  "10.0.0.80",    0.73, None, 48,  [{"name":"fwd_packet_length_max","value":512.0},{"name":"bwd_packet_length_max","value":4096.0},{"name":"flow_iat_std","value":0.5}]),
    ("DoS_Hulk",        "T1499",     "medium",   "confirmed",     "192.168.1.32",   "10.0.0.10",    0.78, None, 60,  [{"name":"fwd_packets_per_second","value":48000.0},{"name":"flow_bytes_per_second","value":750000.0},{"name":"rst_flag_count","value":1.0}]),
    ("PortScan",        "T1046",     "low",      "false_positive","192.168.1.100",  "192.168.1.1",  0.52, None, 72,  [{"name":"flow_duration","value":0.05},{"name":"fwd_packet_length_max","value":64.0},{"name":"syn_flag_count","value":1.0}]),
    ("BruteForce_FTP",  "T1110.001", "low",      "open",          "185.220.101.48", "192.168.1.21", 0.58, None, 84,  [{"name":"flow_duration","value":30.0},{"name":"fwd_packets_per_second","value":1.5},{"name":"fin_flag_count","value":1.0}]),
    ("DoS_Slowloris",   "T1499",     "low",      "acknowledged",  "192.168.1.33",   "10.0.0.5",     0.55, None, 96,  [{"name":"flow_duration","value":20.0},{"name":"fwd_iat_max","value":10.0},{"name":"active_mean","value":15000.0}]),
    ("Web_Attack_SQLi", "T1190",     "low",      "open",          "198.51.100.20",  "10.0.0.80",    0.63, None, 108, [{"name":"fwd_packet_length_max","value":256.0},{"name":"bwd_packet_length_mean","value":2048.0},{"name":"urg_flag_count","value":0.0}]),
    ("PortScan",        "T1046",     "info",     "open",          "192.168.1.200",  "192.168.1.1",  0.41, None, 120, [{"name":"flow_duration","value":0.03},{"name":"fwd_packet_length_max","value":64.0},{"name":"syn_flag_count","value":1.0}]),
    ("BruteForce_SSH",  "T1110.003", "info",     "false_positive","192.168.1.201",  "192.168.1.22", 0.38, None, 144, [{"name":"flow_duration","value":10.0},{"name":"fwd_packets_per_second","value":0.5},{"name":"psh_flag_count","value":0.0}]),
]

_DEVICES = [
    ("pfSense-Core-01",  "Netgate",  "NetFlow", "203.0.113.1"),
    ("MikroTik-Edge-01", "MikroTik", "NetFlow", "203.0.113.2"),
]

_RULES = [
    ("Critical alerts → email",  "critical", "email"),
    ("High & above → push",      "high",     "push"),
    ("Medium & above → SMS",     "medium",   "sms"),
]


@router.post("/seed", status_code=status.HTTP_200_OK)
async def seed_demo_data(current_user: CurrentUser) -> dict:
    """Insert demo devices, incidents, and alert rules for the authenticated org."""
    org_id = current_user["org"]
    now = datetime.now(timezone.utc)
    created: dict[str, int] = {"devices": 0, "incidents": 0, "alert_rules": 0}

    async with db.get_connection() as conn:
        await conn.execute("SELECT set_config('app.current_org', $1, TRUE)", org_id)

        # Devices — skip if already present by name
        device_ids: list[str] = []
        for name, vendor, protocol, ip in _DEVICES:
            row = await conn.fetchrow(
                "SELECT id FROM devices WHERE name=$1 AND organization_id=$2::uuid",
                name, org_id,
            )
            if row:
                device_ids.append(str(row["id"]))
            else:
                dev_id = str(uuid.uuid4())
                await conn.execute(
                    """INSERT INTO devices
                           (id, organization_id, name, vendor, protocol, public_ip, shared_secret_hash)
                       VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6::inet,'seed-placeholder')""",
                    dev_id, org_id, name, vendor, protocol, ip,
                )
                device_ids.append(dev_id)
                created["devices"] += 1

        # Incidents — always insert so re-seeding adds fresh data
        for i, (label, mitre, sev, stat, src, dst, score, narr, hrs, feats) in enumerate(_INCIDENTS):
            dev_id = device_ids[i % len(device_ids)]
            detected = now - timedelta(hours=hrs)
            await conn.execute(
                """INSERT INTO incidents
                       (id, organization_id, device_id, detected_at, severity, status,
                        attack_label, mitre_technique, source_ip, destination_ip,
                        anomaly_score, narrative, top_features)
                   VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)""",
                str(uuid.uuid4()), org_id, dev_id, detected,
                sev, stat, label, mitre, src, dst, score, narr, json.dumps(feats),
            )
            created["incidents"] += 1

        # Alert rules — skip if name already exists
        for name, min_sev, channel in _RULES:
            exists = await conn.fetchrow(
                "SELECT id FROM alert_rules WHERE name=$1 AND organization_id=$2::uuid",
                name, org_id,
            )
            if not exists:
                await conn.execute(
                    """INSERT INTO alert_rules (id, organization_id, name, min_severity, channel, enabled)
                       VALUES ($1::uuid,$2::uuid,$3,$4,$5,TRUE)""",
                    str(uuid.uuid4()), org_id, name, min_sev, channel,
                )
                created["alert_rules"] += 1

    return {"seeded": created}
