#!/bin/bash
# 生成简单的提示音（需要安装 ffmpeg）
# 使用方法：./generate-notification.sh

# 生成 800Hz 正弦波，持续 0.1 秒
ffmpeg -f lavfi -i "sine=frequency=800:duration=0.1" -ar 44100 -y public/notification.mp3

echo "提示音已生成：public/notification.mp3"
