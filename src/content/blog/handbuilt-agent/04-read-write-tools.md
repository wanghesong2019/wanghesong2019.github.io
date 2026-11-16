---
title: "后厨扩招——AI 从此能读、能写、能改、能跑"
column: "handbuilt-agent"
date: 2026-11-11
order: 4
description: "本篇把手搓版Agent只会\"读文件\"这一个工具，扩成\"读、写、改、跑\"四个工具，同时为了方便后续工具扩展及管理，引入注册中心这一前台统一调度。"
juejin: "https://juejin.cn/post/7706740769265270834"
---

## 为什么会有本系列

本系列是手搓 Agent 教学项目 [Teernage/powercode](https://github.com/Teernage/powercode) 的 Python 重实现版本；为什么要做这个系列呢？是因为当我在掘金社区刷到 @不一样的少年_ 大佬的[【不用框架，手搓 AI Agent】](https://juejin.cn/column/7661531339729829926)系列时，感觉写得很好，但是想深入学习时，发现代码都是 Node/TS 实现。想掌握技术细节，但看得似懂非懂，如果先学习 Node/TS，又感觉成本太高。于是就想着实现一个 Python 版本的手搓 Agent 系列，以便让自己能更深入学习 Agent 的相关技术细节。整理成博客，以便那些熟悉 Python 但不熟 Node/TS 的小伙伴能一起进步成长；当然如果你已有 Node/TS 基础，强烈建议去学习 [【不用框架，手搓 AI Agent】](https://juejin.cn/column/7661531339729829926)系列，真的很棒。再次感谢 Teernage 大佬的开源分享。

本系列的源码 [powercode-py](https://github.com/wanghesong2019/powercode-py)，本篇对应 commit `d7ecb11`；如果你觉得对你有帮助，请点个 star ⭐。

---

> **上篇回顾**：上一篇我们给 AI 装上了 Agent Loop，它会自己盘算"信息够没够、要不要再读一个文件"。
>
> **本篇目标**：把只会"读文件"这一道菜，扩成"读、写、改、跑"四道菜，再配个前台统一调度。

## 一、只会看、不会改，AI 干着急

上篇结束，咱们的 AI 已经会循环读文件了，能读 README、读 pyproject、读得头头是道。

但真让它干活，还是抓瞎。你试试：

```bash
powercode "把 README.md 里那句 powercode-py 改成 powercode"
```

它会读一遍 README，然后一本正经地回你："这句在 README 第 5 行，你可以手动改一下。"——它看得见，就是动不了手。

为啥？因为它工具箱里**只有一道菜**：`read_file`。会看，不会写、不会改、更不会跑。

这一篇，我们要给它扩招后厨：加上 `write_file`（写/覆盖文件）、`edit_file`（精确改一段）、`bash`（跑命令）。凑齐"读、写、改、跑"四件套，它才算一个能真正动手的编程助手。

但别急着写代码，先看一个更头疼的问题。

## 二、菜一多，后厨就乱套

现在只有一道菜，后厨很省事。上一篇 `agent.py` 里，客人点啥，直接判断：

```python
if tool_call.function.name != "read_file":
    raise AgentError(f"暂时不支持工具：{tool_call.function.name}")
```

就一个 `read_file`，if 一下完事。

可一旦菜加到 4 道、10 道、几十道，代码会变成一长串：

```python
if name == "read_file":
    ...  # 读文件
elif name == "write_file":
    ...  # 写文件
elif name == "edit_file":
    ...  # 改文件
elif name == "bash":
    ...  # 跑命令
```

菜加到 10 道、20 道，这 if...else 就长得没法看了。更糟的是，每上一道新菜，Agent 除了管自己的循环，还得亲自记住每道菜该找谁做——菜单、厨师、循环，三摊事全搅在一起。客人（AI）跟厨师（工具）越缠越死。

这时候，就差一个"前台"：客人点菜，前台按菜名喊对应厨师，做完端回来。客人不用认识每个厨师，厨师也不用知道客人坐哪桌。

这个前台，代码里叫 **Registry（注册中心）**。用图看是这样：

<p align="center"><img src="/images/ch4-concept.png" alt="工具注册中心概念图" width="35%" /></p>

## 三、先看效果

写完这期代码，你敲：

```bash
powercode "创建一个 hello.py 文件，让它输出 Hello, powercode-py，然后用 python 运行它验证结果"
```

会看到类似这样的过程（这是我真机跑出来的，中间还翻了个车）：

```text
AI 正在思考...

第 1 轮：AI 调用 write_file
✓ 已写入文件：hello.py

第 2 轮：AI 调用 bash
✗ 工具执行失败：命令执行失败（退出码 2）
python: can't open file 'D:\...\hello.py;': [Errno 2] No such file or directory

第 3 轮：AI 调用 bash
✓ Hello, powercode-py

AI：已完成并验证通过。
```

注意第 2 轮——模型自作聪明写了 `python hello.py; echo "exit=$?"` 这种 bash 语法，可我这是 Windows，实际跑命令的是 cmd，不认 `;`，直接报错。**结果它看到报错后，第 3 轮老老实实改成单独一句 `python hello.py`，成了。**这就是"工具失败喂回模型、模型自我纠正"的作用体现。

> ⚠️ 免责：上面这段是 LLM 生成、非固定，你跑出来轮数可能不一样（模型可能一轮就写完再跑，也可能多绕几轮），关键是看它**真去调用了 write_file 和 bash**，而不是背某句话。

为了跑出这个效果，要写的代码串成一条流水线：

<p align="center"><img src="/images/ch4-roadmap.png" alt="实现路线图" width="10%" /></p>

一句话记图：**第四节定规矩（Tool 协议）+ 开前台（Registry），第五节装门禁 + 配齐四个厨师，第六节把客人、前台、后厨串起来。**

## 四、第一步：定规矩 + 开前台

### 4.1 每道菜都要交齐三样

想统一调度，第一步不是写前台，而是先把"一道菜到底长啥样"定死。别管它是读文件还是跑命令，进后厨都得带上三样家当：

1. `name`：叫什么（菜名，比如 `read_file`）；
2. `definition`：给客人看的菜单介绍（有啥用、参数怎么传）；
3. `execute`：真正干活的厨师（程序真去读写改跑）。

新建 `powercode_py/tools/types.py`：

```python
from typing import Protocol


class ToolError(Exception):
    """工具执行或参数校验失败。"""


class Tool(Protocol):
    """一个工具要交齐的三样东西：name、definition、execute。"""

    name: str
    definition: dict

    def execute(self, arguments_json: str) -> str:
        """真正执行工具，返回结果文本。"""
        ...
```

这里最要命的一个区分，是这两行：

```text
definition：给 AI 看，帮它决定要不要点这道菜
execute：给程序用，真正动手干活的厨师
```

一句话分清：**definition 是菜单上的字，谁都能看；execute 是后厨里的锅，只有程序能碰。**客人就算把菜单背得滚瓜烂熟，也炒不出一道菜来。

### 4.2 前台：Registry

菜单备好了，还得有个前台按菜名喊人。新建 `powercode_py/tools/registry.py`：

```python
class Registry:
    """按名字保存工具，供 Agent 统一分发。"""

    def __init__(self):
        self._tools = {}

    def register(self, tool: Tool) -> None:
        """注册一个工具；重名则报错。"""
        if tool.name in self._tools:
            raise ToolError(f"工具重复注册：{tool.name}")
        self._tools[tool.name] = tool

    def get_definitions(self) -> list[dict]:
        """返回所有工具的 definition（给模型看的工具说明）。"""
        return [tool.definition for tool in self._tools.values()]

    def execute(self, name: str, arguments_json: str) -> str:
        """根据工具名找到工具并执行。"""
        tool = self._tools.get(name)
        if tool is None:
            raise ToolError(f"找不到工具：{name}")
        return tool.execute(arguments_json)
```

前台一共就三个动作：

```text
register        新菜上架，登记进后厨名册
get_definitions 把整本菜单递给客人翻
execute         客人点哪道，就去喊哪个厨师
```

`self._tools` 是一本后厨名册，菜名 → 厨师一一对应，翻开就能找到人：

```text
read_file  → ReadFileTool
write_file → WriteFileTool
edit_file  → EditFileTool
bash       → BashTool
```

以后 Agent 循环里，只把菜名和参数甩给前台就行，厨师在哪个文件、怎么干活，它一概不用管。

## 五、第二步：装门禁 + 四个厨师

### 5.1 先装一道门禁

读、写、改三个厨师都会拿到模型给的路径。这路径不能直接用——万一模型使坏传 `../secret.txt` 呢？

所以先写一个公共入口，把"碰文件"的活全关在项目里。新建 `powercode_py/tools/path.py`：

```python
from pathlib import Path

from .types import ToolError


def resolve_in_work_dir(work_dir: str, relative_path: str) -> Path:
    """把相对路径解析成绝对路径，并确保它仍在工作目录内。"""
    if not relative_path.strip():
        raise ToolError("文件路径不能为空。")

    root = Path(work_dir).resolve()
    target = (root / relative_path).resolve()

    if target != root and root not in target.parents:
        raise ToolError("只能操作当前项目里的文件。")

    return target
```

核心就这一行判断：

```python
# target 不是项目根目录本身，且项目根目录也不是 target 的上级 → 越界，拒绝
if target != root and root not in target.parents:
```

这道"路径越界"的检查，第 2 篇讲 `read_file` 时已经掰开揉碎过一遍，这里不重复。区别只有一个：**以前它只护着 read_file 一个人，现在收进 `resolve_in_work_dir`，读、写、改三个厨师共用这一个入口，不用再各自重复写一遍。**

### 5.2 读文件：换身工作服

上一篇的 `read_file` 本来是个散装的函数。这回它的本事一点不用改，只是装进类的壳里、补上 `name` 和 `definition`，让它也变成一道能上台面的标准菜。新建 `powercode_py/tools/read_file.py`：

```python
class ReadFileTool:
    name = "read_file"

    definition = {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "读取当前项目中的文本文件。",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "相对于项目根目录的文件路径"},
                },
                "required": ["path"],
                "additionalProperties": False,
            },
        },
    }

    def __init__(self, work_dir):
        self.work_dir = work_dir

    def execute(self, arguments_json: str) -> str:
        path = _parse_path(arguments_json)
        target = resolve_in_work_dir(self.work_dir, path)
        if not target.exists():
            raise ToolError(f"文件不存在：{path}")
        if target.is_dir():
            raise ToolError(f"这是一个目录，不是文件：{path}")
        data = target.read_bytes()
        if len(data) > MAX_BYTES:
            head = data[:MAX_BYTES].decode("utf-8", errors="replace")
            return f"{head}\n\n...[文件太长了，只返回前 {MAX_BYTES} 个字节]..."
        return data.decode("utf-8", errors="replace")
```

跟上一篇比，真正读文件那一下还是 `target.read_bytes()`，没变。变的只是把它收进类里，交齐 `name`、`definition`、`execute` 三样。（`_parse_path` 负责把 AI 传来的 JSON 解析成 path 字符串，不展开。）

### 5.3 写文件：能创建、能覆盖

前面几个工具都只动眼睛，到 `write_file` 才第一次真正改东西。新建 `powercode_py/tools/write_file.py`：

```python
class WriteFileTool:
    name = "write_file"

    definition = {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "创建或完整覆盖当前项目中的文件，目录不存在时会自动创建。",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "相对于项目根目录的路径"},
                    "content": {"type": "string", "description": "完整文件内容"},
                },
                "required": ["path", "content"],
                "additionalProperties": False,
            },
        },
    }

    def __init__(self, work_dir):
        self.work_dir = work_dir

    def execute(self, arguments_json: str) -> str:
        path, content = _parse_args(arguments_json)
        target = resolve_in_work_dir(self.work_dir, path)
        # 目录不存在就自动补上，AI 想一口气写 nested/deep/xx.py 也不用先建目录
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        return f"已写入文件：{path}"
```

两行关键代码：

```python
target.parent.mkdir(parents=True, exist_ok=True)  # 目标目录不存在就自动建
target.write_text(content, encoding="utf-8")      # 完整写入（文件在则覆盖）
```

`write_file` 的语义是"**创建或完整覆盖**"：文件不在就新建，在就整个重写。所以它适合"新建文件"或"模型已经掌握完整内容、要整体重写"这两种情况。

可要是让 AI 就为了改一个错别字，把整篇 README 从头到尾重抄一遍——它真干得出来，而且抄着抄着指不定把别的段落也顺手"润色"掉了。这时候就得换一把只动一小块的刀：`edit_file`。

### 5.4 改文件：只改一小段，且必须唯一

`edit_file` 的思路是：在文件里找到一段旧文本，换成新文本。新建 `powercode_py/tools/edit_file.py`：

```python
class EditFileTool:
    name = "edit_file"

    definition = {
        "type": "function",
        "function": {
            "name": "edit_file",
            "description": (
                "把文件中唯一出现的一段旧文本替换成新文本。修改前应先读取文件；"
                "如果 old_text 出现多次，请带上前后文后重试。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "要修改的文件路径"},
                    "old_text": {"type": "string", "description": "文件中原有的完整文本"},
                    "new_text": {"type": "string", "description": "替换后的文本"},
                },
                "required": ["path", "old_text", "new_text"],
                "additionalProperties": False,
            },
        },
    }

    def __init__(self, work_dir):
        self.work_dir = work_dir

    def execute(self, arguments_json: str) -> str:
        path, old_text, new_text = _parse_args(arguments_json)
        target = resolve_in_work_dir(self.work_dir, path)
        if not target.exists():
            raise ToolError(f"文件不存在：{path}")
        content = target.read_text(encoding="utf-8")
        matches = content.count(old_text)   # 数一下 old_text 出现了几次
        if matches == 0:
            raise ToolError("没有找到 old_text，请重新读取文件后再试。")
        if matches > 1:
            raise ToolError(f"old_text 出现了 {matches} 次，请提供包含前后文的更长文本。")
        target.write_text(content.replace(old_text, new_text), encoding="utf-8")
        return f"已修改文件：{path}"
```

核心就三个参数：

```text
path      改哪个文件
old_text  文件里现在长啥样（要找到的那段）
new_text  要替换成啥样
```

最关键的是这句判断：

```python
matches = content.count(old_text)   # Python 自带 count，直接数出现次数
```

然后分三种情况：

```text
0 次：文件里根本没这段，要么读的内容旧了，要么 old_text 抄错了 → 报错，让它重新读
1 次：正好就这一处，放心换
N 次：撞上好几处一模一样的，分不清该改哪个 → 报错，让它把上下文写全了再来
```

注意：报错发生在 `write_text` **之前**，所以匹配失败时，原文件一个字节都不会动。

> 这条是 `edit_file` 的底线：**改错地方，比不改更糟。**所以拿不准的时候，它宁可直接报错，把球踢回给模型。

### 5.5 跑命令：让 AI 自己验证

代码写完了不算完，得跑起来验证。这就是 `bash` 这道菜的活。新建 `powercode_py/tools/bash.py`：

```python
import subprocess

from .types import ToolError

TIMEOUT_SECONDS = 30
MAX_OUTPUT = 8_000


class BashTool:
    name = "bash"

    definition = {
        "type": "function",
        "function": {
            "name": "bash",
            "description": (
                "在当前项目目录中执行终端命令，用于构建、测试、运行代码和查看命令结果。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "要执行的命令"},
                },
                "required": ["command"],
                "additionalProperties": False,
            },
        },
    }

    def __init__(self, work_dir):
        self.work_dir = work_dir

    def execute(self, arguments_json: str) -> str:
        command = _parse_command(arguments_json)
        try:
            proc = subprocess.run(
                command,
                shell=True,              # 通过系统 shell 执行，能识别 && 这类组合语法
                cwd=str(self.work_dir),  # 固定在项目目录里跑
                capture_output=True,
                text=True,
                timeout=TIMEOUT_SECONDS, # 最长 30 秒
            )
        except subprocess.TimeoutExpired as exc:
            ...

        if proc.returncode != 0:
            output = _truncate(_format_output(proc.stdout, proc.stderr))
            if output:
                raise ToolError(
                    f"命令执行失败（退出码 {proc.returncode}）\n\n{output}"
                )
            raise ToolError(f"命令执行失败（退出码 {proc.returncode}）")

        output = _truncate(_format_output(proc.stdout, proc.stderr))
        return output or "命令执行成功，没有终端输出。"
```

（`_parse_command` 解析命令、`_format_output` 合并 stdout/stderr、`_truncate` 截断超长输出，都是辅助函数，这里不展开。）

这里两个关键点：

1. **`shell=True`**：让命令走系统 shell，这样 `python hello.py && python test.py` 这种组合语法才能被认出来。
2. **失败时把退出码 + 输出一起抛出来**：

```python
if proc.returncode != 0:
    raise ToolError(f"命令执行失败（退出码 {proc.returncode}）\n\n{output}")
```

第三节里第 2 轮那句 bash 语法报错、第 3 轮又自己改对，靠的正是这一步：`python hello.py; echo "exit=$?"` 失败时，报错把退出码和 stderr 都带回来了，模型看见才知道错在哪，下一轮才改得过来。

另外加了三个保险丝：`cwd`（只在项目目录跑）、`timeout`（30 秒封顶）、`_truncate`（输出 8KB 截断）。但先记住：**这几个是保险丝，不是保险箱**，第七节细说。

## 六、第三步：串起来

厨师和前台都齐了，最后把三根线接上。

### 6.1 ChatClient：把菜单递给 AI

上一篇 `chat.py` 里 `tools` 写死成 `[READ_FILE_TOOL]`，现在得改成接收参数。关键就 `complete` 多了一个 `tools`：

```python
def complete(self, messages, tools):
    """把完整聊天记录和工具说明发给模型，返回最新一条消息。"""
    completion = self._create(
        model=self.config.model,
        messages=messages,
        tools=tools,   # ← 菜单从外面传进来，不再写死
    )
    if not completion.choices:
        return None
    return completion.choices[0].message
```

`ChatClient` 彻底不认识具体工具了，它就一个动作：把菜单递出去、把回复收回来。

### 6.2 Agent：走前台，不再写 if...else

`agent.py` 的变化有两点。构造函数多收一个 `registry`：

```python
class Agent:
    def __init__(self, client: ChatClient, registry: Registry):
        self.client = client
        self.registry = registry
```

循环里，删掉上一篇那坨 `if name == "read_file"` 判断，统一走前台：

```python
for step in range(1, MAX_STEPS + 1):
    message = self.client.complete(messages, self.registry.get_definitions())
    ...
    for tool_call in tool_calls:
        name = tool_call.function.name
        print(f"第 {step} 轮：AI 调用 {name}")
        try:
            result = self.registry.execute(name, tool_call.function.arguments)
            print(f"✓ {result}\n")
        except Exception as exc:
            result = f"工具执行失败：{exc}"
            print(f"✗ {result}\n")
        messages.append(
            {"role": "tool", "tool_call_id": tool_call.id, "content": result}
        )
```

跟上一篇比，这段代码动的行不少，但核心是：**Agent 不再亲手碰任何具体工具，全丢给前台。**值得盯的就三行：

1. `self.registry.get_definitions()` —— 取整本菜单交给模型；
2. `self.registry.execute(name, ...)` —— 统一分发，点哪道菜都是这一行；
3. 工具报错统一 `except` 收下，把报错原样塞回给模型。**这就是"失败恢复"：模型看见自己上一步栽在哪，下一步才换得了招。**

### 6.3 CLI：开张，注册四道菜

最后 `cli.py` 里把四个厨师登记到前台：

```python
work_dir = Path.cwd().resolve()
registry = Registry()
registry.register(ReadFileTool(work_dir))
registry.register(WriteFileTool(work_dir))
registry.register(EditFileTool(work_dir))
registry.register(BashTool(work_dir))
agent = Agent(client, registry)
```

以后想加新工具（比如搜索、git），入口多登记一行 `registry.register(...)`，Agent 循环那边一个字都不用动。

## 七、踩坑：bash 不是你以为的 bash

### 7.1 Windows 下，它是 cmd

`shell=True` 在 Windows 上跑的是 cmd，不是 bash。所以模型一旦写了 bash 语法（比如 `python hello.py; echo "exit=$?"`），cmd 不认那个 `;`，当场翻车：

```text
✗ 工具执行失败：命令执行失败（退出码 2）
python: can't open file 'D:\...\hello.py;': [Errno 2] No such file or directory
```

cmd 把 `hello.py;` 当成文件名的一部分，所以找不到文件。好在这套"失败喂回 + 自我纠正"机制，让模型看到报错后自己换了写法，跑通了。这就是把失败结果喂回模型的价值——不是让它碰运气，是让它"看着错误改"。

### 7.2 它也不是沙箱

`bash` 能做的事，跟你这个登录用户完全一个量级。`cwd`、`timeout`、截断这几个保险丝，根本挡不住 `rm -rf` 或 `cat ~/.ssh/id_rsa` 这种操作。

所以这一版只适合：**自己本地、盯着跑、练手项目**。API Key 别写进项目；没提交的改动先存好再试；更别不经隔离就把这套东西暴露给别人。

真要做成能对外跑的东西，得另加容器、命令白名单、人工审批那一整套——那是后面几篇的活，这里先提醒一句。

## 八、这期到底干成了啥？

表面看，这期就是给后厨多雇了三个厨师。可真正值钱的，是这四个厨师从此**共用一套规矩**：

```text
模型（客人）
└─ Agent（循环）
   └─ 前台（Registry）
      ├─ read_file
      ├─ write_file
      ├─ edit_file
      └─ bash
```

每个工具都交同样的三样：`name`、`definition`、`execute`。以后加新能力，三步搞定：

1. 实现 `Tool` 协议；
2. 注册到前台；
3. 让模型从菜单里学会啥时候点它。

Agent 循环一个分支都不用加。

这也是几乎所有 Agent 框架底层都藏着的一层——框架可能把名字包装得花里胡哨，但剥开了就两样东西：**一套统一的工具接口，一张按名字查表的字典。**

## 九、下集预告

现在 AI 能读、能写、能改、能跑，短任务像模像样了。

但任务一长，新毛病又冒出来：对话记录越攒越多，Token 越烧越凶，AI 干着干着还可能把最早的目标给忘了。

下一篇，给它装一块"记忆"——**会话记忆 + 上下文压缩**，让它记得更久，又能避免把上下文窗口撑爆。
