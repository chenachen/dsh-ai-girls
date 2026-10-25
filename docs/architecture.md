# 架构与接口

完整功能的接口基线为 DSH `0.2.1-rc.2` / Cordis `4.0.5`。宿主接入测试通过 `npm run test:host` 使用本机 DSH 官方模块运行；平台验证范围见[验收清单](acceptance.md)。

## 模块

| 文件 | 职责 |
| --- | --- |
| `src/index.js` | 官方 Cordis 插件入口，声明宿主服务依赖 |
| `src/host-runtime.js` | 全局事件观察、启动时恢复任务、窗口生命周期、去重发布 |
| `src/task-store.js` | 执行状态、并行工具和审批、父子关系、结果卡过期 |
| `src/execution-projection.js` | DSH 会话投影，保存可恢复的执行摘要，不保存模型正文和完整工具参数 |
| `src/desktop-bridge.js` | 启动桌面子进程、UTF-8 JSON 行通信、背压合并、等待退出 |
| `desktop/Overlay.cs` | 独立透明置顶窗口、事实气泡、折叠列表、持续计时和位置记忆 |
| `desktop/Overlay.swift` | macOS AppKit 原生窗口，与 Windows 使用相同快照协议 |
| `src/config.js` / `src/preference-binding.js` | DSH 实时配置 schema、桌面菜单与设置页双向同步 |
| `src/companion.js` | 角色与偏好、轮换、状态动画映射和文案选择 |
| `src/navigation.js` / `src/client.js` | 已鉴权的导航请求、官方客户端会话定位与设置页插槽 |
| `src/desktop-path.js` | 根据宿主系统选择原生程序路径 |
| `scripts/build-desktop.mjs` | 编译当前平台原生程序并复制角色素材 |

## DSH 接口

- `ctx.agents.list()` 返回当前宿主的运行时 Agent 集合。无会话选择、页面焦点或前端组件依赖。
- `session/event(session, event)` 是总线事件；`turn/start`、`turn/end`、`tool/call` 等是它的 `event.type`，并非独立总线事件。
- `tool/result` 的对应关系是 `data.message.toolCallId`。工具错误由 `message.isError` 标识，不能直接转换成任务最终失败。
- `agent/status({agent,status})` 提供运行/闲置；`agent/assistant-stream({agent,frame})` 只用于更新“请求模型 / 接收模型输出”，不复制输出正文。
- `sessionProjections.register/stateOf` 负责重放与当前状态。启用插件时恢复运行任务的工具、待审批状态和真实开始时间；没有时间时不计时。
- `user-questions/request(request,next)` 是 waterfall。观察器必须调用并返回 `next()` 的结果，原样传播回答与错误；用 `finally` 清理等待状态。
- Cordis 生命周期使用 `ctx.effect`，在依赖满足后启动，并返回异步清理函数。
- 所有观察器挂在宿主层。接入测试用两个独立的 `dsh-scope.createScope` 会话证明根层可同时接收事件。

## 状态规则

`turn/start` 进入运行；具体工具事件更新摘要。等待审批、等待输入优先于一般工具执行。正常 `turn/end` 显示“本轮结束 / 结果待查看”，最终错误显示失败，用户取消显示手动停止。工具执行错误仍保持运行。

按会话序号去重，并核对执行轮次。已结束轮次的迟到工具结果不复活任务，上一轮的结束事件不结束新一轮。结果卡保留约 12 秒，活动任务不受其他任务结束影响。

父子关系只使用 `origin === subagent` 的 lineage；普通 fork 不归为子任务。父任务不在可见集合时，仍在运行的子任务独立可见。

## 桌面通信

宿主通过 Node `spawn` 创建一个 Windows WPF 或 macOS AppKit 子进程，用匿名标准输入输出管道绑定两者生命周期。没有监听端口，也没有远程服务依赖。每个宿主只向自己启动的子进程发布快照。

输入为 UTF-8 JSON Lines，当前协议版本为 1：

```json
{"type":"snapshot","protocol":1,"hostPid":1234,"tasks":[{"id":"example","parentId":null,"title":"测试任务","state":"running","stage":"正在读取","detail":"README.md","startedAt":1792746000000,"endedAt":null,"turn":1}]}
```

