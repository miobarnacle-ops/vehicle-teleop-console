#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"
command -v docker >/dev/null || { echo '请先安装 Docker Engine，并确保当前用户有权限访问 Docker。'; exit 1; }
docker info >/dev/null || { echo 'Docker 不可用，请检查运行状态及用户权限。'; exit 1; }
docker build -t vehicle-control-recovery:local .
echo '镜像已构建。请先阅读 树莓派端恢复说明.md，勿与旧底盘驱动并行运行。'
