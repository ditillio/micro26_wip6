#!/usr/bin/env python3
"""
number_figures_from_toc.py

Scansiona _data/toc.yml per ottenere l'ordine delle pagine, quindi:
- cerca <p ... class="... figure-label ... " id="...">...</p> in ogni file
- sostituisce il contenuto interno con la label generata automaticamente
- opzionalmente sostituisce riferimenti [[FIG:id]] con link <a href="{{ site.baseurl }}/it/...#id">Figura ...</a>

Usage:
  python3 scripts/number_figures_from_toc.py [--dry-run] [--mode chapter] [--site-root .] [--backup] [--update-refs]

Default: mode=chapter (FIGURA chapter.n)
"""
from pathlib import Path
import yaml
import re
import argparse
import sys

# SIMPLE, ROBUST regex: capture id in group(1)
# matches <p ... class="... figure-label ..." ... id="SOME/ID"> ... </p>
FIG_RE = re.compile(
    r'<p\b[^>]*\bclass=["\'][^"\']*figure-label[^"\']*["\'][^>]*\bid=["\']([^"\']+)["\'][^>]*>.*?</p>',
    re.IGNORECASE | re.DOTALL
)

# matches our inline references like [[FIG:gr_consumer/discrete-pref]] (allows spaces)
REF_RE = re.compile(r'\[\[\s*FIG\s*:\s*([^\]\s]+)\s*\]\]', re.IGNORECASE)

def md_rel_to_page_url(rel_path: Path) -> str:
    """
    Convert a Path like it/I/1/1.md -> it/I/1/1
    it/I/1/index.md -> it/I/1
    """
    p = str(rel_path).replace("\\", "/")
    if p.endswith(".md"):
        p = p[:-3]
    if p.endswith("/index"):
        p = p[:-6]
    return p

def detect_lang_from_path(path: Path) -> str:
    parts = list(path.parts)
    if len(parts) > 0 and parts[0] in ("it", "en"):
        return parts[0]
    # fallback: try to find 'it' or 'en' anywhere
    for part in parts:
        if part in ("it", "en"):
            return part
    return "it"

def extract_chapter(path: Path):
    """
    Extract chapter number from path, supporting both it/ and en/
    e.g. it/I/2/3.md -> '2' (the chapter folder)
    e.g. it/I/2.md -> '2' (if layout has no section)
    fallback: parent folder name
    """
    parts = list(path.parts)
    # find index of 'it' or 'en'
    idx = None
    for i, p in enumerate(parts):
        if p in ("it", "en"):
            idx = i
            break
    if idx is not None:
        # expect layout it/<PART>/<CHAPTER>/... or it/<PART>/<CHAPTER>.md
        if len(parts) > idx + 2:
            return parts[idx + 2]
    return path.parent.name

