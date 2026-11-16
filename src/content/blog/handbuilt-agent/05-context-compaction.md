---
title: "客人吃完不走——给 AI 发本账，聊长了自动折叠"
column: "handbuilt-agent"
date: 2026-11-12
order: 5
description: "本篇主要目标是让 Agent一次启动能连续追问，对话变长后还会自动把旧内容折叠成摘要，一句话帮Agent把把\"消息放哪\"和\"这轮给模型看啥\"给整明白"
juejin: "https://juejin.cn/post/7707126730373546011"
---

## 为什么会有本系列

本系列是手搓 Agent 教学项目 [Teernage/powercode](https://github.com/Teernage/powercode) 的 Python 重实现版本；为什么要做这个系列呢？是因为当我在掘金社区刷到 @不一样的少年_ 大佬的[【不用框架，手搓 AI Agent】](https://juejin.cn/column/7661531339729829926)系列时，感觉写得很好，但是想深入学习时，发现代码都是 Node/TS 实现。想掌握技术细节，但看得似懂非懂，如果先学习 Node/TS，又感觉成本太高。于是就想着实现一个 Python 版本的手搓 Agent 系列，以便让自己能更深入学习 Agent 的相关技术细节。整理成博客，以便那些熟悉 Python 但不熟 Node/TS 的小伙伴能一起进步成长；当然如果你已有 Node/TS 基础，强烈建议去学习 [【不用框架，手搓 AI Agent】](https://juejin.cn/column/7661531339729829926)系列，真的很棒。再次感谢 Teernage 大佬的开源分享。

本系列的源码 [powercode-py](https://github.com/wanghesong2019/powercode-py)，本篇对应 commit `409c203`；如果你觉得对你有帮助，请点个 star ⭐。

---

> **上篇回顾**：上一篇我们把工具从 1 个扩到 4 个，还配了个前台（Registry）统一调度，AI 已经会读、会写、会改、会跑了。
>
> **本篇目标**：让它别再"金鱼记忆"——一次启动能连续追问，对话变长后还会自动把旧内容折叠成摘要。

## 一、上一秒热聊，下一秒装不认识你

上一期收工后，AI 看着挺能干了：会读文件、写文件、改文件、跑命令。

但你连着敲两条命令，它就露馅：

```bash
powercode "用一句话解释什么是 Python"
# AI 答得头头是道

powercode "那它主要用在哪些领域？"
# AI 懵了：你在问哪个它？
```

第二句里的"它"，AI 完全接不上。不是它脑筋突然短路，也不是存心装傻——是它压根没把上一单记下来，拿什么接着聊？每一次启动，都像店里来了个新客人，点完菜、结完账、走人，服务员把账本当场撕了。下一位客人问"续上刚才那桌"，服务员只能干瞪眼。

问题出在哪？上一篇 `agent.py` 里的消息列表，是 `run()` 的**局部变量**：

```python
def run(self, prompt: str) -> str:
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ]
    # 循环跑完，函数一返回，messages 就没了
```

函数一返回，这摞消息就烟消云散。下一次启动是全新进程，内存里啥也没有。

所以这一篇要干两件事：**让消息有个长期安身的地方（Session 账本）**，再**让账本太厚时能折叠（上下文压缩）**。

## 二、别急着写代码，先分清两个循环

这里有个最容易绕晕的地方：现在会出现**两个循环**，长得像，干的不是一回事。

第一个循环，上一篇就有了——**Agent Loop**：客人点菜 → 后厨做 → 端菜 → 客人再点 → 直到吃饱。它负责"**把眼前这一单**"干完。

第二个循环，这一篇要加——**交互循环**：客人吃完一单，坐着不走，又点下一单，再下一单，直到喊"结账"（exit）走人。它负责"**别让客人吃完一单就被请出去**"。

用图看是这样：

<p align="center"><img src="/images/ch5-concept.png" alt="两个循环与账本概念图" width="25%" /></p>

关键就在中间那个菱形：**只要客人还接着点（还有下一句输入），就回到"点菜"；喊结账（exit/quit）才散场。**

支撑这一切的，是那个"账本"——**Session**。客人每一单点的菜、上的菜、说的话，全按顺序记进账本。之前第 3 篇那个"服务员的小本本"（`messages`），这次给它升个级，专门做成一个"账本"对象，从头到尾攥在服务员手里，不再每单重写。

## 三、先看效果

写完这期代码，你敲：

```bash
powercode
```

（注意：不带任何参数）会进入交互模式，可以连着追问：

```text
已进入交互模式，输入 exit 或 quit 退出。

> 用一句话解释什么是 Python
AI 正在思考...

AI：Python 是一种语法简洁、跨平台、拥有庞大第三方生态的解释型通用编程语言，广泛用于数据分析、人工智能、Web 开发和自动化脚本等领域。

> 那主要用在哪些领域？
AI 正在思考...

AI：Python 的主要应用领域可以概括为数据分析与科学计算、人工智能与机器学习、Web 后端、自动化脚本、爬虫等几大类……

> exit
```

第二句开头的"那"，能接得上，靠的就是账本还攥在服务员手里——上一句聊的 Python，它都还记得。

> ⚠️ 免责：上面是 LLM 生成、非固定，你跑出来措辞可能不一样；压缩在小任务里根本不会触发（要聊到几万 Token 才会）。关键是看它**第二次提问能接上"那"字**，而不是背某句话。

为了跑出这个效果，要写的代码串成一条流水线：

<p align="center"><img src="/images/ch5-roadmap.png" alt="实现路线图" width="15%" /></p>

一句话记图：**第四节建账本（Session），第五节让客人能连续点菜（交互循环），第六节记账重量 + 折叠旧页（Compactor）+ 接进后厨（Agent）。**

## 四、第一步：建账本 Session

先把消息的"长期安身之所"造出来。新建 `powercode_py/context/session.py`：

```python
"""会话：保存同一进程内的完整消息历史与压缩状态。"""

from datetime import datetime


class Session:
    """按顺序保存消息，并记录 Token 用量与压缩进度。"""

    def __init__(self):
        self.created_at = datetime.now()
        self.updated_at = datetime.now()
        self._history = []
        self._compaction = None
        self._usage = None

    def append(self, *messages) -> None:
        """按顺序追加消息。"""
        self._history.extend(messages)
        self.updated_at = datetime.now()

    def get_history(self) -> list:
        """返回完整历史（列表浅拷贝，消息对象不会被内部改写）。"""
        return list(self._history)

    def get_compaction(self) -> dict | None:
        """返回压缩状态 {summary, compacted_until}，未压缩时为 None。"""
        return dict(self._compaction) if self._compaction is not None else None

    def get_usage(self) -> dict | None:
        """返回最近一次 Token 用量 {total_tokens, history_length}。"""
        return dict(self._usage) if self._usage is not None else None

    def save_usage(self, total_tokens: int) -> None:
        """保存最近一次请求的真实 Token 用量。"""
        self._usage = {
            "total_tokens": total_tokens,
            "history_length": len(self._history),
        }
        self.updated_at = datetime.now()

    def save_compaction(self, summary: str, compacted_until: int) -> None:
        """保存压缩结果，并清空旧的 usage 快照。"""
        self._compaction = {"summary": summary, "compacted_until": compacted_until}
        self._usage = None
        self.updated_at = datetime.now()
```

这个账本，先看最核心的两个动作：

```python
session.append(...)   # 按顺序记账
session.get_history() # 取出整本账
```

**这账本现在只活在内存里**。想让它在下次开机接着用，是下一篇写文件的事，第七节细说。

剩下那几个 `save_usage` / `save_compaction` / `get_usage` / `get_compaction`，是给第六节的"压缩"准备的，先放着，回头用得上。

### 让 Agent 把账本接过去

上一篇 `Agent` 是自己 `run()` 里新建消息列表；现在改成从外面收一个 `session`，把每条消息都记进账本。`agent.py` 的关键改动：

```python
class Agent:
    def __init__(self, client: ChatClient, registry: Registry, session: Session):
        self.client = client
        self.registry = registry
        self.session = session
        self.compactor = Compactor(client, client.get_context_window())

    def run(self, prompt: str) -> str:
        self.session.append({"role": "user", "content": prompt})  # 用户的话先记账

        for step in range(1, MAX_STEPS + 1):
            memory = self.compactor.build_working_memory(self.session)  # 从账本取历史（第六节细说）
            messages = [
                {"role": "system", "content": SYSTEM_PROMPT},  # 店规：不记账，每轮现念
                *memory,                                       # 账本里记过的历史
            ]
            # ...请求模型，把回复和工具结果再写回账本
```

**账本（Session）成了消息的主人，Agent 每次要用就翻开，用完接着往里记。**system 提示词是每次都得念一遍的"店规"，不是客人点过的菜，所以不记账、每轮现拼。

## 五、第二步：让客人能连续点菜

账本有了，还得让程序"别问完一个问题就退出"。打开 `powercode_py/cli.py`，加一个交互循环：

```python
def _interactive_loop(agent):
    """交互循环：持续读取输入，直到用户输入 exit/quit。"""
    print("已进入交互模式，输入 exit 或 quit 退出。\n")
    while True:
        try:
            value = input("> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not value:
            continue
        if value in ("exit", "quit"):
            break
        try:
            print("AI 正在思考...\n")
            answer = agent.run(value)
            print(f"AI：{answer}")
        except (ChatError, AgentError) as exc:
            print(f"本轮执行失败：{exc}")
```

关键就两处：

```python
value = input("> ").strip()  # 停在这等客人开口，回车才继续
if value in ("exit", "quit"):
    break                     # 喊结账，散场
```

`input()` 会停在 `>` 后头等你敲字，敲完回车才往下走；Agent 答完，`while True` 又绕回开头继续等。它不会傻乎乎空转烧 CPU——每一轮都老老实实卡在 `input()` 这行，你不敲回车它就不往下走。

还有个**特别容易踩的坑**：账本得是"一桌一本"，从客人坐下用到结账，不能"一句换一本"：

```python
# ✅ 建在循环外，一份 Session 从头用到尾
agent = _build_agent(client, Path.cwd().resolve())  # 里面 new Session + new Agent
_interactive_loop(agent)
```

要是一句换一本，客人每开一次口就领到一本空账，之前点的菜全白记，效果又退回失忆了。

## 六、第三步：账本太厚，就折叠旧页

现在账本会一直记下去了。但新问题冒出来：**账本越记越厚，厨师（模型）的脑子有容量上限，翻不过来。**

### 6.1 为什么不能永远照单全塞

Agent 连续读文件、跑命令、处理报错，账本会越记越厚。厚到一定程度，问题就来了：**厨师（模型）的脑子是有限的，一次只能摊开这么多页。**你把它从头到尾照单全念一遍，它要么记不住你最后点的菜，要么把你最开始要的招牌菜给忘了。

更糟的是，账本里塞的那些几万行的构建日志、报错堆栈，比你的真实需求还占地方——念完这些，正事反而没地儿搁。

那"太厚了就把最旧的撕掉、只留最近几页"行不行？不稳。最旧那几页里，可能就压着你半路改过的需求、当场拍板的决定——撕了，想找都找不回来。

所以这一篇的核心动作就一个：**账本照存整本，但每次只给厨师摊开两样——旧账折成的一张摘要，加最近几页的原文。**账本一个字没少，只是厨师这一轮看到的，是精简过的。

### 6.2 摘要谁来写？模型写，本地只当"搬运工"

这里有个很容易会错意的地方：压缩不是本地代码自己读懂聊天记录、再改写。本地代码笨得很，只会三下：**粗估一下这摞消息多重（UTF-8 字节数 ÷ 4），把它切成"旧的 / 新的"两摞，再把旧的那摞丢给模型写摘要。**

真正的摘要文本，是**模型**写出来的。摘要要保留什么，由一段提示词定死。这段提示词写在 `powercode_py/context/compactor.py` 顶部：

```python
SUMMARY_PROMPT = """你负责压缩一个 AI 编程任务的较早对话。
请只保留后续完成任务真正需要的信息，并严格使用以下结构：

## 用户目标
## 约束与关键决定
## 已完成
## 当前问题
## 已读取或修改的文件
## 下一步

不要编造对话中没有出现的结论。
"""
```

它规定摘要必须保留这六样：目标、约束、已完成、当前卡点、碰过的文件、下一步。模型照着这个格式写，交回来的东西就能直接接着干活——前手做到哪、下一步去哪，都写得明明白白。

### 6.3 怎么知道"该压缩了"？先信秤上的实数

要判断账本有没有超重，得先知道"现在多重"。模型每次回答，接口通常会在 `usage.total_tokens` 里返回**这次请求真实用了多少 Token**。这个数比我们自己估的准，优先信它；只有它**之后新冒出来**的消息，才用"字节数 ÷ 4"补个大概。

所以上一篇的 `complete()` 升级成 `complete_with_usage()`。先看 `chat.py` 的两处改动：

```python
@dataclass
class CompletionResult:
    """一次模型请求的结果：回复消息 + 真实 Token 用量。"""

    message: object
    total_tokens: int | None


class ChatClient:
    def get_context_window(self) -> int:
        """返回模型的上下文窗口上限。"""
        return self.config.context_window

    def complete_with_usage(self, messages, tools) -> CompletionResult:
        completion = self._create(
            model=self.config.model,
            messages=messages,
            tools=tools,
        )
        message = completion.choices[0].message if completion.choices else None
        usage = getattr(completion, "usage", None)
        total_tokens = usage.total_tokens if usage is not None else None
        return CompletionResult(message=message, total_tokens=total_tokens)
```

它并没有多发一次请求——以前接口回包里的 `usage.total_tokens`，`complete()` 看都不看就扔了，这回顺手捡回来，跟 `message` 一起交给上层。

"现在多重"就这么算（`compactor.py` 里的辅助函数）：

```python
def estimate_context_tokens(session: Session, history: list, current: list) -> int:
    """优先使用 API 返回的真实 usage，只估算 usage 之后新增的消息。"""
    usage = session.get_usage()
    if usage is None:
        return estimate_tokens(current)              # 还没真实数，就整个粗估
    trailing = history[usage["history_length"]:]     # 只取 usage 之后新加的消息
    return usage["total_tokens"] + estimate_tokens(trailing)
```

**有真实用量就只补算新消息，没有才整体粗估。**犯不着给每家模型都配一个专用分词器，粗估一下就够用。

### 6.4 触发压缩：整条主流程

再看 `Compactor.build_working_memory()` 的主干：

```python
    def build_working_memory(self, session: Session) -> list:
        history = session.get_history()
        state = session.get_compaction()
        start = state["compacted_until"] if state else 0
        summary = state["summary"] if state else None
        pending = history[start:]                    # 还没被摘要覆盖的部分
        current = self._with_summary(summary, pending)
        usable_tokens = self.max_context_tokens - self.reserve_tokens
        context_tokens = estimate_context_tokens(session, history, current)

        if context_tokens <= usable_tokens:
            return current                           # 没超预算，直接用它

        cut_index = self._find_cut_index(pending)
        if cut_index <= 0:
            return self._with_summary(summary, truncate_large_tool_outputs(pending))

        print(
            f"上下文接近上限（约 {context_tokens} / {usable_tokens} Token），正在压缩较早消息..."
        )

        older = truncate_large_tool_outputs(pending[:cut_index])   # 较早：要折叠
        recent = truncate_large_tool_outputs(pending[cut_index:])  # 最近：留原文

        parts = []
        if summary:
            parts.append(f"# 上一次摘要\n{summary}")
        parts.append(f"# 新增历史\n{json.dumps(older, ensure_ascii=False, indent=2)}")
        summary_input = "\n\n".join(parts)

        completion = self.client.complete_with_usage(
            [
                {"role": "system", "content": SUMMARY_PROMPT},
                {"role": "user", "content": summary_input},
            ],
            [],
        )
        new_summary = ""
        if completion.message is not None:
            new_summary = (completion.message.content or "").strip()

        if not new_summary:
            return self._with_summary(summary, truncate_large_tool_outputs(pending))

        session.save_compaction(new_summary, start + cut_index)
        print("✓ 上下文压缩完成，近期消息继续保留原文。\n")
        return self._with_summary(new_summary, recent)
```

流程走一遍：先算重量，没超就直接用当前内容；超了才切一刀，把较早的一摞交给模型写摘要，最后返回"新摘要 + 最近原文"。

有两个地方得留意：

1. **`reserve_tokens` 得先刨出去**：窗口不能全拿历史填满，总得给模型这轮的回答留块空地。所以"该折叠"的红线是 `contextWindow - reserve`（比如 128K 刨掉预留，超过约 11 万就触发）。
2. **摘要没写成，就当没发生**：模型要是回了空摘要，就保持原样、不更新折叠进度，别把历史给折腾没了。

### 6.5 切一刀，别把一单劈成两半

找切分点是整个压缩里最需要动脑子的地方。`_find_cut_index` 长这样：

```python
    def _find_cut_index(self, messages: list) -> int:
        recent_tokens = 0
        for index in range(len(messages) - 1, -1, -1):
            recent_tokens += estimate_message_tokens(messages[index])
            if recent_tokens < self.keep_recent_tokens:
                continue
            # 找到"最近约 2 万 Token"的大致位置后，向后找下一条 user 消息当分界
            for cut in range(index, len(messages)):
                if messages[cut].get("role") == "user":
                    return cut
        return 0
```

为什么要费劲找一条 `user` 消息？因为**一笔完整的单，是从客人开口（user）开始，接着后厨做菜（assistant 调工具）、端菜（tool 结果）、客人点评（assistant 回答），环环相扣**。比如：

```text
user       帮我看看 deploy/build.py 是怎么打包的
assistant  调用 read_file
tool       返回文件内容
assistant  根据内容回答
```

这四条是一单。要是按 Token 数从中间硬切，很可能把"调用工具"留在摘要里、"工具结果"丢到近期原文里——模型下一轮拿到半截工具调用，看不懂不说，很多兼容 OpenAI 的接口还会因为"工具调用"和"工具结果"对不上，直接把整条请求拒了。

所以 `_find_cut_index` 不追求"刚刚好 2 万 Token"这种漂亮数字，它要找的是一道整单都能完整落位的缝。宁可多留几页，也别把一单劈成两半。

### 6.6 为什么还要留"最近原文"，不干脆全摘要？

因为摘要再准，也是"结论"，会丢掉具体代码、参数、刚读的文件内容这些**当前最要命的细节**。最近的消息（刚读的文件、刚跑的命令结果、还没完成的工具调用）留着原文，模型才接得上手。这也跟长上下文模型常见的"位置偏差"（关键信息在开头和结尾更吃得准，中间容易被忽略）对得上，这里不展开。

顺带一提：`reserve_tokens = 16_384`、`keep_recent_tokens = 20_000` 这俩默认值，是我拍脑袋拍的，不是黄金比例，也没论文背书。换个更小的模型，跟着往下调就行。

最后把 Compactor 接进 `agent.py`——`run()` 里不再直接取 `session.get_history()`，而是先让 Compactor 生成工作记忆：

```python
        for step in range(1, MAX_STEPS + 1):
            memory = self.compactor.build_working_memory(self.session)
            messages = [
                {"role": "system", "content": SYSTEM_PROMPT},
                *memory,
            ]

            completion = self.client.complete_with_usage(
                messages,
                self.registry.get_definitions(),
            )
            message = completion.message
            # ...
            self.session.append(self._assistant_message(message))

            if completion.total_tokens is not None and completion.total_tokens > 0:
                self.session.save_usage(completion.total_tokens)
```

注意顺序：**先 `append` 消息，再 `save_usage`**。因为 `save_usage` 要把 `history_length` 记成"这份用量数到第几条"，得等消息进账之后再数，才数得准。

## 七、踩坑：这三个坑，掉进去的人最多

### 7.1 把 Session 当永久记忆

当前 `Session` 只活在进程内存里——**账本是纸糊的，进程一关就烧成灰。**

它只管**这一桌、这一场**的连续对话，管不了下次开机接着聊。别被 "Session" 这名字唬住，它可不是数据库，断电就清零。

### 7.2 把摘要当绝对事实

摘要是模型写的，不是从账本里逐字抄的。它可能把一个端口号记岔了，也可能把你"随口提过的想法"当成"已经拍板的决定"。所以摘要只能拿来省地方，不能当任务账本。这也是为什么 Compactor 不把所有消息都折叠，而是坚持留最近一段原文。

### 7.3 把 contextWindow 填成统一默认值

`provider.json` 里要多加一个 `contextWindow`，填**当前模型真实的上下文上限**：

```json
{
  "baseURL": "https://api.example.com/v1",
  "apiKey": "replace-with-your-api-key",
  "model": "your-model-name",
  "contextWindow": 128000
}
```

这个数填错，两头都遭殃。举个例子：你的模型实际只有 32K 上下文，却照抄了别人的 `128000`——那 Agent 会一直觉得自己还有大把空地，等到真撞上模型上限报错，它一次折叠都还没触发。反过来，模型明明是 128K，你偷懒填成 32K——它聊几句就慌慌张张折叠，白烧摘要请求不说，还把你没聊完的细节提前压没了。所以照着模型官方规格填，别图省事照抄别人的数。

## 八、这期到底干成了啥？

这期真正的活儿，就是把"消息放哪"和"这轮给模型看啥"这两件事掰开、理顺。理顺之后，账本（Session）、交互循环、折叠器（Compactor）各管一摊，互不掺和。

最值钱的是这一下：**账本存整本，厨师只看当页。**这俩一分开，往后想落盘、想规划、想换压缩算法，都只动"当页怎么挑"这一层，Agent Loop 那圈循环一个字不用改。

## 九、下集预告

现在 AI 能连续追问、也会自动折叠旧账了，但它还是一问就动手——你说"先看看、先别改"，它照样抡起 `write_file` 就上。

下一篇，给它加个 **Plan Mode**：先只读着调查项目，交出一份计划，等你点头了才放它动手；批下来的计划还会写进 `PLAN.md`、`TODO.md` 落到磁盘，进程重启也找得回进度。
