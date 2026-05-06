#!/usr/bin/env python3
"""Prepare Meta Ads Manager CSV export for cross-account import."""

from __future__ import annotations

import argparse
import csv
import re
from pathlib import Path

# ===== Replace with your target account resources =====
NEW_PIXEL_ID = ""
NEW_PAGE_ID = ""
NEW_IG_ID = ""
FORCED_STATUS = "PAUSED"

CLEAR_EXACT_COLUMNS = {
    "campaign id",
    "ad set id",
    "adset id",
    "ad id",
    "image hash",
    "video id",
    "asset feed id",
    "created time",
    "last updated time",
    "reporting starts",
    "reporting ends",
}

STATUS_COLUMNS = {"campaign status", "ad set status", "ad status"}

REPLACEMENT_COLUMNS = {
    "pixel id": lambda _: NEW_PIXEL_ID,
    "facebook page id": lambda _: NEW_PAGE_ID,
    "instagram id": lambda _: NEW_IG_ID,
}

METRIC_PATTERNS = [
    re.compile(p, re.I)
    for p in [
        r"\bspend\b",
        r"\bimpressions\b",
        r"\bclicks\b",
        r"\bresults?\b",
        r"\breach\b",
        r"\bfrequency\b",
        r"\bcpm\b",
        r"\bcpc\b",
        r"\bctr\b",
        r"\bcost per\b",
        r"\bamount spent\b",
        r"\bconversions?\b",
        r"\bpurchases?\b",
        r"\blink clicks\b",
    ]
]


def norm(name: str) -> str:
    return re.sub(r"[_\-]+", " ", (name or "").strip().lower())


def is_metric_column(name: str) -> bool:
    n = norm(name)
    return any(p.search(n) for p in METRIC_PATTERNS)


def process_csv(input_path: Path, output_path: Path) -> None:
    with input_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            raise ValueError("CSV has no header")

        source_columns = reader.fieldnames
        keep_columns = []
        for c in source_columns:
            nc = norm(c)
            if is_metric_column(nc):
                continue
            keep_columns.append(c)

        rows_out = []
        for row in reader:
            new_row = {}
            for col in keep_columns:
                value = row.get(col, "")
                ncol = norm(col)

                if ncol in CLEAR_EXACT_COLUMNS:
                    new_row[col] = ""
                elif ncol in STATUS_COLUMNS:
                    new_row[col] = FORCED_STATUS
                elif ncol in REPLACEMENT_COLUMNS:
                    new_row[col] = REPLACEMENT_COLUMNS[ncol](value)
                else:
                    new_row[col] = value
            rows_out.append(new_row)

    with output_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=keep_columns)
        writer.writeheader()
        writer.writerows(rows_out)


def main() -> None:
    parser = argparse.ArgumentParser(description="Clean Meta Ads export CSV for import into another account")
    parser.add_argument("input_csv", type=Path, help="Path to input CSV")
    parser.add_argument("-o", "--output", type=Path, help="Path to output CSV")
    args = parser.parse_args()

    output = args.output or args.input_csv.with_name(f"{args.input_csv.stem}_cleaned.csv")
    process_csv(args.input_csv, output)
    print(f"Saved cleaned CSV: {output}")


if __name__ == "__main__":
    main()
