from pathlib import Path
from datetime import datetime, timezone
from urllib.request import Request, urlopen
import csv
import hashlib
import json


# ============================================================
# RONI - Relative Oceanic Niño Index
# NOAA Climate Prediction Center
# ============================================================

SOURCE_URL = "https://www.cpc.ncep.noaa.gov/data/indices/RONI.ascii.txt"

OUTPUT_CSV = Path("data/roni.csv")
OUTPUT_JSON = Path("data/roni.json")
OUTPUT_METADATA = Path("metadata/roni.json")


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

header = lines[0].split()

if header != ["SEAS", "YR", "ANOM"]:
    raise ValueError(f"Unexpected NOAA header: {header}")


season_to_month = {
    "DJF": 1,
    "JFM": 2,
    "FMA": 3,
    "MAM": 4,
    "AMJ": 5,
    "MJJ": 6,
    "JJA": 7,
    "JAS": 8,
    "ASO": 9,
    "SON": 10,
    "OND": 11,
    "NDJ": 12,
}


records = []

for line in lines[1:]:

    season, year, value = line.split()

    year = int(year)
    value = float(value)
    month = season_to_month[season]

    date = f"{year:04d}-{month:02d}-01"

    records.append({
        "date": date,
        "season": season,
        "year": year,
        "roni": value,
    })


# ============================================================
# 3. Controles básicos
# ============================================================

dates = [record["date"] for record in records]

if len(dates) != len(set(dates)):
    raise ValueError("Duplicate dates detected in RONI dataset")

if dates != sorted(dates):
    raise ValueError("RONI records are not chronologically ordered")


# ============================================================
# 4. Guardar CSV
# ============================================================

OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)

with OUTPUT_CSV.open("w", newline="", encoding="utf-8") as file:

    writer = csv.DictWriter(
        file,
        fieldnames=["date", "season", "year", "roni"]
    )

    writer.writeheader()
    writer.writerows(records)


# ============================================================
# 5. Guardar JSON
# ============================================================

with OUTPUT_JSON.open("w", encoding="utf-8") as file:
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
    "id": "roni",
    "name": "Relative Oceanic Niño Index",
    "short_name": "RONI",

    "source_institution": "NOAA Climate Prediction Center",
    "source_url": SOURCE_URL,
        "source_page_url": (
        "https://www.cpc.ncep.noaa.gov/products/"
        "analysis_monitoring/enso/roni/"
    ),

    "methodology_url": (
        "https://www.cpc.ncep.noaa.gov/products/"
        "analysis_monitoring/enso/roni/"
    ),
    "source_dataset": "ERSSTv6",

    "definition": (
        "Three-month running mean of the relative Niño 3.4 index. "
        "NOAA CPC computes the relative Niño 3.4 anomaly by subtracting "
        "the tropical-mean SST anomaly (20N-20S) from the Niño 3.4 "
        "SST anomaly and adjusting the resulting series so that its "
        "variance equals that of the original Niño 3.4 index."
    ),

    "region_nino34": "5N-5S, 170W-120W",
    "tropical_reference_region": "20N-20S",

    "reference_period": "1991-2020",
    "temporal_resolution": "overlapping 3-month seasons",
    "units": "degC",

    "time_representation": (
        "The date field represents the first day of the central month "
        "of each 3-month season. NOAA season and year fields are retained."
    ),
    "data_note": (
        "NOAA CPC indicates that the most recent RONI values "
        "should be considered estimates because ERSSTv6 values "
        "may be revised for up to two months after their initial "
        "real-time publication."
    ),
    
    "first_record": records[0],
    "last_record": records[-1],
    "number_of_records": len(records),

    "retrieved_utc": retrieved_utc,
    "source_sha256": source_sha256
}


OUTPUT_METADATA.parent.mkdir(parents=True, exist_ok=True)

with OUTPUT_METADATA.open("w", encoding="utf-8") as file:
    json.dump(
        metadata,
        file,
        indent=2,
        ensure_ascii=False
    )


# ============================================================
# 7. Resumen
# ============================================================

print("RONI update completed")
print(f"Records:      {len(records)}")
print(f"First record: {records[0]}")
print(f"Last record:  {records[-1]}")
print(f"Source SHA256: {source_sha256}")
