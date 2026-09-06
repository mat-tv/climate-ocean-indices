"""Update the additional climate-index products used by the dashboard.

The script intentionally uses only the Python standard library so it can run
unchanged in GitHub Actions. Existing RONI, PDO, SAM and MJO products are not
modified here.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen


DATA_DIR = Path("data")
METADATA_DIR = Path("metadata")
USER_AGENT = "climate-ocean-indices/1.0"
RETRIEVED_UTC = datetime.now(timezone.utc).isoformat()

SOURCES = {
    "nino": "https://www.cpc.ncep.noaa.gov/data/indices/ersst5.nino.mth.91-20.ascii",
    "soi": "https://www.cpc.ncep.noaa.gov/data/indices/soi",
    "mei": "https://psl.noaa.gov/enso/mei/data/meiv2.data",
    "tpi": "https://psl.noaa.gov/data/timeseries/IPOTPI/tpi.timeseries.ersstv5.data",
    "pmm": "https://psl.noaa.gov/data/timeseries/month/data/pmm.csv",
    "dmi": "https://psl.noaa.gov/data/timeseries/month/data/dmi.had.long.csv",
    "qbo_30": "https://www.cpc.ncep.noaa.gov/data/indices/qbo.u30.index",
    "qbo_50": "https://www.cpc.ncep.noaa.gov/data/indices/qbo.u50.index",
    "sea_ice": "https://noaadata.apps.nsidc.org/NOAA/G02135/south/daily/data/S_seaice_extent_daily_v4.0.csv",
    "sea_ice_climatology": "https://noaadata.apps.nsidc.org/NOAA/G02135/south/daily/data/S_seaice_extent_climatology_1981-2010_v4.0.csv",
    "amo": "https://www.ncei.noaa.gov/pub/data/cmb/ersst/v5/index/ersst.v5.amo.dat",
    "nao": "https://psl.noaa.gov/data/correlation/nao.data",
}


def download(url: str) -> tuple[bytes, str]:
    request = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(request, timeout=60) as response:
        payload = response.read()
    return payload, payload.decode("utf-8", errors="replace")


def standard_monthly(text: str, value_key: str, missing_limit: float = -90.0):
    """Read the NOAA PSL 13-column year + month format."""
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    start_year, end_year = (int(value) for value in lines[0].split()[:2])
    records = []
    for line in lines[1 : 2 + end_year - start_year]:
        values = re.findall(r"[-+]?\d+(?:\.\d+)?", line)
        if len(values) < 13:
            continue
        year = int(values[0])
        for month, raw_value in enumerate(values[1:13], 1):
            value = float(raw_value)
            if value <= missing_limit:
                continue
            records.append({
                "date": f"{year:04d}-{month:02d}-01",
                "year": year,
                "month": month,
                value_key: value,
            })
    return records


def parse_nino(text: str):
    records = []
    for line in text.splitlines()[1:]:
        parts = line.split()
        if len(parts) != 10:
            continue
        year, month = int(parts[0]), int(parts[1])
        records.append({
            "date": f"{year:04d}-{month:02d}-01",
            "year": year,
            "month": month,
            "nino_1_2": float(parts[3]),
            "nino_3": float(parts[5]),
            "nino_3_4": float(parts[9]),
            "nino_4": float(parts[7]),
        })
    return records


def parse_soi(text: str):
    lines = text.splitlines()
    start = next(i for i, line in enumerate(lines) if "STANDARDIZED" in line)
    header = next(i for i in range(start, len(lines)) if "YEAR" in lines[i])
    records = []
    for line in lines[header + 1 :]:
        values = re.findall(r"[-+]?\d+(?:\.\d+)?", line)
        if len(values) < 13 or len(values[0]) != 4:
            continue
        year = int(values[0])
        for month, raw_value in enumerate(values[1:13], 1):
            value = float(raw_value)
            if value <= -90:
                continue
            records.append({
                "date": f"{year:04d}-{month:02d}-01",
                "year": year,
                "month": month,
                "soi": value,
            })
    return records


def parse_mei(text: str):
    season_labels = ["DJ", "JF", "FM", "MA", "AM", "MJ", "JJ", "JA", "AS", "SO", "ON", "ND"]
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    start_year, end_year = (int(value) for value in lines[0].split()[:2])
    records = []
    for line in lines[1 : 2 + end_year - start_year]:
        values = re.findall(r"[-+]?\d+(?:\.\d+)?", line)
        if len(values) < 13:
            continue
        year = int(values[0])
        for month, raw_value in enumerate(values[1:13], 1):
            value = float(raw_value)
            if value <= -90:
                continue
            records.append({
                "date": f"{year:04d}-{month:02d}-01",
                "year": year,
                "month": month,
                "season": season_labels[month - 1],
                "mei": value,
            })
    return records


def parse_simple_csv(text: str, value_key: str):
    records = []
    reader = csv.reader(io.StringIO(text))
    next(reader, None)
    for row in reader:
        if len(row) < 2:
            continue
        date = row[0].strip()
        try:
            value = float(row[1])
        except ValueError:
            continue
        if value <= -90:
            continue
        parsed = datetime.strptime(date, "%Y-%m-%d")
        records.append({
            "date": date,
            "year": parsed.year,
            "month": parsed.month,
            value_key: value,
        })
    return records


def parse_qbo_table(text: str):
    lines = text.splitlines()
    original = next(i for i, line in enumerate(lines) if "ORIGINAL" in line)
    header = next(i for i in range(original, len(lines)) if "YEAR" in lines[i])
    records = {}
    for line in lines[header + 1 :]:
        if "ANOMALY" in line or "STANDARDIZED" in line:
            break
        values = re.findall(r"[-+]?\d+(?:\.\d+)?", line)
        if len(values) < 13 or len(values[0]) != 4:
            continue
        year = int(values[0])
        for month, raw_value in enumerate(values[1:13], 1):
            value = float(raw_value)
            if value <= -90:
                continue
            date = f"{year:04d}-{month:02d}-01"
            records[date] = value
    return records


def parse_qbo(text_30: str, text_50: str):
    qbo_30 = parse_qbo_table(text_30)
    qbo_50 = parse_qbo_table(text_50)
    records = []
    for date in sorted(set(qbo_30) | set(qbo_50)):
        parsed = datetime.strptime(date, "%Y-%m-%d")
        records.append({
            "date": date,
            "year": parsed.year,
            "month": parsed.month,
            "qbo_30": qbo_30.get(date),
            "qbo_50": qbo_50.get(date),
        })
    return records


def parse_amo(text: str):
    records = []
    for line in text.splitlines():
        values = re.findall(r"[-+]?\d+(?:\.\d+)?", line)
        if len(values) != 3 or len(values[0]) != 4:
            continue
        year, month = int(values[0]), int(values[1])
        records.append({
            "date": f"{year:04d}-{month:02d}-01",
            "year": year,
            "month": month,
            "amo": float(values[2]),
        })
    return records


def parse_sea_ice(text: str, climatology_text: str):
    rows = []
    reader = csv.reader(io.StringIO(text))
    next(reader, None)
    next(reader, None)
    for row in reader:
        if len(row) < 4:
            continue
        try:
            year, month, day = (int(row[index].strip()) for index in range(3))
            extent = float(row[3])
        except ValueError:
            continue
        date = f"{year:04d}-{month:02d}-{day:02d}"
        rows.append((date, year, month, day, extent))

    climatology = {}
    climatology_reader = csv.reader(io.StringIO(climatology_text))
    next(climatology_reader, None)
    next(climatology_reader, None)
    for row in climatology_reader:
        if len(row) < 2:
            continue
        try:
            day_of_year = int(row[0].strip())
            average_extent = float(row[1])
        except ValueError:
            continue
        reference_date = datetime.strptime(f"2000-{day_of_year:03d}", "%Y-%j")
        climatology[(reference_date.month, reference_date.day)] = average_extent

    records = []
    for date, year, month, day, extent in rows:
        normal = climatology.get((month, day))
        anomaly = extent - normal if normal is not None else None
        records.append({
            "date": date,
            "year": year,
            "month": month,
            "day": day,
            "extent": round(extent, 3),
            "climatology_1981_2010": round(normal, 3) if normal is not None else None,
            "anomaly": round(anomaly, 3) if anomaly is not None else None,
        })
    return records


def validate(records: list[dict], value_keys: list[str]):
    if not records:
        raise ValueError("No valid records were parsed")
    dates = [record["date"] for record in records]
    if dates != sorted(dates) or len(dates) != len(set(dates)):
        raise ValueError("Dates must be unique and chronologically ordered")
    if not any(any(record.get(key) is not None for key in value_keys) for record in records):
        raise ValueError("No finite index values were parsed")


def write_product(product_id: str, records: list[dict], metadata: dict, hashes: dict):
    value_keys = metadata["value_keys"]
    validate(records, value_keys)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    METADATA_DIR.mkdir(parents=True, exist_ok=True)

    fields = list(records[0])
    with (DATA_DIR / f"{product_id}.csv").open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        writer.writerows(records)

    with (DATA_DIR / f"{product_id}.json").open("w", encoding="utf-8") as file:
        json.dump(records, file, indent=2, ensure_ascii=False)

    complete_metadata = {
        "id": product_id,
        **metadata,
        "first_record": records[0],
        "last_record": records[-1],
        "number_of_records": len(records),
        "retrieved_utc": RETRIEVED_UTC,
        "source_sha256": hashes if len(hashes) > 1 else next(iter(hashes.values())),
    }
    with (METADATA_DIR / f"{product_id}.json").open("w", encoding="utf-8") as file:
        json.dump(complete_metadata, file, indent=2, ensure_ascii=False)
    print(f"{product_id}: {len(records)} records, last {records[-1]['date']}")


def source_hash(payload: bytes):
    return hashlib.sha256(payload).hexdigest()


def main():
    downloaded = {key: download(url) for key, url in SOURCES.items()}
    p = {key: value[0] for key, value in downloaded.items()}
    t = {key: value[1] for key, value in downloaded.items()}

    write_product("nino", parse_nino(t["nino"]), {
        "name": "Niño sea-surface-temperature regions",
        "short_name": "Niño 1+2 / 3 / 3.4 / 4",
        "source_institution": "NOAA Climate Prediction Center",
        "source_dataset": "ERSSTv5 Niño monthly indices, 1991–2020 climatology",
        "source_url": SOURCES["nino"],
        "source_page_url": "https://www.cpc.ncep.noaa.gov/data/indices/",
        "methodology_url": "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/ensostuff/ONI_change.shtml",
        "definition": "Monthly sea-surface-temperature anomalies for the Niño 1+2, Niño 3, Niño 3.4 and Niño 4 monitoring regions of the tropical Pacific.",
        "reference_period": "1991–2020 monthly climatology",
        "temporal_resolution": "monthly",
        "units": "degC",
        "time_representation": "Each value is represented by the first day of its calendar month; no smoothing or interpolation is applied.",
        "data_note": "The portal retains the anomaly columns published by NOAA CPC and does not reproduce the absolute SST columns.",
        "citation": "Huang, B. et al. (2017): Extended Reconstructed Sea Surface Temperature, Version 5 (ERSSTv5). Journal of Climate, 30, 8179–8205.",
        "value_keys": ["nino_1_2", "nino_3", "nino_3_4", "nino_4"],
    }, {"nino": source_hash(p["nino"])})

    write_product("soi", parse_soi(t["soi"]), {
        "name": "Southern Oscillation Index",
        "short_name": "SOI",
        "source_institution": "NOAA Climate Prediction Center",
        "source_dataset": "Standardized Tahiti minus Darwin sea-level-pressure index",
        "source_url": SOURCES["soi"],
        "source_page_url": "https://www.cpc.ncep.noaa.gov/data/indices/",
        "methodology_url": "https://www.cpc.ncep.noaa.gov/data/indices/Readme.index.shtml",
        "definition": "Standardized difference between sea-level-pressure anomalies at Tahiti and Darwin, used to monitor the atmospheric component of ENSO.",
        "reference_period": "Source standardization as published by NOAA CPC",
        "temporal_resolution": "monthly",
        "units": "standardized index",
        "time_representation": "Each value is represented by the first day of its calendar month.",
        "data_note": "The STANDARDIZED DATA table is used; the preceding pressure-anomaly table is not mixed with this series.",
        "value_keys": ["soi"],
    }, {"soi": source_hash(p["soi"])})

    write_product("mei", parse_mei(t["mei"]), {
        "name": "Multivariate ENSO Index Version 2",
        "short_name": "MEI.v2",
        "source_institution": "NOAA Physical Sciences Laboratory",
        "source_dataset": "Multivariate ENSO Index Version 2",
        "source_url": SOURCES["mei"],
        "source_page_url": "https://psl.noaa.gov/enso/mei/",
        "methodology_url": "https://psl.noaa.gov/enso/mei/",
        "definition": "A multivariate ENSO index based on five tropical Pacific fields: sea-level pressure, sea-surface temperature, zonal and meridional surface winds, and outgoing longwave radiation.",
        "reference_period": "1980–2018 seasonal climatology and standardization, per NOAA PSL documentation",
        "temporal_resolution": "overlapping bimonthly seasons",
        "units": "standardized index",
        "time_representation": "DJ is assigned to January, JF to February, and so on through ND in December of the row year.",
        "data_note": "Values are retained exactly as published; no interpolation is applied to unavailable seasons.",
        "citation": "Wolter, K. and Timlin, M. S. (2011): El Niño/Southern Oscillation behaviour since 1871 as diagnosed in an extended multivariate ENSO index. International Journal of Climatology, 31, 1074–1087.",
        "value_keys": ["mei"],
    }, {"mei": source_hash(p["mei"])})

    write_product("tpi", standard_monthly(t["tpi"], "tpi"), {
        "name": "Tripole Index / Interdecadal Pacific Oscillation",
        "short_name": "TPI / IPO",
        "source_institution": "NOAA Physical Sciences Laboratory",
        "source_dataset": "ERSSTv5 Tripole Index",
        "source_url": SOURCES["tpi"],
        "source_page_url": "https://psl.noaa.gov/data/timeseries/IPOTPI/",
        "methodology_url": "https://psl.noaa.gov/data/timeseries/IPOTPI/",
        "definition": "Difference between central equatorial Pacific SST anomalies and the mean of northwest and southwest Pacific SST anomalies; a monthly index associated with the IPO pattern.",
        "reference_period": "Climatology used in the ERSSTv5 source product",
        "temporal_resolution": "monthly",
        "units": "degC",
        "time_representation": "Each value is represented by the first day of its calendar month.",
        "data_note": "This portal displays the unsmoothed monthly TPI. Decadal smoothing is not applied.",
        "citation": "Henley, B. J. et al. (2015): A Tripole Index for the Interdecadal Pacific Oscillation. Climate Dynamics, 45, 3077–3090.",
        "value_keys": ["tpi"],
    }, {"tpi": source_hash(p["tpi"])})

    write_product("pmm", parse_simple_csv(t["pmm"], "pmm"), {
        "name": "Pacific Meridional Mode — SST component",
        "short_name": "PMM",
        "source_institution": "NOAA Physical Sciences Laboratory",
        "source_dataset": "Monthly SST PMM index derived from NCEP/NCAR Reanalysis",
        "source_url": SOURCES["pmm"],
        "source_page_url": "https://psl.noaa.gov/data/timeseries/month/PMM/",
        "methodology_url": "https://doi.org/10.1175/JCLI-D-16-0543.1",
        "definition": "Monthly sea-surface-temperature component of the Pacific Meridional Mode as distributed by NOAA PSL.",
        "reference_period": "As defined in the NOAA PSL source product",
        "temporal_resolution": "monthly",
        "units": "degC",
        "time_representation": "Each value is represented by the first day of its calendar month.",
        "data_note": "Only the SST component provided by this official machine-readable series is displayed.",
        "citation": "Chiang, J. C. H. and Vimont, D. J. (2004): Analogous meridional modes of atmosphere–ocean variability in the tropical Atlantic and tropical Pacific. Journal of Climate, 17, 4143–4158.",
        "value_keys": ["pmm"],
    }, {"pmm": source_hash(p["pmm"])})

    write_product("dmi", parse_simple_csv(t["dmi"], "dmi"), {
        "name": "Dipole Mode Index",
        "short_name": "DMI / IOD",
        "source_institution": "NOAA Physical Sciences Laboratory",
        "source_dataset": "HadISST1.1 Dipole Mode Index",
        "source_url": SOURCES["dmi"],
        "source_page_url": "https://psl.noaa.gov/data/timeseries/month/DMI/",
        "methodology_url": "https://psl.noaa.gov/data/timeseries/month/DMI/",
        "definition": "Difference between SST anomalies in the western equatorial Indian Ocean and the southeastern equatorial Indian Ocean, used to monitor the Indian Ocean Dipole.",
        "reference_period": "Climatology used in the HadISST1.1 source product",
        "temporal_resolution": "monthly",
        "units": "degC",
        "time_representation": "Each value is represented by the first day of its calendar month.",
        "data_note": "The long HadISST1.1 series is used and no additional smoothing is applied.",
        "citation": "Saji, N. H., Goswami, B. N., Vinayachandran, P. N. and Yamagata, T. (1999): A dipole mode in the tropical Indian Ocean. Nature, 401, 360–363.",
        "value_keys": ["dmi"],
    }, {"dmi": source_hash(p["dmi"])})

    write_product("qbo", parse_qbo(t["qbo_30"], t["qbo_50"]), {
        "name": "Quasi-Biennial Oscillation zonal-wind indices",
        "short_name": "QBO 30 / 50 hPa",
        "source_institution": "NOAA Climate Prediction Center",
        "source_dataset": "CDAS equatorial zonal-wind indices at 30 and 50 mb",
        "source_url": [SOURCES["qbo_30"], SOURCES["qbo_50"]],
        "source_page_url": "https://www.cpc.ncep.noaa.gov/data/indices/",
        "methodology_url": "https://www.cpc.ncep.noaa.gov/data/indices/Readme.index.shtml",
        "definition": "Monthly equatorial stratospheric zonal-wind indices at 30 and 50 hPa. Positive values indicate westerly flow and negative values easterly flow.",
        "reference_period": "Original wind values; not standardized by this portal",
        "temporal_resolution": "monthly",
        "units": "m s-1",
        "time_representation": "Each value is represented by the first day of its calendar month.",
        "data_note": "The ORIGINAL DATA tables are used at both pressure levels; anomaly and standardized tables in the source files are not mixed in.",
        "value_keys": ["qbo_30", "qbo_50"],
    }, {"qbo_30": source_hash(p["qbo_30"]), "qbo_50": source_hash(p["qbo_50"])})

    write_product("sea_ice", parse_sea_ice(t["sea_ice"], t["sea_ice_climatology"]), {
        "name": "Antarctic sea-ice extent",
        "short_name": "Antarctic sea ice",
        "source_institution": "National Snow and Ice Data Center",
        "source_dataset": "Sea Ice Index, Version 4 — Southern Hemisphere daily extent",
        "source_url": [SOURCES["sea_ice"], SOURCES["sea_ice_climatology"]],
        "source_page_url": "https://nsidc.org/data/g02135/versions/4",
        "methodology_url": "https://nsidc.org/sites/default/files/g02135-v004-userguide_1_1.pdf",
        "definition": "Daily Southern Hemisphere sea-ice extent. The portal also computes a calendar-day anomaly from the official NSIDC 1981–2010 daily climatology.",
        "reference_period": "NSIDC 1981–2010 daily climatology",
        "temporal_resolution": "daily",
        "units": "million km2",
        "time_representation": "Each observation retains its UTC calendar date from the NSIDC file.",
        "data_note": "Extent and climatology are preserved from NSIDC. Anomaly is their difference, rounded to 0.001 million km²; no gap filling is applied.",
        "value_keys": ["extent", "anomaly"],
        "derived_fields": {"anomaly": "extent minus the official NSIDC 1981–2010 average for the same calendar month and day"},
        "citation": "Fetterer, F., Knowles, K., Meier, W. N., Savoie, M., Windnagel, A. K. and Stafford, T. (2025): Sea Ice Index, Version 4 (G02135). National Snow and Ice Data Center. https://doi.org/10.7265/a98x-0f50.",
    }, {
        "sea_ice": source_hash(p["sea_ice"]),
        "sea_ice_climatology": source_hash(p["sea_ice_climatology"]),
    })

    write_product("amo", parse_amo(t["amo"]), {
        "name": "Atlantic Multidecadal Oscillation / Variability",
        "short_name": "AMV / AMO",
        "source_institution": "NOAA National Centers for Environmental Information",
        "source_dataset": "ERSSTv5 North Atlantic 0–60°N SST anomaly index",
        "source_url": SOURCES["amo"],
        "source_page_url": "https://www.ncei.noaa.gov/products/extended-reconstructed-sst",
        "methodology_url": "https://doi.org/10.1175/JCLI-D-16-0836.1",
        "definition": "Monthly ERSSTv5 sea-surface-temperature anomaly averaged over the North Atlantic from the equator to 60°N.",
        "reference_period": "1971–2000 ERSSTv5 climatology",
        "temporal_resolution": "monthly",
        "units": "degC",
        "time_representation": "Each value is represented by the first day of its calendar month.",
        "data_note": "This is the raw monthly NOAA NCEI series. The portal does not detrend or apply a multiyear low-pass filter, so AMV/AMO interpretations should account for that distinction.",
        "citation": "Huang, B. et al. (2017): Extended Reconstructed Sea Surface Temperature, Version 5 (ERSSTv5). Journal of Climate, 30, 8179–8205.",
        "value_keys": ["amo"],
    }, {"amo": source_hash(p["amo"])})

    write_product("nao", standard_monthly(t["nao"], "nao"), {
        "name": "North Atlantic Oscillation Index",
        "short_name": "NAO",
        "source_institution": "NOAA Climate Prediction Center, distributed by NOAA PSL",
        "source_dataset": "Monthly CPC NAO index",
        "source_url": SOURCES["nao"],
        "source_page_url": "https://psl.noaa.gov/data/timeseries/month/NAO/",
        "methodology_url": "https://www.cpc.ncep.noaa.gov/products/precip/CWlink/pna/nao.shtml",
        "definition": "Monthly NAO index distributed by NOAA PSL from the NOAA CPC product, describing the leading North Atlantic atmospheric pressure-pattern variability.",
        "reference_period": "Source standardization as published by NOAA CPC",
        "temporal_resolution": "monthly",
        "units": "standardized index",
        "time_representation": "Each value is represented by the first day of its calendar month.",
        "data_note": "Values are reproduced from the CPC monthly NAO index without interpolation or additional smoothing.",
        "value_keys": ["nao"],
    }, {"nao": source_hash(p["nao"])})


if __name__ == "__main__":
    main()
