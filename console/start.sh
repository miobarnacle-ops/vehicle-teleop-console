#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"
if [[ ! -x .venv/bin/python ]]; then echo '请先运行 ./setup.sh'; exit 1; fi
exec .venv/bin/python server.py
