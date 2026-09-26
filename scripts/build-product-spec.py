#!/usr/bin/env python3
"""Build the three-player product confirmation PDF from its maintained Markdown."""

from __future__ import annotations

import hashlib
import html
import json
import re
from pathlib import Path

from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, Frame, Image, KeepTogether, LongTable, PageBreak, PageTemplate,
    Paragraph, Spacer, TableStyle,
)


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "docs/06-三人局UI与产品设计确认稿.md"
OUTPUT = ROOT / "output/pdf/拍卖大亨_三人局_UI与产品设计确认稿.pdf"
MANIFEST = ROOT / "docs/product-spec-build.json"
FONT = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"

pdfmetrics.registerFont(TTFont("Chinese", FONT))
INK = colors.HexColor("#29251d")
GOLD = colors.HexColor("#9c703c")
MUTED = colors.HexColor("#756b5d")
PAPER = colors.HexColor("#f7f3eb")
LINE = colors.HexColor("#d6c8b4")

styles = {
    "title": ParagraphStyle("TitleCN", fontName="Chinese", fontSize=22, leading=31, textColor=INK, spaceAfter=13),
    "h2": ParagraphStyle("HeadingCN", fontName="Chinese", fontSize=15, leading=23, textColor=GOLD, spaceBefore=17, spaceAfter=8, keepWithNext=True),
    "h3": ParagraphStyle("SubheadingCN", fontName="Chinese", fontSize=11.5, leading=19, textColor=INK, spaceBefore=11, spaceAfter=6, keepWithNext=True),
    "body": ParagraphStyle("BodyCN", fontName="Chinese", fontSize=9.1, leading=15.7, textColor=INK, spaceAfter=7, allowWidows=0, allowOrphans=0),
    "cell": ParagraphStyle("CellCN", fontName="Chinese", fontSize=7.5, leading=12.5, textColor=INK),
    "headcell": ParagraphStyle("HeadCellCN", fontName="Chinese", fontSize=8, leading=13, textColor=colors.white),
    "caption": ParagraphStyle("CaptionCN", fontName="Chinese", fontSize=9, leading=15, textColor=MUTED, alignment=TA_CENTER, spaceAfter=8),
}


def inline(value: str) -> str:
    escaped = html.escape(value)
    escaped = re.sub(r"\*\*(.*?)\*\*", r"<b>\1</b>", escaped)
    escaped = re.sub(r"`([^`]+)`", r"<font color='#7b542e'>\1</font>", escaped)
    return escaped


def image_block(alt: str, rel: str):
    path = SOURCE.parent / rel
    if not path.is_file():
        raise FileNotFoundError(path)
    with PILImage.open(path) as pic:
        width, height = pic.size
    max_width, max_height = 322, 520 if Path(rel).name == "08-request.png" else 635
    scale = min(max_width / width, max_height / height)
    pic = Image(str(path), width=width * scale, height=height * scale, kind="proportional")
    pic.hAlign = "CENTER"
    return KeepTogether([
        Spacer(1, 7),
        Paragraph(inline(alt.replace("界面截图：", "图：")), styles["caption"]),
        pic,
        Spacer(1, 12),
    ])


def table_block(rows: list[list[str]]):
    col_count = len(rows[0])
    widths = {3: [99, 301, 98], 4: [39, 116, 270, 73], 5: [110, 96, 135, 57, 100]}.get(col_count)
    if widths is None:
        widths = [498 / col_count] * col_count
    cells = []
    for idx, row in enumerate(rows):
        style = styles["headcell"] if idx == 0 else styles["cell"]
        cells.append([Paragraph(inline(value.strip()), style) for value in row])
    table = LongTable(cells, colWidths=widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), GOLD),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, PAPER]),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.35, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return table


def parse_markdown(text: str):
    lines = text.splitlines()
    story = []
    paragraph = []

    def flush():
        if paragraph:
            story.append(Paragraph(inline(" ".join(paragraph)), styles["body"]))
            paragraph.clear()

    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            flush()
            i += 1
            continue
        image_match = re.fullmatch(r"!\[(.*?)\]\((.*?)\)", line)
        if image_match:
            flush()
            story.append(image_block(*image_match.groups()))
            i += 1
            continue
        if line.startswith("| "):
            flush()
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                row = [x.strip() for x in lines[i].strip().strip("|").split("|")]
                if not all(re.fullmatch(r"[-: ]+", x) for x in row):
                    rows.append(row)
                i += 1
            if rows:
                story.append(table_block(rows))
                story.append(Spacer(1, 10))
            continue
        heading = re.match(r"^(#{1,3})\s+(.*)$", line)
        if heading:
            flush()
            depth = len(heading.group(1))
            if depth == 2 and heading.group(2).startswith("12. "):
                story.append(PageBreak())
            key = "title" if depth == 1 else "h2" if depth == 2 else "h3"
            story.append(Paragraph(inline(heading.group(2)), styles[key]))
            i += 1
            continue
        if re.match(r"^(?:\d+\.|- )\s", line):
            flush()
            story.append(Paragraph(inline(line), styles["body"]))
            i += 1
            continue
        paragraph.append(line)
        i += 1
    flush()
    return story


def draw_page(canvas, doc):
    canvas.saveState()
    width, height = A4
    canvas.setFillColor(GOLD)
    canvas.rect(0, height - 14, width, 14, fill=1, stroke=0)
    canvas.setFont("Chinese", 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(48, height - 35, "拍卖大亨 / 三人局 UI 与产品设计确认稿")
    canvas.setStrokeColor(LINE)
    canvas.line(48, 43, width - 48, 43)
    canvas.drawString(48, 30, "当前本地实现快照 · 2026-09-26")
    canvas.drawRightString(width - 48, 30, f"{doc.page}")
    canvas.restoreState()


class ProductDoc(BaseDocTemplate):
    def __init__(self, filename):
        super().__init__(str(filename), pagesize=A4, leftMargin=48, rightMargin=48,
                         topMargin=52, bottomMargin=57, title="拍卖大亨 · 三人局 UI 与产品设计确认稿",
                         author="拍卖大亨项目")
        frame = Frame(48, 57, A4[0] - 96, A4[1] - 111, leftPadding=0,
                      rightPadding=0, topPadding=0, bottomPadding=0)
        self.addPageTemplates(PageTemplate(id="normal", frames=[frame], onPage=draw_page))


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    ProductDoc(OUTPUT).build(parse_markdown(SOURCE.read_text()))
    tracked = [
        "web/game.js", "web/app.js", "web/style.css", "web/catalog.js", "web/index.html",
        "web/manual.html", "supabase/functions/game/handler.js", "docs/03-小白说明书.md",
        "docs/06-三人局UI与产品设计确认稿.md",
        "scripts/capture-product-spec.mjs", "scripts/build-product-spec.py",
    ]
    images = sorted((SOURCE.parent / "product-spec-assets").glob("*.png"))
    payload = {"sourceHashes": {path: digest(ROOT / path) for path in tracked},
               "imageHashes": {str(path.relative_to(ROOT)): digest(path) for path in images},
               "output": str(OUTPUT.relative_to(ROOT)), "imageCount": len(images)}
    MANIFEST.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    print(f"Built {OUTPUT} with {len(images)} screenshots")


if __name__ == "__main__":
    main()
