FROM ros:humble-ros-base
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3-colcon-common-extensions ros-humble-rosbridge-server \
    ros-humble-tf2-ros ros-humble-launch-ros && \
    rm -rf /var/lib/apt/lists/*
COPY driver/spore_patrol_base_driver /opt/vehicle_ws/src/spore_patrol_base_driver
SHELL ["/bin/bash", "-c"]
RUN source /opt/ros/humble/setup.bash && cd /opt/vehicle_ws && colcon build --packages-select spore_patrol_base_driver
