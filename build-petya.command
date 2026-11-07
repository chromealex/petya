#!/bin/bash
# Rebuilds Petya.app (macOS) with the current sources. Double-click in Finder to run.
cd "$(dirname "$0")" && python3 scripts/build.py --mac
echo; echo "Готово. Окно можно закрыть."; read -r -p "Нажмите Enter…" _
