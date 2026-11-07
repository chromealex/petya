#!/bin/bash
# Rebuilds Petya with the current sources and runs its live self-check (read-only questions
# with your model and connections). Double-click in Finder.
cd "$(dirname "$0")" || exit 1
echo "Закрываю Петю…"; osascript -e 'tell application "Petya" to quit' >/dev/null 2>&1; pkill -f "Petya.app/Contents/MacOS/Electron" >/dev/null 2>&1; sleep 2
echo "Собираю Петю…"; python3 scripts/build.py --mac || { echo "Сборка не удалась."; read -r -p "Нажмите Enter…" _; exit 1; }
mkdir -p tests/results; OUT="$PWD/tests/results/live-check-$(date +%Y%m%d-%H%M%S).json"
echo "Петя проверяет сам себя (несколько минут)…"; PETYA_LIVE_CHECK="$OUT" ./Petya.app/Contents/MacOS/Electron >/dev/null 2>&1
echo "Отчёт: $OUT"; open ./Petya.app
echo "Готово. Окно можно закрыть."; read -r -p "Нажмите Enter…" _
