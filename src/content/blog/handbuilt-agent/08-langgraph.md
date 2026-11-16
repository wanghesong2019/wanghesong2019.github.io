---
title: "从手写循环到画流程图——LangGraph 封装"
column: "handbuilt-agent"
date: 2026-11-15
order: 8
description: "把这套手搓的 Agent Loop，用 LangGraph 的 StateGraph 重写一遍，同一套能力换一种\"声明式\"的表达."
juejin: "https://juejin.cn/post/7707957158462095402"
---

## 为什么会有本系列

本系列[【手搓 AI Agent · Python 版】](https://juejin.cn/column/7705955493571084328)是手搓 Agent 教学项目 [Teernage/powercode](https://github.com/Teernage/powercode) 的 Python 重实现版本；为什么要做这个系列呢？是因为当我在掘金社区刷到 @不一样的少年_ 大佬的【不用框架，手搓 AI Agent】系列时，感觉写得很好，但是想深入学习时，发现代码都是 Node/TS 实现。想掌握技术细节，但看得似懂非懂，如果先学习 Node/TS，又感觉成本太高。于是就想着实现一个 Python 版本的手搓 Agent 系列，以便让自己能更深入学习 Agent 的相关技术细节。整理成博客，以便那些熟悉 Python 但不熟 Node/TS 的小伙伴能一起进步成长；当然如果你已有 Node/TS 基础，强烈建议去学习 [【不用框架，手搓 AI Agent】](https://juejin.cn/column/7661531339729829926)系列，真的很棒。再次感谢 Teernage 大佬的开源分享。

本系列的源码 [powercode-py](https://github.com/wanghesong2019/powercode-py)，本篇对应 commit `8064b2f`；如果你觉得对你有帮助，请点个 star ⭐。

---

> **上篇回顾**：前 7 篇，我们给 AI 装上了读文件、Agent Loop、工具注册中心、会话记忆、Plan Mode、错误自救与熔断，全是用 `for` 循环手搓的。
>
> **本篇目标**：收官——把这套手搓的 Agent Loop，用 LangGraph 的 StateGraph 重写一遍，同一套能力换一种"声明式"的表达。

## 一、写了 7 篇的循环，换一种写法

前 7 篇下来，咱们的 `agent.py` 里始终有一个主角——`for step in range(MAX_STEPS)`：

```python
for step in range(1, MAX_STEPS + 1):
    # 调模型 → 拿工具调用 → 跑工具 → 把结果塞回 Session → 再调模型
    ...
```

每一篇的新能力（读文件、工具注册、记忆、Plan Mode、熔断）都挂在这个循环上。写到第 7 篇，这个循环已经挺长、挺"串"了：循环里要顾着调模型、跑工具、记失败、处理审批暂停……全搅在一个 `for` 里。

这当然能跑，但"谁先谁后、什么情况该回到哪"这些流程，全藏在循环体和一串 `if` 里，得靠人脑去捋。

这一篇，我们换个姿势：把"调模型"和"跑工具"画成两个框，用箭头连起来，交给 **LangGraph** 去跑。能力一行不重写，只是把"谁先谁后"从 `for` 循环，搬进了一张图。

这跟现实里 Codex、Cursor 这些框架底层的做法是一个道理——**框架不替你写工具，它替你管流程**。前 7 篇手搓，就是为了让你看清"循环里到底发生了什么"；这一篇用 LangGraph，是为了让你看到"同样的流程，可以被画成图"。

## 二、手写的循环，画出来就是一张图

先对齐一个概念：手搓版和 LangGraph 版，做的是**同一件事**，只是"流程"的表达方式不一样。

手搓版，流程是厨师脑子里记着的：

```text
调模型（客人点菜）
  ↓
看有没有工具要调（要上菜了吗）
  ├─ 有 → 跑工具（后厨做菜）→ 回到"调模型"
  └─ 没有 → 回答客人，收工
```

LangGraph 版，把这段流程画成两个框 + 两根箭头：

<p align="center"><img src="/images/ch8-concept.png" alt="手写循环 vs LangGraph 图的概念图" width="45%" /></p>

- **节点（框）**：`call_model`（调模型）和 `run_tools`（跑工具），就是原来循环里的两段代码，一行不改搬进节点。
- **边（箭头）**：`call_model` 出来，看 `tool_calls` 有没有东西——有，走 `run_tools`；没有，走 `END` 收工。`run_tools` 干完，再回 `call_model`。

原来 `for` 循环的"回到开头再跑一轮"，在 LangGraph 里就是那条 `run_tools → call_model` 的回环箭头；原来"没有工具调了就 break"，就是 `call_model → END` 那条条件边。

**同一个 Agent，两种写法，对照着看最清楚。**手搓版把每个细节摊开给你看，LangGraph 版把流程收成一张图。

## 三、先看效果

装好 LangGraph（可选依赖）后，用 `--engine langgraph` 切过去：

```bash
pip install -e '.[graph]'
powercode --engine langgraph "读一下 README.md，用一句话说这个项目是什么"
```

```text
AI 正在思考...
✓ read_file 执行完成
AI：这个项目是 powercode-py：一个不用任何 Agent 框架、纯 Python 从零手搓的终端 coding agent……
```

跟手搓版（默认 `--engine handmade`）的输出一模一样——同一套工具、同一套提示词、同一套记忆和熔断，只是底下跑的"流程"换成了图。

> ⚠️ 免责：上面是 LLM 生成、非确定，你跑出来措辞可能不一样；关键是看它**照样调了 `read_file`、照样给出回答**，证明能力没变。

要写的代码，其实就一个新文件加一个小开关，串起来是条很短的流水线：

<p align="center"><img src="/images/ch8-roadmap.png" alt="实现路线图" width="12%" /></p>

一句话记图：**第四节定义图状态 + 两个节点（graph/agent.py），第五节连条件边 + 回环，第六节补 interrupt 审批 + `--engine` 开关（cli.py）。**

## 四、第一步：定义图状态 + 两个节点

新建 `powercode_py/graph/agent.py`。先定一张图里流转的状态——就是节点之间传来传去的那张"小纸条"：

```python
class GraphState(TypedDict, total=False):
    tool_calls: list   # 模型这轮要调的工具（dict 列表）
    answer: str        # 最终回答
```

只有两个字段：`tool_calls`（这轮模型想调哪些工具）和 `answer`（最终回答）。图就在这两个字段上转。

然后是两个节点。第一个 `call_model`，干的就是原来循环里"调模型"那段：

```python
def _call_model(self, state: GraphState) -> dict:
    memory = self.compactor.build_working_memory(self.session)   # 复用第 5 篇的工作记忆
    allowed = self._allowed_tool_names()                        # 复用第 6 篇的权限边界
    messages = [{"role": "system", "content": self._build_system_prompt()}, *memory]
    completion = self.client.complete_with_usage(
        messages, self.registry.get_definitions(allowed)
    )
    message = completion.message
    ...
    raw_calls = getattr(message, "tool_calls", None) or []
    if not raw_calls:
        self.state.finish_execution()
        return {"answer": message.content or "模型没有返回文本内容。", "tool_calls": []}
    return {"tool_calls": self._tool_calls_dicts(message)}   # 有工具，交给 run_tools
```

第二个 `run_tools`，干的是原来"跑工具"那段，**直接复用第 7 篇的 `run_tool_batch`**：

```python
def _run_tools(self, state: GraphState) -> dict:
    calls = [...把 dict 转回 tool_call 对象...]
    batch = run_tool_batch(calls, self.registry, allowed, self.recovery)  # 复用批次执行器
    self.session.append(*batch["messages"])

    if batch["stop"]:
        return {"answer": f"本次运行已暂停。\n{batch['stop_reason']}\n...", "tool_calls": []}
    if self.state.get_status() == "waiting_for_approval":
        interrupt({"title": plan.title, "plan": format_plan(plan)})  # 提交计划，暂停图等审批
    return {"tool_calls": []}
```

注意这两段代码：`compactor`、`registry`、`run_tool_batch`、`RecoveryManager`、`format_plan`——全是前 7 篇写好的，**一行没重写**，只是从循环里搬进了节点。这就是"只换编排层、不重写能力"。

## 五、第二步：连条件边，循环变成回环

节点写好了，接下来把"该走哪条路"画出来。核心是 `_should_continue` 这条条件边：

```python
def _should_continue(self, state: GraphState) -> str:
    return "run_tools" if state.get("tool_calls") else END
```

`call_model` 跑完，看 `tool_calls`：有工具要调就走去 `run_tools`，没有就 `END` 收工——这就是原来循环里"有没有工具调用"那个判断。

然后把整张图拼起来：

```python
def _build_graph(self):
    graph = StateGraph(GraphState)
    graph.add_node("call_model", self._call_model)
    graph.add_node("run_tools", self._run_tools)
    graph.set_entry_point("call_model")           # 从调模型开始
    graph.add_conditional_edges(
        "call_model", self._should_continue,
        {"run_tools": "run_tools", END: END},     # 有工具→run_tools；没有→END
    )
    graph.add_edge("run_tools", "call_model")      # 跑完工具回 call_model，形成回环
    return graph.compile(checkpointer=MemorySaver())
```

对照着看最清楚：

```text
手搓版 for 循环           LangGraph 版
─────────────             ──────────────────────────────
for step in range(...)    call_model ──有工具──▶ run_tools
    ...                      ▲                        │
                             └──────── 回环 ◀─────────┘
没有工具了就 break/return  call_model ──没工具──▶ END
```

原来"跑完一轮回到循环开头"，就是那条 `run_tools → call_model` 的边；原来"没有工具调了就停"，就是 `call_model → END` 那条条件边。

## 六、第三步：审批怎么暂停图？`--engine` 怎么切？

### 6.1 提交计划后怎么停、怎么恢复？两个版本对照看

第 6 篇的 Plan Mode，模型提交计划后要停下来等老板签字，批准了再继续执行。这一停一续，两个版本各是怎么实现的？先把手搓版看清楚，LangGraph 版就好懂了。

**手搓版的停和续**：`run()` 里跑完工具批次后，发现状态变成 `waiting_for_approval`，就 `return format_plan(plan)`——这次 `run()` 到此结束，控制权交回 CLI；批准后，CLI 再调一次 `run("计划已批准…")`，开新一轮循环（还是同一个 `AgentState` 和 `Session`，模型接着读 `PLAN.md`/`TODO.md` 干活）。

```python
# 手搓版：跑完工具批次后，交计划就 return，结束这次 run
if self.state.get_status() == "waiting_for_approval":
    plan = self.state.get_pending_plan()
    return format_plan(plan)
```

**LangGraph 版的停**：不在循环里 `return`，而是在 `_run_tools` 节点里调 `interrupt()`，把图停住：

```python
if self.state.get_status() == "waiting_for_approval":
    plan = self.state.get_pending_plan()
    interrupt({"title": plan.title, "plan": format_plan(plan)})  # 图停在这，把计划交出去
```

先看清 `interrupt()` 到底是个什么：它一个调用衔接**两个方向、两个时刻**——

- **暂停时刻（参数）**：`interrupt({"title": ..., "plan": ...})` 的参数，方向是「节点 → 调用者」，把计划"吐"给等在外头的 `run()`；
- **恢复时刻（返回值）**：本该由调用者用 `Command(resume=...)` 把人工决策送回节点，`resume` 的内容原样变成 `interrupt()` 的**返回值**，方向是「调用者 → 节点」。

官方给它的比喻是"生产级、异步版的 `input()`"。`run()` 这边就靠检测 `invoke()` 返回值里的 `__interrupt__` 键，把计划文本还给 CLI：

```python
def run(self, prompt: str) -> str:
    ...
    result = self._graph.invoke(
        {"tool_calls": [], "answer": ""},
        {"configurable": {"thread_id": str(uuid4())}},   # 每次都生成全新 thread_id
    )
    if "__interrupt__" in result:
        plan = self.state.get_pending_plan()
        return format_plan(plan) if plan else ""
    return result.get("answer", "")
```

**关键点：本文这版，只用上了 interrupt 的"暂停时刻"，没用"恢复时刻"。**两个证据：

1. `run()` 拿到 `__interrupt__` 后，直接 `return format_plan(plan)`，从没调过 `Command(resume=...)`——所以 `interrupt()` 的返回值那一半压根没被触发；
2. `run()` 每次 `invoke` 都用 `thread_id = str(uuid4())` 生成**全新** ID，而 resume 的前提是"两次 invoke 用**同一个** `thread_id` + checkpointer"，前提不满足，checkpoint 续跑自然不发生。

所以批准后，CLI 再调 `run()`，开的是**一张新图**，从头再跑——这跟手搓版"再调一次 `run()` 开新一轮"是**完全一致的恢复模型**。`interrupt` 在这里的角色，其实就是"用 LangGraph 的方式把'交计划、停下来'表达出来"。

> **想真正补上"恢复"这一半（原地续跑），要做三件事**：① 固定 `thread_id`（现在是每次 `uuid4()`，checkpoint 存了也没人续）；② 给 `LangGraphAgent` 加一个 `resume()` 入口，批准后用 `Command(resume=...)` 续跑；③ 把 `interrupt` 挪进一个**无副作用**的独立节点——否则 resume 时 `_run_tools` 会从头重跑，把 `submit_plan` 再执行一遍（批准后状态已是 `executing`，会直接报错）。这套 human-in-the-loop 的 interrupt/resume 机制，推荐看这篇讲得很细：[第 2 讲：HITL——让 Agent 学会"先问再做"，给高危操作加一道人工审批闸门](https://juejin.cn/post/7701585502927568932)

### 6.2 `--engine` 开关：默认还是手搓版

`powercode_py/cli.py` 加一个开关，让两种引擎并存：

```python
def _build_agent(client, work_dir, state, engine="handmade"):
    ...
    if engine == "langgraph":
        try:
            from .graph.agent import LangGraphAgent
        except ImportError as exc:
            raise ConfigError("要使用 --engine langgraph 请先安装：pip install -e '.[graph]'") from exc
        return LangGraphAgent(client, registry, session, state)
    return Agent(client, registry, session, state)   # 默认还是手搓版
```

`LangGraphAgent` 的 `run(prompt)` 接口和手搓版 `Agent` 完全一致（drop-in 替换），所以 CLI 其余部分一行不用改。依赖也做成可选：

```toml
[project.optional-dependencies]
graph = [
    "langgraph>=1.0",
]
```

默认 `pip install -e .` 不拉 LangGraph；想用图引擎，才 `pip install -e '.[graph]'`。

## 七、踩坑：这几个坑，掉进去的人最多

### 7.1 图状态必须可序列化

`MemorySaver` 检查点用 msgpack 存图状态，节点之间传的东西必须能被序列化。模型 SDK 返回的 `tool_call` 对象不能直接塞进状态，得先转成 dict（见 `_tool_calls_dicts`），要用的时候再转回来。这是最容易踩的一脚。

### 7.2 只换编排层，别重写能力

`LangGraphAgent` 的节点里，`Compactor`、`Registry`、`RecoveryManager`、`run_tool_batch` 全复用前几篇的。别手痒在节点里重新实现一遍工具执行——那样就白手搓了，还容易和手搓版行为不一致。

### 7.3 默认 handmade，向后兼容

`--engine` 默认 `handmade`，LangGraph 是可选依赖。这样不装 LangGraph 的人照样能跑手搓版，装了的人多一个选择。别把默认值反过来，否则老用户装完就跑不动。

### 7.4 interrupt 之后是开新图，不是"原地续跑"

图被 `interrupt` 暂停后，`run()` 返回了，这次 `invoke` 就结束了。批准后 CLI 再调 `run()`，用**全新的 `thread_id`** 开一张**新图**，不是拿旧 `thread_id` 去续跑中断的那张图（详见 6.1）。这点和第 6 篇"不是挂起循环、而是结束再开新一轮"是同一个道理。

## 八、这期到底干成了啥？

这一篇没给 Agent 加任何新能力——`read_file`、Plan Mode、熔断、记忆压缩，一个没多。

我们只做了一件事：**把"谁先谁后"从 `for` 循环里抠出来，画成了一张图。**

```text
手搓版    for step in range(MAX_STEPS)  —— 流程藏在循环体和 if 里
LangGraph 版  call_model ⇄ run_tools    —— 流程画成节点 + 边，一眼看清
```

最关键的是这一句：**手搓版让你看清循环里发生了什么，LangGraph 版让你看到这段流程可以被画出来。**两者能力一模一样，只是表达方式不同——这正是从"手写循环"到"框架封装"的最后一步。

## 九、系列收官：回头看这 8 篇

到这里，咱们从一行 `powercode "你好"` 出发，一路手搓出了一个完整的 coding agent：

```text
第 1 篇  一问一答                ── 让模型先跑起来
第 2 篇  read_file               ── 给它"手"，能读文件
第 3 篇  Agent Loop              ── 会循环：信息不够就再读
第 4 篇  工具注册中心             ── 读、写、改、跑四件套
第 5 篇  会话记忆 + 上下文压缩     ── 记得住、聊长了会折叠
第 6 篇  Plan Mode               ── 先规划、后审批、再动手
第 7 篇  错误自救 + 熔断          ── 报错了会拐弯、连败会停火
第 8 篇  LangGraph 封装           ── 同一套能力，画成图
```

手搓版是"读得懂的教科书"，LangGraph 版是"生产化的框架表达"——两个版本都留在仓库里，对照着看，你就能把 Agent 从"黑盒"彻底看透。

感谢一路读到这里。如果你照着这 8 篇把手搓版一路写下来了，恭喜你——你已经比大多数只会调 API 的人，更懂 Agent 底层到底是怎么转的了。
