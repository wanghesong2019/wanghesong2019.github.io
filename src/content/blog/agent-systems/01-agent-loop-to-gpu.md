---
title: "从 agent loop 到 GPU：一个 AI Agent 系统到底分几层？"
column: "agent-systems"
date: 2026-11-16
order: 1
description: "这篇文章想讲清楚：一个 AI agent 系统，从用户点下回车，到最后 GPU 吐出一个 token，中间到底叠了几层？ 以及为什么绝大多数人只活在顶上两层，却把真的成本和延迟，都丢给了下面四层"
juejin: "https://juejin.cn/post/7708182272193904683"
---

> 这是「AI Agent 系统底层」系列的第1篇。系列跟着哈佛 CS2680《Modern AI Systems: Agents and System Optimizations》的脉络走，但视角是我自己的：一个天天和 agent 打交道的从业者，把"agent 到底是怎么跑起来、为什么这么慢、钱花在哪了"这件事，一层一层拆到底。

先说一个我反复在真实项目里撞见的场景：

你花两天调了一个 agent。prompt 写得清清楚楚，工具 schema 也磨了好几轮，换了更强的模型之后，任务成功率确实上去了——但你发现，成本翻了 3 倍，端到端延迟到了不可接受的地步，而且同一个任务跑两次，结果还可能不一样。

这时候你停下来想优化，脑子里冒出来的第一个念头是"换个便宜点的模型"或者"把 prompt 写短一点"。**这就是问题所在**：你是在用"调 LLM 应用"的思路，去优化一个本质上是"计算机"的东西。瓶颈根本不在 prompt，而在你看不到的那几层里。

这篇文章想把这件事讲清楚：**一个 AI agent 系统，从用户点下回车，到最后 GPU 吐出一个 token，中间到底叠了几层？** 以及更关键的一句——**为什么绝大多数人只活在顶上两层，却把真正的成本和延迟，都丢给了下面四层。**

---

## 先把一个概念立住：agent 不是"带工具的 LLM"

业内对 agent 有个含糊的共识：LLM + 工具 + 循环，就是 agent。这句话不算错，但太轻了，轻到它会误导你所有的技术决策。

哈佛这门课的导论里给的定义是：

> 一个 AI agent 是一个**自治的软件系统**，它用 AI 模型去推理一个目标，调用外部工具，执行多步动作，直到任务完成。

注意"自治"和"多步"这两个词。它们才是 agent 区别于"一次问答"的地方。

而 agent 的工作方式，是一个循环（agent loop），五步：

1. **plan** —— 把任务拆成子步骤
2. **act** —— 调用外部工具（API、数据库、文件……）
3. **observe** —— 解释工具返回的结果
4. **adapt** —— 根据新信息修订计划
5. **deliver** —— 返回最终结果

<p align="center"><img src="/images/d1-loop.png" alt="agent 的五步循环" width="85%" /></p>
<p align="center"><small>▲ agent 五步循环：plan → act → observe → adapt → deliver</small></p>

这套循环，任何一个做过 agent 的人都不陌生。但我要你把它往深里想一层：**这个循环里，每一步的"执行体"和"执行时间"是完全不同的**。plan 是一次推理，act 可能是一次网络请求（几十毫秒到几秒不等），observe 可能又要读一大段上下文。这就是后面所有系统问题的根源——我们先按下不表，稍后回来。

---

## 一个更狠的类比：LLM 是一台"新的计算机"

这是我认为这门课导论里最有价值的一个观点，也值得每一个 agent 从业者刻在脑子里：

> **LLM 不止是一个"更聪明的 CPU"，它是一种全新的可编程计算机——有着完全不同的编程模型，和完全不同的失败模型。**

把 agent 和传统计算机逐层对照，你会发现这个类比严丝合缝：

| 传统计算机 | AI Agent |
|---|---|
| CPU | LLM |
| RAM / 工作内存 | 上下文窗口（context window） |
| 外设（peripherals） | 工具（tools） |
| 操作系统 | Agent Harness |
| 应用程序 | Agent |

这个类比厉害在哪？它逼你换一套思考框架。

当你把 LLM 当"函数"时，你会问"这个 prompt 该写成什么样"。当你把 LLM 当"CPU"时，你会开始问"这个进程的**内存**（上下文）是怎么管理的？这些**外设**（工具）的调用是同步还是异步？这个**操作系统**（harness）在崩溃之后能不能恢复？"