def build_file_list(site_root: Path):
    """
    Try to resolve files from TOC if present (preferring the structure),
    otherwise fallback to scanning both it/ and en/ for .md files.
    Returns a list of Paths (absolute resolved), ordered.
    """
    toc_path = site_root / "_data" / "toc.yml"
    files = []
    if toc_path.exists():
        try:
            with toc_path.open(encoding="utf-8") as f:
                toc = yaml.safe_load(f)
        except Exception as e:
            print(f"[WARN] cannot read TOC: {e}", file=sys.stderr)
            toc = None

        if toc:
            parts = toc.get("parts") or toc.get("Parts") or []
            for part in parts:
                part_folder = str(part.get("folder", "")).strip()
                chapters = part.get("chapters", []) or []
                for chap in chapters:
                    chap_folder = str(chap.get("folder", "")).strip()
                    sections = chap.get("sections", []) or []
                    # Try to build candidate paths for both languages and both index/numbered
                    for i in range(1, len(sections) + 1):
                        for lang in ("it", "en"):
                            candidate = site_root / lang / part_folder / chap_folder / f"{i}.md"
                            if candidate.exists():
                                files.append(candidate.resolve())
                    # also try index.md for chapter landing
                    for lang in ("it", "en"):
                        candidate_idx = site_root / lang / part_folder / chap_folder / "index.md"
                        if candidate_idx.exists():
                            files.append(candidate_idx.resolve())
            # remove duplicates while preserving order
            seen = set()
            ordered = []
            for p in files:
                if p not in seen:
                    seen.add(p)
                    ordered.append(p)
            if ordered:
                return ordered

    # fallback: scan both languages
    files = []
    for lang in ("it", "en"):
        root = site_root / lang
        if root.exists():
            files.extend(sorted([p.resolve() for p in root.rglob("*.md")]))
    # final dedupe preserving order
    seen = set()
    ordered = []
    for p in files:
        if p not in seen:
            seen.add(p)
            ordered.append(p)
    return ordered

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--site-root", default=".", help="root of the site (default .)")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--backup", action="store_true")
    parser.add_argument("--update-refs", action="store_true",
                        help="replace [[FIG:id]] with a clickable link to the figure")
    parser.add_argument("--verbose", action="store_true")
    parser.add_argument("--mode", choices=("chapter",), default="chapter",
                        help="numbering mode; currently 'chapter' supported")
    args = parser.parse_args()

    site_root = Path(args.site_root).resolve()
    files = build_file_list(site_root)
    if not files:
        print("[ERROR] nessun file md trovato (toc.yml mancante o vuoto)", file=sys.stderr)
        sys.exit(1)

    # normalize to relative paths for consistent printed output
    files_rel = [p.relative_to(site_root) for p in files]

    print("Files resolved from TOC / scan:")
    for f in files_rel:
        print(" ", f)
    print("Total:", len(files_rel))

    # PASS 1: costruisco mappa id -> (label, page_url) per lingua
    chapter_counters = {"it": {}, "en": {}}
    id_map = {"it": {}, "en": {}}
    total_figures = 0

    for rel in files_rel:
        full = site_root / rel
        lang = detect_lang_from_path(rel)
        chapter = extract_chapter(rel)
        # ensure counter entry exists for this chapter in language
        if chapter not in chapter_counters[lang]:
            chapter_counters[lang][chapter] = 1

        text = full.read_text(encoding="utf-8")
        for m in FIG_RE.finditer(text):
            fig_id = m.group(1)  # the id captured by the simple regex
            n = chapter_counters[lang][chapter]
            if lang == "en":
                label = f"FIGURE {chapter}.{n}"
            else:
                label = f"FIGURA {chapter}.{n}"
            page_url = md_rel_to_page_url(rel)
            # store label and page_url
            id_map[lang][fig_id] = (label, page_url)
            chapter_counters[lang][chapter] += 1
            total_figures += 1

    if args.verbose:
        print(f"[INFO] Built id -> label map: total figures: {total_figures}")
        # show up to 12 mappings (mixed langs)
        shown = 0
        for lg in ("it", "en"):
            for k, v in id_map[lg].items():
                if shown >= 12:
                    break
                print(f"  [{lg}] {k} => {v}")
                shown += 1
            if shown >= 12:
                break

    # PASS 2: riscrivo i file (sostituisco le label e - opzionale - i riferimenti)
    modified = []

    for rel in files_rel:
        full = site_root / rel
        lang = detect_lang_from_path(rel)
        text = full.read_text(encoding="utf-8")

        # replace figure labels: keep id extracted, produce consistent <p class="figure-label" id="..."><strong>LABEL</strong></p>
        def repl_fig(m):
            fig_id = m.group(1)
            entry = id_map.get(lang, {}).get(fig_id)
            label = entry[0] if entry else "FIGURA ?"
            return f'<p class="figure-label" id="{fig_id}">{label}</p>'

        new_text = FIG_RE.sub(repl_fig, text)

        if args.update_refs:
            # 1) prima sostituisci i token [[FIG:id]]
            def repl_ref_token(m):
                fig_id = m.group(1)
                entry = id_map.get(lang, {}).get(fig_id)
                if entry:
                    label, page_url = entry
                    number = re.sub(r'^(FIGURA|FIGURE)\s+', '', label).strip()
                    word = "Figura" if lang == "it" else "Figure"
                    href = f'{{{{ site.baseurl }}}}/{page_url}#{fig_id}'
                    return f'<a href="{href}">{word} {number}</a>'
                else:
                    # fallback: try the other language map
                    other = "en" if lang == "it" else "it"
                    entry2 = id_map.get(other, {}).get(fig_id)
                    if entry2:
                        label2, page_url2 = entry2
                        number2 = re.sub(r'^(FIGURA|FIGURE)\s+', '', label2).strip()
                        word2 = "Figura" if other == "it" else "Figure"
                        href2 = f'{{{{ site.baseurl }}}}/{page_url2}#{fig_id}'
                        return f'<a href="{href2}">{word2} {number2}</a>'
                    return m.group(0)

            new_text = REF_RE.sub(repl_ref_token, new_text)

            # 2) poi sostituisci anche eventuali anchor HTML già esistenti che puntano a #fig_id
            #    (es. <a href="/it/I/1/1#gr_figB">Figura 1.2</a> o <a href="#gr_figB">Figura 1.2</a>)
            #    per ogni fig_id noto nella lingua corrente, sostituisci l'intero <a ...>...</a>
            #    con la versione aggiornata.
            for fig_id, (label, page_url) in id_map.get(lang, {}).items():
                number = re.sub(r'^(FIGURA|FIGURE)\s+', '', label).strip()
                word = "Figura" if lang == "it" else "Figure"
                href_full = f'{{{{ site.baseurl }}}}/{page_url}#{fig_id}'
                # regex per trovare <a ... href="(maybe site.baseurl...)?#fig_id" ...>...</a>
                # - non-greedy match for attributes and inner text
                anchor_re = re.compile(
                    rf'<a\b([^>]*)\bhref=(["\'])(?:[^"\']*?){re.escape("#"+fig_id)}\2([^>]*)>.*?</a>',
                    flags=re.IGNORECASE | re.DOTALL
                )
                # replacement: a consistent anchor pointing to the canonical page_url
                replacement = f'<a href="{href_full}">{word} {number}</a>'
                new_text, nrep = anchor_re.subn(replacement, new_text)
                # (nrep used only implicitly; continue for all fig_ids)

            # 3) fallback: prova anche a trovare anchors che usano other-language page_url
            #    (rare; handled implicitly above by two-language map during token replacement)

        if new_text != text:
            modified.append(rel)
            if not args.dry_run:
                if args.backup:
                    bak = full.with_suffix(full.suffix + ".bak")
                    bak.write_bytes(full.read_bytes())
                full.write_text(new_text, encoding="utf-8")
            if args.verbose:
                print(f"[MOD] {rel}")

    print("\nDone.")
    print("Total figures discovered:", total_figures)
    print("Files modified:", len(modified))
    if args.dry_run:
        print("(dry-run: no file changes were written)")
    if args.verbose and modified:
        for r in modified:
            print(" -", r)

if __name__ == "__main__":
    main()