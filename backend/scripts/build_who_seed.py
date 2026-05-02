from __future__ import annotations

import argparse
import csv
import re
import zipfile
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from xml.etree import ElementTree as ET

MONTH_LENGTH_DAYS = Decimal("30.4375")
DEFAULT_MAX_AGE_MONTHS = Decimal("6")
CSV_FIELDS = ("gender", "indicator", "age_months", "l_value", "m_value", "s_value")
DECIMAL_2 = Decimal("0.01")
DECIMAL_6 = Decimal("0.000001")
SPREADSHEET_NS = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


@dataclass(frozen=True)
class WhoSource:
    gender: str
    indicator: str
    relative_path: Path


WHO_SOURCES = (
    WhoSource("male", "weight", Path("weight-for-age/wfa_boys_zscores_expanded.xlsx")),
    WhoSource("female", "weight", Path("weight-for-age/wfa_girls_zscores_expanded.xlsx")),
    WhoSource("male", "height", Path("length-for-age/lhfa_boys_zscores_expanded.xlsx")),
    WhoSource("female", "height", Path("length-for-age/lhfa_girls_zscores_expanded.xlsx")),
    WhoSource("male", "head", Path("head-circumference/hcfa_boys_zscores_expanded.xlsx")),
    WhoSource("female", "head", Path("head-circumference/hcfa_girls_zscores_expanded.xlsx")),
)


def _default_source_dir() -> Path:
    return Path(__file__).resolve().parents[2] / "docs/books/WHO-growth-standards"


def _default_output_path() -> Path:
    return Path(__file__).resolve().parents[1] / "seeds/who_growth_reference.csv"


def _cell_index(cell_ref: str) -> int:
    match = re.match(r"([A-Z]+)", cell_ref)
    if match is None:
        raise ValueError(f"Invalid cell reference: {cell_ref}")
    index = 0
    for char in match.group(1):
        index = index * 26 + ord(char) - ord("A") + 1
    return index - 1


def _shared_strings(archive: zipfile.ZipFile) -> list[str]:
    try:
        with archive.open("xl/sharedStrings.xml") as handle:
            root = ET.parse(handle).getroot()
    except KeyError:
        return []

    strings: list[str] = []
    for item in root.findall("x:si", SPREADSHEET_NS):
        parts = [node.text or "" for node in item.findall(".//x:t", SPREADSHEET_NS)]
        strings.append("".join(parts))
    return strings


def _cell_value(cell: ET.Element, shared_strings: list[str]) -> str:
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        return "".join(node.text or "" for node in cell.findall(".//x:t", SPREADSHEET_NS))

    value = cell.find("x:v", SPREADSHEET_NS)
    if value is None or value.text is None:
        return ""
    if cell_type == "s":
        return shared_strings[int(value.text)]
    return value.text


def _read_sheet_rows(path: Path) -> list[dict[str, str]]:
    with zipfile.ZipFile(path) as archive:
        shared_strings = _shared_strings(archive)
        with archive.open("xl/worksheets/sheet1.xml") as handle:
            root = ET.parse(handle).getroot()

    rows: list[list[str]] = []
    for row in root.findall(".//x:sheetData/x:row", SPREADSHEET_NS):
        cells: dict[int, str] = {}
        for cell in row.findall("x:c", SPREADSHEET_NS):
            cells[_cell_index(cell.attrib["r"])] = _cell_value(cell, shared_strings).strip()
        if cells:
            rows.append([cells.get(index, "") for index in range(max(cells) + 1)])

    if not rows:
        raise ValueError(f"{path} has no worksheet rows")

    headers = [header.strip() for header in rows[0]]
    required = {"Day", "L", "M", "S"}
    missing = required.difference(headers)
    if missing:
        raise ValueError(f"{path} is missing required columns: {', '.join(sorted(missing))}")

    records = []
    for row in rows[1:]:
        record = {header: row[index] if index < len(row) else "" for index, header in enumerate(headers)}
        if record["Day"] != "":
            records.append(record)
    return records


def _format_decimal(value: Decimal, places: Decimal) -> str:
    return format(value.quantize(places, rounding=ROUND_HALF_UP), "f")


def build_rows(source_dir: Path, max_age_months: Decimal) -> list[dict[str, str]]:
    output_rows: list[dict[str, str]] = []
    for source in WHO_SOURCES:
        path = source_dir / source.relative_path
        if not path.exists():
            raise FileNotFoundError(f"WHO source file not found: {path}")

        for record in _read_sheet_rows(path):
            age_days = Decimal(record["Day"])
            age_months = age_days / MONTH_LENGTH_DAYS
            if age_months > max_age_months:
                continue

            output_rows.append(
                {
                    "gender": source.gender,
                    "indicator": source.indicator,
                    "age_months": _format_decimal(age_months, DECIMAL_2),
                    "l_value": _format_decimal(Decimal(record["L"]), DECIMAL_6),
                    "m_value": _format_decimal(Decimal(record["M"]), DECIMAL_6),
                    "s_value": _format_decimal(Decimal(record["S"]), DECIMAL_6),
                }
            )

    return output_rows


def write_csv(output_path: Path, rows: list[dict[str, str]]) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_FIELDS)
        writer.writeheader()
        writer.writerows(rows)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build WHO LMS seed CSV from WHO xlsx tables")
    parser.add_argument("--source", type=Path, default=_default_source_dir())
    parser.add_argument("--output", type=Path, default=_default_output_path())
    parser.add_argument("--max-age-months", type=Decimal, default=DEFAULT_MAX_AGE_MONTHS)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    rows = build_rows(args.source, args.max_age_months)
    if not rows:
        raise RuntimeError("No WHO seed rows generated")

    write_csv(args.output, rows)
    print(f"build_who_seed: wrote {len(rows)} row(s) to {args.output}")


if __name__ == "__main__":
    main()
