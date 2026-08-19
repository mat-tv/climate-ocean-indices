from pathlib import Path
from datetime import datetime, timezone
from urllib.request import Request, urlopen
import csv
import hashlib
import io
import json


# ============================================================
# SAM / AAO - Southern Annular Mode
# NOAA Climate Prediction Center
# ============================================================

SOURCE_URL = (
    "https://ftp.cpc.ncep.noaa.gov/cwlinks/"
    "norm.daily.aao.cdas.z700.19790101_current.csv"
)

SOURCE_PAGE_URL = (
    "https://www.cpc.ncep.noaa.gov/products/precip/"
    "CWlink/daily_ao_index/aao/aao.shtml"
)

METHODOLOGY_URL = (
    "https://www.cpc.ncep.noaa.gov/products/precip/"
    "CWlink/daily_ao_index/history/method.shtml"
)

OUTPUT_CSV = Path("data/sam.csv")
OUTPUT_JSON = Path("data/sam.json")
OUTPUT_METADATA = Path("metadata/sam.json")


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

reader = csv.DictReader(
    io.StringIO(source_text)
)

expected_header = [
    "year",
    "month",
    "day",
    "aao_index_cdas"
]

if reader.fieldnames != expected_header:
    raise ValueError(
        f"Unexpected NOAA header: {reader.fieldnames}"
    )


records = []

for row in reader:

    year = int(row["year"])
    month = int(row["month"])
    day = int(row["day"])

    date_object = datetime(
        year,
        month,
        day
    )

     raw_value = row["aao_index_cdas"].strip()

     if raw_value == "":
        value = None
     else:
        value = float(raw_value)
    )

    records.append({
        "date": date_object.strftime("%Y-%m-%d"),
        "sam": value,
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
        "Duplicate dates detected in SAM dataset"
    )


if dates != sorted(dates):
    raise ValueError(
        "SAM records are not chronologically ordered"
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
    if record["sam"] is None
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
            "sam"
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

    "id": "sam",

    "name": "Southern Annular Mode",

    "short_name": "SAM",

    "source_name": (
        "Antarctic Oscillation"
    ),

    "source_short_name": "AAO",

    "source_institution": (
        "NOAA Climate Prediction Center"
    ),

    "source_url": SOURCE_URL,

    "source_page_url": (
        SOURCE_PAGE_URL
    ),

    "methodology_url": (
        METHODOLOGY_URL
    ),

    "source_dataset": (
        "CDAS / 700 hPa geopotential height"
    ),

    "source_variable": (
        "aao_index_cdas"
    ),

    "definition": (
        "Daily Antarctic Oscillation index "
        "constructed by projecting daily 00Z "
        "700 hPa geopotential height anomalies "
        "poleward of 20S onto the leading AAO "
        "loading pattern."
    ),

    "normalization": (
        "Standardized using the standard "
        "deviation of the monthly AAO index "
        "for the 1979-2000 base period."
    ),

    "reference_period": (
        "1979-2000"
    ),

    "temporal_resolution": (
        "daily"
    ),

    "units": (
        "dimensionless standardized index"
    ),

    "time_representation": (
        "Each record retains the original "
        "calendar day of the NOAA CPC daily "
        "AAO product. No temporal aggregation "
        "or interpolation is applied."
    ),

    "first_record": (
        records[0]
    ),

    "last_record": (
        records[-1]
    ),

    "number_of_records": (
        len(records)
    ),

    "missing_calendar_days": (
        missing_calendar_days
    ),

    "retrieved_utc": (
        retrieved_utc
    ),

    "source_sha256": (
        source_sha256
    )
    "missing_calendar_days": (
    missing_calendar_days
    ),

    "missing_value_count": (
        len(missing_value_records)
    ),

    "missing_value_dates": (
        missing_value_dates
    ),
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

print("SAM update completed")
print(f"Records:       {len(records)}")
print(f"First record:  {records[0]}")
print(f"Last record:   {records[-1]}")
print(f"Missing days:  {missing_calendar_days}")
print(f"Missing values:{len(missing_value_records)}")
print(f"Missing dates: {missing_value_dates}")
print(f"Source SHA256: {source_sha256}")
