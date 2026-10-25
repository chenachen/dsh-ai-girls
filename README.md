# AI 娘值班室

为 [DeepSeek Harness（DSH）](https://github.com/deepseek-ai/deepseek-harness) 提供独立桌面角色与任务气泡。切换到编辑器、浏览器或最小化 DSH 后，仍能看到当前实例中各个会话的执行状态，并点击气泡返回对应会话。

## 功能

- **全局任务气泡**：监听当前 DSH 实例的全部运行会话，子任务归属父任务；等待审批和输入优先显示。
- **真实执行状态**：展示任务名、工具或文件摘要及可用耗时，区分运行、等待、正常结束、失败和手动停止。
- **独立桌面窗口**：Windows 使用 WPF，macOS 使用 AppKit，支持置顶、拖动、缩放与位置记忆。
- **五位角色、十种形态**：DeepSeek 鲸娘、GPT 龙娘、Claude 娘、Grok 娘、Gemini 双子猫娘，各有常态和 Q 版，配有持续状态动画与角色配色。
- **角色与轮换设置**：固定、顺序、收藏或随机轮换；桌面菜单与 DSH 设置页双向同步。
- **点击返回任务**：恢复 DSH 并打开对应会话。

运行与等待期间只展示执行信息；没有运行中或等待处理的任务时，才显示结果或闲置文案。插件与桌面程序独立维护，不修改 DSH 安装包，无需额外 Electron 运行时。

## 环境要求

- Node.js **22 或以上**，npm。
- 已安装的 DSH Desktop。完整功能的已验证基线为 **DSH 0.2.1-rc.2 / Cordis 4.0.5**；其他版本需自行验证兼容性。
- 原生编译环境：

| 平台 | 构建要求 | 验证范围 |
| --- | --- | --- |
| macOS | Xcode 或 Command Line Tools，含 Swift 编译器 | 已在 arm64 实机验证安装、任务气泡、角色设置与会话跳转 |
| Windows | 系统 .NET Framework 4.x 编译器（Framework64） | 已提供 WPF 实现与 CI 构建；当前角色版桌面效果待实机验收 |

暂不支持 Linux。透明区域跨应用点击穿透、多屏不同缩放及断开副屏仍有待实机验证项，详见[验收清单](docs/acceptance.md)。

## 安装

当前通过源码构建并安装本地目录。在目标系统上执行：

```sh
git clone https://github.com/chenachen/dsh-ai-girls.git
cd dsh-ai-girls
npm ci
npm run build
```

构建生成 macOS 的 `dist/AiGirls.Desktop.app` 或 Windows 的 `dist/AiGirls.Desktop.exe` 及配套素材。

1. 打开 DSH「插件 → 添加插件」。
2. 输入本仓库的**绝对路径**，安装后点击「立即启用」。
3. 在「设置 → AI 娘值班室」或插件详情中配置角色与显示选项。

本地安装链接仓库目录，使用期间请保留目录位置和构建产物。更新源码后重新运行 `npm ci`、`npm run build`，并在当前任务结束后重启 DSH。

## 使用

- 拖动角色或气泡标题移动窗口；点击角色名称或右键角色打开菜单。
- 默认使用 DeepSeek Q 版、100% 大小、固定模式。缩放范围为 75%–150%；轮换间隔可在设置页输入 1–3600 秒，默认 10 秒。
- 默认显示最多三个主任务，可展开查看其余任务及子任务。点击任务标题返回对应会话。
- 点击「−」隐藏气泡，通过角色菜单恢复；点击「×」关闭桌面窗口，重新启用插件可恢复。
- 在 DSH 插件详情页停用或卸载。停用插件或真正退出 DSH 后，配套桌面程序随之退出。

角色偏好由 DSH profile 保存；窗口位置与本地偏好副本位于 Windows 的 `%LOCALAPPDATA%\DshAiGirls` 或 macOS 的 `~/Library/Application Support/DshAiGirls`。

## 开发与验证

```sh
npm test              # 状态、通信、角色策略、导航与配置测试
npm run build         # 构建当前系统的原生程序
npm run test:host     # 使用已安装的 DSH 官方模块执行接入测试
npm run doctor        # 检查编译器、构建产物、DSH 模块和安装信息
```

macOS 构建后可运行 `npm run test:native` 检查图集透明像素命中；`npm run demo` 会打开约 65 秒的合成任务演示窗口，不调用模型。真实桌面行为按[手动验证步骤](docs/manual-verification.md)检查。

`test:host` 和 `doctor` 的默认模块来源：macOS 使用 `/Applications/DeepSeek Harness.app`，Windows 使用 `%USERPROFILE%\.dsh\profiles\node_modules`。可通过 `DSH_APP_PATH` 指定 macOS 应用位置，或通过 `DSH_NODE_MODULES` 指定模块目录；`DSH_PROFILE_DIR` 可覆盖诊断使用的 profile 目录。

### 目录

```text
src/        DSH 宿主插件、客户端设置、任务状态与角色策略
desktop/    Windows WPF 与 macOS AppKit 原生窗口
assets/     角色图集、动画清单、文案、配色与图标
locale/     插件名称与说明的本地化资源
scripts/    构建、诊断、演示与接入测试入口
test/       单元测试与宿主接入测试
docs/       产品行为、架构、素材格式与验收说明
```

### 文档与贡献

- [产品行为](docs/product-plan.md)：任务范围、状态语义与桌面交互。
- [架构与接口](docs/architecture.md)：模块职责、DSH 接入及通信协议。
- [角色素材](docs/assets.md)：图集布局、状态映射、文案与更新要求。
- [手动验证](docs/manual-verification.md)与[验收清单](docs/acceptance.md)：复现步骤及验证范围。

问题反馈请在 [Issues](https://github.com/chenachen/dsh-ai-girls/issues) 中提供操作系统、DSH 版本、复现步骤和预期行为。提交代码修改前运行相关测试；桌面改动注明实际验证的平台。共享日志前移除凭据、个人路径与真实会话内容。

## 许可证

源码、角色图集、文案及本仓库其他素材统一采用 [MIT License](LICENSE)。角色设计参考链接保留在 [assets/characters.json](assets/characters.json) 中。
