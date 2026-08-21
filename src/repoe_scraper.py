import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse

BASE = "https://repoe-fork.github.io/"
seen = set()
json_files = set()


from pathlib import Path

output = Path(".poe_data")
output.mkdir(exist_ok=True)


def crawl(url):
    if url in seen:
        return

    seen.add(url)
    print(url)

    if any(
        folder in urlparse(url).path
        for folder in (
            "Art",
            "French",
            "German",
            "Japanese",
            "Korean",
            "Metadata",
            "Portuguese",
            "Russian",
            "Spanish",
            "Thai",
            "Traditional%20Chinese",
            "stat_translations",
            "data-formats",
            "passive_skill_trees",
        )
    ):
        return
    # breakpoint()

    try:
        r = requests.get(url, timeout=10)
        r.raise_for_status()
    except requests.RequestException:
        return

    soup = BeautifulSoup(r.text, "html.parser")

    # breakpoint()

    for a in soup.select("a[href]"):
        href = urljoin(url, a["href"])

        # Stay on the same site
        if urlparse(href).netloc != urlparse(BASE).netloc:
            continue

        if href.lower().endswith(".min.json"):
            filename = Path(urlparse(href).path).name
            data = requests.get(href).text
            (output / filename).write_text(data, encoding="utf-8")
            print(filename)
        elif href.endswith("/") or href.endswith(".html"):
            crawl(href)


crawl(BASE + "poe1.html")
