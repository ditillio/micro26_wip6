#!/bin/bash

echo "🔄 Aggiornamento figure..."
python3 scripts/number_figures_from_toc.py --update-refs || {
  echo "❌ Errore durante l'aggiornamento. Interrotto."
  exit 1
}

echo "🚀 Avvio Jekyll..."
bundle exec jekyll serve