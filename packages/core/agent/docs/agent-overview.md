# dsh-agent 包概览

`@deepseek-ai/dsh-agent`（`packages/core/agent`）是 agent 的**公共服务层**：定义 `Agent` 公开约定、`ctx.agents` 注册表（`AgentRegistry`）、创建工厂接口（`AgentFactory`）和全部 `agent/*` 事件词汇。它**不创建模型请求**——驱动由 `@deepseek-ai/dsh-agent-loop` 实现并通过 `setFactory` 注册进来，消费者只依赖本包。

## 1. 基本能力

| 能力 | 入口 |
|------|------|
| 创建 / 恢复 agent | `ctx.agents.create(options)` / `ctx.agents.resume(options)`（委托给注册的工厂） |
| 驱动对话 | `agent.followup()` / `agent.steer()` / `agent.inject()`，把带来源的 user 消息路由进持久化 inbox |
| 取消与静止 | `agent.cancel(cause, { keepInbox })`、`agent.whenIdle()`、`agent.runMaintenance(task)` |
| 查询存活 agent | `ctx.agents.get(id)`；创建方持有 `AgentHandle.dispose()` 拆除 |
| 发起者归因 | `ctx.agents.currentInitiator()` / `requireInitiator()` / `withInitiator()` / `withoutInitiator()`（进程内 AsyncLocalStorage 因果链） |
| 观察 / 拦截活动 | `agent/*` 事件（见第 4 节），全部支持 scope 过滤，只收听指定 agent |
| 按 agent 组合能力 | `agent.ctx`：agent 级作用域，注册的工具、prompt 段、监听器随 dispose 回收 |

设计边界：

- **model-visible ⟺ logged**：到达模型请求的一切内容必须能从 session 日志重建；`followup`/`steer`/`inject` 的内容都会落日志。
- **Agent 不是 I/O 管道**：输入走持久化 inbox，输出走 session 事件流（`assistant/message` 等 durable 事件 + `agent/assistant-stream` 瞬时流）。
- **接口与实现分离**：消费者（如 ACP bridge）从不 import `dsh-agent-loop`；未注册工厂时 `create`/`resume` 抛出 `no agent factory registered (load an agent-loop plugin)`。

## 2. 接口

### 2.1 `Agent`（types.ts + runtime-types.ts 声明合并）

属性：

| 属性 | 类型 | 说明 |
|------|------|------|
| `id` | `SessionId` | session 背书身份（agent id === session id） |
| `options` | `AgentOptions` | 请求使用的 provider/model 路由（`provider`、`model`、`reasoningEffort`、`maxTokens`） |
| `session` | `Session` | 活跃 session，其日志是持久化事实源 |
| `inbox` | `Inbox` | agent 持有的待处理工作访问口（`nextTurn`/`nextStep` 两队列 + `append`/`prepend`/`replace`/`remove`/`splice`/`clear`） |
| `status` | `AgentStatus` | `'idle' \| 'running'`，每次跃迁镜像为 `agent/status` 事件 |
| `ctx` | `Context` | agent 级作用域上下文；注册物 agent 本地、dispose 时回收、之后拒绝注册 |

方法：

| 方法 | 语义 |
|------|------|
| `followup(message)` | 排队一个普通下一轮 prompt 并**唤醒**驱动器（= `send(msg, 'next-turn', true)`） |
| `steer(message)` | 向最近 step 提交转向输入并**唤醒**；运行中驱动器在下一 step 边界消费（= `send(msg, 'next-step', true)`） |
| `inject(message)` | 注入模型可见上下文，**不唤醒**；下一 pre-step 认领（= `send(msg, 'next-step', false)`） |
| `send(message, target, wakeup)` | 底层路由：写入 inbox 指定边界，可选唤醒 |
| `cancel(cause, options?)` | 中止当前 turn/维护任务；默认清空 inbox，`keepInbox: true` 时保留待办 |
| `whenIdle()` | 整个 agent 达到静止（无活跃驱动器/维护任务）后 resolve |
| `runMaintenance(task)` | 在真 idle 相位运行一个非 turn 维护任务；被占用时同步抛错 |

