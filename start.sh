#!/bin/bash
set -e
cd "$(dirname "$0")"

if ! command -v python3 &>/dev/null; then echo "Нужен Python 3"; exit 1; fi

if [ ! -d ".venv" ]; then
  echo "→ Создаю виртуальное окружение..."
  python3 -m venv .venv
fi

source .venv/bin/activate
echo "→ Устанавливаю зависимости..."
pip install -q -r requirements.txt

echo ""
echo "✅ Приложение запускается на http://localhost:8000"
echo "   Открой эту ссылку в браузере (или на телефоне в той же Wi-Fi сети)"
echo "   Для остановки нажми Ctrl+C"
echo ""

python3 main.py
