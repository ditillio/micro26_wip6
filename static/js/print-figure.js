// Simplified print-figure.js
// Assumes: all labels "FIGURA X.Y" or "FIGURE X.Y" are written in the .md above the <figure>.

document.addEventListener("DOMContentLoaded", () => {

  const FIG_RE = /^(FIGURA|FIGURE)\s+\d+\.\d+/; // case-sensitive: only ALL CAPS labels

  function isFigureLabelText(t) {
    if (!t) return false;
    return FIG_RE.test(t.trim());
  }

  // find the first <figure> after the given element (walk siblings / parents)
  function findNextFigureAfter(el) {
    let cur = el;
    while (cur && cur.nextElementSibling) {
      cur = cur.nextElementSibling;
      if (!cur) break;
      if (cur.tagName && cur.tagName.toLowerCase() === "figure") return cur;
      if (cur.querySelector) {
        const f = cur.querySelector("figure");
        if (f) return f;
      }
    }
    const p = el.parentElement;
    if (p && p !== document.body) return findNextFigureAfter(p);
    return null;
  }

  // open print using an invisible iframe (no popup)
  function openPrintWindowWithFigure(figure, labelSourceEl = null) {
    const clone = figure.cloneNode(true);

    // If the label is outside the figure (normal case), prepare printable wrapper with label
    let printableOuterHTML;
    if (labelSourceEl) {
      const labelText = (labelSourceEl.textContent || "").trim();
      const m = labelText.match(/^(FIGURA|FIGURE)\s+\d+\.\d+/);
      if (m) {
        const labelDiv = document.createElement("div");
        labelDiv.className = "print-figure-label";
        labelDiv.textContent = m[0];

        const wrapper = document.createElement("div");
        wrapper.appendChild(labelDiv);
        wrapper.appendChild(clone);
        printableOuterHTML = wrapper.outerHTML;
      }
    }

    // sync inputs into clone (print-safe)
    const originalInputs = figure.querySelectorAll("input, select, textarea");
    const clonedInputs = clone.querySelectorAll("input, select, textarea");

    originalInputs.forEach((input, i) => {
      const c = clonedInputs[i];
      if (!c) return;
      const tag = (input.tagName || "").toLowerCase();

      if (tag === "input") {
        const type = (input.getAttribute("type") || "").toLowerCase();
        if (type === "checkbox" || type === "radio") {
          c.checked = input.checked;
          c.defaultChecked = input.checked;
          if (input.checked) c.setAttribute("checked", "checked");
          else c.removeAttribute("checked");
        } else {
          c.value = input.value;
          c.defaultValue = input.value;
          c.setAttribute("value", input.value);
        }
        return;
      }

      if (tag === "select") {
        c.value = input.value;
        Array.from(c.options).forEach(opt => {
          const sel = (opt.value === input.value);
          opt.selected = sel;
          if (sel) opt.setAttribute("selected", "selected");
          else opt.removeAttribute("selected");
        });
        return;
      }

      if (tag === "textarea") {
        c.value = input.value;
        c.defaultValue = input.value;
        c.textContent = input.value;
        return;
      }
    });

    // remove print buttons from clone
    clone.querySelectorAll(".print-figure-btn").forEach(b => b.remove());

    // gather page styles
    const styles = Array.from(document.querySelectorAll("link[rel='stylesheet'], style"))
      .map(el => el.outerHTML)
      .join("");

    // create hidden iframe
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.setAttribute("aria-hidden", "true");
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(`
      <html>
        <head>
          <title>Stampa figura</title>
          ${styles}
          <style>
            @page { margin: 12mm; }
            html { margin: 0 !important; padding: 0 !important; width: 100% !important; background: white; }
            body {
              margin: 0 !important;
              padding-top: 12mm !important;
              padding-bottom: 12mm !important;
              padding-left: 14mm !important;
              padding-right: 18mm !important;
              width: 100% !important;
              background: white;
              display: block;
            }
            figure { margin: 0 auto !important; padding: 0 !important; width: 100% !important; max-width: 100% !important; box-sizing: border-box !important; transform: none !important; left: auto !important; right: auto !important; }
            figure.fullwidth { margin-left: 0 !important; margin-right: 0 !important; width: 100% !important; max-width: 100% !important; }
            figure * { box-sizing: border-box; }
            .kg-container, .kg-container * { max-width: 100% !important; }
            .sidebar { max-width: 100% !important; overflow: visible !important; }
            .kg-container { overflow: visible !important; }
            .print-figure-label { font-weight: 700; font-size: 20px; margin: 0 0 10mm 0; border-bottom: 1px solid #bbb; padding-bottom: 3mm; }
          </style>
        </head>
        <body>
          ${ printableOuterHTML ? printableOuterHTML : clone.outerHTML }
        </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => { iframe.remove(); }, 1000);
    }, 200);
  }

  // tooltip localized by path segment (robust)
  function getPrintFigureTitle() {
    const path = window.location.pathname || "";
    const m = path.match(/\/(it|en)(\/|$)/);
    const lang = m ? m[1] : "it";
    return (lang === "en") ? "Print this figure" : "Stampa questa figura";
  }

  function makeButton() {
    const btn = document.createElement("button");
    btn.className = "print-figure-btn";
    btn.type = "button";
    btn.innerHTML = "🖨️";
    btn.title = getPrintFigureTitle();
    return btn;
  }

  function hasPrintButton(root) {
    return !!(root && root.querySelector && root.querySelector(".print-figure-btn"));
  }

  // Attach buttons to manual labels (only these are considered authoritative now)
  function attachButtonsToLabels() {
    // candidate elements where the label may be placed in MD
    const candidates = document.querySelectorAll("p, strong, span, a");
    candidates.forEach(el => {
      if (el.closest(".sidebar")) return; // keep labels outside sidebar (we assume md labels)
      const txt = (el.textContent || "").trim();
      if (!isFigureLabelText(txt)) return;
      // avoid if this node contains an actual figure
      if (el.querySelector && el.querySelector("figure")) return;

      const fig = findNextFigureAfter(el);
      if (!fig) return;

      // avoid duplicate button
      const parent = el.parentElement || el;
      if (hasPrintButton(parent)) return;

      // wrap if needed
      let wrap = el.closest(".figure-label-wrap");
      if (!wrap) {
        wrap = document.createElement("span");
        wrap.className = "figure-label-wrap";
        el.parentNode.insertBefore(wrap, el);
        wrap.appendChild(el);
      }
      if (hasPrintButton(wrap)) return;

      const btn = makeButton();
      btn.addEventListener("click", () => {
        const f = findNextFigureAfter(wrap);
        if (!f) {
          console.warn("Print figure: cannot find <figure> after label", el);
          return;
        }
        openPrintWindowWithFigure(f, wrap);
      });
      wrap.appendChild(btn);
    });
  }

  // initial run
  attachButtonsToLabels();

  // one extra run after full load (fonts/layout settled)
  window.addEventListener("load", attachButtonsToLabels);

});
