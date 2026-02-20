#!/usr/bin/env python3
"""
find_orphan_fig_refs.py

Cerca riferimenti a figure non corrispondenti ad alcuna <p class="figure-label" id="...">,
limitandosi agli id che iniziano con "gr_".

Riferimenti cercati:
- token [[FIG:gr_...]]
- anchor HTML con href contenente #gr_...

Exit codes:
  0 -> nessun orphan
  2 -> trovati orphan
  1 -> errore
"""
from pathlib import Path
import re
import argparse
import sys

ID_PREFIX = "gr_"

# p.figure-label id="..."
LABEL_RE = re.compile(
    r'<p\b[^>]*\bclass=["\'][^"\']*figure-label[^"\']*["\'][^>]*\bid=["\']([^"\']+)["\']',
    re.IGNORECASE
)

# token [[FIG:id]]
TOKEN_RE = re.compile(r'\[\[\s*FIG\s*:\s*([^\]\s]+)\s*\]\]', re.IGNORECASE)

# href="...#id"
ANCHOR_RE = re.compile(
    r'href\s*=\s*(?P<q>["\'])(?P<h>[^"\']*#(?P<id>[^"\'>]+))(?P=q)',
    re.IGNORECASE
)

def is_figure_id(x: str) -> bool:
    return x.startswith(ID_PREFIX)

def collect_ids(root: Path):
    ids_it = set()
    ids_en = set()
    for lang in ("it", "en"):
        base = root / lang
        if not base.exists():
            continue
        for p in base.rglob("*.md"):
            try:
                text = p.read_text(encoding="utf-8")
            except Exception:
                continue
            for m in LABEL_RE.finditer(text):
                idv = m.group(1).strip()
                if not is_figure_id(idv):
                    continue
                if lang == "it":
                    ids_it.add(idv)
                else:
                    ids_en.add(idv)
    return ids_it, ids_en

def scan_refs(root: Path):
    refs = []  # (path_rel, lineno, kind, id, file_lang)
    for lang in ("it", "en"):
        base = root / lang
        if not base.exists():
            continue
        for p in base.rglob("*.md"):
            rel = p.relative_to(root)
            try:
                lines = p.read_text(encoding="utf-8").splitlines()
            except Exception:
                continue
            for i, L in enumerate(lines, start=1):
                # tokens
                for m in TOKEN_RE.finditer(L):
                    fid = m.group(1).strip()
                    if is_figure_id(fid):
                        refs.append((rel, i, "token", fid, lang))
                # anchors
                for m in ANCHOR_RE.finditer(L):
                    fid = m.group("id").strip()
                    if is_figure_id(fid):
                        refs.append((rel, i, "anchor", fid, lang))
    return refs

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--site-root", default=".", help="root del sito (default .)")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    root = Path(args.site_root).resolve()

    ids_it, ids_en = collect_ids(root)
    if args.verbose:
        print(f"[INFO] figure ids (prefix '{ID_PREFIX}') found: it={len(ids_it)} en={len(ids_en)}")

    refs = scan_refs(root)

    orphan_refs = []
    cross_refs = []

    for rel, lineno, kind, fid, file_lang in refs:
        exists_same = (fid in ids_it) if file_lang == "it" else (fid in ids_en)
        exists_other = (fid in ids_en) if file_lang == "it" else (fid in ids_it)

        if exists_same:
            continue
        elif exists_other:
            cross_refs.append((rel, lineno, kind, fid, file_lang))
        else:
            orphan_refs.append((rel, lineno, kind, fid, file_lang))

    if cross_refs:
        print("⚠️  Cross-language references (id exists only in the other language):")
        for rel, lineno, kind, fid, file_lang in cross_refs:
            other = "en" if file_lang == "it" else "it"
            print(f"  {rel}:{lineno}  [{kind}]  id='{fid}'  (exists only in {other})")
        print()

    if orphan_refs:
        print("❌ Orphan figure references (id starts with 'gr_' but not found in any language):")
        for rel, lineno, kind, fid, file_lang in orphan_refs:
            print(f"  {rel}:{lineno}  [{kind}]  id='{fid}'  (file language: {file_lang})")
        print()
        print("Suggerimento: correggi/rimuovi i riferimenti segnalati oppure ripristina la figura.")
        return 2

    if not orphan_refs and not cross_refs:
        print("✅ Nessun riferimento orfano (solo id 'gr_').")
        return 0

    print("✅ Nessun orphan, ma ci sono riferimenti cross-language (verifica se voluti).")
    return 0

if __name__ == "__main__":
    sys.exit(main())