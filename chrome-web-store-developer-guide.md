# Chrome Web Store 开发者账号注册与认证要求（2025-2026）

## 一、基本注册

| 项目 | 要求 |
|------|------|
| 账号 | Google 账号（Gmail） |
| 费用 | **一次性 $5 USD**（Visa/Mastercard） |
| 入口 | [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) |
| 协议 | 同意 Chrome Web Store 开发者协议和政策 |

## 二、账户设置要求

1. **开发者邮箱** — 建议使用专门的邮箱用于发布，确保经常查看（接收审核通知和政策更新）
2. **验证邮箱** — 注册时需验证联系邮箱，该邮箱会公开显示在扩展的联系信息中
3. **两步验证（强制）** — 所有开发者账户在发布或更新扩展前，**必须启用 Google 两步验证（2-Step Verification）**
4. **实体地址** — 仅在扩展涉及购买、附加功能或订阅时需要提供

## 三、Trader（交易者）认证 — 欧盟合规新要求

这是近期**最重要的变化**，为遵守欧盟在线市场法规：

- 如果你是 **Trader（交易者）** 账户（即通过扩展进行商业活动），需要提供并公开显示：
  - **电话号码**（需验证）
  - **组织 D-U-N-S 编号**（如适用）
  - **实体地址**
  - **联系邮箱**
- 目前适用于**新开发者**和从"非交易者"变更为"交易者"的现有开发者
- 预计后续会扩展到**所有交易者账户**
- 标记为"非交易者"的开发者暂不受影响

## 四、验证上传（Verified Uploads）— 2025 年新功能

自 **2025 年 5 月 7 日**起可选启用：

- 要求上传到 Chrome Web Store 的内容必须使用**受信任的私钥签名**
- 即使账户被入侵，未持有私钥的人也无法上传新版本
- **可选功能**，但强烈建议启用以提升安全性

## 五、技术要求

- **Manifest V3**（强制） — 所有新扩展必须使用 Manifest V3，V2 已不可用
- **单一用途原则** — 每个扩展只能有一个明确的用途
- **最小权限原则** — 只申请实际需要的权限，过度申请会被拒
- **隐私政策** — 收集任何数据（包括错误日志）都必须提供隐私政策 URL

## 六、扩展上架要求

### 商品信息

- 扩展名称（不得与已有扩展混淆）
- 详细描述（必须清晰说明功能，不接受模糊描述）
- 至少 1 张截图（1280x800 或 640x400）
- 图标：128x128 PNG
- 选择合适的分类

### 隐私要求

- 提供 **隐私政策**（Privacy Policy）URL
- 如果收集用户数据，必须明确披露
- 数据使用必须透明且符合用户预期
- 填写 **隐私惯例声明**（Privacy Practices tab）

### 内容政策

- 遵守 [Chrome Web Store 开发者计划政策](https://developer.chrome.com/docs/webstore/program-policies)
- 不得包含恶意软件、间谍软件
- 不得有欺骗性行为或误导用户
- 不得侵犯知识产权
- 不得包含色情、暴力、仇恨内容
- 不允许代码混淆（但允许压缩/minify）

## 七、审核流程与时间线

1. 上传 zip 包到 Developer Dashboard
2. 填写商品信息、截图、隐私政策等
3. 提交审核
4. 简单扩展：通常 **24 小时内**通过
5. 复杂扩展或涉及敏感权限：**1-3 个工作日**或更长
6. 新账号有发布数量限制，随信誉积累逐步放宽

## 八、常见被拒原因

- 权限过度申请（如不需要却申请了 `tabs`、`<all_urls>` 等）
- 缺少或不完整的隐私政策
- 功能描述与实际不符
- 违反单一用途原则
- 代码混淆

## 九、收费扩展额外要求

- 设置 **Google Payments 商家账号**
- 提供**银行账户信息**用于收款
- 提供**税务信息**（如美国 W-8BEN 表格）
- 遵守当地法律法规

## 十、中国大陆开发者注意事项

- 需能访问 Google 服务
- 支付需支持外币的信用卡（Visa/Mastercard）
- 两步验证可使用 Google Authenticator 等验证器 App
- 收款可能需要有外币收款能力的银行账户
- 身份验证时证件需为英文或提供翻译件

---

## 参考链接

- [Register your developer account](https://developer.chrome.com/docs/webstore/register)
- [Set up your developer account](https://developer.chrome.com/docs/webstore/set-up-account)
- [Chrome Web Store Developer Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies)
- [Updates to trader requirements](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/ZI9R_KAA3BQ)
- [Verified uploads in the Chrome Web Store](https://developer.chrome.com/blog/verified-uploads-cws)
- [What's happening in Chrome Extensions, January 2025](https://developer.chrome.com/blog/extension-news-january-2025)

> 最后更新：2026 年 1 月
