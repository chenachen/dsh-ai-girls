# AI 娘值班室 · dsh-ai-girls

独立开发的 DSH（DeepSeek Harness）桌面宠物插件。让 AI 娘在桌面上陪伴工作，并在身旁显示当前 DSH 实例内全部运行任务的真实执行信息。

**当前阶段：第一阶段开发——全局任务监听与独立桌面气泡。**

## 产品约定

- 自己维护插件、角色渲染、状态机和气泡交互，不依赖现成桌宠插件。
- Windows 桌面悬浮是首版核心：DSH 最小化、隐藏或被其他普通窗口覆盖时，宠物与任务气泡仍显示、更新。
- 覆盖当前 DSH 实例内所有运行会话，不局限于当前打开的会话；子任务归属父任务。
- **运行中只展示执行信息。** 成功、本轮结束、最终失败、手动停止或闲置时，再按状态展示角色文案；等待审批/输入优先展示具体待办。
- 5 位角色各有常态与 Q 版，共 10 种形态；支持持续动画、角色切换和轮换。

## 文档导航

| 文档 | 内容 |
| --- | --- |
| [产品方案](docs/product-plan.md) | 首版范围、任务气泡、角色与状态行为 |
| [开发准备](docs/development-plan.md) | 架构方向、已有接口证据、实施顺序与待验证点 |
| [验收清单](docs/acceptance.md) | 最小化、多任务、状态、动画、桌面交互与退出清理 |
| [素材接入说明](docs/assets.md) | 既有角色素材、文案迁移和版本选择 |
| [协作约定](AGENTS.md) | 工作范围、Git 分支与验证要求 |
| [桌面联调步骤](docs/manual-verification.md) | 安装、启动、最小化/遮挡验证与移除入口 |
| [接口与通信](docs/architecture.md) | 已实现的模块职责、事件语义和本机通信 |

## 开发状态

宿主级任务监听、执行状态聚合、独立 WPF 桌面窗口、标准输入输出通信和本地安装脚本已实现。运行中只展示执行事实。当前窗口使用 AI 图标占位，角色素材与点击跳转尚未接入。

已完成状态/通信/安装自动化测试及基于本机 DSH 官方模块的无界面接入测试。最小化、遮挡、透明区域点击和实际 DSH Desktop 加载仍待桌面联调。详细结果见 [开发交接](docs/handoff-2026-10-23.md)。

## 开始开发

Windows，Node.js 22+，系统自带的 .NET Framework 4.x 编译器；无需安装 Electron 或第三方桌宠插件。

```powershell
npm ci
npm test
npm run test:host
npm run build
npm run doctor
```

`test:host` 使用本机已安装的 DSH 官方模块；非默认安装位置设置 `DSH_NODE_MODULES`。准备查看窗口时运行 `npm run demo`；接入 DSH 运行 `npm run install:local`，具体步骤见[桌面联调说明](docs/manual-verification.md)。

仓库初始化日期：2026-10-23。
