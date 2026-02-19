document.addEventListener("DOMContentLoaded", () => {

  const FIG_RE = /^(FIGURA|FIGURE)\s+\d+\.\d+/;

  function isFigureLabelText(t) {
    if (!t) return false;
    return FIG_RE.test(t.trim());
  }

  function findNextFigureAfter(el) {
    // Cerca la prima <figure> successiva nel DOM (scorrendo tra sibling e risalendo se serve)
    let cur = el;

    // prima: prova tra i sibling diretti
    while (cur && cur.nextElementSibling) {
      cur = cur.nextElementSibling;
      if (!cur) break;
      if (cur.tagName && cur.tagName.toLowerCase() === "figure") return cur;
      if (cur.querySelector) {
        const f = cur.querySelector("figure");
        if (f) return f;
      }
    }

    // fallback: risali di un livello e riprova
    const p = el.parentElement;
    if (p && p !== document.body) return findNextFigureAfter(p);

    return null;
  }

  function findFigureForLabel(labelEl) {
    // Caso sidebar: label dentro la figura
    const inside = labelEl.closest("figure");
    if (inside) return inside;

    // Caso label manuale: la figura è dopo
    return findNextFigureAfter(labelEl);
  }

  function openPrintWindowWithFigure(figure, labelSourceEl = null) {
    const clone = figure.cloneNode(true);

    // Se la label non è dentro la figura (caso "senza sidebar"), aggiungila in cima al print
    if (labelSourceEl) {
      const labelText = (labelSourceEl.textContent || "").trim();

      // prendi solo "FIGURA X.Y" / "FIGURE X.Y" (senza altre parole)
      const m = labelText.match(/^(FIGURA|FIGURE)\s+\d+\.\d+/);
      if (m) {
        const labelDiv = document.createElement("div");
        labelDiv.className = "print-figure-label";
        labelDiv.textContent = m[0];

        // wrapper: label sopra, poi figura
        const wrapper = document.createElement("div");
        wrapper.appendChild(labelDiv);
        wrapper.appendChild(clone);

        // sostituisci clone con wrapper
        // (più sotto useremo wrapper.outerHTML)
        var printableOuterHTML = wrapper.outerHTML;
      }
    }

    // sincronizza stato input (slider, radio, ecc.) in modo "print-safe"
    const originalInputs = figure.querySelectorAll("input, select, textarea");
    const clonedInputs = clone.querySelectorAll("input, select, textarea");

    originalInputs.forEach((input, i) => {
      const c = clonedInputs[i];
      if (!c) return;

      const tag = (input.tagName || "").toLowerCase();

      // INPUT
      if (tag === "input") {
        const type = (input.getAttribute("type") || "").toLowerCase();

        if (type === "checkbox" || type === "radio") {
          c.checked = input.checked;
          c.defaultChecked = input.checked;

          if (input.checked) c.setAttribute("checked", "checked");
          else c.removeAttribute("checked");

        } else {
          // range, number, text, hidden, ecc.
          c.value = input.value;
          c.defaultValue = input.value;
          c.setAttribute("value", input.value);
        }

        return;
      }

      // SELECT
      if (tag === "select") {
        c.value = input.value;

        // forza lo stato delle option (alcuni browser guardano quello in stampa)
        Array.from(c.options).forEach(opt => {
          const sel = (opt.value === input.value);
          opt.selected = sel;
          if (sel) opt.setAttribute("selected", "selected");
          else opt.removeAttribute("selected");
        });

        return;
      }

      // TEXTAREA
      if (tag === "textarea") {
        c.value = input.value;
        c.defaultValue = input.value;
        c.textContent = input.value;
        return;
      }
    });

    // non stampare i bottoni
    clone.querySelectorAll(".print-figure-btn").forEach(b => b.remove());

    // raccogli CSS della pagina
    const styles = Array.from(document.querySelectorAll("link[rel='stylesheet'], style"))
      .map(el => el.outerHTML)
      .join("");

    // crea iframe nascosto
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
            /* margini pagina: best effort (il browser può ignorarli se l'utente sceglie "Margins: None") */
            @page { margin: 12mm; }

            html {
              margin: 0 !important;
              padding: 0 !important;
              width: 100% !important;
              background: white;
            }

            /* QUESTO garantisce margini anche con "Margins: None" */
            body {
              margin: 0 !important;

              /* sinistra | destra leggermente più ampia */
              padding-top: 12mm !important;
              padding-bottom: 12mm !important;
              padding-left: 14mm !important;
              padding-right: 18mm !important;

              width: 100% !important;
              background: white;
              display: block;
            }

            /* forza la figura ad entrare nel foglio */
            figure {
              margin: 0 auto !important;
              padding: 0 !important;
              width: 100% !important;
              max-width: 100% !important;
              box-sizing: border-box !important;
              transform: none !important;
              left: auto !important;
              right: auto !important;
            }

            /* spesso il tuo fullwidth ha margin-left negativo o simili: annullalo */
            figure.fullwidth {
              margin-left: 0 !important;
              margin-right: 0 !important;
              width: 100% !important;
              max-width: 100% !important;
            }

            /* qualunque wrapper interno non deve “spingere” a sinistra */
            figure * {
              box-sizing: border-box;
            }

            /* iframe kg spesso mette una larghezza fissa: rendiamola fluida */
            .kg-container, .kg-container * {
              max-width: 100% !important;
            }

            /* evita tagli di sidebar/controlli */
            .sidebar {
              max-width: 100% !important;
              overflow: visible !important;
            }

            /* se ci sono elementi assoluti che escono, prova a contenerli */
            .kg-container {
              overflow: visible !important;
            }

            /* label aggiunta per le figure senza sidebar */
            .print-figure-label {
              font-weight: 700;
              font-size: 20px;
              margin: 0 0 10mm 0;
              border-bottom: 1px solid #bbb;
              padding-bottom: 3mm;
            }
          </style>
        </head>
        <body>
          ${(typeof printableOuterHTML !== "undefined") ? printableOuterHTML : clone.outerHTML}
        </body>
      </html>
    `);
    doc.close();

    // aspetta un attimo che il browser faccia layout, poi stampa
    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();

      // pulizia dopo un po' (Firefox a volte ha bisogno di tempo)
      setTimeout(() => {
        iframe.remove();
      }, 1000);
    }, 200);
  }

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

  // -------------------------
  //  A) FIGURE SENZA SIDEBAR
  // -------------------------
  function attachForNoSidebar() {
    const candidates = document.querySelectorAll("a, strong, span, p, div");

    candidates.forEach(el => {
      if (el.closest(".sidebar")) return;

      const txt = (el.textContent || "").trim();
      if (!isFigureLabelText(txt)) return;

      if (el.querySelector && el.querySelector("figure")) return;

      const fig = findFigureForLabel(el);
      if (!fig) return;

      const parent = el.parentElement || el;
      if (hasPrintButton(parent)) return;

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
        const f = findFigureForLabel(wrap);
        if (!f) {
          console.warn("Print figure: non trovo la <figure> dopo la label", el);
          return;
        }
        openPrintWindowWithFigure(f, wrap);
      });

      wrap.appendChild(btn);
    });
  }

  // -------------------------
  //  B) FIGURE CON SIDEBAR
  // -------------------------
  function attachForSidebarOnceReady() {
    document.querySelectorAll("figure.fullwidth").forEach(fig => {
      const sidebar = fig.querySelector(".sidebar");
      if (!sidebar) return;

      const labelDiv = sidebar.querySelector(":scope > div:first-child > div:first-child");
      if (!labelDiv) return;

      if (hasPrintButton(labelDiv)) return;

      const t = (labelDiv.textContent || "").trim();
      if (!isFigureLabelText(t)) return;

      labelDiv.classList.add("figure-label-row");

      const btn = makeButton();
      btn.addEventListener("click", () => openPrintWindowWithFigure(fig));

      labelDiv.appendChild(btn);
    });
  }

  // Re-inietta per un po' (utile dopo print, zoom, resize, re-layout KG)
  function reattachForAWhile(ms = 5000, every = 250) {
    const start = Date.now();
    const id = setInterval(() => {
      attachForNoSidebar();
      attachForSidebarOnceReady();

      if (Date.now() - start > ms) {
        clearInterval(id);
      }
    }, every);
  }

  // Prima passata
  attachForNoSidebar();

  // Poll leggero per sidebar iniziale (KG crea .sidebar dopo)
  let tries = 0;
  const maxTries = 20;
  const timer = setInterval(() => {
    attachForSidebarOnceReady();
    tries++;
    if (tries >= maxTries) clearInterval(timer);
  }, 250);

  window.addEventListener("load", () => {
    attachForNoSidebar();
    attachForSidebarOnceReady();
  });

  window.addEventListener("afterprint", () => {
    reattachForAWhile(5000, 250);
  });

  window.addEventListener("beforeprint", () => {
    attachForNoSidebar();
    attachForSidebarOnceReady();
  });

  // ✅ FIX: zoom in/out => resize => KG può ricostruire sidebar e far sparire il bottone
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      reattachForAWhile(3000, 250);
    }, 150);
  });

});
