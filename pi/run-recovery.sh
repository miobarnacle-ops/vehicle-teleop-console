#!/usr/bin/env bash
set -euo pipefail
port="${1:-/dev/ttyACM0}"
[[ "$port" =~ ^/dev/tty(ACM|USB)[0-9]+$ ]] || { echo '串口必须形如 /dev/ttyACM0 或 /dev/ttyUSB0'; exit 1; }
[[ -c "$port" ]] || { echo "没有发现串口 $port；请确认设备已连接。"; exit 1; }
docker image inspect vehicle-control-recovery:local >/dev/null 2>&1 || { echo '请先运行 ./build-recovery.sh'; exit 1; }
if systemctl is-active --quiet spore-vehicle-stack || systemctl is-active --quiet spore-rosbridge; then echo '原车辆服务仍在运行：请先排除重复驱动和 9091 端口冲突，再手动操作。'; exit 1; fi
if ss -ltn '( sport = :9091 )' | grep -q LISTEN; then echo '9091 已被占用，请先查明并处理。'; exit 1; fi
if [[ -n "$(docker ps -q --filter name='^/vehicle-control-recovery$')" ]]; then echo '恢复容器已经在运行。'; exit 1; fi
exec docker run --rm --name vehicle-control-recovery --network host --device "$port:$port" \
 -e ROS_DOMAIN_ID=77 vehicle-control-recovery:local \
 bash -c 'source /opt/ros/humble/setup.bash; source /opt/vehicle_ws/install/setup.bash; ros2 launch rosbridge_server rosbridge_websocket_launch.xml address:=0.0.0.0 port:=9091 & bridge=$!; trap "kill $bridge 2>/dev/null || true" EXIT; ros2 launch spore_patrol_base_driver base_driver.launch.py port:="$1"' _ "$port"
