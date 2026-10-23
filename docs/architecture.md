# 当前实现与接口依据

实现版本：`0.1.0-dev.1`。本机核对 DSH `0.1.7-rc.2`、Cordis `4.0.4` 的已安装源码和类型，并使用同一份官方模块运行接入测试。

## 模块

| 文件 | 职责 |
| --- | --- |
| `src/index.js` | 官方 Cordis 插件入口，声明宿主服务依赖 |
| `src/host-runtime.js` | 全局事件观察、启动时恢复任务、窗口生命周期、去重发布 |
| `src/task-store.js` | 执行状态、并行工具和审批、父子关系、结果卡过期 |
| `src/execution-projection.js` | DSH 会话投影，保存可恢复的执行摘要，不保存模型正文和完整工具参数 |
| `src/desktop-bridge.js` | 启动桌面子进程、UTF-8 JSON 行通信、背压合并、等待退出 |
| `desktop/Overlay.cs` | 独立透明置顶窗口、事实气泡、折叠列表、持续计时和位置记忆 |
| `scripts/install-local.mjs` | 备份并更新本地 profile 中有标记的开发入口 |

## DSH 接口

- `ctx.agents.list()` 返回当前宿主的运行时 Agent 集合。无会话选择、页面焦点或前端组件依赖。
- `session/event(session, event)` 是总线事件；`turn/start`、`turn/end`、`tool/call` 等是它的 `event.type`，并非独立总线事件。
- `tool/result` 的对应关系是 `data.message.toolCallId`。工具错误由 `message.isError` 标识，不能直接转换成任务最终失败。
- `agent/status({agent,status})` 提供运行/闲置；`agent/assistant-stream({agent,frame})` 只用于更新“请求模型 / 接收模型输出”，不复制输出正文。
- `sessionProjections.register/stateOf` 负责重放与当前状态。启用插件时恢复运行任务的工具、待审批状态和真实开始时间；没有时间时不计时，不扫描已弃用的会话同步读取接口。
- `user-questions/request(request,next)` 是 waterfall。观察器必须调用并返回 `next()` 的结果，原样传播回答与错误；用 `finally` 清理等待状态。
- **Cordis 4.0.4 生命周期使用 `ctx.effect`。** 当前实现直接在依赖满足后启动，并返回异步清理函数；不等待不存在的 `ready/dispose` 生命周期事件。
- 所有观察器挂在宿主层。接入测试用两个独立的 `dsh-scope.createScope` 会话证明根层可同时接收事件。

## 状态规则

`turn/start` 进入运行；具体工具事件更新摘要。等待审批、等待输入优先于一般工具执行。正常 `turn/end` 显示“本轮结束 / 结果待查看”，最终错误显示失败，用户取消显示手动停止。工具执行错误仍保持运行。

按会话序号去重，并核对执行轮次。已结束轮次的迟到工具结果不复活任务，上一轮的结束事件不结束新一轮。结果卡保留约 12 秒，活动任务不受其他任务结束影响。

父子关系只使用 `origin === subagent` 的 lineage；普通 fork 不归为子任务。父任务不在可见集合时，仍在运行的子任务独立可见。

## 桌面通信

宿主通过 Node `spawn` 创建一个 Windows WPF 子进程，用匿名标准输入输出管道绑定两者生命周期。没有监听端口，也没有远程服务依赖。每个宿主只向自己启动的子进程发布快照。

输入为 UTF-8 JSON Lines，当前协议版本为 1：

```json
{"type":"snapshot","protocol":1,"hostPid":1234,"tasks":[{"id":"example","parentId":null,"title":"测试任务","state":"running","stage":"正在读取","detail":"README.md","startedAt":1792746000000,"endedAt":null,"turn":1}]}
```

桌面输出 `ready` 触发完整快照重发。`rendered` 诊断只含渲染序号、任务数量、置顶/可见标志和窗口句柄，不含任务正文。输入结束时关闭窗口；插件卸载等待子进程结束，超出两秒则结束自己创建的子进程。

宿主不重复发送未变化的快照，管道拥堵时保留最新快照。桌面线程只排队一份最新状态；每秒只更新耗时标签，避免持续销毁和重建任务列表。

## 原生窗口选择

使用 Windows 自带 .NET Framework WPF：不需要额外 Electron 安装和运行时下载。独立顶层窗口不以 DSH 主窗口为 owner；`Topmost`、`ShowActivated=false`、`WS_EX_NOACTIVATE` 和 `MA_NOACTIVATE` 承担置顶与不主动抢焦点。这个结构支持主窗口最小化后继续运行，实际可见效果按手动验收记录。

默认隐藏任务栏入口，使用工具窗口样式；通过图标拖动或右键切换气泡。等待任务优先，默认展示最多三个主任务，可以展开子任务。没有任务时收起气泡，AI 占位图标保留呼吸动画。

尚未完成的桌面链路：任务点击导航、真实角色动画、跨屏不同 DPI 的交互验收、透明区域点击穿透实测。
