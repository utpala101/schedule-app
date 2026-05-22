# 日程工作台

纯前端日程安排与工作记录 SPA。本地运行，基于 Git 跨设备同步。

## 功能

- **日历** — 月/周/日视图，拖拽调整时间，折叠非工作时区
- **四象限待办** — 艾森豪威尔矩阵，拖拽调整优先级
- **工作记录** — 结构化表单 + 自由备注，搜索筛选
- **统计** — 5 种图表：完成趋势、项目分布、象限分析、热力图
- **本地存储** — IndexedDB / 文件 API / 服务端三种模式
- **跨设备同步** — 基于 Git 仓库的推送/拉取同步

## 使用方式

### 本地模式（无需安装）

双击 `index.html`，数据保存在浏览器 IndexedDB 中。

### 服务端模式（跨设备同步）

1. 确保已安装 [Node.js](https://nodejs.org)
2. 双击 `start-server.bat` 或运行 `node server.js`
3. 浏览器打开 `http://localhost:8765`
4. 侧边栏底部的"同步"区域进行推送/拉取

### 多台电脑同步

```
git clone <仓库地址>
cd schedule-app
node server.js
```

浏览器打开 `http://localhost:8765`，点击"拉取"获取另一台电脑的数据。修改完成后点击"推送"提交到 GitHub。

## 技术栈

- 纯 HTML/CSS/JavaScript（无构建工具）
- Tailwind CSS（CDN）
- Chart.js
- File System Access API
- IndexedDB
- Node.js 本地服务器（零依赖）

## 许可证

MIT
