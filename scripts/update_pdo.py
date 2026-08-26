from pathlib import Path
from datetime import datetime, timezone
from urllib.request import Request, urlopen
import csv
import hashlib
import json


# ============================================================
# PDO - Pacific Decadal Oscillation
# NOAA Physical Sciences Laboratory
# ============================================================

SOURCE_URL = (
    "https://psl.noaa.gov/pdo/data/"
    "pdo.timeseries.sstens.data"
)

SOURCE_PAGE_URL = (
    "https://psl.noaa.gov/data/timeseries/month/PDO/"
)

FORMAT_URL = (
    "https://psl.noaa.gov/data/timeseries/month/standard/"
)

USAGE_URL = (
    "https://www.psl.noaa.gov/disclaimer/"
)

METHODOLOGY_URL = (
    "https://doi.org/10.1175/JCLI-D-15-0508.1"
)

OUTPUT_CSV = Path("data/pdo.csv")
OUTPUT_JSON = Path("data/pdo.json")
OUTPUT_METADATA = Path("metadata/pdo.json")


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
# 2. Leer formato mensual estándar de NOAA PSL
# ============================================================

lines = [
    line.strip()
    for line in source_text.splitlines()
    if line.strip() != ""
]

start_year, end_year = map(
    int,
    lines[0].split()
)

number_of_years = (
    end_year - start_year + 1
)

data_lines = lines[
    1:1 + number_of_years
]

missing_value = float(
    lines[1 + number_of_years]
)

source_notes = lines[
    2 + number_of_years:
]


records = []

for line in data_lines:

    parts = line.split()

    if len(parts) != 13:
        raise ValueError(
            f"Unexpected PDO row: {line}"
        )

    year = int(parts[0])

    values = [
        float(value)
        for value in parts[1:]
    ]

    for month, value in enumerate(
        values,
        start=1
    ):

        if value == missing_value:
            value_out = None
        else:
            value_out = value

        records.append({
            "date": (
                f"{year:04d}-{month:02d}-01"
            ),
            "year": year,
            "month": month,
            "pdo": value_out,
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
        "Duplicate dates detected in PDO dataset"
    )


if dates != sorted(dates):
    raise ValueError(
        "PDO records are not chronologically ordered"
    )


if records[0]["year"] != start_year:
    raise ValueError(
        "First PDO year does not match source header"
    )


if records[-1]["year"] != end_year:
    raise ValueError(
        "Last PDO year does not match source header"
    )


missing_value_records = [
    record
    for record in records
    if record["pdo"] is None
]

missing_value_dates = [
    record["date"]
    for record in missing_value_records
]


valid_records = [
    record
    for record in records
    if record["pdo"] is not None
]

first_valid = valid_records[0]
last_valid = valid_records[-1]


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
            "year",
            "month",
            "pdo",
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
    "id": "pdo",

    "name": "Pacific Decadal Oscillation",
    "short_name": "PDO",

    "source_institution": (
        "NOAA Physical Sciences Laboratory"
    ),

    "source_url": SOURCE_URL,
    "source_page_url": SOURCE_PAGE_URL,
    "format_url": FORMAT_URL,
    "methodology_url": METHODOLOGY_URL,
    "usage_url": USAGE_URL,

    "source_product": (
        "Ensemble mean PDO"
    ),

    "definition": (
        "Leading EOF of monthly sea-surface-temperature anomalies "
        "in the North Pacific between 20N and 70N. NOAA PSL removes "
        "the monthly SST climatology and the global-mean SST anomaly "
        "before calculating the PDO."
    ),

    "reference_period": (
        "1920-2014 EOF/climatology period, as documented by NOAA PSL"
    ),

    "temporal_resolution": "monthly",

    "units": (
        "degC, as documented by NOAA PSL"
    ),

    "time_representation": (
        "Each monthly value is represented by the first day of its "
        "calendar month. No temporal interpolation, smoothing or "
        "aggregation is applied by this portal."
    ),

    "source_file_start_year": start_year,
    "source_file_end_year": end_year,

    "first_record": records[0],
    "first_valid_record": first_valid,
    "last_valid_record": last_valid,

    "number_of_records": len(records),
    "number_of_valid_records": len(valid_records),

    "missing_value_sentinel": missing_value,
    "missing_value_count": len(missing_value_records),
    "missing_value_dates": missing_value_dates,

    "source_notes": source_notes,

    "documentation_note": (
        "The NOAA PSL PDO webpage currently states monthly coverage "
        "from 1891/01 to present, while the machine-readable standard "
        "file currently begins in 1870. This portal preserves the "
        "machine-readable source file exactly and records this "
        "documentation discrepancy explicitly."
    ),

    "usage": {
        "status": (
            "U.S. government information; public domain unless "
            "specifically annotated otherwise"
        ),
        "redistribution": True,
        "attribution": (
            "Data provided by the NOAA Physical Sciences Laboratory, "
            "Boulder, Colorado, USA."
        ),
        "usage_url": USAGE_URL,
    },

    "citation": (
        "Newman, M., Alexander, M. A., Ault, T. R., Cobb, K. M., "
        "Deser, C., Di Lorenzo, E., Mantua, N., Miller, A. J., "
        "Minobe, S., Nakamura, H., Schneider, N., Vimont, D. J., "
        "Phillips, A. S., Scott, J. D., and Smith, C. A. (2016): "
        "The Pacific Decadal Oscillation, Revisited. Journal of "
        "Climate, 29, 4399-4427."
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

print("PDO update completed")
print(f"Records:        {len(records)}")
print(f"Valid records:  {len(valid_records)}")
print(f"First record:   {records[0]}")
print(f"First valid:    {first_valid}")
print(f"Last valid:     {last_valid}")
print(f"Missing values: {len(missing_value_records)}")
print(f"Source SHA256:  {source_sha256}")
