---
title: "先别动刀——Plan Mode 让 AI 报完方案才动手"
column: "handbuilt-agent"
date: 2026-11-14
order: 6
description: "让Agent别\"一问就动手\"——先只读着摸清项目，交出一份计划等你点头，批准了才恢复改文件、跑命令等实际操作"
juejin: "https://juejin.cn/post/7707745381980291091"
---

## 为什么会有本系列

本系列[【手搓 AI Agent · Python 版】](https://juejin.cn/column/7705955493571084328)是手搓 Agent 教学项目 [Teernage/powercode](https://github.com/Teernage/powercode) 的 Python 重实现版本；为什么要做这个系列呢？是因为当我在掘金社区刷到 @不一样的少年_ 大佬的【不用框架，手搓 AI Agent】系列时，感觉写得很好，但是想深入学习时，发现代码都是 Node/TS 实现。想掌握技术细节，但看得似懂非懂，如果先学习 Node/TS，又感觉成本太高。于是就想着实现一个 Python 版本的手搓 Agent 系列，以便让自己能更深入学习 Agent 的相关技术细节。整理成博客，以便那些熟悉 Python 但不熟 Node/TS 的小伙伴能一起进步成长；当然如果你已有 Node/TS 基础，强烈建议去学习 [【不用框架，手搓 AI Agent】](https://juejin.cn/column/7661531339729829926)系列，真的很棒。再次感谢 Teernage 大佬的开源分享。

本系列的源码 [powercode-py](https://github.com/wanghesong2019/powercode-py)，本篇对应 commit `ea3be10`；如果你觉得对你有帮助，请点个 star ⭐。

---

> **上篇回顾**：上一篇给 AI 发了本账（Session），一次启动能连续追问，聊长了还会自动把旧账折叠成摘要。
>
> **本篇目标**：让它别"一问就动手"——先只读着摸清项目，交出一份计划等你点头，批准了才恢复改文件、跑命令。

## 一、你嘴上说"先别改"，它转身就动了刀

上一期收工后，AI 已经会读、会写、会改、会跑了，看着挺能干。

但能干过头了。你试试：

```bash
powercode "先看看这个项目是怎么启动的，先别改，就看看"
```

它读了两眼 README 和 `pyproject.toml`，转头就"顺手"把 `pyproject.toml` 里的 Python 版本从 `3.10` 改成了 `3.12`——因为它觉得"用新版更好"。可你们的 CI 还钉死在 3.10 上。

你火大：我不是说了"先别改"吗？

问题不在它故意跟你作对。上一版 agent 的"工具箱"里，读文件、写文件、改文件、跑命令这些工具**从第一秒起就全都在**。你跟它说"先别改"，只是一句**建议**，不是一道**门禁**。它读完两个文件觉得"信息够了"，自然挑一个最能推进任务的动作——直接动手。

这跟真实的 coding agent（Claude Code、Codex、Cursor）遇到的问题一模一样，它们也都靠一套 **Plan Mode** 来管住"什么时候只能看、什么时候才能动手"。

所以这一篇，我们要给后厨装一道门禁：**先只给眼睛（读工具），把刀和锅（写工具、跑命令）收进柜子锁起来；等它交出一份方案，老板（你）点头签字了，再发刀。**

## 二、Plan Mode 不是一句话，是一道门禁 + 一个状态机

这里最容易误会：Plan Mode 不是往提示词里加一句"请先规划"。

上一版的 system 提示词里，你可能已经写过"先了解清楚再改"。但提示词顶多算打个招呼，模型听不听全凭它自己；只要写工具还攥在它手里，它就随时能动手。

Plan Mode 干的是两件实打实的事：

1. **收走写工具**：Plan 阶段，模型能看到的工具只有 `read_file`、`list_files`、`search_files`、`submit_plan`——没有 `write_file`、`edit_file`、`bash`。它就算想改，手里也没刀。
2. **挂起一个状态机**：模型交完计划（`submit_plan`）后，Agent Loop 立刻停住，进入"等老板签字"；只有你批准，它才切回 Code Mode、恢复写工具、开始干活。

用图看是这样：

<p align="center"><img src="/images/ch6-concept.png" alt="Plan Mode 状态机概念图" width="25%" /></p>

所以 Plan Mode 的底线就一条：**光动嘴没用，把刀收走，它才真的改不了。**

那怎么知道"该收刀、该发刀"？靠一个**状态机**，它同时记两个东西：

- **mode（模式）**：现在手里有没有刀。`plan` = 只读，`code` = 能写能跑。
- **status（阶段）**：现在走到哪一步。`planning`（还在看）、`waiting_for_approval`（方案交了、等签字）、`executing`（批准了、正在干）。

为什么要拆成 mode 和 status 两个字段，而不是只用一个布尔值"是不是在规划"？因为"规划"底下还藏着两种得分开的处境：

```text
mode = plan, status = planning
  还在读代码、搜项目、憋方案，模型能接着看

mode = plan, status = waiting_for_approval
  方案已经交上去，Agent Loop 停手，只能等老板
```

工具边界一样，但前者还能接着看，后者只能等人。这个区别到第六节会咬人，这里先知道有这回事就行。

## 三、先看效果

写完这期代码，你敲：

```bash
powercode --plan "请读一下 README.md，然后给出这个项目的改造计划"
```

`--plan` 让程序一启动就进 Plan Mode。你会看到它全程只做"看"和"报方案"：

```text
AI 正在思考...

第 1 轮：AI 调用 list_files ✓
第 1 轮：AI 调用 read_file ✓
第 2 轮：AI 调用 search_files ✓
...
第 19 轮：AI 调用 submit_plan ✓

AI：# powercode-py 后续改造计划：阶段 7 错误自救与熔断 → 阶段 8 LangGraph → ...
```

关键证据在这：**从头到尾只有 `list_files`、`read_file`、`search_files`、`submit_plan`，一次 `write_file`/`edit_file`/`bash` 都没出现过。**不是模型"自觉"，是它手里根本没这几把刀。

交互模式下还能查状态：

```text
> /status
当前模式：plan
当前状态：planning
可用工具：read_file, list_files, search_files, submit_plan
```

`/plan` 之后工具从 6 个缩到 4 个只读的，`/code` 又恢复。

> ⚠️ 免责：上面是 LLM 生成、非固定，你跑出来轮数、计划内容可能不一样；关键是看它**全程只调用只读工具、最后用 `submit_plan` 交方案**，而不是背某句话。

为了跑出这个效果，要写的代码串成一条流水线：

<p align="center"><img src="/images/ch6-roadmap.png" alt="实现路线图" width="12%" /></p>

一句话记图：**第四节立状态机（plan.py），第五节装门禁 + 只读工具（registry + 三个新工具），第六节把动态提示词、审批、落盘接进 Agent 和 CLI。**

## 四、第一步：立一个状态机

先不碰大模型，只做一个专门存 Plan Mode 状态的对象。新建 `powercode_py/plan.py`：

```python
@dataclass
class PlanDraft:
    """待审批或已批准的计划：标题、Markdown 正文、执行步骤。"""
    title: str
    content: str
    steps: list[str]


class AgentState:
    """保存 Plan Mode 运行状态，状态只能通过这些方法改变。"""

    def __init__(self, mode: str = "code"):
        self._mode = mode
        self._status = "planning" if mode == "plan" else "idle"
        self._pending_plan = None   # 待老板签字的方案
        self._approved_plan = None  # 老板已经点头的方案

    def enter_plan(self) -> None:   # /plan：收刀，开始看
        self._mode = "plan"
        self._status = "planning"
        self._pending_plan = None
        self._approved_plan = None

    def submit_plan(self, plan: PlanDraft) -> None:  # 模型交方案
        if self._mode != "plan" or self._status != "planning":
            raise PlanError("只有规划阶段可以提交计划。")
        self._pending_plan = plan
        self._status = "waiting_for_approval"   # 交完就停住等签字

    def approve_plan(self) -> PlanDraft:  # 老板批准
        if self._status != "waiting_for_approval" or self._pending_plan is None:
            raise PlanError("当前没有等待批准的计划。")
        plan = self._pending_plan
        self._mode = "code"
        self._status = "executing"
        self._pending_plan = None
        self._approved_plan = plan
        return plan
```

（`enter_code`、`refine_plan`、`cancel_plan`、`finish_execution` 这几个方法照旧，就是在这几张状态之间切来切去。）

看最核心的三个动作，全是"状态切换"：

```text
enter_plan()   老板说先别动 → 收刀，进入 planning
submit_plan()  模型交方案   → 进入 waiting_for_approval
approve_plan() 老板签字     → 发刀，进入 executing
```

两个关键点：

1. **mode 和 status 各管一摊**：`mode` 决定"有没有刀"，`status` 决定"走到哪一步"。缺一个都会出岔子——只有 mode，你不知道该停还是该继续；只有 status，你不知道该不该发刀。
2. **状态只能从这些方法进**：模型不能自己改状态。`submit_plan` 里那行 `if ... raise` 就是防跳步——在 Code Mode 下直接交方案、或没有待批方案时直接批准，都会当场报错。

还有一个 `PlanDraft`，别被名字唬住，它就是"待审批方案"的数据格式：`title`（后面用来生成任务目录名）、`content`（完整的 Markdown 计划正文，给老板看也给模型执行）、`steps`（从正文里提炼的执行步骤，用来生成 TODO）。

## 五、第二步：装门禁，再配三个只读工具

状态机有了，接下来让"只读"落地。这需要两样：三个只读工具 + Registry 的双层拦截。

### 5.1 三个只读工具 + 一个"交方案"工具

第五篇已经有了 `read_file`。Plan Mode 还缺三个：

- `list_files`：看目录结构（给模型一张"项目地图"）。
- `search_files`：按关键词搜代码。
- `submit_plan`：交方案，触发"等签字"。

前两个"只读"，不会碰任何文件。新建 `powercode_py/tools/list_files.py`（`search_files.py` 结构同理）：

```python
MAX_ITEMS = 200                                   # 最多列 200 项，别一次撑爆上下文
SKIPPED_DIRECTORIES = {".git", ".powercode", "dist", "node_modules"}


class ListFilesTool:
    name = "list_files"
    definition = {
        "type": "function",
        "function": {
            "name": "list_files",
            "description": "递归列出当前项目中的文件和目录。",
            # ... parameters 省略
        },
    }

    def execute(self, arguments_json: str) -> str:
        start = resolve_in_work_dir(self.work_dir, _parse_path(arguments_json))
        items = []

        def walk(directory):
            if len(items) >= MAX_ITEMS:           # 满了 200 项就停，不再往下钻
                return
            for entry in sorted(directory.iterdir(), key=lambda p: p.name):
                if len(items) >= MAX_ITEMS:       # 循环里再查一次，满了就撤
                    return
                if entry.is_symlink():
                    continue                      # 跳过符号链接，别走出工作目录
                if entry.is_dir() and entry.name in SKIPPED_DIRECTORIES:
                    continue                      # 跳过 .git/.powercode/node_modules
                display = str(entry.relative_to(self.work_dir)).replace("\\", "/")
                items.append(f"{display}/" if entry.is_dir() else display)
                if entry.is_dir():
                    walk(entry)

        walk(start)
        return "\n".join(items)
```

`list_files` 只干一件事：**把"项目里有哪些文件"报给模型，正文一个字符都不碰。**它有两道保险：跳过符号链接（防止走出工作目录）、跳过 `.git`/`.powercode`/`node_modules`（少刷无关内容）；再封顶 200 项（别一次撑爆上下文）。

`submit_plan` 更特别——它不返回什么内容，它的作用是"喊一嗓子"：

```python
class SubmitPlanTool:
    name = "submit_plan"

    def __init__(self, state: AgentState):
        self.state = state

    def execute(self, arguments_json: str) -> str:
        plan = _parse_plan(arguments_json)   # 校验 title/content/steps 非空
        self.state.submit_plan(plan)          # 状态切到 waiting_for_approval
        return "计划已提交，等待用户审批。"
```

`_parse_plan` 会先验货：`title`、`content` 得是非空字符串，`steps` 得是非空字符串数组，哪样不合格就当场报错，绝不放一份缺胳膊少腿的方案进门。

### 5.2 门禁要做两道，不是一道

光"不发写工具的定义"还不够。万一模型凭空编出 `write_file` 这个工具名呢？所以 `powercode_py/tools/registry.py` 改了这两处：

```python
def get_definitions(self, allowed_names=None) -> list[dict]:
    # 第一道门：只把当前模式允许的工具定义发给模型
    return [
        tool.definition
        for tool in self._tools.values()
        if allowed_names is None or tool.name in allowed_names
    ]

def execute(self, name, arguments_json, allowed_names=None) -> str:
    # 第二道门：真正执行前，再拦一次
    if allowed_names is not None and name not in allowed_names:
        raise ToolError(f"当前模式不允许调用工具：{name}")
    tool = self._tools.get(name)
    if tool is None:
        raise ToolError(f"找不到工具：{name}")
    return tool.execute(arguments_json)
```

两道门是这样配合的：

```text
发菜单前   write_file / edit_file / bash 这三样根本不进菜单（不发定义）
端菜前     就算模型硬喊出这些名字，前台也拒单（执行前拦截）
```

所以 Plan Mode 的"只读"到这里，才不是一句空话。

## 六、第三步：串起来，让审批真正跑通

### 6.1 Agent 按模式挑工具、挑提示词

`powercode_py/agent.py` 里，模型能拿到什么工具、看到什么提示词，都由状态机决定：

```python
PLAN_TOOL_NAMES = {"read_file", "list_files", "search_files", "submit_plan"}
CODE_TOOL_NAMES = {
    "read_file", "list_files", "search_files",
    "write_file", "edit_file", "bash",
}

def _allowed_tool_names(self):
    return PLAN_TOOL_NAMES if self.state.get_mode() == "plan" else CODE_TOOL_NAMES

def _build_system_prompt(self) -> str:
    if self.state.get_mode() == "plan":
        return CORE_SYSTEM_PROMPT + PLAN_MODE_PROMPT
    approved = self.state.get_approved_plan()
    if approved:
        return CORE_SYSTEM_PROMPT + EXECUTION_PROMPT + f"\n\n{format_plan(approved)}"
    return CORE_SYSTEM_PROMPT
```

提示词也拆成三段：`CORE`（通用店规）、`PLAN_MODE`（只读阶段：先探索、别瞎猜、最后必须交 `submit_plan`）、`EXECUTION`（执行阶段：先读 `PLAN.md` 和 `TODO.md`，做完一步勾一步）。

注意，提示词只是**锦上添花**，不是安全边界。就算模型无视"不能改文件"，Plan Mode 也拿不到写工具——这是第五节 Registry 的意义。

另外，上一版 `MAX_STEPS = 8` 对"读项目、写方案、改多文件、逐项验证"这种长任务不够用，这里提到 30：

```python
MAX_STEPS = 30

# run() 里拿它当循环上限，满 30 轮还交不出方案就报"执行超过 30 轮"：
for step in range(1, MAX_STEPS + 1):
    ...
```

它的"体现"就在 `run()` 那圈 `for step in range(1, MAX_STEPS + 1)` 上——旧值 8 会把长任务提前掐断，30 才够它读完项目、写完方案、改完多个文件再逐项验证。

### 6.2 交完方案就停住，别让模型自己批准自己

这是整篇最关键的一步。模型调用 `submit_plan` 后，状态变成 `waiting_for_approval`，Agent Loop 必须马上停住。`agent.py` 的 `run()` 里，在本轮工具都跑完之后加一道检查：

```python
if self.state.get_status() == "waiting_for_approval":
    plan = self.state.get_pending_plan()
    if plan is None:
        raise AgentError("计划状态异常。")
    return format_plan(plan)   # 直接 return，结束本轮 Agent Loop
```

这句 `return` 会立刻结束 `run()`，外层 `for step` 不会再进下一轮，也就不会继续请求模型。所以"Agent Loop 暂停"的准确说法是：

```text
停止继续调模型 → 把完整方案返回给 CLI → 进程继续跑，等着老板输入
```

"暂停"这个词有点误导——代码里并没有一个循环停在那儿等你。真实情况是：`run()` 直接 `return` 了，这轮 Agent Loop 整个结束；CLI 拿到返回值，才弹出菜单、堵在 `input()` 上等你。

### 6.3 CLI 弹审批菜单，批准后才落盘

最后是 `powercode_py/cli.py`。交互循环里先认三个命令：

```python
if value == "/plan":
    state.enter_plan()
    print("已进入 Plan Mode，只能读取和搜索项目。")
    continue
if value == "/code":
    state.enter_code()
    print("已进入 Code Mode。")
    continue
if value == "/status":
    _print_status(state)
    continue
```

每次模型跑完，就检查要不要审批：

```python
def _review_pending_plan(agent, state, work_dir):
    while state.get_status() == "waiting_for_approval":
        print("\n请选择：\n1. 批准并执行\n2. 继续修改计划\n3. 取消\n")
        choice = input("选择：").strip()
        if choice == "1":
            plan = state.approve_plan()                 # 发刀，进入 executing
            files = save_approved_plan(work_dir, plan)  # 落盘 PLAN.md + TODO.md
            print("\n计划已批准，已进入 Code Mode。")
            print(f"已创建任务目录：{files['task_dir']}\n")
            _run_prompt(agent, f"计划已经批准。\n计划文件：{files['plan_path']}\n执行清单：{files['todo_path']}\n请先读取这两份文件，从第一项未完成任务开始执行；每完成一项后立即更新这份 TODO.md。")
            return
        if choice == "2":
            feedback = input("请输入计划修改意见：").strip()
            if not feedback:
                print("修改意见不能为空。")
                continue
            state.refine_plan()                          # 退回 planning，让模型改
            _run_prompt(agent, f"请根据下面的反馈修改计划，并再次调用 submit_plan：\n{feedback}")
            continue
        if choice == "3":
            state.cancel_plan()
            print("\n计划已取消，已返回 Code Mode。")
            return
        print("请输入 1、2 或 3。")
```

菜单三个选项，对应三条路：

```text
1 批准并执行  发刀 + 落盘 + 自动开始执行
2 继续修改    退回 planning，让模型按意见改完再交一次
3 取消        清空方案，回到 idle
```

批准后真正"落盘"的是 `powercode_py/plan_files.py` 的 `save_approved_plan`，它在 `.powercode/tasks/<plan-name>/` 下写两份文件：

```text
.powercode/tasks/20261112-143012000-重构登录模块/
├── PLAN.md    # 老板批准的方案，保持稳定
└── TODO.md    # 从 steps 生成，执行时逐项打勾
```

两处得盯紧：

1. **目录名不能直接抄模型给的标题**：模型可能起个带空格、斜杠甚至 `..` 的标题，直接拿它当目录名，轻则路径乱套，重则跟之前的任务重名互相覆盖。所以 `_create_task_name` 先 NFKC 归一化、把非字母数字换成 `-`、截到 60 字符，再拼上毫秒时间戳。
2. **落盘是 Harness 干的，不是模型**：Plan Mode 里模型没有 `write_file`。这两份文件是**老板批准之后**由 Harness 自己写的，不是模型在只读阶段偷偷写进去的。

## 七、踩坑：这五个坑，掉进去的人最多

### 7.1 以为光说"只读"就行——刀还在手里，等于没门禁

只要模型还能拿到写工具，"只读"就是假的。必须**同时**藏定义 + 执行前再拦，缺一道都不算数。

### 7.2 方案一交就当批准了——那审批就是走过场

`submit_plan` 之后必须把状态切到 `waiting_for_approval` 并停住 Agent Loop，否则"审批"只剩一行字。

### 7.3 没签字的方案当成"正在做"

方案里的勾选清单，在老板点头之前只是"打算怎么做"，不是"正在做"。所以 `TODO.md` 要等批准后才生成。

### 7.4 给 Plan Mode 发把 bash 刀

有人会想"给 bash 套个白名单，只放行 `cat`/`grep`/`find` 这些只读命令"——行不通。命令能套管道、加重定向、用 `$(...)` 命令替换，光看开头几个字根本拦不住。所以第一版干脆不给 bash，换成专用只读工具，最省事也最清楚。

### 7.5 拿模型给的标题直接当文件夹名

模型给的标题别当路径用——它可能带斜杠、`..` 这些字符，还可能跟上一个任务重名。清洗 + 加时间戳再建目录（细节见 6.3）。

## 八、这期到底干成了啥？

回头看，这期最值钱的，是把"能不能动手"这道关，从嘴上挪到了程序里。

以前，模型跟后厨一样，点完菜就能动刀；现在它得先走三步：

```text
规划阶段   只给眼睛，不给刀
审批阶段   Agent Loop 停手，等老板拍板
执行阶段   发刀，照着方案干
```

最关键的分界是这一句：**Plan Mode 做的，是把"先别改"从一句口头提醒，变成一道真的收走刀的闸门。**这层边界一旦立起来，往后想扩展、想调优，都只是在这套状态机上添砖，不用推倒重来。

## 九、下集预告

现在 Plan Mode 管住了"先想清楚再动手"。但 Agent 真正改起项目来，还是会撞上另一个更常见的问题：bash 报错了，它换个参数又试一次，还是同样的错，就这么一直重试到耗尽轮数。

下一篇，给它加一层**错误自救与熔断**：把失败分好类、告诉它"哪类错、该怎么换策略"，再给重复失败设个上限，别再让它原地打转。
