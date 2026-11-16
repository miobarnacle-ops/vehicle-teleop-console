#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"
command -v python3 >/dev/null || { echo '缺少 Python 3，请让 Agent 安装 python3、python3-venv、python3-pip。'; exit 1; }
python3 -c 'import sys; assert sys.version_info >= (3, 9), "需要 Python 3.9 或更高版本"'
if [[ ! -x .venv/bin/python ]]; then
  python3 -m venv .venv || { echo '无法创建虚拟环境，请让 Agent 检查并安装 Ubuntu 的 python3-venv。'; exit 1; }
fi
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -c 'import aiohttp; print("依赖安装成功，aiohttp", aiohttp.__version__)'
echo '现在运行 ./start.sh'
