import sys
import pdfplumber

path = sys.argv[1]

with pdfplumber.open(path) as pdf:
    for i, page in enumerate(pdf.pages):
        print(f"\n=== PAGE {i+1} ===")
        tables = page.extract_tables()
        print(f"  Tables found: {len(tables)}")
        for j, table in enumerate(tables):
            print(f"  Table {j+1} ({len(table)} rows):")
            for row in table[:6]:
                print(f"    {row}")