桌面输出 `ready` 触发完整快照重发。`rendered` 诊断只含渲染序号、任务数量、置顶/可见标志和窗口句柄，不含任务正文。输入结束时关闭窗口；插件卸载等待子进程结束，超出两秒则结束自己创建的子进程。

宿主不重复发送未变化的快照，管道拥堵时保留最新快照。桌面线程只排队一份最新状态；每秒只更新耗时标签，避免持续销毁和重建任务列表。

## 原生窗口选择

使用 Windows 自带 .NET Framework WPF：不需要额外 Electron 安装和运行时下载。独立顶层窗口不以 DSH 主窗口为 owner；`Topmost`、`ShowActivated=false`、`WS_EX_NOACTIVATE` 和 `MA_NOACTIVATE` 承担置顶与不主动抢焦点。这个结构支持主窗口最小化后继续运行，实际可见效果按手动验收记录。

默认隐藏任务栏入口；拖动角色或气泡标题移动，角色名称按钮和右键打开设置菜单。等待任务优先，默认展示最多三个主任务，可以展开子任务。没有任务时收起任务气泡，角色继续闲置动画。

跨屏不同 DPI、物理断屏与 Windows 角色版桌面行为仍需对应设备验收。

macOS 使用 AppKit `NSWindow`，透明背景、隐藏标题、`.floating` 级别。标准窗口保留辅助功能语义；只有用户主动交互才取得焦点，状态更新不调用 `activate`、`makeKey` 或恢复宿主。输入 EOF 时退出。鼠标是否位于实际角色不透明像素、名称按钮或气泡区域决定 `ignoresMouseEvents`；拖动时保持命中。显示器改变时约束位置。

## 角色与偏好

`assets/manifest.json` 记录 10 个稳定形态 ID、图集哈希、帧大小与每个状态的行/帧时长。每个平台使用自己的原生图片渲染，按单调时钟选帧。动画时间不依赖宿主事件频率，也不因鼠标悬停、展开菜单或角色切换停止。运行中的工作动作持续循环；存在运行任务时总体保持工作，只有等待任务时显示等待动作。

宿主快照增加 `companion` 字段，包含选择形态、动画行与时长、缩放、轮换、收藏、气泡偏好及允许显示的台词。原生窗口发出 `{type:"preferences",patch:{...}}`；宿主校验后保存，再发布快照。偏好不包含会话正文。角色选取与文案在共享模块中处理，平台不各自随机产生文案。运行/等待时任何闲聊字段都为空；结果台词不会覆盖事实结果。

## 任务导航

桌面只接受明确点击，输出 `{type:"navigate",sessionId}`。宿主先确认该 ID 仍在当前任务集合，再保存一个 15 秒有效的导航请求。客户端插件通过 `ctx.connection.rpc.call("/api", "dsh-ai-girls/navigation", ...)` 获取请求，调用 `ctx.uiWorkspace.openSession(sessionId)` 并确认消费。重复轮询不重复导航，旧确认不会删除新请求；卸载时中止轮询。

服务端通过 `ctx.connection.fetch.register` 注册 `/api/dsh-ai-girls/navigation` 和 `/api/dsh-ai-girls/ack`。沿用 DSH 的已鉴权 owner 通道和官方 `/api` 路由，不开放新端口。

原生窗口同时打开 DSH 已注册的 `dsh://open`，负责恢复宿主；具体会话由上述客户端插件定位。

## 插件管理与设置页

本地安装通过 DSH 的插件管理器链接仓库目录；`package.json` 的 `dsh.bundle.patch` 注册宿主组件，`dsh.client` 注册客户端。`locale/*.json` 的 `meta` 与包图标用于插件列表。安装、启停、配置和卸载均由 DSH 插件管理器负责。

`Config.preferences` 是 volatile 对象。设置页通过官方 `configForms.get("dsh-ai-girls")` 读写该字段，宿主每次发布快照时接收变化；原生菜单更新通过 `settings.update` 回写 profile。共享绑定比较当前值并串行写入，避免往返同步形成循环。原有本地偏好文件保留为首次迁移和模拟窗口的数据来源。

客户端把同一个表单注册到 `settings.section` 与 `plugins.bundle.config`，因此设置和插件详情均可配置。React 及配置镜像沿用宿主提供的运行时，不额外打包前端框架。
