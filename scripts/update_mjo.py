from pathlib import Path
from datetime import datetime, timezone
from urllib.request import Request, urlopen
import csv
import hashlib
import json
import math


# ============================================================
# MJO / RMM - Madden-Julian Oscillation
# Australian Bureau of Meteorology
# ============================================================

SOURCE_URL = (
    "https://www.bom.gov.au/clim_data/IDCKGEM000/"
    "rmm.74toRealtime.txt"
)

SOURCE_PAGE_URL = "https://www.bom.gov.au/climate/mjo/"

METHODOLOGY_WH04_URL = (
    "https://journals.ametsoc.org/view/journals/mwre/132/8/"
    "1520-0493_2004_132_1917_aarmmi_2.0.co_2.xml"
)

METHODOLOGY_G10_URL = (
    "https://journals.ametsoc.org/view/journals/bams/91/9/"
    "2010bams2816_1.xml"
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

lines = source_text.strip().splitlines()

if len(lines) < 3:
    raise ValueError("Unexpectedly short BOM RMM source file")

if "RMM values up to" not in lines[0]:
    raise ValueError(f"Unexpected BOM header line 1: {lines[0]}")

if "year, month, day, RMM1, RMM2, phase, amplitude" not in lines[1]:
    raise ValueError(f"Unexpected BOM header line 2: {lines[1]}")

records = []

for line in lines[2:]:

    fields = line.split()

    if len(fields) < 8:
        raise ValueError(f"Unexpected BOM data row: {line}")

    year = int(fields[0])
    month = int(fields[1])
    day = int(fields[2])

    rmm1_raw = float(fields[3])
    rmm2_raw = float(fields[4])
    phase_raw = int(fields[5])
    amplitude_raw = float(fields[6])
    method = fields[7]

    date_object = datetime(
        year,
        month,
        day
    )

    is_missing = (
        phase_raw == 999
        or abs(rmm1_raw) > 1e20
        or abs(rmm2_raw) > 1e20
        or abs(amplitude_raw) > 1e20
    )

    if is_missing:
        rmm1 = None
        rmm2 = None
        phase = None
        amplitude = None
    else:
        rmm1 = rmm1_raw
        rmm2 = rmm2_raw
        phase = phase_raw
        amplitude = amplitude_raw

    records.append({
        "date": date_object.strftime("%Y-%m-%d"),
        "rmm1": rmm1,
        "rmm2": rmm2,
        "phase": phase,
        "amplitude": amplitude,
        "method": method,
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
    raise ValueError("Duplicate dates detected in MJO dataset")

if dates != sorted(dates):
    raise ValueError("MJO records are not chronologically ordered")

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
    if record["amplitude"] is None
]

missing_value_dates = [
    record["date"]
    for record in missing_value_records
]

valid_records = [
    record
    for record in records
    if record["amplitude"] is not None
]

for record in valid_records:

    if record["phase"] not in range(1, 9):
        raise ValueError(
            f"Unexpected MJO phase at {record['date']}: {record['phase']}"
        )

    calculated_amplitude = math.hypot(
        record["rmm1"],
        record["rmm2"]
    )

    if abs(calculated_amplitude - record["amplitude"]) > 1e-4:
        raise ValueError(
            f"RMM amplitude mismatch at {record['date']}"
        )


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
            "rmm1",
            "rmm2",
            "phase",
            "amplitude",
            "method"
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

retrieved_utc = datetime.now(timezone.utc).isoformat()

metadata = {
    "id": "mjo",
    "name": "Madden-Julian Oscillation",
    "short_name": "MJO",

    "index_name": "Real-time Multivariate MJO Index",
    "index_short_name": "RMM",

    "source_institution": "Australian Bureau of Meteorology",
    "source_url": SOURCE_URL,
    "source_page_url": SOURCE_PAGE_URL,

    "methodology_wh04_url": METHODOLOGY_WH04_URL,
    "methodology_gottschalck2010_url": METHODOLOGY_G10_URL,

    "definition": (
        "The RMM index represents the MJO using two components, RMM1 and "
        "RMM2, derived from combined near-equatorial outgoing longwave "
        "radiation and 850 hPa and 200 hPa zonal wind fields."
    ),

    "temporal_resolution": "daily",
    "units": "dimensionless",

    "variables": {
        "rmm1": "First RMM component",
        "rmm2": "Second RMM component",
        "phase": "MJO phase from 1 to 8",
        "amplitude": "RMM vector amplitude"
    },

    "time_representation": (
        "Each record retains the original calendar day of the Bureau of "
        "Meteorology RMM product. No temporal aggregation or interpolation "
        "is applied."
    ),

    "source_processing_note": (
        "The source file states that for 1974-06-01 through 2013-12-31, "
        "both SST1 variability (ENSO) and the 120-day mean were removed. "
        "From 2014-01-01 onward, only the 120-day mean is removed."
    ),

    "methodology_note": (
        "The Bureau of Meteorology states that values through the end of "
        "2013 use the Wheeler and Hendon (2004) method, while values from "
        "2014 onward use the modified method described by Gottschalck et "
        "al. (2010)."
    ),

    "missing_value_definition": (
        "The source file identifies 1.E36 or 999 as missing values. These "
        "records are retained with null RMM1, RMM2, phase and amplitude."
    ),

    "first_record": records[0],
    "last_record": records[-1],
    "last_valid_record": valid_records[-1],
    "number_of_records": len(records),

    "missing_calendar_days": missing_calendar_days,
    "missing_value_count": len(missing_value_records),
    "missing_value_dates": missing_value_dates,

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

print("MJO update completed")
print(f"Records:        {len(records)}")
print(f"First record:   {records[0]}")
print(f"Last record:    {records[-1]}")
print(f"Last valid:     {valid_records[-1]}")
print(f"Missing days:   {missing_calendar_days}")
print(f"Missing values: {len(missing_value_records)}")
print(f"Source SHA256:  {source_sha256}")
