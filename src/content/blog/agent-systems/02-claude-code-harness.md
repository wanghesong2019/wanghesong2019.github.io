---
title: "拆解 Claude Code：coding agent 是怎么「看着完成」任务的？"
column: "agent-systems"
date: 2026-11-16
order: 2
description: "上一篇讲了 agent 系统的六层栈，并抛出一个结论：agent 不是\"带工具的 LLM\"，而是一台\"新的计算机\"。这一篇，把最顶层的那台\"计算机\"——Claude Code拆开，看它到底怎么运转的。"
juejin: "https://juejin.cn/post/7708565080220483627"
---

> 这是「AI Agent 系统底层」系列的第2篇。上一篇我讲了 agent 系统的六层栈，并抛出一个结论：agent 不是"带工具的 LLM"，而是一台"新的计算机"。这一篇，我把最顶层的那台"计算机"——Claude Code——拆开，看它到底怎么运转。

先说一个几乎每个用过 Claude Code 的人都有的错觉。

你给它一句"把这个失败的 auth 测试修好"。它自己 grep 定位到 `session.py`，read 打开看了一遍，edit 改了几行，跑 `pytest`，红了，再改，再跑，全绿，然后把改动 commit 了。你看着这一套行云流水的操作，心里冒出一句："这模型真聪明。"

我要泼一盆冷水：**这一整套里，模型贡献的聪明，比你想象中少得多。** 大部分让你觉得"聪明"的东西——它怎么知道该读哪个文件、怎么在跑偏时停下来、怎么记住你们之前的约定——根本不是模型干的，是外面那层 harness 干的。

这一篇，我把 Claude Code 从你打字那一刻开始，一步步拆到底，回答一个问题：**一个 prompt 进去，到任务完成，中间到底发生了什么？以及"聪明"到底是谁的功劳。**

---

## 一个 prompt，不是一次请求，是一串循环

大多数人潜意识里把"用 Claude Code"当成"跟 ChatGPT 聊天"的变体：你发一句话，模型回一句。错了，错得离谱。

课程里的原话是：**"One user prompt = many model calls and many tool executions, not a single request."（一个用户 prompt = 很多次模型调用 + 很多次工具执行，不是一次请求。）**

拆开看，你那一句"修好 auth 测试"，展开之后是这样一个交替的链条：

```
U(prompt) → M₁(推理) → T₁(工具) → M₂(推理) → T₂(工具) → … → Mₙ(推理) → A(回答)
```

具体到那个测试：`pytest → read session.py → grep authentication → create_session → edit session.py → pytest`，一路跑下来，每一步的推理都**被上一步的工具结果重新塑造**。

<p align="center"><img src="/images/d2-loop.png" alt="一个 prompt 展开成多轮调用" width="30%" /></p>
<p align="center"><small>▲ 一个 prompt 展开成多轮推理 + 工具调用的循环</small></p>

这就是 agent 的循环（agentic loop），三步一轮：

1. **Gather context** —— 收集上下文：prompt、文件内容、工具结果
2. **Generate action** —— 生成一个动作：跑个 bash、读个文件、改个文件
3. **Run tool** —— 执行工具：跑测试、看输出、重新读状态

然后重复，直到任务完成。

理解这个循环，你才能理解后面的所有事。因为**模型在每一步里只做一件事：根据当前上下文，提出下一个动作建议。** 注意我的用词——"建议"。

---

## 模型只负责"提议"，harness 才负责"执行"

这是 Claude Code 架构里最反直觉、也最关键的一层分离，很多人用了半年都没意识到。

看这个流程：

```
Claude 模型          发出一个请求：Bash("pytest")
        ↓
Claude Code harness  解析它、检查权限、执行它
        ↓
你的机器             pytest 真正跑起来 → stdout/stderr
        ↓
tool_result          回到模型的上下文里
```

**模型提出"我想跑 pytest"，真正跑 pytest 的是 harness，不是模型。** 模型从头到尾没有执行任何东西的能力，它只是在一轮一轮地"提议"。

为什么要这么设计？因为在这"提议"和"执行"之间，隔着一层**权限（permission）**。

模型提议 `Bash("rm -rf build/")` 的时候，权限层会跳出来：这个命令到底允不允许跑？课程里给了三种结局：

- **allowed** —— 直接跑
- **ask** —— 你先确认
- **denied** —— 什么都不发生