### 2.2 `AgentHandle`

```ts
interface AgentHandle {
  agent: Agent
  dispose(): Promise<void>  // 能力凭证：仅持有者可拆除（停 loop→排空→注销→删 session→回收作用域）
}
```

### 2.3 `AgentFactory`（由 loop 实现）

| 方法 | 语义 |
|------|------|
| `createAgent(ownerCtx, options: CreateAgentOptions)` | 在调用方提供的 session id 上新建 agent；setup→commit→插入→公告全事务化，失败回滚 |
| `resume(ownerCtx, options: ResumeAgentOptions)` | 在持久化 session 上恢复；要求 `ctx.sessionPersistence` 已存在 |

关键选项：`CreateAgentOptions` = `{ sessionId, meta?, seed?（fork 前缀）, parentAgent?, agentOptions?, signal?, setup? }`；`ResumeAgentOptions` = `{ resumeSessionId, parentAgent?, agentOptions?, signal?, setup? }`。`setup` 在发布前组合 agent 作用域（工具、prompt 段、监听器），可返回 `AgentSetupCommit` 在发布边界同步提交；失败整体回滚，两个 id 都不发布。

### 2.4 `AgentRegistry`（`ctx.agents` 服务）

| 方法 | 语义 |
|------|------|
| `create(options)` / `resume(options)` | 通过注册工厂创建/恢复，归属绑定到**调用方**上下文（`ownerCtx`） |
| `setFactory(factory)` | 注册工厂（loop 构造时 effect-scoped 调用）；重复注册抛错；返回清空槽位的 disposer |
| `register(agent)` | 登记一个已构造的 agent（source=`startup`）；普通调用者用此入口 |
| `enter(agent, owner)` / `announce(agent, source, signal?)` | 工厂专用的有序生命周期原语：先不公开插入，setup 完成后再公告 |
| `get(id)` | 按 id 查存活 agent（返回裸 `Agent`，不含 handle） |
| 发起者方法 | `currentInitiator()` / `requireInitiator()` / `withInitiator(agent, op)` / `withoutInitiator(op)` |

## 3. 生命周期

```
谁创建                                  谁调用 / 谁销毁
─────────────────────────────────────────────────────────────
AgentLoop (dsh-agent-loop)
  构造时 ctx.agents.setFactory(this)     ← effect-scoped，卸载自动清槽
        ▲
        │ 委托（归属绑到调用方 ownerCtx）
        │
消费者（ACP bridge / UI / subagent 编排器 / 配置启动）
  ctx.agents.create(options)             → 持有 AgentHandle，负责 dispose()
  ctx.agents.resume(options)             → 同上
  config 启动的 agent                    → 由 loop 自身 fiber 持有，无 handle
```

创建管线（`createAgent`/`resume` 内部，全事务化）：

1. 铸造 `agentCtx`（agent 级作用域）
2. await `setup(agentCtx, ...)` 组合作用域 → 可选同步 `commit()`
3. `enter()` 插入注册表（此时代理**未公开**，观察者看不到半成品）
4. `announce()`：先 `session/created`，再**串行 await** `agent/created` 监听器
5. 发布完成，loop 开始驱动；排队的输入等监听器结束后才放行

回滚与销毁：

- setup 抛错 / commit 抛错 / owner 被 dispose → 回滚，不发布任何 id；已部分送达的公告以 `agent/disposed` / `session/disposed` 配对补偿
- `handle.dispose()`：停 loop → 等退出 → 注销 → 从 store 移除 session → 回收作用域
- provider（loop）卸载 → 其创建的所有存活 handle 一并停止排空（结构归属兜底）
- `resume` 额外前置：打开持久化 session → 读取并修复日志 → 再走同一发布边界

