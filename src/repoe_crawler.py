import json
from pathlib import Path

folder = Path(".poe_data")
data = {}
for file in folder.iterdir():
    with open(file, encoding="utf-8") as f:
        data["/".join(file.parts[1:])] = f.read()
with open(".all_data.json", "w", encoding="utf-8") as f:
    json.dump(data, f, separators=(",", ":"))