而且这个权限判断可以是**手动**的（弹出来让你点 Accept/Deny），也可以是**自动**的（一个小模型在背后检查这个命令安不安全）。

<p align="center"><img src="/images/d2-propose.png" alt="模型提议 harness 执行" width="30%" /></p>
<p align="center"><small>▲ 模型只提议，harness 才执行——中间隔着权限层</small></p>

这一步，就是 harness 和模型的分工里最值钱的地方：**模型负责"想做什么"，harness 负责"该不该让你做"。** 把"判断力"和"执行力"拆开，是传统系统里早就玩烂的权限模型，只不过现在被搬到了 agent 上。

记住这句话，后面你会发现它反复出现：**模型是提案方，harness 是执行方兼裁判。**

---

## 你还没打字，上下文已经 10k+ token 了

另一个反直觉的事实：**你以为上下文是你写的那个 prompt，其实在你敲第一个字之前，上下文已经塞满了好几层东西。**

课程里把"你打字之前"的上下文列了出来：

- **SYSTEM** —— Claude Code 的指令
- **PROJECT** —— 环境信息
- **MEMORY** —— 持久化的项目/用户笔记、CLAUDE.md
- **TOOLS** —— Read、Edit、Bash、Glob、Grep、Web、Agent 这些工具的定义
- **SKILLS / MCP** —— 各种 skill 和 MCP 的**名字和描述**
- **USER** —— 你即将敲的那句"修好 auth 测试"

粗算一下，这里已经 **10k+ token** 了。而且注意最后一行最关键：**skill 和 MCP 一开始只加载"名字和描述"，不加载正文。** 正文要等模型真正"伸手去用"那个 skill 的时候，才被读进来。

这就是第1篇里埋过伏笔的**三级渐进加载**——名称常驻、正文按需、资源最后再开。它存在的唯一理由：**上下文是钱，能省就省。**

同理，还有一个更隐蔽的设计：**Claude Code 不会把你的整个仓库发给模型。**

你的仓库在磁盘上躺着几千个文件，但模型只会按需去"拉"。它想找认证相关代码，就 `Grep("authentication")`，回来几行匹配，这几行才进入上下文。**它不知道你仓库里还有几百个它没读过的东西，也不需要知道。**

---

## 记忆：上下文是租的，记忆是买的

现在进入 Claude Code 最被低估、也是我最想让你记住的一块：**记忆（memory）**。

先记住一个残酷的事实：**LLM 是无状态的。** 两次会话之间，它什么都不记得。每次 session 开始，都是一张白纸。

那"记忆"哪来的？课程给了个特别朴素的答案：**在实践中，"记忆"就是 session 启动时加载进来的那几个文件。**

于是记忆分成了两种：

| | 上下文（context） | 持久记忆（memory） |
|---|---|---|
| 是什么 | 模型"现在"能看到的东西 | 能活过 session、下次重新加载的东西 |
| 生命周期 | 随 session 死 | 跨 session 活 |

而持久记忆，又分两个来源，都靠文件承载：

- **CLAUDE.md** —— **你**写的，写的是规则和指令
- **Auto memory** —— **Claude**写的，记的是它从你身上学到的偏好和模式

CLAUDE.md 的加载有讲究，从最宽的范围到最窄的，依次是：组织级 → 用户级（`~/.claude/CLAUDE.md`）→ 项目级（`./CLAUDE.md`）→ 本地级（`./CLAUDE.local.md`），最近的那份最后读、优先级最高。

而 Auto memory 更精妙一点：它有个 `MEMORY.md` 做**索引**（每次 session 加载前 200 行 / 25KB），具体的话题文件存在 `~/.claude/projects/<project>/memory/` 里，**只有任务用到时，才按需读进来**。这又是一个三级加载的实例。

但真正让我记住的是这句话，它值得贴在工位上：

> **"Context is rented, memory is owned."（上下文是租的，记忆是买的。）**

<p align="center"><img src="/images/d2-memory.png" alt="上下文与记忆的对比" width="80%" /></p>
<p align="center"><small>▲ 上下文是租的，记忆是买的</small></p>

翻译成人话：上下文每次 session 都要重新付 token 钱，是房租；记忆你只"买"一次（写进文件），之后每次免费加载。**所以你要精打细算的是——哪些东西值得"买下来"变记忆，哪些东西只配"租"在当次上下文里。**