而这些问题，恰好对应了传统操作系统、传统分布式系统花了几十年才解决的那些问题。只不过在 agent 的世界里，它们被重新发明了一遍，而且大部分从业者还没意识到需要去解决。

课程里甚至有一句让我印象很深的话，用来描述 LLM 这个"奇怪计算机"的矛盾性：**它同时是超人，又是低能儿。**

- **超人之处**：海量事实记忆、语言、模式匹配、写代码、跨领域操作。
- **低能之处**：没有持久记忆、不可靠地理解上下文、幻觉、不知道自己不知道什么、扛不住对抗性输入。

这句话不是我编的，是 Andrej Karpathy 在"Software is changing (again)"那场演讲里反复强调的观点，课程也把它列为必读。理解这个矛盾，你就理解了为什么 agent 需要 harness、需要记忆层、需要工具、需要护栏——**因为 LLM 这台 CPU 天生有缺陷，所有这些"外挂"，都是在补它的短板。**

---

## 全景：agent 系统的六层栈

理解了"agent = 新计算机"之后，这门课真正的主角登场了——一张六层的栈图。这张图是整门课的骨架，后面 19 篇文章，全是在往这张图的某一层里钻。

从顶到底，六层是：

```
Application / User
   │
Agent / Harness      planning · context · memory · tools · subagents
   │
Model
   │
Serving System       batching · scheduling · routing · caching
   │
Runtime / Kernels    CUDA · Triton · collectives
   │
Hardware             GPU · CPU · memory · network · storage
```

<p align="center"><img src="/images/d1-stack.png" alt="agent 系统的六层栈" width="15%" /></p>
<p align="center"><small>▲ agent 系统的六层栈：从应用一路到底层 GPU</small></p>

我逐层说人话，并标出每层"从业者最该关心、却最常忽略"的那个点：

**第 1 层 · Application / User（应用层）**
你的产品。大多数人在这一层花 90% 的时间。这没问题，但问题是：如果你只在这一层打转，你能优化的上限，就是"prompt 写得好一点"。

**第 2 层 · Agent / Harness（智能体层）**
这是 agent 的灵魂。planning（规划）、context（上下文管理）、memory（记忆）、tools（工具）、subagents（子智能体），全在这里。**这一层是 Part I 的主角**——后面 第2篇 到 第9篇，全在拆这一层。一个残酷的现实是：大部分 agent 项目的差异，不在模型，而在这一层的设计。

**第 3 层 · Model（模型层）**
就是你调的那个 API，或者你 serve 的那个权重。注意它在栈里的位置——它只是中间一层，不是全部。

**第 4 层 · Serving System（推理服务层）**
batching（批处理）、scheduling（调度）、routing（路由）、caching（缓存）。**这是大多数 agent 从业者的知识盲区**，也是成本和延迟的黑洞所在。你以为"调用一次模型 API"是一个原子操作，实际上它背后是几十个请求在抢 GPU、在排队、在等 KV-cache。这是 Part II 的主角（第10篇 到 第20篇）。

**第 5 层 · Runtime / Kernels（运行时/算子层）**
CUDA、Triton、集合通信。FlashAttention 就活在这一层。绝大多数人不碰这一层，但这一层的优化（比如一个 attention kernel 的 IO 优化）带来的加速，往往比你在应用层抠三天 prompt 还大。

**第 6 层 · Hardware（硬件层）**
GPU、CPU、内存、网络、存储。你不需要懂显卡布线，但你需要知道 prefill 和 decode 在硬件上是两个完全不同的瓶颈——这个我下面重点讲。

---

## 为什么"agent"是个系统问题，而不是模型问题

这是全文最重要的一节。让我用一个对比把这件事钉死。

传统 LLM 推理服务，长这样：

```
request  →  inference  →  response
```

一次请求，一次推理，一次响应。干净。

而 agent 服务，长这样：

```
infer → tool → infer → tool → retrieval → infer → …
```

<p align="center"><img src="/images/d1-serving.png" alt="传统 LLM 服务 vs Agent 服务" width="85%" /></p>
<p align="center"><small>▲ 传统 LLM 服务（一次请求）vs Agent 服务（一条交织的长链）</small></p>

