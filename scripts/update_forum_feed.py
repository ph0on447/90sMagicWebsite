#!/usr/bin/env python3
import json
from datetime import timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET


FEED_URL = "https://90smagic.proboards.com/rss/public"
OUTPUT_PATH = Path(__file__).resolve().parents[1] / "forum-feed.json"


def main():
    request = Request(FEED_URL, headers={"User-Agent": "90sMagicWebsite/1.0"})
    with urlopen(request, timeout=30) as response:
        feed = ET.fromstring(response.read())

    items = feed.findall("./channel/item")
    threads = []
    for item in items:
        title = item.findtext("title", "").strip()
        link = item.findtext("link", "").strip()
        published = item.findtext("pubDate", "").strip()
        if not title or not link or not published:
            continue

        parsed_url = urlsplit(link)
        if parsed_url.hostname != "90smagic.proboards.com" or not parsed_url.path.startswith("/thread/"):
            continue

        published_at = parsedate_to_datetime(published)
        if published_at.tzinfo is None:
            published_at = published_at.replace(tzinfo=timezone.utc)

        threads.append({
            "title": title,
            "url": urlunsplit(("https", parsed_url.netloc, parsed_url.path, parsed_url.query, parsed_url.fragment)),
            "date": published_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        })
        if len(threads) == 3:
            break

    if not threads:
        raise ValueError("The ProBoards RSS feed did not contain any valid threads.")

    OUTPUT_PATH.write_text(json.dumps(threads, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