状态机：`idle` ⇄ `running`（无第三种可观状态；disposal 体现为从注册表移除）。唤醒输入在预留取消位后同步进入 `running`；无驱动器残留时回到 `idle`。

## 4. 基本事件

所有事件声明在 cordis `Events` 上，均支持 **scope 过滤**（agent 作用域监听器只收到该 agent）。`@mode` 决定派发语义：`emit`（广播）、`serial`（串行 await）、`waterfall`（必须调 `next()` 委托，否则短路）。

### 4.1 生命周期与 inbox（emit/serial）

| 事件 | mode | 载荷要点 | 触发时机 |
|------|------|---------|---------|
| `agent/created` | **serial** | `agent, source, signal?` | setup 完成后、创建 resolve 前；监听器串行 await，失败使创建失败 |
| `agent/disposed` | emit | `agent` | 驱动器静止、作用域回收后，session 脱离前 |
| `agent/status` | emit | `agent, status` | `idle` ⇄ `running` 每次跃迁 |
| `agent/inbox/inserted` | emit | `agent, message` | 一条消息进入 live inbox |
| `agent/inbox/claimed` | emit | `agent, message, turn` | 消息在其 open turn 内被认领（step 被拒时消息终结于此） |
| `agent/inbox/discarded` | emit | `agent, message` | 消息被丢弃（如 cancel 清 inbox） |

### 4.2 状态机扩展点（waterfall/serial/emit）

| 事件 | mode | 载荷要点 | 用途 |
|------|------|---------|------|
| `agent/pre-step` | **waterfall** | `agent, messages, turn, step, signal` | 拒绝提议的 step（`{kind:'reject'}`）或替换进入的消息；`next()` 保留现状 |
| `agent/request` | **waterfall** | `agent, turn, step, signal` | 替换冻结的 `LlmCallConfig`（换模型路由）；`await next()` 拿到默认配置 |
| `agent/request-error` | **waterfall** | `agent, turn, step, provider, failure, retryPolicy, signal` | 接管失败请求恢复：返回 `{kind:'retry'}` 不调 `next()`；默认 `undefined` 终结 |
| `agent/assistant-stream` | emit | `agent, frame` | 进程内 assistant 流式发布（start/chunk/end；chunk 瞬时，最终落 durable 事件） |
| `agent/turn-stopping` | **serial** | `agent, turn, signal` | turn 即将关闭前 await；异议者 `agent.steer(...)` 则重读 inbox 再跑一个 step |

### 4.3 错误通知（emit）

| 事件 | 载荷要点 | 说明 |
|------|---------|------|
| `agent/error` | `agent, turn, step, error` | step/turn 出错；即使错误无 turn 内位置可持久化也在此上报 |

### 4.4 持久化 session 事件（`dsh-session` 词汇）

| 事件 | 说明 |
|------|------|
| `agent/inbox/spliced` | inbox 两队列的一次规范化持久化变更；`Session.append()` 返回前投影已应用 |

> 注：turn/step 边界（`turn/start`、`step/start` 等 durable 事件）属于 `@deepseek-ai/dsh-session` 的事件词汇，本包通过 `TurnBoundaryProjection` 投影读取；未加载 agent-loop 时该投影键缺席，读者应视为"无 open turn"的能力缺席而非数据损坏。

## 参考源码

- 接口与注册表：`src/index.ts`（`AgentRegistry`、`AgentFactory`、`AgentHandle`、创建选项）
- 运行面与事件：`src/runtime-types.ts`（`Agent` 合并成员、`Inbox`、`AgentStatus`、全部 `agent/*` 事件）
- 持久化词汇：`src/types.ts`（`Agent` 核心、`InboxState`、`agent/inbox/spliced`、投影声明）
- 唯一具体实现：`packages/core/agent-loop`（`AgentLoop implements AgentFactory`，`src/agent.ts` 实现 `Agent` 方法）
