# MBTI 多人格智能体前端

[English README](./README.md)

这是一个本地优先的前端实验项目：把 MBTI 16 种人格做成 16 个思考智能体。你提出一个问题，也可以加入自己的背景设定，应用会让每一种人格用不同的语气、判断方式、结论和点子来回答。

![MBTI 多人格智能体前端](./screenshots/04-home.png)

## 核心功能

- 同一个问题由 16 种 MBTI 人格分别回答。
- 每个人格都有独立的说话语气、决策偏好、常见盲点、反对点、结论、点子和标签。
- 支持多轮对话：每轮可以总结，继续追问时会保留上一轮上下文。
- 支持 Reddit 数据调研模式：先抓真实帖子，再让 16 种人格基于真实素材分析。
- 支持模型优先的检索策略：配置模型后，会先让模型把中文或英文问题转换成英文检索词、目标社区、关键词、人群和领域。
- 模型不可用时，会退回内置中英文词库和规则扩展，不会阻断调研流程。
- 支持自定义设定：可以保存自己的背景、领域和输出偏好。
- 历史、收藏、设定和 API 配置保存在当前浏览器的 localStorage。

## 技术栈

- 浏览器端 Babel 加载的 React。
- Node.js 本地服务，用于静态文件、模型代理和 Reddit RSS 调研。
- 无数据库，无构建步骤。

## 快速开始

```bash
npm start
```

然后打开：

```text
http://127.0.0.1:4174/
```

语法检查：

```bash
npm run check
```

需要 Node.js 18 或更高版本。

## 模型 API 配置

进入页面后点击设置按钮，在「模型 API」里配置供应商：

- OpenAI 或 OpenAI 兼容接口
- DeepSeek
- Anthropic Claude
- Google Gemini
- OpenRouter
- 自定义 OpenAI 兼容接口

项目内置 DeepSeek 模板，模型 ID 可以在设置面板里自行修改，以你账号当前可用的模型为准。

应用不会把 API Key 写入项目文件。API Key 会保存在浏览器 localStorage 中，并且只在发起模型请求时发送给本地 Node 服务。如果要公开部署给多人使用，需要额外实现服务端密钥管理和访问控制。

## Reddit 调研模式

调研模式分三种：

- 精准模式：只查 `SideProject`、`startups`、`Entrepreneur`、`SaaS`、`indiehackers`，适合独立开发者和 SaaS 主题。
- 全局发现：先做全 Reddit 搜索，自动发现相关社区，再进入高相关社区继续抓取。
- 自定义模式：手动输入 subreddit，例如 `smallbusiness`、`freelance`、`teachers`、`ADHD`、`realestate`。

配置模型后，系统会先调用模型生成结构化检索策略；如果模型没有配置或调用失败，则使用内置中英文映射词库和规则兜底。

## 项目结构

```text
.
├── App.jsx          # 应用主壳、提问流程、轮次切换、调研 UI
├── PersonaCard.jsx  # 人格结果卡片
├── data.js          # 16 人格数据和设定元数据
├── llm.js           # 模型调用、提示词构造、离线示例
├── server.js        # 本地服务、模型代理、Reddit 调研接口
├── store.jsx        # localStorage、Toast、应用状态
├── views.jsx        # 设置、历史、收藏、设定弹窗
├── styles.css       # 主页面样式
├── cards.css        # 人格卡片样式
└── screenshots/     # 预览截图
```

## 说明

这个项目用于多视角创意和决策讨论。MBTI 在这里被当作产品交互角色使用，不代表科学人格测评结论。

