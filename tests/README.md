# 模拟检查

先在 `console/` 执行 `./setup.sh`，再在包根目录运行：

```bash
console/.venv/bin/python tests/test_bridge.py
node tests/test_steering.js   # 若已安装 Node.js
```

第一项在临时本地端口创建模拟 rosbridge，不连接真实车辆；第二项检查转向计算。浏览器中仍需人工检查界面和记录选择流程。测试不能证明真实串口、固件、无线网络丢包、轮胎转动、物理急停或回放轨迹精度。