而且买错了更糟。课程原话：**"Stale memory is worse than none: it actively misleads."（过期的记忆比没有更糟：它会主动误导你。）** 你想，一条过时的 CLAUDE.md 规则，每 session 都加载，每 session 都把你往坑里带。这不是省钱的问题，是害命。

所以 CLAUDE.md 该写什么、不该写什么，是有硬标准的：

**该写**：怎么跑测试/构建/lint、硬约束（"永远别 commit 到 main"）、模型无法廉价推断的事实（目录结构、代码归属、坑）

**不该写**：模型本来就懂的（语言、框架常识）、linter 已经管了的（代码风格）、长篇大论、changelog、任何秘密

一个判断标准：**"这条信息，模型不读会不会犯错？"** 不会，就别写。会，而且每次 session 都需要，才值得进 CLAUDE.md。太多人把 CLAUDE.md 写成了一篇又长又没用的自述。

---

## 四个扩展机制，四个不同的问题

讲完记忆，再讲 Claude Code 怎么被"扩展"。这里有个几乎人人踩的坑，我先亮结论：

**Skill、MCP、Hook、Plugin，是四个解决完全不同问题的东西，它们不可互换。** 混着用，你的配置会一团糟。

课程给它们各自的一句话定位：

- **Skill** —— 决定 agent **怎么**完成一个任务（知识 + 流程）
- **MCP** —— 决定它能**够到**哪些外部数据和动作
- **Hook** —— 决定在生命周期事件上**自动发生**什么
- **Plugin** —— 决定这些扩展**怎么打包分发**

逐个说。

**Skill**，本质是**上下文工程**。一个 skill 就是一个文件夹：`SKILL.md`（描述 + 流程）+ `references/`（参考）+ `scripts/`（脚本）。它最精妙的地方还是那个三级加载——**描述负责被发现，正文负责被加载，文件负责按需打开**。而且课程点了一句很实在的话：**有副作用的 skill，应该要求显式调用**（用户打 `/release` 才跑），不能让模型自己揣摩着就触发了。

**MCP**，是给 agent 接外部的。它的存在理由特别朴素：没有 MCP 之前，N 个 AI 客户端 × M 个外部服务 = N×M 种集成，谁受得了。MCP 把它压成一套标准协议。核心三个原语：**Tools**（能调的动作）、**Resources**（能读的数据）、**Prompts**（可复用的提示模板）。但课程把 MCP 的安全单独拎出来讲了半页，我觉得这才是从业者最该听的：

- **最小权限** —— token 只 scope 到你真需要的那个 repo/表/频道
- **读写分离** —— 读和写分开，写操作留在审批后面
- **别信工具输出** —— 返回的内容永远当成数据，不当成指令（这是 prompt injection 的入口）
- **装之前先审查** —— 第三方 server 可能带注入

**Hook**，是生命周期自动化。session 从左到右走，每个标记事件都能挂一个钩子：session start、user prompt、before tool use、after tool use、before stop。它和 skill 的区别一句话就能讲清——**skill 是"知识"，hook 是"强制"**。你要"每次 edit 之后自动 format"，这是 hook 的活，因为"每次"和"自动"意味着它不依赖模型记得这件事。课程里那句"**No hook, reasoning is not an event**（没有 hook——因为'模型在思考'不是一个事件）"点得很透：凡是需要模型"记得去做"的，都不该交给 hook；hook 只挂在能确定触发的时刻上。

**Plugin**，最没技术含量但最实用：把 skill、hook、agent、MCP 配置打包成一个可安装单元，一键装、带版本、能分发。它就是"怎么把你这一套好用的配置变成别人也能装的东西"。

一句话收束这节：**判断、能力、强制、分发，四个机制各管一段，别指望一个 skill 干完 MCP 的活。**

---

## 三个反直觉点

我把这一篇里最反直觉、最容易理解错的东西，抽成三点。

**反直觉点一：Claude Code 的"聪明"，一大半在 harness，不在模型。**

这是全文的题眼。模型从头到尾只干一件事：看上下文，提下一个动作建议。它没有执行能力，没有记忆，没有权限判断。让它看起来"聪明"的——按需拉文件、权限卡点、自动 compaction、CLAUDE.md 记忆、skill 三级加载——全是 harness 在背后兜底。所以别人问你"用的什么模型"，你该反问一句："你问的是模型，还是它外面那层 harness？"绝大多数效果的差异，出在后者。

**反直觉点二：上下文不是白用的，每一笔常驻 token 都是房租。**

