import html
import re
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

import requests


class _ArticleImportHTMLParser(HTMLParser):
    BLOCK_TAGS = {
        "p",
        "article",
        "main",
        "section",
        "div",
        "li",
        "h1",
        "h2",
        "h3",
        "blockquote",
    }

    SKIP_TAGS = {
        "script",
        "style",
        "noscript",
        "svg",
        "path",
        "iframe",
        "canvas",
    }

    SKIP_ATTR_KEYWORDS = {
        "nav",
        "menu",
        "header",
        "footer",
        "breadcrumb",
        "cookie",
        "consent",
        "banner",
        "sidebar",
        "toolbar",
        "newsletter",
        "social",
        "share",
        "search",
        "ads",
        "advert",
        "pagination",
    }

    def __init__(self):
        super().__init__()
        self.meta = {}
        self.title_chunks = []

        self.body_chunks = []
        self.paragraph_chunks = []
        self.image_sources = []
        self.favicon_sources = []

        self._in_title = False
        self._skip_depth = 0

        self._paragraph_stack = []
        self._current_paragraph_parts = []

    def _attrs_to_dict(self, attrs):
        return {key.lower(): value for key, value in attrs if key}

    def _should_skip_by_attrs(self, attrs_dict):
        haystack = " ".join(
            [
                attrs_dict.get("id") or "",
                attrs_dict.get("class") or "",
                attrs_dict.get("role") or "",
                attrs_dict.get("aria-label") or "",
            ]
        ).lower()

        return any(keyword in haystack for keyword in self.SKIP_ATTR_KEYWORDS)

    def handle_starttag(self, tag, attrs):
        tag = (tag or "").lower()
        attrs_dict = self._attrs_to_dict(attrs)

        if tag in self.SKIP_TAGS or self._should_skip_by_attrs(attrs_dict):
            self._skip_depth += 1
            return

        if tag == "title":
            self._in_title = True
            return

        if tag == "meta":
            meta_key = (
                (attrs_dict.get("property") or attrs_dict.get("name") or attrs_dict.get("itemprop") or "")
                .strip()
                .lower()
            )
            content = (attrs_dict.get("content") or "").strip()
            if meta_key and content and meta_key not in self.meta:
                self.meta[meta_key] = content
            return

        if tag == "link":
            rel_value = (attrs_dict.get("rel") or "").strip().lower()
            href = (attrs_dict.get("href") or "").strip()
            if href and any(marker in rel_value for marker in ("icon", "apple-touch-icon", "mask-icon")):
                self.favicon_sources.append(href)
            return

        if tag == "img":
            for key in ("src", "data-src", "data-original", "srcset"):
                candidate = (attrs_dict.get(key) or "").strip()
                if candidate:
                    if key == "srcset":
                        candidate = candidate.split(",")[0].strip().split(" ")[0].strip()
                    self.image_sources.append(candidate)
                    break
            return

        if self._skip_depth > 0:
            return

        if tag in {"p", "article", "main", "section", "blockquote"}:
            self._paragraph_stack.append(tag)
            self._current_paragraph_parts.append([])

    def handle_endtag(self, tag):
        tag = (tag or "").lower()

        if tag == "title":
            self._in_title = False
            return

        if self._skip_depth > 0:
            if tag in self.SKIP_TAGS or tag in {"nav", "header", "footer", "aside"}:
                self._skip_depth -= 1
            return

        if tag in {"p", "article", "main", "section", "blockquote"}:
            if self._paragraph_stack and self._current_paragraph_parts:
                self._paragraph_stack.pop()
                parts = self._current_paragraph_parts.pop()
                text = _collapse_article_text(" ".join(parts))
                if text:
                    self.paragraph_chunks.append(text)

    def handle_data(self, data):
        if not data:
            return

        if self._in_title:
            self.title_chunks.append(data)
            return

        if self._skip_depth > 0:
            return

        cleaned = _collapse_article_text(data)
        if not cleaned:
            return

        self.body_chunks.append(cleaned)

        if self._current_paragraph_parts:
            self._current_paragraph_parts[-1].append(cleaned)

    @property
    def title_text(self):
        return _collapse_article_text(" ".join(self.title_chunks))

    @property
    def body_text(self):
        return _collapse_article_text(" ".join(self.body_chunks))


def _collapse_article_text(value):
    value = html.unescape(value or "")
    value = re.sub(r"\s+", " ", value).strip()
    return value


