# 角色素材

仓库包含五位角色的常态与 Q 版，共十张透明精灵图，以及 216 条角色文案。源码和角色素材统一采用 [MIT License](../LICENSE)，角色设计参考链接保留在 `assets/characters.json` 中。

| 角色 | 稳定 ID 前缀 | 形态 |
| --- | --- | --- |
| DeepSeek 鲸娘 | `deepseek` | `normal` / `chibi` |
| GPT 龙娘 | `gpt` | `normal` / `chibi` |
| Claude 娘 | `claude` | `normal` / `chibi` |
| Grok 娘 | `grok` | `normal` / `chibi` |
| Gemini 双子猫娘 | `gemini` | `normal` / `chibi` |

## 文件与格式

- `assets/sprites/<角色 ID>.png`：RGBA 精灵图，如 `deepseek-chibi.png`。
- `assets/manifest.json`：素材版本、角色 ID、图集哈希、帧布局及动画时长。
- `assets/characters.json`：角色信息、设计参考和按形态、状态分组的文案。
- `assets/bubble-themes.json`：五套角色气泡配色。
- `assets/icon.svg`：DSH 插件列表图标。

每张图集为 **1536 × 2288 px**，8 列 × 11 行，单格 **192 × 208 px**。动画行号从 0 开始，每帧时长以清单中的毫秒数组为准；数组长度决定播放帧数。

| 运行状态 | 动画键 | 行号 |
| --- | --- | --- |
| 闲置 | `idle` | 0 |
| 执行中 | `running` | 7 |
| 等待审批或输入 | `waiting` | 6 |
| 本轮结束 | `completed` | 4 |
| 最终失败 | `failed` | 5 |
| 手动停止 | `stopped` | 8 |

两平台按单调时钟循环播放。工作动画持续到任务状态改变，不依赖事件到达频率，也不因注视或菜单操作暂停。

## 文案规则

文案由 `src/companion.js` 统一选择。存在运行或等待任务时不显示角色闲聊；结束、失败、停止和闲置分别使用对应文案。`completed` 对应文案键 `complete`，`stopped` 对应 `interrupted`。

文案库只包含闲置、结束、失败和停止四类可展示文案，保留角色语气与标点；设计特征与参考链接用于维护角色风格及追溯来源。默认偏好由 `src/companion.js` 定义，界面配色由 `assets/bubble-themes.json` 定义。

闲置文案约每 90 秒出现一次，停留 8 秒。测试逐条验证文案能在对应角色、形态和状态下展示，运行与等待状态保持无闲聊。

## 更新素材

1. 替换对应稳定 ID 的 PNG，保留透明通道和约定的帧布局。
2. 更新 `manifest.json` 的素材版本、SHA-256；动画变化时同步修改行号和时长。
3. 运行 `npm test` 检查十张图的尺寸和哈希，再运行 `npm run build` 将素材复制到原生程序目录。
4. macOS 构建后运行 `npm run test:native`，并按[验收清单](acceptance.md)检查动画、透明边缘和缩放效果。

只保留运行时使用的素材；源工程缓存、旧版图集和对照图放在仓库之外。
