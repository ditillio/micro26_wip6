// auto-figure-number-section.js
document.addEventListener("DOMContentLoaded", () => {

  // trova chapter e section dal path; se path contiene almeno 2 numeri, usa penultimo/ultimo
  function getChapterAndSectionFromPath() {
    const parts = window.location.pathname.split("/").filter(Boolean);
    const nums = parts.filter(p => /^\d+$/.test(p));
    if (nums.length >= 2) {
      const chapter = nums[nums.length - 2];
      const section = nums[nums.length - 1];
      return { chapter, section };
    }
    return { chapter: null, section: null };
  }

  // fallback: cerca negli heading H1/H2 pattern like "Capitolo 2" o "2.3 Titolo"
  function getFromHeadings() {
    const h = document.querySelector("h1, h2, h3");
    if (!h) return { chapter: null, section: null };
    const txt = (h.textContent || "").trim();
    let m = txt.match(/\bCapitolo\b[\s.:]*?(\d+)(?:\.(\d+))?/i) || txt.match(/\bChapter\b[\s.:]*?(\d+)(?:\.(\d+))?/i);
    if (m) return { chapter: m[1], section: m[2] || null };
    // try patterns like "2.3 Titolo" or "2.3.1"
    m = txt.match(/^(\d+)\.(\d+)/);
    if (m) return { chapter: m[1], section: m[2] };
    return { chapter: null, section: null };
  }

  const byPath = getChapterAndSectionFromPath();
  let chapter = byPath.chapter;
  let section = byPath.section;

  if (!chapter) {
    const fromHead = getFromHeadings();
    chapter = fromHead.chapter;
    section = fromHead.section;
  }

  // fallback ultimate: try to detect a single number as chapter
  if (!chapter) {
    const parts = window.location.pathname.split("/").filter(Boolean);
    const nums = parts.filter(p => /^\d+$/.test(p));
    if (nums.length === 1) chapter = nums[0];
  }

  // determine language: "en" if path contains /en/ else "it"
  const path = window.location.pathname || "";
  const isEn = /\/en(\/|$)/.test(path);

  // Find all labels in document order, count only those that belong to this section page.
  // We expect authors to write: <p class="figure-label" id="...">FIGURA</p> (or with any inner text)
  const labels = Array.from(document.querySelectorAll(".figure-label"));

  // counter for figures in this section/page
  let counter = 0;
  labels.forEach(label => {
    // skip if explicitly excluded
    if (label.classList.contains("no-auto-number")) return;

    // determine whether the label belongs to this *section*:
    // we assume one page = one section; if you have many pages per section you'd need build-time.
    // So we number all .figure-label present on the current page.
    counter += 1;

    // build label token (FIGURA vs FIGURE)
    const tok = isEn ? "FIGURE" : "FIGURA";

    // extract textual description after possible existing label
    // innerText is safe here because this script must run BEFORE print-figure adds the button
    const fullText = (label.innerText || "").trim();
    // remove any existing prefix like "FIGURA 2.3.4" or "FIGURE ..."
    const rest = fullText.replace(/^(FIGURA|FIGURE)\s*\d+(\.\d+)*\s*/i, "").trim();

    // compose final label
    let newLabel;
    if (chapter && section) {
      newLabel = `${tok} ${chapter}.${section}.${counter}`;
    } else if (chapter) {
      newLabel = `${tok} ${chapter}.${counter}`;
    } else {
      // ultimate fallback: simple progressive per page
      newLabel = `${tok} ${counter}`;
    }

    // Put the label as HTML in a conservative way:
    // we replace the textual content while keeping any child elements (but label is usually plain)
    // easiest robust approach: set label.innerHTML to <strong>LABEL</strong> + optional description
    const descrHtml = rest ? (" " + escapeHtml(rest)) : "";
    label.innerHTML = `<strong>${escapeHtml(newLabel)}</strong>${descrHtml}`;
  });

  // small utility to escape text into HTML
  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

});
