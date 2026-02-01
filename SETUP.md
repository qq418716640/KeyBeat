# KeyBeat 安装与使用指南

## 一、Firebase 配置（一次性）

### 1. 创建 Firebase 项目

1. 打开 https://console.firebase.google.com/ ，用 Google 账号登录
2. 点击 **添加项目**
3. 项目名称填 `keybeat`，点继续
4. 关闭 Google Analytics（不需要），点 **创建项目**
5. 等待创建完成，点 **继续**

### 2. 开启匿名登录

1. 左侧栏点 **构建 → Authentication**
2. 点 **开始使用**
3. 切到 **Sign-in method** 标签页
4. 找到 **匿名**，点击进入，打开 **启用** 开关，点 **保存**

### 3. 创建实时数据库

1. 左侧栏点 **构建 → Realtime Database**
2. 点 **创建数据库**
3. 选择数据库位置（推荐选离你近的，如 `asia-southeast1`）
4. 选择 **以锁定模式启动**，点 **启用**

### 4. 设置数据库安全规则

1. 在 Realtime Database 页面，切到 **规则** 标签页
2. 把内容替换为：

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

3. 点 **发布**

### 5. 获取配置并填入代码

1. 点左上角 **齿轮图标 → 项目设置**
2. 往下滚到 **您的应用**，点 Web 图标（`</>`）
3. 应用昵称填 `keybeat-web`，**不勾选** Firebase Hosting，点 **注册应用**
4. 页面会显示一段配置代码，从中找到以下三个值：
   - `apiKey`（形如 `AIzaSy...`）
   - `projectId`（形如 `keybeat-xxxxx`）
   - `databaseURL`（形如 `https://keybeat-xxxxx-default-rtdb.firebaseio.com`）
5. 打开项目中的 `lib/firebase-config.js`，修改开头的三行：

```js
const FIREBASE_CONFIG = {
  apiKey: "粘贴你的 apiKey",
  projectId: "粘贴你的 projectId",
  databaseURL: "粘贴你的 databaseURL",
};
```

6. 保存文件

---

## 二、安装 Chrome 扩展

1. 打开 Chrome 浏览器，地址栏输入 `chrome://extensions/` 回车
2. 右上角打开 **开发者模式**
3. 点击 **加载已解压的扩展程序**
4. 选择 `msgn` 文件夹（即包含 `manifest.json` 的那个目录）
5. 扩展列表中出现 **KeyBeat** 即安装成功

> 建议点击工具栏的拼图图标，把 KeyBeat 固定到工具栏，方便随时查看。

---

## 三、基本使用

### 查看自己的活跃度

1. 打开任意网页，正常打字
2. 点击工具栏的 KeyBeat 图标，弹窗左侧 **Me** 下方的圆圈会显示你的实时分数（0-100）
3. 圆圈颜色含义：
   - 灰色（0-19）：空闲
   - 绿色（20-39）：轻度
   - 黄色（40-59）：中等
   - 橙色（60-79）：活跃
   - 红色（80-100）：高强度
4. 工具栏图标的角标也会显示当前分数和对应颜色

### 与对方配对

需要两台电脑各装一份扩展，然后：

**用户 A（发起方）：**

1. 点击 KeyBeat 图标打开弹窗
2. 点 **Generate Pair Key**
3. 会生成一个密钥（形如 `KB-A1B2-C3D4-E5F6`）
4. 点击密钥可复制，把它发给对方（微信、口头等任何方式）

**用户 B（加入方）：**

1. 点击 KeyBeat 图标打开弹窗
2. 在输入框中粘贴收到的密钥
3. 点 **Join**
4. 配对立即生效，无需对方确认

**配对成功后：**

- 弹窗右侧 **Partner** 圆圈会实时显示对方的活跃分数
- 工具栏角标显示的是对方的分数（关心的是对方在不在忙）
- 双方数据每 10 秒同步一次

### 取消配对

1. 打开弹窗，点击 **Unpair**
2. 双方的绑定关系会同时解除

---

## 四、常见问题

### 弹窗里显示 "--" 不动

- 刚安装后需要打几下键盘，等 10 秒左右第一次同步后才会显示分数
- 检查 `lib/firebase-config.js` 里的配置是否正确填写
- 打开 `chrome://extensions/`，点 KeyBeat 下方的 **Service Worker** 链接查看控制台有无报错

### 配对失败提示 "Invalid pair key"

- 确认密钥输入完整且正确（大写字母 + 数字，格式 `KB-XXXX-XXXX-XXXX`）
- 密钥只能使用一次，如果已被用过需要重新生成

### 配对失败提示 "Cannot pair with yourself"

- 不能用自己生成的密钥和自己配对，需要另一台电脑/另一个 Chrome 配置文件

### 扩展更新后怎么刷新

- 修改代码后，回到 `chrome://extensions/`，点 KeyBeat 卡片上的 **刷新** 图标即可

---

## 五、项目文件结构

```
msgn/
├── manifest.json            # 扩展配置
├── background.js            # 后台 Service Worker（核心逻辑）
├── content.js               # 内容脚本（监听键盘）
├── lib/
│   └── firebase-config.js   # Firebase 配置与 API 封装
├── popup/
│   ├── popup.html           # 弹窗界面
│   ├── popup.js             # 弹窗逻辑
│   └── popup.css            # 弹窗样式
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```