**一次任务，是一串推理和工具调用交织的长链。** 课程里点出了这条链的三个致命特征：

1. **步骤之间有依赖**：下一步的 prompt 依赖上一步工具的结果，所以不能无脑并行。
2. **每一步延迟差异巨大**：推理可能几百毫秒，工具调用可能几秒，甚至要等人（human-in-the-loop）。
3. **关键路径横跨一切**：一次 agent 任务，关键路径会穿过 GPU、CPU、存储、网络，还有外部服务。

这意味着什么？**你哪怕把模型推理做到极致快（tokens/sec 拉满），只要中间夹着一次 3 秒的工具调用、一次 200ms 的排队，你的端到端延迟照样烂。** 反过来，你在应用层抠半天 prompt，结果瓶颈在一个没做好的调度队列上。

所以这门课敢下一句重话——**agent 是个系统问题，不是模型问题。**

---

## 反直觉点一：throughput 是错的优化目标

这句话值得单独拿出来，因为它是整门课价值观的地基：

> **Throughput is the wrong objective for an agent.（吞吐量，是 agent 错误的优化目标。）**

传统推理服务，大家都在卷 tokens/sec（每秒生成多少 token）。这没错，因为对"一次请求一次响应"的纯 LLM 服务来说，吞吐量就是钱。

但 agent 不一样。一个 agent 任务的成功，取决于**端到端能不能成**，而不是每秒吐多少 token。课程给的优化目标是这样一串约束：

```
maximize   task success（任务成功率）
subject to latency / cost / resources / reliability / security
```

翻译成人话：**在延迟、成本、资源、可靠性、安全这五条约束下，最大化任务成功率。**

更狠的是这个指标——**$ / successful task（每个成功任务花多少钱）**，而不是 tokens/sec。以及 energy / successful task（每个成功任务耗多少电）。

我见过太多团队栽在这个认知上：他们骄傲地汇报"我们把推理吞吐量提升了 40%"，结果 agent 的端到端成本一分钱没降，因为瓶颈根本不在推理吞吐，而在某个没缓存好的上下文、某个没并行的工具调用。

**更多 tokens/sec，可能意味着一个更慢、更贵的 agent。** 这句反直觉的话，值得你贴在工位上。

---

## 反直觉点二：prefill 和 decode 是两个完全不同的东西

这是理解"为什么模型推理忽快忽慢"的钥匙，也是后面讲 batching、讲投机解码时反复要用到的地基。课程把它列为"AI 系统与传统系统最大的不同之一"。

一次 LLM 推理，分两个阶段：

- **Prefill（预填充）**：把你的 prompt（可能几千上万 token）一次性吃进去，算出所有位置的中间状态。这一步是**计算密集型（compute-bound）**——GPU 的算力被拉满。
- **Decode（逐 token 生成）**：一个 token 一个 token 地往外吐，每个 token 都要重新读一遍整个 KV-cache。这一步是**内存带宽密集型（memory-bandwidth-bound）**——GPU 的算力闲着，内存带宽被榨干。

同一个部署，一会儿卡在算力上，一会儿卡在带宽上。这直接导致了两件事：一是**执行时间不可预测**（输出多长、卡在哪个阶段，都影响耗时），这让调度变成噩梦；二是**优化方向完全不同**——prefill 你要优化算力利用，decode 你要优化数据搬运。糊里糊涂地"统一优化"，基本等于瞎忙。

---

## 反直觉点三：你的 agent 是"非确定性"的，而且这不可怕

还有一个很多从业者没意识到的点：**LLM 推理不是确定性的**，即使你把 temperature 设成 0。

原因很硬核：浮点数加法不满足结合律。`(a + b) + c` 和 `a + (b + c)` 在浮点下结果不一样，因为每一步都在舍入。在 GPU 上，一个 matmul 的第 7 位小数抖一下，下一个 token 就可能翻车——这是典型的蝴蝶效应。

这种不确定性从哪来？课程列了三层：**运行时**（warp/block 调度、内存排序、异步流、batch size）、**软件**（fused multiply-add 还是两步算、自动调优、次正规数）、**硬件**（CUDA 核 vs tensor core、Hopper 的 FP8 vs Blackwell 的微缩放 tile）。

