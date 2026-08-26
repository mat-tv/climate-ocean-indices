from pathlib import Path
from datetime import datetime, timezone
from urllib.request import Request, urlopen
import csv
import hashlib
import io
import json
import math


# ============================================================
# MJO / ROMI - Real-time OLR MJO Index
# NOAA Physical Sciences Laboratory
# ============================================================

SOURCE_URL = (
    "https://www.psl.noaa.gov/mjo/mjoindex/"
    "romi.cpcolr.1x.txt"
)

SOURCE_PAGE_URL = (
    "https://www.psl.noaa.gov/mjo/index.html"
)

FORMAT_URL = (
    "https://www.psl.noaa.gov/mjo/mjoindex/format.html"
)

METHODOLOGY_URL = (
    "https://doi.org/10.1175/MWR-D-13-00301.1"
)

USAGE_URL = (
    "https://www.psl.noaa.gov/disclaimer/"
)

OUTPUT_CSV = Path("data/mjo.csv")
OUTPUT_JSON = Path("data/mjo.json")
OUTPUT_METADATA = Path("metadata/mjo.json")


# ============================================================
# 1. Descargar archivo oficial
# ============================================================

request = Request(
    SOURCE_URL,
    headers={"User-Agent": "climate-ocean-indices/1.0"}
)

with urlopen(request, timeout=30) as response:
    source_bytes = response.read()

source_text = source_bytes.decode("utf-8")
source_sha256 = hashlib.sha256(source_bytes).hexdigest()


# ============================================================
# 2. Leer datos
# ============================================================

records = []

for line in source_text.strip().splitlines():

    parts = line.split()

    if len(parts) < 7:
        continue

    if not parts[0].lstrip("-").isdigit():
        continue

    year = int(parts[0])
    month = int(parts[1])
    day = int(parts[2])
    hour = int(parts[3])

    pc1 = float(parts[4])
    pc2 = float(parts[5])
    amplitude = float(parts[6])

    date_object = datetime(
        year,
        month,
        day
    )

    if (
        not math.isfinite(pc1)
        or not math.isfinite(pc2)
        or not math.isfinite(amplitude)
    ):
        pc1 = None
        pc2 = None
        amplitude = None
        phase_space_x = None
        phase_space_y = None
        phase = None

    else:

        # NOAA PSL indica que, para mostrar ROMI en la misma
        # orientación de fase que RMM:
        #
        # x = ROMI PC2
        # y = -ROMI PC1

        phase_space_x = pc2
        phase_space_y = -pc1

        angle = math.degrees(
            math.atan2(
                phase_space_y,
                phase_space_x
            )
        )

        phase = (
            int(
                math.floor(
                    (angle + 180.0) / 45.0
                )
            )
            + 1
        )

        if phase == 9:
            phase = 1

        calculated_amplitude = math.hypot(
            pc1,
            pc2
        )

        if abs(
            calculated_amplitude - amplitude
        ) > 0.002:
            raise ValueError(
                "ROMI amplitude is inconsistent "
                f"on {date_object:%Y-%m-%d}: "
                f"source={amplitude}, "
                f"calculated={calculated_amplitude}"
            )

    records.append({
        "date": date_object.strftime("%Y-%m-%d"),
        "hour_utc": hour,
        "romi_pc1": pc1,
        "romi_pc2": pc2,
        "phase_space_x": phase_space_x,
        "phase_space_y": phase_space_y,
        "phase": phase,
        "amplitude": amplitude,
    })


# ============================================================
# 3. Controles básicos
# ============================================================

dates = [
    datetime.strptime(
        record["date"],
        "%Y-%m-%d"
    )
    for record in records
]


if len(dates) != len(set(dates)):
    raise ValueError(
        "Duplicate dates detected in ROMI dataset"
    )


if dates != sorted(dates):
    raise ValueError(
        "ROMI records are not chronologically ordered"
    )


missing_calendar_days = 0

for previous, current in zip(
    dates[:-1],
    dates[1:]
):

    delta_days = (
        current - previous
    ).days

    if delta_days > 1:
        missing_calendar_days += (
            delta_days - 1
        )


missing_value_records = [
    record
    for record in records
    if (
        record["romi_pc1"] is None
        or record["romi_pc2"] is None
        or record["amplitude"] is None
    )
]

missing_value_dates = [
    record["date"]
    for record in missing_value_records
]


# ============================================================
# 4. Guardar CSV
# ============================================================

OUTPUT_CSV.parent.mkdir(
    parents=True,
    exist_ok=True
)

