# 📦 部署指南

## 本地开发

### 环境要求
- Node.js 18+ 
- npm 或 pnpm

### 快速启动

```bash
# 克隆项目
git clone https://github.com/xxx/werewolf-helper.git
cd werewolf-helper

# 安装依赖
npm install

# 启动开发服务器（自动热重载）
npm run dev

# 访问 http://localhost:3000
```

### 生成提示音（可选）

```bash
# 需要安装 ffmpeg
chmod +x scripts/generate-notification.sh
./scripts/generate-notification.sh
```

## 生产部署

### 方案一：Node.js 服务器直接运行

```bash
# 构建项目
npm run build

# 启动生产服务器
npm start

# 后台运行（使用 pm2）
pm2 start npm --name "werewolf" -- start
```

### 方案二：Docker 部署

创建 `Dockerfile`：

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
```

构建和运行：

```bash
docker build -t werewolf-helper .
docker run -p 3000:3000 -d werewolf-helper
```

### 方案三：Vercel 部署

1. 安装 Vercel CLI：
```bash
npm i -g vercel
```

2. 部署：
```bash
vercel
```

3. 生产环境：
```bash
vercel --prod
```

### 方案四：Railway 部署

1. 访问 [Railway](https://railway.app)
2. 连接 GitHub 仓库
3. 自动部署

## 配置说明

### 端口配置

默认端口：3000

通过环境变量修改：
```bash
PORT=8080 npm start
```

### 跨域配置

开发环境允许所有来源。

生产环境建议在 `next.config.mjs` 中配置：

```javascript
const nextConfig = {
  // ...其他配置
  allowedDevOrigins: ['yourdomain.com'],
};
```

### HTTPS 配置

使用反向代理（如 Nginx）：

```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 性能优化

### 内存管理

房间数据存储在内存中，24 小时无活动自动清理。

对于高并发场景，建议：
- 使用 Redis 存储房间数据
- 增加服务器内存

### 连接数优化

Socket.IO 默认配置：
- pingTimeout: 60000ms
- pingInterval: 25000ms

可根据网络环境调整。

## 监控和日志

### 查看日志

```bash
# 直接运行
tail -f debug.log

# PM2
pm2 logs werewolf
```

### 健康检查

访问 `http://yourdomain.com` 检查服务状态。

## 常见问题

### 端口被占用

```bash
# 查看占用端口的进程
netstat -ano | findstr :3000

# 结束进程
taskkill /F /PID <PID>
```

### 无法跨设备访问

1. 确保防火墙允许 3000 端口
2. 使用 `0.0.0.0` 监听所有网卡
3. 检查 WiFi 网络是否互通

### 断线重连失败

1. 检查 LocalStorage 是否被清除
2. 确保房间未过期（24 小时）
3. 刷新页面重新加入

## 备份和恢复

### 备份房间数据

修改 `server/room-store.ts` 添加持久化：

```typescript
// 定期保存到文件
setInterval(() => {
  const data = JSON.stringify(Array.from(rooms.entries()));
  fs.writeFileSync('rooms-backup.json', data);
}, 60000);
```

### 恢复数据

启动时读取备份文件：

```typescript
if (fs.existsSync('rooms-backup.json')) {
  const data = fs.readFileSync('rooms-backup.json', 'utf-8');
  // 恢复数据
}
```

## 安全建议

1. **生产环境禁用详细日志**
2. **启用 HTTPS**
3. **限制最大连接数**
4. **定期清理过期房间**

---

如有问题，请查看 [GitHub Issues](https://github.com/xxx/werewolf-helper/issues)
