#!/usr/bin/env python3
"""Erzeugt devices/argon-flow-XX.yaml für alle 16 Anlagen.

Trage die Anlagen unten in MACHINES ein (Name + SP-Wert je Sensor) und führe aus:
    python gen_devices.py
Bereits vorhandene Dateien werden überschrieben.
"""
from pathlib import Path

# (machine_id, Klartext-Name, liter_per_pulse = Festo-SP in Nl/Puls)
MACHINES = [
    ("anlage-01", "Anlage 01", 1.0),
    ("anlage-02", "Anlage 02", 1.0),
    ("anlage-03", "Anlage 03", 1.0),
    ("anlage-04", "Anlage 04", 1.0),
    ("anlage-05", "Anlage 05", 1.0),
    ("anlage-06", "Anlage 06", 1.0),
    ("anlage-07", "Anlage 07", 1.0),
    ("anlage-08", "Anlage 08", 1.0),
    ("anlage-09", "Anlage 09", 1.0),
    ("anlage-10", "Anlage 10", 1.0),
    ("anlage-11", "Anlage 11", 1.0),
    ("anlage-12", "Anlage 12", 1.0),
    ("anlage-13", "Anlage 13", 1.0),
    ("anlage-14", "Anlage 14", 1.0),
    ("anlage-15", "Anlage 15", 1.0),
    ("anlage-16", "Anlage 16", 1.0),
]

TEMPLATE = """\
# Auto-generiert von gen_devices.py – manuelle Änderungen ggf. überschrieben.
substitutions:
  device_name: "{dev}"
  friendly_name: "{friendly}"
  machine_id: "{mid}"
  liter_per_pulse: "{lpp}"

packages:
  common: !include ../argon-flowmeter.yaml
"""

out = Path(__file__).parent / "devices"
out.mkdir(exist_ok=True)
for i, (mid, name, lpp) in enumerate(MACHINES, start=1):
    dev = f"argon-flow-{i:02d}"
    (out / f"{dev}.yaml").write_text(
        TEMPLATE.format(dev=dev, friendly=f"Argon Flow {i:02d} – {name}", mid=mid, lpp=lpp),
        encoding="utf-8",
    )
    print(f"  geschrieben: devices/{dev}.yaml  ({mid}, SP={lpp} Nl/Puls)")
print(f"Fertig: {len(MACHINES)} Geräte-Dateien.")