你的系统 prompt、你的 CLAUDE.md、你装的那堆 skill 描述、MCP 工具定义——这些在每次 session 一开始就吃掉 10k+ token，而且**每一次都要重新付钱**。课程里还有一句补刀：**prefix-cache 的读取，占了大部分成本。** 也就是说，你以为的"模型调用"，大头成本其实在反复读取那段一成不变的前缀。所以一个铁律：**常驻的东西要像管钱一样管**——能三级加载就别常驻，能按需就别全量，过期了就删。

**反直觉点三：上下文会"长大"，长到一定时候会被"压缩"，而压缩是会丢东西的。**

长任务跑到后面，上下文里堆满了模型回复、文件内容、命令输出。涨到一定规模，harness 会做一次 **compaction**——把旧轨迹总结成一段摘要，再重新注入 CLAUDE.md 和 memory。但"总结"意味着**细节被抹掉了**，那些"当初为什么这么决定"的来龙去脉，可能就丢在这次压缩里。这就是为什么课程会说"丢失的决策/假设"是 agent 记忆要解决的核心问题之一。你做的 agent 越跑越长，就越要警惕这次看不见的"断片"。

---

## 放进系列脉络

回到第1篇的六层栈。这一篇，我把**第 2 层（Agent / Harness）**剖开了一半——planning、context、memory、tools、subagents 这几个词，前面都摸到了。但还差两块硬骨头：**多 agent 架构**（第4篇）和**工具设计**（第6篇），它们比这篇讲的更深。

而 Claude Code 里那些"你感觉不到的聪明"，其实都指向后面 Part II 要讲的系统问题：三级加载 → context 成本 → 第10篇 的 token 算术；compaction → 上下文工程 → 第5篇；prefix-cache 吃成本 → KV-cache 复用 → 第15篇。**harness 的每个设计选择，最终都会落到 serving 层的成本上。** 这就是这门课把"agent 设计"和"LLM serving"串成一条线的原因。

| 你在 Claude Code 里看到的现象 | 背后对应的系统问题 | 后续篇目 |
|---|---|---|
| skill/MCP 只加载名字 | 上下文渐进加载 / context 成本 | 第10篇 |
| 上下文涨到被压缩 | 上下文工程 / compaction | 第5篇 |
| prefix-cache 占大头成本 | KV-cache 复用 | 第15篇 |
| 模型只提议、harness 执行 | agent loop 的调度 | 第14篇 |
| 多 subagent 拆活 | 多 agent 编排 | 第4篇 |

---

## 一个可带走的结论

如果这篇只让你记住一句话，记这句：

> **别再只盯着 prompt 和模型了。Claude Code 的"聪明"，一大半在外面那层 harness——上下文怎么加载、记忆怎么沉淀、工具怎么执行、权限怎么卡。你调 prompt 调不动的时候，去调 CLAUDE.md、调 skill 的加载策略、调 hook 的触发时机，往往立竿见影。**

---

## 延伸阅读（也供你溯源）

- **CS2680 Lecture 2 课件**（本文主出处，本地 `slides/2_agent_use_1.pdf`）：Juncheng Yang《How Claude Code Works》，agentic loop、model-proposes/harness-executes、三级加载、四个扩展机制的原始论述都在这里。
- **Best practices for Claude Code**（本地 `articles/claudecode_best_practices.md`）：Anthropic 官方最佳实践，讲怎么给任务配可执行验证、怎么管上下文。
- **How I use LLMs**（本地 `articles/karpathy_how_i_use_llms.md`）：Andrej Karpathy，用具体任务演示模型选择/工具/文件/持久指令怎么改变结果。
- **Agentic Engineering Patterns**（本地 `articles/simonwillison_agentic_engineering_patterns.md`）：Simon Willison，把散落的 agent 实践整理成可复用的模式。
- **Equipping agents with Agent Skills**（本地 `articles/anthropic_agent_skills.md`）：Anthropic，三级渐进加载的官方论述。
- **The Harness Is the Thing**（本地 `articles/fryxell_the_harness_is_the_thing.md`）：Scott Fryxell，把 harness（指令文件、skill、脚本、工作目录）当作核心、模型当作可换零件——本文观点的同路人。

---

*本文是系列第2篇。下一篇（第3篇）拆上下文加载：为什么你的 agent 总在浪费 token，以及 skill/MCP 的三级渐进加载到底怎么帮你省钱。*