def _truncate_article_text(value, limit=10000):
    value = _collapse_article_text(value)
    if len(value) <= limit:
        return value

    truncated = value[:limit].rstrip()
    last_space = truncated.rfind(" ")
    if last_space >= max(80, limit // 2):
        truncated = truncated[:last_space].rstrip()
    return truncated


def _absolute_remote_url(base_url, candidate):
    candidate = (candidate or "").strip()
    if not candidate:
        return ""

    if candidate.startswith("//"):
        candidate = f"https:{candidate}"

    absolute = urljoin(base_url, candidate)
    if not absolute.startswith(("http://", "https://")):
        return ""

    return absolute


def _dedupe_keep_order(values, limit=None):
    output = []
    seen = set()

    for value in values:
        normalized = (value or "").strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        output.append(normalized)

        if limit and len(output) >= limit:
            break

    return output


def _pick_best_favicon_url(final_url, parser):
    favicon_candidates = [_absolute_remote_url(final_url, href) for href in getattr(parser, "favicon_sources", [])]

    parsed = urlparse(final_url)
    if parsed.scheme and parsed.netloc:
        favicon_candidates.append(f"{parsed.scheme}://{parsed.netloc}/favicon.ico")

    favicon_candidates = _dedupe_keep_order(favicon_candidates, limit=5)
    return favicon_candidates[0] if favicon_candidates else ""


def _clean_import_title(title):
    title = _collapse_article_text(title)
    if not title:
        return ""

    title = re.split(r"\s[\-|–|—|•|·|:]\s", title, maxsplit=1)[0].strip()
    title = re.split(r"\s\|\s", title, maxsplit=1)[0].strip()
    return title


def _looks_like_noise_text(text):
    text = _collapse_article_text(text)
    if not text:
        return True

    lowered = text.lower()

    noise_markers = [
        "cookie",
        "consent",
        "accepter",
        "refuser",
        "menu",
        "newsletter",
        "suivez-nous",
        "se connecter",
        "connexion",
        "inscription",
        "publicité",
        "advertisement",
    ]

    if any(marker in lowered for marker in noise_markers):
        return True

    if len(text) < 40:
        return True

    word_count = len(text.split())
    return word_count < 8


def _pick_best_short_text(meta, parser):
    description = _collapse_article_text(
        meta.get("description") or meta.get("og:description") or meta.get("twitter:description")
    )

    if description and not _looks_like_noise_text(description):
        return _truncate_article_text(description, limit=10000)

    paragraph_candidates = []
    for chunk in parser.paragraph_chunks:
        text = _collapse_article_text(chunk)
        if _looks_like_noise_text(text):
            continue
        paragraph_candidates.append(text)

    paragraph_candidates = _dedupe_keep_order(paragraph_candidates)

    combined = ""
    for text in paragraph_candidates:
        if not combined:
            combined = text
        else:
            combined = f"{combined} {text}"

        if len(combined) >= 220:
            break

    combined = _truncate_article_text(combined, limit=10000)
    if combined:
        return combined

    body_candidates = []
    for piece in parser.body_chunks:
        text = _collapse_article_text(piece)
        if _looks_like_noise_text(text):
            continue
        body_candidates.append(text)

    return _truncate_article_text(" ".join(body_candidates), limit=10000)


def _extract_import_preview_from_url(link):
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/123.0.0.0 Safari/537.36"
        ),
        "Accept": ("text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"),
        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Upgrade-Insecure-Requests": "1",
    }

    response = requests.get(
        link,
        headers=headers,
        timeout=10,
        allow_redirects=True,
    )
    response.raise_for_status()

    final_url = response.url or link

    content_type = (response.headers.get("Content-Type") or "").lower()
    if "text/html" not in content_type and "application/xhtml+xml" not in content_type:
        raise ValueError("Le lien ne renvoie pas une page HTML.")

    parser = _ArticleImportHTMLParser()
    parser.feed(response.text or "")
    parser.close()

    meta = parser.meta

    raw_title = meta.get("og:title") or meta.get("twitter:title") or parser.title_text
    title = _clean_import_title(raw_title)

    short_text = _pick_best_short_text(meta, parser)

    image_candidates = []
    for key in (
        "og:image",
        "og:image:url",
        "og:image:secure_url",
        "twitter:image",
        "twitter:image:src",
    ):
        image_candidates.append(_absolute_remote_url(final_url, meta.get(key)))

    for img_src in parser.image_sources:
        image_candidates.append(_absolute_remote_url(final_url, img_src))

    image_candidates = [img for img in image_candidates if img and not img.lower().endswith(".svg")]
    image_candidates = _dedupe_keep_order(image_candidates, limit=3)
    favicon = _pick_best_favicon_url(final_url, parser)

    return {
        "title": title,
        "short_text": short_text,
        "cover_image": image_candidates[0] if image_candidates else "",
        "cover_images": image_candidates,
        "favicon": favicon,
        "resolved_link": final_url,
    }


def extract_article_preview(url: str):
    return _extract_import_preview_from_url(url)


__all__ = ["_extract_import_preview_from_url", "extract_article_preview"]