with OUTPUT_CSV.open(
    "w",
    newline="",
    encoding="utf-8"
) as file:

    writer = csv.DictWriter(
        file,
        fieldnames=[
            "date",
            "hour_utc",
            "romi_pc1",
            "romi_pc2",
            "phase_space_x",
            "phase_space_y",
            "phase",
            "amplitude",
        ]
    )

    writer.writeheader()
    writer.writerows(records)


# ============================================================
# 5. Guardar JSON
# ============================================================

with OUTPUT_JSON.open(
    "w",
    encoding="utf-8"
) as file:

    json.dump(
        records,
        file,
        indent=2,
        ensure_ascii=False
    )


# ============================================================
# 6. Metadatos
# ============================================================

retrieved_utc = (
    datetime.now(timezone.utc)
    .isoformat()
)


metadata = {
    "id": "mjo_romi",

    "name": "Madden-Julian Oscillation",
    "short_name": "MJO",

    "index_name": "Real-time OLR MJO Index",
    "index_short_name": "ROMI",

    "source_institution": (
        "NOAA Physical Sciences Laboratory"
    ),

    "source_url": SOURCE_URL,
    "source_page_url": SOURCE_PAGE_URL,
    "format_url": FORMAT_URL,
    "methodology_url": METHODOLOGY_URL,
    "usage_url": USAGE_URL,

    "definition": (
        "ROMI is a real-time convective MJO index based on the "
        "projection of a 9-day running average of outgoing longwave "
        "radiation anomalies onto daily spatial EOF patterns of "
        "30-96 day eastward-filtered OLR."
    ),

    "input_variable": (
        "Outgoing longwave radiation (OLR)"
    ),

    "temporal_resolution": "daily",
    "units": "dimensionless",

    "time_representation": (
        "Each record retains the original daily date and UTC hour "
        "published by NOAA PSL. No temporal aggregation, interpolation "
        "or gap filling is applied."
    ),

    "phase_space_representation": (
        "For comparison with the conventional Wheeler-Hendon RMM "
        "phase-space orientation, NOAA PSL specifies that ROMI PC2 "
        "is analogous to RMM1 and -ROMI PC1 is analogous to RMM2. "
        "The portal therefore plots x = ROMI PC2 and y = -ROMI PC1."
    ),

    "phase_derivation": (
        "The displayed phase number (1-8) is derived by the portal "
        "from the NOAA-recommended phase-space orientation using "
        "eight 45-degree sectors. This geometric phase assignment "
        "does not convert ROMI into the RMM index."
    ),

    "weak_signal_note": (
        "Amplitude below 1 is displayed as weak MJO signal. "
        "The phase-space position is retained, but the portal does "
        "not interpret the phase alone as a strong MJO event."
    ),

    "product_distinction": (
        "ROMI is not the Wheeler-Hendon RMM index. ROMI is based on "
        "OLR only, whereas RMM is a multivariate index using OLR and "
        "zonal winds at 850 and 200 hPa."
    ),

    "citation": (
        "Kiladis, G.N., Dias, J., Straub, K.H., Wheeler, M.C., "
        "Tulich, S.N., Kikuchi, K., Weickmann, K.M., and Ventrice, "
        "M.J. (2014), A Comparison of OLR and Circulation-Based "
        "Indices for Tracking the MJO, Monthly Weather Review, "
        "142, 1697-1715."
    ),

    "first_record": records[0],
    "last_record": records[-1],
    "number_of_records": len(records),

    "missing_calendar_days": (
        missing_calendar_days
    ),

    "missing_value_count": (
        len(missing_value_records)
    ),

    "missing_value_dates": (
        missing_value_dates
    ),

    "retrieved_utc": retrieved_utc,
    "source_sha256": source_sha256
}


OUTPUT_METADATA.parent.mkdir(
    parents=True,
    exist_ok=True
)


with OUTPUT_METADATA.open(
    "w",
    encoding="utf-8"
) as file:

    json.dump(
        metadata,
        file,
        indent=2,
        ensure_ascii=False
    )


# ============================================================
# 7. Resumen
# ============================================================

valid_records = [
    record
    for record in records
    if record["amplitude"] is not None
]

last_valid = valid_records[-1]


print("MJO / ROMI update completed")
print(f"Records:        {len(records)}")
print(f"First record:   {records[0]}")
print(f"Last valid:     {last_valid}")
print(f"Missing days:   {missing_calendar_days}")
print(f"Missing values: {len(missing_value_records)}")
print(f"Source SHA256:  {source_sha256}")