所以，**别指望两次跑出来的结果一模一样，也别在 bug 排查里因为"上次还能跑"就乱了阵脚。** 近似计算是 LLM 推理的既定事实，系统设计要去拥抱它，而不是对抗它。

---

## 这些特征，各自逼出一个系统问题

课程把这套逻辑收束得非常漂亮：**agent 负载的每一个特征，都对应着一个待解决的系统问题。** 我把它翻译成一张表，这也是整个系列后面 19 篇的路线图：

| Agent 负载特征 | 逼出的系统问题 | 对应文章 |
|---|---|---|
| 长轨迹 | 状态与上下文管理 | 第5篇 |
| 重复前缀 | prefix caching | 第15篇 |
| 工具依赖 | 依赖感知的调度 | 第20篇 |
| 工具延迟不一 | 异步执行 | 第14篇 |
| 多 agent | 编排与通信 | 第4篇 |
| 超大上下文 | 记忆层级与检索 | 第7篇 |
| 分支推理 | 投机执行 | 第17–18篇 |
| 不同模型 | 路由 | 第20篇 |
| 外部副作用 | 安全与隔离 | 第9篇 |
| 长时任务 | 检查点与容错 | 第9篇 |

你发现没有——**这些几乎全是传统操作系统和分布式系统早就研究过的问题**：上下文管理是内存管理，prefix caching 是缓存，调度是调度，路由是负载均衡，投机执行是分支预测，检查点是崩溃恢复。

所以我的结论很直接：**做 agent，做到后面，拼的不是 prompt 工程，是系统能力。** 谁先把 agent 当成一台"要设计、要调优的计算机"来对待，谁就能在成本和延迟上把对手甩开。

---

## 还有一层常被忽略：可观测性

最后补一刀。传统系统里，分布式链路追踪是标配；但 agent 里，**可观测性本身就是个一等公民问题，而且更难**。

因为 agent 的"trace"不是一条线，而是一棵嵌套的树：

```
Session
 └─ Turn
     └─ Agent step
         ├─ Model request
         ├─ Tool call
         │   └─ Tool result
         └─ Subagent
             └─ …
```

一句话：**你优化不了你看不到的东西。** 而 agent 的每一次工具调用、每一次子 agent 分支、每一次失败重试，都是这条轨迹上的一个节点。课程甚至为此专门设计了作业 1——让学生用 Claude Code 给 Claude Code 自己做一个轨迹可视化工具，实时看每个 tool call 的输入输出、看 subagent 的分支树、看每次 run 花了多少钱。

这恰好印证了我的判断：**连哈佛都在第一课就逼学生去"看"agent 内部发生了什么，说明这个行业里，多数人对自己的 agent 是怎么跑的，其实一无所知。**

---

## 一个可带走的结论

如果这篇文章只让你记住一句话，记这句：

> **Agent 不是"带工具的 LLM"，而是一台"新的计算机"。你把它当 LLM 优化，就会去卷 tokens/sec；你把它当计算机来设计，才会去优化"每个成功任务花多少钱"。这之间的差距，就是 agent 从业者和 agent 系统工程师的差距。**

后面 19 篇，我会带着这个视角，从上到下把六层栈一层层拆开：先讲 harness（你怎么设计好一个 agent），再讲 serving（你怎么把它跑快跑省），最后把它们缝成一个 co-design 的整体。

---

## 延伸阅读（也供你溯源）

- **CS2680 Lecture 1 课件**（本文观点的主要出处，本地 `slides/1_intro.pdf`）：Juncheng Yang《Course Overview》，其中"agents as a new kind of computer""throughput is the wrong objective""agentic systems stack"三张片子，是本文的骨架。
- **Andrej Karpathy, "Software is changing (again)"**（课程必读，视频）：LLM"同时超人和低能"这一矛盾的核心论述来源。https://www.youtube.com/watch?v=LCEmiRjPEtQ
- **Google Cloud, "What are AI agents?"**（课程引用的定义来源）：区分 agent / assistant / bot 三者。https://cloud.google.com/discover/what-are-ai-agents
- **课程主页**：https://cs2680.com —— 完整的课程结构、作业和阅读清单都在这里。

---

*本文是系列第1篇。下一篇（第2篇）拆 Claude Code：一个 coding agent 是怎么在"看着完成"一个任务的，以及它背后的 harness 到底在替你做什么。*
