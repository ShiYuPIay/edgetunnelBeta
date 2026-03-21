#!/usr/bin/env python3
"""Convert a CSV file into a Markdown table.

This script reads a CSV file with UTF‑8 encoding and outputs a Markdown table.
It can either print the Markdown to standard output or write it to a file.

Usage:
    python csv_to_markdown.py input.csv            # print table to stdout
    python csv_to_markdown.py input.csv -o table.md # write table to table.md

Dependencies:
    - pandas >= 1.0
"""

import argparse
import sys

import pandas as pd


def csv_to_markdown(input_path: str, output_path: str | None) -> None:
    """Read a CSV file and output a Markdown table.

    Args:
        input_path: Path to the CSV file.
        output_path: Path to save the Markdown table.  If None, prints to stdout.
    """
    try:
        df = pd.read_csv(input_path)
    except Exception as e:
        raise SystemExit(f"Failed to read CSV: {e}")

    markdown_table = df.to_markdown(index=False)
    if output_path:
        try:
            with open(output_path, "w", encoding="utf-8") as f:
                f.write(markdown_table)
        except OSError as e:
            raise SystemExit(f"Failed to write output file: {e}")
    else:
        print(markdown_table)


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert a CSV file into a Markdown table.")
    parser.add_argument("input_path", help="Path to the input CSV file")
    parser.add_argument(
        "-o",
        "--output_path",
        default=None,
        help="Optional output file to write the markdown table",
    )
    args = parser.parse_args()
    csv_to_markdown(args.input_path, args.output_path)


if __name__ == "__main__":
    main()