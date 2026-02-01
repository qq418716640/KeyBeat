# KeyBeat

[English](README_EN.md) | 中文

> 通过键盘敲击节奏，感知对方的工作状态。

KeyBeat 是一个 Chrome 扩展，让情侣/伴侣能实时感知彼此的工作状态。它只统计键盘敲击频率（不记录内容），通过颜色直觉化地展示活跃度——让你知道对方正在专注工作，还是有空聊天。

## 工作原理

```
键盘事件 → 活跃度评分（0-100）→ 彩色角标 → 实时同步给对方
```

1. **Content Script** 在所有标签页中统计按键次数（不记录按键内容）
2. **Service Worker** 基于滚动时间窗口（5/15/30 分钟）计算加权活跃度
3. **Firebase** 通过 SSE 实时同步双方分数
4. **角标和弹窗** 同时展示自己和对方的状态

### 活跃度等级

| 分数 | 状态 | 颜色 | 含义 |
|------|------|------|------|
| 80-100 | 深度专注 | 红色 | 高强度打字中 |
| 60-79 | 忙碌 | 橙色 | 活跃使用键盘 |
| 40-59 | 中等 | 黄色 | 一般活跃 |
| 20-39 | 轻度 | 绿色 | 偶尔打字 |
| 0-19 | 空闲 | 灰色 | 离开或未使用 |

## 特性

- **隐私优先** —— 只统计按键次数，不记录任何按键内容和浏览记录
- **一键配对** —— 生成密钥、分享、配对完成
- **实时同步** —— 对方状态变化即时可见
- **最小权限** —— 仅需 `alarms` 和 `storage`，不读取浏览历史
- **零依赖** —— 纯 JavaScript，无需构建步骤
- **Manifest V3** —— 基于最新的 Chrome 扩展架构

## 界面预览

```
┌─────────────────────────────┐
│          KeyBeat            │
│                             │
│    Me          Partner      │
│   ┌───┐        ┌───┐       │
│   │ 72│        │ 35│       │
│   └───┘        └───┘       │
│   忙碌          轻度        │
│                             │
│  [Generate Pair Key]        │
│        ── or ──             │
│  [Enter pair key] [Join]    │
└─────────────────────────────┘
```

## 快速开始

### 1. 配置 Firebase

需要一个 Firebase 项目用于数据同步。

1. 打开 [Firebase 控制台](https://console.firebase.google.com/)，创建新项目
2. 开启**匿名登录**（构建 → Authentication → Sign-in method → 匿名 → 启用）
3. 创建**实时数据库**（构建 → Realtime Database → 创建数据库）
4. 设置安全规则：

```json
{
  "rules": {
    "users": {
      "$uid": {
        ".read": "auth != null && ($uid === auth.uid || root.child('users').child(auth.uid).child('partnerId').val() === $uid)",
        ".write": "auth != null && $uid === auth.uid"
      }
    },
    "pairKeys": {
      "$key": {
        ".read": "auth != null",
        ".write": "auth != null"
      }
    },
    "pairing": {
      "$uid": {
        ".read": "auth != null && $uid === auth.uid",
        ".write": "auth != null"
      }
    }
  }
}
```

5. 注册 Web 应用（项目设置 → 您的应用 → Web 图标），复制配置值
6. 将 `lib/firebase-config.example.js` 复制为 `lib/firebase-config.js`，填入你的配置：

```js
const FIREBASE_CONFIG = {
  apiKey: "你的_API_KEY",
  projectId: "你的_PROJECT_ID",
  databaseURL: "https://你的项目ID-default-rtdb.区域.firebasedatabase.app",
};
```

### 2. 安装扩展

1. Chrome 地址栏输入 `chrome://extensions/` 回车
2. 右上角打开**开发者模式**
3. 点击**加载已解压的扩展程序**，选择本项目文件夹
4. 建议将 KeyBeat 固定到工具栏方便查看

### 3. 与对方配对

双方各自安装好扩展并配置好 Firebase 后：

**发起方：**
1. 点击 KeyBeat 图标 → **Generate Pair Key**
2. 复制生成的密钥（格式：`KB-XXXX-XXXX-XXXX`），发给对方

**加入方：**
1. 点击 KeyBeat 图标 → 粘贴密钥 → **Join**
2. 配对立即生效，无需确认

## 项目结构

```
keybeat/
├── manifest.json              # 扩展配置（Manifest V3）
├── background.js              # Service Worker —— 评分、同步、配对逻辑
├── content.js                 # Content Script —— 按键计数
├── lib/
│   ├── firebase-config.js     # Firebase 配置与凭据（不提交到 Git）
│   └── firebase-config.example.js  # 配置模板
├── popup/
│   ├── popup.html             # 弹窗界面
│   ├── popup.js               # 弹窗交互逻辑
│   └── popup.css              # 弹窗样式（暗色主题）
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## 技术细节

### 评分算法

基于滚动时间窗口在本地计算活跃度：

```
score = (5分钟按键数 × 0.6) + (15分钟按键数 × 0.3) + (30分钟按键数 × 0.1)
```

原始值归一化到 0-100。计算完全在本地完成，Firebase 只接收最终分数。

### 原子化配对

配对操作使用 Firebase ETag 条件写入，防止竞态条件。当两人同时尝试使用同一个密钥时，只有一人能成功，另一人会收到明确错误提示。

### 架构选型

- **REST API + fetch** 替代 Firebase SDK —— 保持扩展轻量，兼容 Manifest V3
- **fetch ReadableStream 解析 SSE** —— Service Worker 中无法使用 `EventSource`，手动解析 SSE 流
- **Chrome Alarms** —— 同步任务在 Service Worker 被挂起后仍能存活
- **匿名认证** —— 无需注册，身份与浏览器配置文件绑定

## 隐私

KeyBeat 以隐私为核心设计原则：

- **不记录按键内容** —— 只统计次数，永远不知道你打了什么
- **不读取浏览记录** —— 不访问 URL 和页面标题
- **本地计算** —— 原始按键数据不离开你的设备
- **匿名认证** —— 无需邮箱、密码或任何个人信息
- **最小权限** —— 仅需 `alarms`（定时同步）和 `storage`（本地状态）
- **开源** —— 所有代码可审查

## 参与贡献

欢迎贡献代码！以下是一些可以改进的方向：

- [ ] 可自定义活跃度等级阈值
- [ ] 支持多人/群组模式
- [ ] 移植到 Firefox / Edge
- [ ] 国际化（i18n）
- [ ] Chrome Web Store 上架素材

请先开 Issue 讨论你想做的改动。

## 许可证

[MIT](LICENSE)
