---
title: "没吃饱就接着点——手搓 Agent Loop"
column: "handbuilt-agent"
date: 2026-11-11
order: 3
description: "本篇目标：把Agent升级成\"没吃饱就接着点\"——让 AI 自己决定要不要继续读文件，直到心里有数才回答，也就是大名鼎鼎的Agent Loop."
juejin: "https://juejin.cn/post/7706474677128708105"
---

## 为什么会有本系列

本系列是手搓 Agent 教学项目 [Teernage/powercode](https://github.com/Teernage/powercode) 的 Python 重实现版本；为什么要做这个系列呢？是因为当我在掘金社区刷到 @不一样的少年_ 大佬的[【不用框架，手搓 AI Agent】](https://juejin.cn/column/7661531339729829926)系列时，感觉写得很好，但是想深入学习时，发现代码都是 Node/TS 实现。想掌握技术细节，但看得似懂非懂，如果先学习 Node/TS，又感觉成本太高。于是就想着实现一个 Python 版本的手搓 Agent 系列，以便让自己能更深入学习 Agent 的相关技术细节。整理成博客，以便那些熟悉 Python 但不熟 Node/TS 的小伙伴能一起进步成长；当然如果你已有 Node/TS 基础，强烈建议去学习 [【不用框架，手搓 AI Agent】](https://juejin.cn/column/7661531339729829926)系列，真的很棒。再次感谢 Teernage 大佬的开源分享。

本系列的源码 [powercode-py](https://github.com/wanghesong2019/powercode-py)，本篇对应 commit `300bf4d`；如果你觉得对你有帮助，请点个 star ⭐。

---

> **上篇回顾**：上一篇我们给 AI 配了第一个工具 `read_file`，它终于能"点一道菜"——读一个文件、再回答。但它只会点一道，点完就走。
>
> **本篇目标**：把它升级成"没吃饱就接着点"——让 AI 自己决定要不要继续读文件，直到心里有数才回答。

## 一、上一期的客人，只会点一道菜

上一篇把 `read_file` 接上之后，AI 确实能"看文件"了。但它有个毛病：**只会点一道菜，点完就走。**

你让它"先读 `README.md`，再看看 `pyproject.toml`，告诉我这个项目怎么装、怎么跑"，它读完 README 就一本正经地开始回答，`pyproject.toml` 连个影都没看。

原因藏在上一篇的代码里——我们当时只取了第一个工具调用：

```python
tool_call = (
    first_message.tool_calls[0]
    if first_message and first_message.tool_calls
    else None
)
```

就算模型一口气申请了"读 README"和"读 pyproject"两件事，程序也只挑第一个去执行，剩下的全当没看见。

> 想真机复现的话，这个版本现在会先撞上 DeepSeek thinking mode 的 `reasoning_content` 400（上一篇避坑里有讲，补一行就好）。所以这里不用复现，看代码就够了。

可真实的 Agent 不该这么死板——它得会自己掂量：读完一个文件，看够没够，不够就再读，够了再开口。

所以这一篇，我们要把"写死的只读一次"，换成"**没吃饱就接着点**"的循环。这个循环，就是 Agent 圈天天挂在嘴边的 **Agent Loop**。

## 二、循环这事儿，拆开看就一句话

"Agent Loop" 这名字挺唬人，拆开其实就是一件事：

> **别把"读几个文件"写死；每看完一个文件，让 AI 自己判断——信息够不够？不够就再要一个，够了就回答。**

这跟点菜一个道理：你进一家没吃过的店，不会一上来点一大桌——先点一两道尝尝，好吃再接着点，不好吃就换。AI 读文件也是这节奏：先读一个，看信息够不够，不够再读下一个，够了才开口。

AI 也一样。分工还是上一篇那套，没变：

- **AI（客人）**：决定下一步点什么；
- **程序（后厨）**：做菜、端菜、把结果记下来。

变的是：客人现在可以**一道接着一道点**，直到吃饱为止。用图看是这样：

<p align="center"><img src="/images/ch3-concept.png" alt="Agent Loop 概念图" width="25%" /></p>

关键就在中间那个菱形：**只要客人还在点菜（模型还有 `tool_calls`），就转回"点菜"；一旦它开始直接答话（没有 `tool_calls` 了），说明它吃饱了，循环结束。**

还有件事得先铺垫：客人一道接一道点，服务员得拿个**小本本记着**——已经上了哪些菜、客人说过啥。这个小本本就是 `messages`，模型每轮都能看到之前发生的一切，才知道自己做到哪一步。要是每上一道菜就把本子撕了，客人说"再来一份"时，服务员就懵了。

## 三、先看效果

写完这期代码，你敲：

```bash
powercode "先读 README.md，再看看 pyproject.toml，告诉我这个项目怎么安装和启动"
```

会看到类似这样的过程：

```text
AI 正在思考...

第 1 轮：AI 想调用 read_file
正在读取文件：{"path": "README.md"}

第 1 轮：AI 想调用 read_file
正在读取文件：{"path": "pyproject.toml"}

AI：两个文件都读完了。这是个教学项目……（基于两个文件真实内容回答）
```

> ⚠️ 免责：上面这个例子里，模型在第 1 轮**一口气申请了两次 read_file**（同时读两个文件）。有些模型会分成两轮、一轮读一个；两种情况代码都能处理。回答是 LLM 生成、非固定，别盯着某句话背，要看它是不是真的读了文件。

为了跑出这个效果，接下来要改三块代码，串起来是这样一条循环流水线：

<p align="center"><img src="/images/ch3-roadmap.png" alt="循环实现路线图" width="25%" /></p>

一句话记图：**新建 `agent.py` 管循环（判断、执行工具），`chat.py` 退化成只管"发消息、收消息"（`complete`），`cli.py` 退化成只管"启动 Agent"。**

## 四、第一步：先把记事本备好

新建 `powercode_py/agent.py`。先写个最小骨架：

```python
from .chat import ChatClient
from .read_file import read_file_tool

MAX_STEPS = 8

SYSTEM_PROMPT = (
    "你是 powercode-py，一个研发助手。需要了解项目内容时，优先读取真实文件。请使用中文回答。"
)


class AgentError(Exception):
    """Agent 运行失败。"""


class Agent:
    """一个最小 Agent：循环调用模型，直到它不再申请工具。"""

    def __init__(self, client: ChatClient):
        self.client = client

    def run(self, prompt: str) -> str:
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ]
        # 循环代码接下来写在这里
        return "暂未实现"
```

这个 `messages` 数组，就是上一篇第一次请求时拼的那组消息。唯一的变化是：**它现在是个能一直往里加东西的列表，每轮都在同一份基础上接着记，而不是每轮重头拼一遍。**

它就是那个"服务员的记事本"——Agent 的短期记忆。`MAX_STEPS` 先摆着，第十节解释它为什么非有不可。

## 五、第二步：让 ChatClient 只管"发消息、收消息"

上一篇的 `ask_with_tools` 收一个 `prompt` 字符串、自己拼消息；`answer_after_read_file` 专管"读一次文件后的第二次请求"。现在消息越来越多，这俩写死的流程都不合适了。

直接用下面的代码**替换整个 `powercode_py/chat.py`**，统一换成一个 `complete` 方法：

```python
def complete(self, messages):
    """把完整聊天记录发给模型，返回最新一条消息（可能带 tool_calls）。"""
    completion = self._create(
        model=self.config.model,
        messages=messages,
        tools=[READ_FILE_TOOL],
    )
    if not completion.choices:
        return None
    return completion.choices[0].message
```

这段代码干的事很简单：收到"截至现在的全部聊天记录"，原样发给模型，把模型的最新消息返回。

关键变化就一点：**`complete` 不关心现在是第几轮，也不关心模型会不会调用工具，它只管"发一次、收一次"。**

这样两边各管一摊，责任清楚：

```
ChatClient：负责一次请求，别的啥都不管
Agent：负责整个循环，决定下一步干啥
```

## 六、第三步：把模型的每句话都记下来

回到 `agent.py`，把 `return "暂未实现"` 换成循环骨架：

```python
for step in range(1, MAX_STEPS + 1):
    message = self.client.complete(messages)

    if message is None:
        raise AgentError("模型没有返回消息。")

    messages.append(self._assistant_message(message))

    # 接下来判断：它是想调用工具，还是已经准备回答？
```

每轮做三件事：① 把当前完整 `messages` 发给模型；② 拿到新回复；③ **立刻把这条回复也塞回 `messages`**。

这里有个我们和上一篇不同的处理：模型的回复要转成 dict 再存。写个 `_assistant_message` 辅助方法：

```python
def _assistant_message(self, message) -> dict:
    """把模型返回的消息转成可回传的 assistant 消息 dict。"""
    msg = {"role": "assistant", "content": message.content}
    tool_calls = getattr(message, "tool_calls", None) or []
    if tool_calls:
        msg["tool_calls"] = [
            {
                "id": tc.id,
                "type": tc.type,
                "function": {
                    "name": tc.function.name,
                    "arguments": tc.function.arguments,
                },
            }
            for tc in tool_calls
        ]
    return msg
```

为什么要转成 dict？因为模型的回复**可能带一次工具调用申请**，后面我们把工具结果交回模型时，模型得能对上"这个结果是在回应哪一次调用"。转成 dict 存，更稳、也更好测。

## 七、第四步：客人不点菜了，就结账

模型会返回两类消息：一类是普通回答，一类是工具调用。第二类会出现在 `message.tool_calls` 里。

所以在上面的 `messages.append(...)` 后面补上：

```python
tool_calls = getattr(message, "tool_calls", None) or []
if not tool_calls:
    return message.content or "模型没有返回文本内容。"
```

这一句其实不关心"模型到底读没读完文件"，只问一件事：**它这轮还申不申请工具。**

逻辑就变成：

```
没有 tool_calls → 这轮没再申请工具 → 它觉得信息够了 → 直接返回这轮文字，结束
有 tool_calls   → 它还想让程序读文件 → 先执行工具、把结果告诉它 → 再让它想下一步
```

这就是 Agent Loop 最核心的退出条件。

## 八、第五步：执行工具，把结果记回本子

在"没有工具就返回"的代码后面，继续补：

```python
for tool_call in tool_calls:
    if tool_call.type != "function":
        raise AgentError(f"暂时不支持工具类型：{tool_call.type}")

    if tool_call.function.name != "read_file":
        raise AgentError(f"暂时不支持工具：{tool_call.function.name}")

    print(f"第 {step} 轮：AI 想调用 read_file")
    print(f"正在读取文件：{tool_call.function.arguments}\n")

    try:
        result = read_file_tool(tool_call.function.arguments)
    except Exception as exc:
        result = f"读取失败：{exc}"

    messages.append(
        {
            "role": "tool",
            "tool_call_id": tool_call.id,
            "content": result,
        }
    )
```

这段看着长，其实就是在完整走一遍"申请 → 执行 → 回传"。有两个点值得记：

1. **一个 `for` 遍历所有 `tool_calls`**，而不是上一篇那样只取 `[0]`。模型一轮申请好几个工具时（比如同时读两个文件），每个都要执行、每个结果都要记回。
2. **读取失败也不崩**：把 `读取失败：...` 当结果喂回模型，它就有机会换个路径、或者告诉用户"文件不存在"。失败原因得让模型看见，它才有机会自己想办法。

## 九、第六步：入口只负责启动

最后把 `powercode_py/cli.py` 里的工具调用逻辑全删掉，换成最干净的样子：

```python
try:
    config = load_config(args.provider)
    client = ChatClient(config)
    agent = Agent(client)

    print("AI 正在思考...\n")
    answer = agent.run(args.prompt)
except (ConfigError, ChatError, AgentError) as exc:
    print(f"错误：{exc}", file=sys.stderr)
    return 1

print(f"AI：{answer}")
return 0
```

入口现在薄得像张纸：读配置、建 Agent、跑、打印。至于中途要读几个文件、什么时候收手，全是 `Agent.run` 的事。

跑一下：

```bash
powercode "先读 README.md，再看看 pyproject.toml，告诉我这个项目怎么安装和启动"
```

如果你看到它只读一个文件就急着回答，先别怪代码——多半是模型觉得这一个文件的信息已经够用了。想让它多读几个，就把要求说得死一点，比如"必须分别读 README.md 和 pyproject.toml，读完再告诉我安装和启动命令"。

## 十、为什么要给循环设个上限？

循环听着美好，但有个隐患：**客人要是永远说"还没饱"，后厨就得一直炒下去。**

更实际的坑是，模型不保证每次都做最优决定，它可能钻牛角尖：

- 反复读同一个文件；
- 一直试不存在的路径；
- 问题问得含糊，反复收集用不上的信息。

不管哪种，结果都是白烧 Token，程序甚至停不下来。所以咱们设了个上限：

```python
MAX_STEPS = 8
```

相当于老板提前立好规矩：**最多上 8 道菜，还不满足就结账**——先把已经发生的事摆出来，回头再排查。

`8` 这个数随便定，学习项目取个小数字方便观察。真正要记住的是：**循环一定要有停止条件和上限，不能让它无限跑。**

## 十一、这期到底干成了啥？

说实话，这个 Agent 现在还是只会读文件，但它的身份变了——不再是"问一句、读一个、答一句"的自动回复机，而是会自己盘算"信息够没够、要不要再看一眼"的小助手了。

回头看，这一篇其实只加了两样东西：一个 `for` 循环、一个退出条件。就这两样，让程序从"写死的剧本"变成了"自己走一步看一步"。这，就是绝大多数 AI Agent 的骨架。

## 十二、下集预告

现在后厨只会做一道菜，上菜时直接判断一下"是不是 read_file"就行，还凑合。

可下一期要给后厨加三道新菜：写文件、改文件、跑命令。菜一多，还靠这种挨个判断，后厨迟早乱套。

下一篇，咱们就搞一个"**工具管理中心**"：每道菜统一定义、统一登记、统一出菜。到那时，AI 终于能写文件、精确改文件、跑命令了。
