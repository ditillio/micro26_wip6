// print-figure.js - versione semplificata e robusta
document.addEventListener("DOMContentLoaded", () => {

  const FIG_RE = /^(FIGURA|FIGURE)\s+\d+\.\d+/; // etichetta in maiuscolo come fonte d'autorità

  function isFigureLabelText(t) {
    return !!t && FIG_RE.test(t.trim());
  }

  // trova il primo .kg-container che compare *dopo* la label nel documento
  function findFirstKgAfter(el) {
    const containers = Array.from(document.querySelectorAll('.kg-container'));
    for (const c of containers) {
      if (el.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING) return c;
    }
    return null;
  }

  function getLangTitle() {
    const path = window.location.pathname || "";
    const m = path.match(/\/(it|en)(\/|$)/);
    const lang = m ? m[1] : "it";
    return (lang === "en") ? "Print this figure" : "Stampa questa figura";
  }

  function makeButton() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "print-figure-btn";
    btn.setAttribute("aria-label", getLangTitle());
    btn.title = getLangTitle();

    // icona SVG (personalizzabile)
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M19 8H5a2 2 0 0 0-2 2v5h4v4h10v-4h4v-5a2 2 0 0 0-2-2zm-1 12H6v-6h12v6zM17 3H7v4h10V3z"/>
      </svg>`;
    // stile inline minimo per posizionarlo vicino alla label
    btn.style.display = "inline-block";
    btn.style.verticalAlign = "middle";
    btn.style.marginLeft = "0.6rem";
    btn.style.padding = "2px 6px";
    btn.style.border = "none";
    btn.style.background = "transparent";
    btn.style.cursor = "pointer";
    return btn;
  }

  // apre iframe e stampa (come nella versione precedente)
  function openPrintWindowWithFigure(figure, labelEl) {
    const clone = figure.cloneNode(true);

    // sincronizza inputs/selects/textarea
    const originals = figure.querySelectorAll("input, select, textarea");
    const clones = clone.querySelectorAll("input, select, textarea");
    originals.forEach((orig, i) => {
      const c = clones[i];
      if (!c) return;
      const tag = orig.tagName.toLowerCase();
      if (tag === "input") {
        const type = (orig.getAttribute("type") || "").toLowerCase();
        if (type === "checkbox" || type === "radio") {
          c.checked = orig.checked;
          if (orig.checked) c.setAttribute("checked","checked"); else c.removeAttribute("checked");
        } else {
          c.value = orig.value;
          c.setAttribute("value", orig.value);
        }
      } else if (tag === "select") {
        c.value = orig.value;
        Array.from(c.options).forEach(opt => {
          if (opt.value === orig.value) opt.setAttribute("selected","selected");
          else opt.removeAttribute("selected");
        });
      } else if (tag === "textarea") {
        c.value = orig.value;
        c.textContent = orig.value;
      }
    });

    // remove eventuali print buttons nella clone
    clone.querySelectorAll(".print-figure-btn").forEach(b => b.remove());

    // prepara label stampabile (se labelEl fornita)
    let printableHTML;
    if (labelEl) {
      const labelTxt = (labelEl.textContent || "").trim().match(/^(FIGURA|FIGURE)\s+\d+\.\d+/);
      if (labelTxt) {
        printableHTML = `<div class="print-figure-label" style="font-weight:700;margin-bottom:8mm;border-bottom:1px solid #ddd;padding-bottom:6px;">${labelTxt[0]}</div>` + clone.outerHTML;
      } else {
        printableHTML = clone.outerHTML;
      }
    } else printableHTML = clone.outerHTML;

    const styles = Array.from(document.querySelectorAll("link[rel='stylesheet'], style"))
      .map(s => s.outerHTML).join("\n");

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.setAttribute("aria-hidden","true");
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(`
      <html>
        <head>
          <meta charset="utf-8"/>
          ${styles}
          <style>
            @page { margin: 12mm; }
            body { background: white; margin: 0; padding: 12mm; }
            .kg-container, figure { max-width: 100% !important; box-sizing: border-box; }
            .print-figure-label { font-weight: 700; font-size: 18px; margin-bottom: 10px; }
          </style>
        </head>
        <body>${printableHTML}</body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(()=> iframe.remove(), 1000);
    }, 200);
  }

  // MAIN: attach buttons
  function attachButtons() {
    const labels = document.querySelectorAll(".figure-label");
    labels.forEach(el => {
      if (!isFigureLabelText(el.textContent || "")) return;
      // se la label o i suoi antenati hanno classe che esclude, skip
      if (el.closest && el.closest(".no-print-button")) return;

      // se il bottone è già presente nella stessa element, skip
      if (el.querySelector && el.querySelector(".print-figure-btn")) return;

      // trova il primo container dopo la label (ordine documento)
      const fig = findFirstKgAfter(el);
      if (!fig) return;
      // se il container stesso dichiara data-print-button="false" o classe no-print-button, skip
      if (fig.dataset && fig.dataset.printButton === "false") return;
      if (fig.classList && fig.classList.contains("no-print-button")) return;

      // crea e inserisce il bottone direttamente nella label (non wrapper)
      const btn = makeButton();
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        openPrintWindowWithFigure(fig, el);
      });
      el.appendChild(btn);
    });
  }

  // esecuzione iniziale
  setTimeout(attachButtons, 120); // piccolo delay per permettere rendering dinamico
});
