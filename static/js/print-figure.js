// print-figure.js - versione con conversione canvas/svg -> img
document.addEventListener("DOMContentLoaded", () => {

  const FIG_RE = /^(FIGURA|FIGURE)\s+\d+(?:\.\d+)*/; // etichetta in maiuscolo come fonte d'autorità

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

  function getLangResetTitle() {
    const path = window.location.pathname || "";
    const m = path.match(/\/(it|en)(\/|$)/);
    const lang = m ? m[1] : "it";
    return (lang === "en") ? "Reset graph" : "Resetta grafico";
  }

  function getLangCode() {
    const path = window.location.pathname || "";
    const m = path.match(/\/(it|en)(\/|$)/);
    return m ? m[1] : "it";
  }

  function getPrintFooterText() {
    const lang = getLangCode();
    return (lang === "en")
      ? "Notes on Microeconomics. Copyright © 2025-2026 Alfredo Di Tillio. All rights reserved."
      : "Note di microeconomia. Copyright © 2025-2026 Alfredo Di Tillio. All rights reserved.";
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

  // --- NEW: reset button (icona freccia circolare) ---
  function makeResetButton() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "reset-graph-btn";
    btn.setAttribute("aria-label", getLangResetTitle());
    btn.title = getLangResetTitle();

    // icona "refresh"
    btn.textContent = "↻";
    btn.style.fontSize = "20px";
    btn.style.lineHeight = "1";
    btn.style.fontWeight = "450";
    btn.style.position = "relative";
    btn.style.top = "-2px";

    // stile inline: IDENTICO al print, ma margine più piccolo perché è "a destra della stampante"
    btn.style.display = "inline-block";
    btn.style.verticalAlign = "middle";
    btn.style.marginLeft = "0.2rem";
    btn.style.padding = "2px 6px";
    btn.style.border = "none";
    btn.style.background = "transparent";
    btn.style.cursor = "pointer";
    return btn;
  }
  // --- END NEW ---

  // ---------- helper: convert canvases & svgs in the clone to images ----------
  function convertGraphicsToImages(origRoot, cloneRoot) {
    // 1) canvases
    try {
      const origCanvases = Array.from(origRoot.querySelectorAll('canvas'));
      const cloneCanvases = Array.from(cloneRoot.querySelectorAll('canvas'));
      origCanvases.forEach((origCanvas, idx) => {
        const cloneCanvas = cloneCanvases[idx];
        if (!cloneCanvas) return;
        try {
          // try to get a PNG data URL from original canvas
          const data = origCanvas.toDataURL('image/png');
          const img = document.createElement('img');
          img.src = data;
          // preserve sizing / style
          if (cloneCanvas.width) img.width = cloneCanvas.width;
          if (cloneCanvas.height) img.height = cloneCanvas.height;
          if (cloneCanvas.style && cloneCanvas.style.width) img.style.width = cloneCanvas.style.width;
          if (cloneCanvas.style && cloneCanvas.style.height) img.style.height = cloneCanvas.style.height;
          cloneCanvas.parentNode && cloneCanvas.parentNode.replaceChild(img, cloneCanvas);
        } catch (err) {
          // toDataURL may fail for tainted canvas (CORS) -- log and leave the clone canvas as-is
          console.warn('print-figure: could not convert canvas to image (tainted or cross-origin?):', err, origCanvas);
        }
      });
    } catch (e) {
      console.warn('print-figure: error converting canvases', e);
    }

    // 2) SVGs
    try {
      const origSvgs = Array.from(origRoot.querySelectorAll('svg'));
      const cloneSvgs = Array.from(cloneRoot.querySelectorAll('svg'));
      origSvgs.forEach((origSvg, idx) => {
        const cloneSvg = cloneSvgs[idx];
        if (!cloneSvg) return;
        try {
          const serializer = new XMLSerializer();
          let svgStr = serializer.serializeToString(origSvg);

          // Add namespace if missing
          if (!svgStr.match(/^<svg[^>]+xmlns=/)) {
            svgStr = svgStr.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
          }
          // Fix xlink namespace if needed
          if (svgStr.indexOf('xmlns:xlink') === -1 && svgStr.indexOf('xlink:href') !== -1) {
            svgStr = svgStr.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
          }

          const encoded = encodeURIComponent(svgStr);
          const data = 'data:image/svg+xml;charset=utf-8,' + encoded;

          const img = document.createElement('img');
          img.src = data;
          // copy width/height attributes if present
          const w = cloneSvg.getAttribute('width');
          const h = cloneSvg.getAttribute('height');
          if (w) img.setAttribute('width', w);
          if (h) img.setAttribute('height', h);
          // copy inline styles
          if (cloneSvg.style && cloneSvg.style.width) img.style.width = cloneSvg.style.width;
          if (cloneSvg.style && cloneSvg.style.height) img.style.height = cloneSvg.style.height;

          cloneSvg.parentNode && cloneSvg.parentNode.replaceChild(img, cloneSvg);
        } catch (err) {
          console.warn('print-figure: could not serialize svg for printing:', err, origSvg);
        }
      });
    } catch (e) {
      console.warn('print-figure: error converting svgs', e);
    }
  }
  // ---------- end helper ----------

  // apre iframe e stampa (come nella versione precedente), ora con conversione grafica
  function openPrintWindowWithFigure(figure, labelEl) {
    // clone figure
    const clone = figure.cloneNode(true);

    // convert interactive graphics (canvas/svg) in the clone using originals pixels
    try {
      convertGraphicsToImages(figure, clone);
    } catch (err) {
      console.warn('print-figure: conversion step failed', err);
    }

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

    // remove eventuali print/reset buttons nella clone
    clone.querySelectorAll(".print-figure-btn").forEach(b => b.remove());
    clone.querySelectorAll(".reset-graph-btn").forEach(b => b.remove());

    // prepara label stampabile (se labelEl fornita)
    let printableHTML;
    if (labelEl) {
      const labelTxt = (labelEl.textContent || "").trim().match(/^(FIGURA|FIGURE)\s+\d+(?:\.\d+)*/);
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

const footerText = getPrintFooterText();

doc.write(`
  <html>
    <head>
      <meta charset="utf-8"/>
      ${styles}
      <style>
        @page { margin: 12mm; }

        /* lascia spazio al footer (altrimenti può sovrapporsi alla figura) */
        body { background: white; margin: 0; padding: 12mm; padding-bottom: 22mm; }

        .kg-container, figure { max-width: 100% !important; box-sizing: border-box; }
        .print-figure-label { font-weight: 700; font-size: 18px; margin-bottom: 10px; }
        /* ensure images (converted canvases/svg) fit inside the page */
        img { max-width: 100%; height: auto; display: block; }

        /* --- NEW: footer su ogni pagina stampata --- */
        .print-figure-footer {
          position: fixed;
          left: 12mm;
          right: 12mm;
          bottom: 8mm;
          text-align: center;
          font-size: 1rem;
          line-height: 1.2;
          color: #111;
          z-index: 9999;
        }

        @media print {
          /* prova a rendere il testo più “pieno” in stampa */
          .print-figure-footer {
            color: #111 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
        /* --- END NEW --- */
      </style>
    </head>
    <body>
      ${printableHTML}
      <div class="print-figure-footer">${footerText}</div>
    </body>
  </html>
`);

    doc.close();

    // give the iframe a short moment to layout and load data URLs
    setTimeout(() => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch (err) {
        console.warn('print-figure: print failed', err);
      }
      setTimeout(()=> iframe.remove(), 1000);
    }, 250);
  }

  // --- NEW: reset graph ---


function resetGraphForFigure(fig) {
  // 1) trova la view associata a questo container
  let v = null;
  try {
    const allViews = window.views || window["views"];
    if (Array.isArray(allViews)) {
      v = allViews.find(vv =>
        vv && vv.div && typeof vv.div.node === "function" && vv.div.node() === fig
      );
      // rimuovi la vecchia view dall'array globale
      if (v) {
        const idx = allViews.indexOf(v);
        if (idx >= 0) allViews.splice(idx, 1);
      }
    }
  } catch (e) {}

  // 2) svuota il container e rimuovi il flag "loaded"
  fig.innerHTML = "";
  fig.classList.remove("kg-loaded");

  // 3) ricrea la view RIUSANDO la stessa logica di loadGraphs(), ma solo per questo div
  const src = fig.getAttribute("src");
  const tmp = fig.getAttribute("template");

  function generateViewFromYamlText(t) {
    const y = jsyaml.safeLoad(t);
    const j = JSON.parse(
      JSON.stringify(y).replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&")
    );

    let custom = "";
    if (tmp) {
      d3.text(tmp).then(template_file => {
        const yt = jsyaml.safeLoad(template_file);
        let yts = JSON.stringify(yt)
          .replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");

        for (const key in j) {
          if (key === "custom") custom = j[key];
          const searchTerm = new RegExp("template.\\b" + key + "\\b", "g");
          yts = yts.replace(searchTerm, j[key]);
        }

        const jt = JSON.parse(yts);
        jt.custom = custom;

        // push nuova view SOLO per questo grafico
        (window.views || window["views"]).push(new KG.View(fig, jt));
        fig.classList.add("kg-loaded");
      });
    } else {
      (window.views || window["views"]).push(new KG.View(fig, j));
      fig.classList.add("kg-loaded");
    }
  }

  // Caso A: YAML inline o YAML da file
  if (!src || src.indexOf(".yml") > -1) {
    if (src) {
      d3.text(src).then(yaml_file => generateViewFromYamlText(yaml_file));
    } else {
      const inlineDef = fig.dataset.kgInlineYaml || "";
      generateViewFromYamlText(inlineDef);
    }
    return;
  }

  // Caso B: definizione già in KG.viewData
  if (KG["viewData"] && Object.prototype.hasOwnProperty.call(KG["viewData"], src)) {
    (window.views || window["views"]).push(new KG.View(fig, KG["viewData"][src]));
    fig.classList.add("kg-loaded");
    return;
  }

  // Caso C: JSON da URL
  d3.json(src + "?update=true").then(data => {
    if (!data) {
      fig.innerHTML = `<p>oops, ${src} doesn't seem to exist.</p>`;
      return;
    }
    (window.views || window["views"]).push(new KG.View(fig, data));
    fig.classList.add("kg-loaded");
  });
}




  // --- END NEW ---

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

      // --- SAVE INLINE YAML FOR HARD RESET (only once) ---
      if (!fig.getAttribute("src") && !fig.dataset.kgInlineYaml) {
        const html = (fig.innerHTML || "").trim();

        // Se non è già stato renderizzato (cioè non contiene SVG)
        if (html && html.indexOf("<svg") === -1) {
          fig.dataset.kgInlineYaml = html;
        }
      }
      // --- END SAVE ---

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

      // --- NEW: reset button right of print icon ---
      if (el.querySelector && el.querySelector(".reset-graph-btn")) return;
      const rbtn = makeResetButton();
      rbtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        resetGraphForFigure(fig);
      });
      el.appendChild(rbtn);
      // --- END NEW ---
    });
  }

  // esecuzione iniziale
  setTimeout(attachButtons, 120); // piccolo delay per permettere rendering dinamico
});