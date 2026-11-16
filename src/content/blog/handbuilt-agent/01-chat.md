---
title: "想要 Agent 干活？不妨先让它从能对话开始"
column: "handbuilt-agent"
date: 2026-11-09
order: 1
description: "作为本系列的第一篇博客，这篇博客目标非常简单，就是在命令终端里让 Agent 能正常和我们对话，搭建好Agent骨架。"
juejin: "https://juejin.cn/post/7705716341148123151"
---

## 为什么会有本系列

本系列[【手搓 AI Agent · Python 版】](https://juejin.cn/column/7705955493571084328)是手搓 Agent 教学项目 [Teernage/powercode](https://github.com/Teernage/powercode) 的 Python 重实现版本；为什么要做这个系列呢？是因为当我在掘金社区刷到 @不一样的少年_ 大佬的【不用框架，手搓 AI Agent】系列时，感觉写得很好，但是想深入学习时，发现代码都是 Node/TS 实现。想掌握技术细节，但看得似懂非懂，如果先学习 Node/TS，又感觉成本太高。于是就想着实现一个 Python 版本的手搓 Agent 系列，以便让自己能更深入学习 Agent 的相关技术细节。整理成博客，以便那些熟悉 Python 但不熟 Node/TS 的小伙伴能一起进步成长；当然如果你已有 Node/TS 基础，强烈建议去学习 [【不用框架，手搓 AI Agent】](https://juejin.cn/column/7661531339729829926)系列，真的很棒。再次感谢 Teernage 大佬的开源分享。

本系列的源码 [powercode-py](https://github.com/wanghesong2019/powercode-py)，如果你觉得对你有帮助，请点个 star ⭐。

## Agent 的本质

在我看来，Agent 就是一个小型军队，其中 LLM 就是指挥中枢，它可能并不会直接拿刀去砍人，但是它能观察战场全局(context 上下文)，分析战场态势(deep think 深度思考)，也能做出杀伐决断的决策(给出判断与结论)，甚至是战争资源配置(调用什么服务，使用什么工具)；然后围绕着指挥中枢，会衍生一大堆 工具、资源、服务、存储、记忆等保障系统，以便这个军队能在指挥中枢的领导下，完成各种任务。

如此一来，我们要手搓 Agent，自然就是先把 LLM 给包起来，让它先能对话，然后逐步给他配备各种保障系统，让 Agent 逐步从能想到能说再到能动最后到能干，最终成长成我们熟悉的 Agent 形态。

## 本篇预期实现效果

这一篇做完，你会在终端看到下面这个效果。别担心，**你不需要先吃透原理，只要跟着后面的步骤一步一步做，就一定能把它跑起来**：

```bash
$ powercode "用一句话解释什么是 Python"
Python 是一种语法简洁、易读易学且应用广泛的通用高级编程语言。
```

> 小提示：大模型的输出不是固定模板，每次措辞可能略有不同——只要它返回一句合理的中文解释，就说明你跑通了。

## 今天的目标

今天的目标非常简单，就是在命令终端里让 Agent 能正常和我们对话。

## 分步实现今天的目标

下面每一步做完，都提交一次 `git commit`——这样既方便随时回退，也能和配套源码的 commit 历史一一对应。

### 一、环境准备

开工前先备料。这一篇只用得着 Python 3.10 以上，外加一个第三方依赖 `openai`——它统一了 OpenAI / DeepSeek 这些兼容接口，省得我们每家都写一遍。

```bash
python --version    # 确认是 3.10+
pip install openai  # 全程只装这一个包
```

如果你习惯用 uv（更快更省心的 Python 工具链），可以等骨架搭好再一起装：`uv venv && uv pip install -e .`。

### 二、搭骨架

先给指挥部打个地基。项目目录里放一个 Python 包 `powercode_py`——注意，**包名不能用 `powercode-py`**，带连字符的名字没法 `import`，所以包名用下划线，PyPI 上仍叫 `powercode-py`。

整个项目的结构长这样（`config.py` / `chat.py` / `cli.py` 是后面三节要填的）：

```text
powercode-py/
├── pyproject.toml        # 项目配置 + powercode 命令
├── provider.json.example # 配置模板（不含真实密钥）
└── powercode_py/
    ├── __init__.py       # 包标识
    ├── config.py         # 读配置
    ├── chat.py           # 封装大模型
    └── cli.py            # 命令行入口
```

`pyproject.toml` 里最要紧的是 `[project.scripts]` 这一行：它把终端里的 `powercode` 命令，绑到 `powercode_py.cli:main` 这个函数上。装好包，就能直接在终端喊 `powercode` 了。这一节先建下面三个文件：

**`pyproject.toml`**

```toml
[project]
name = "powercode-py"
version = "0.1.0"
description = "从零手搓 AI Agent（Python 版）"
requires-python = ">=3.10"
dependencies = ["openai>=1.0"]

[project.optional-dependencies]
dev = ["pytest>=8"]

[project.scripts]
powercode = "powercode_py.cli:main"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```

**`powercode_py/__init__.py`**

```python
"""powercode-py：从零手搓 AI Agent（Python 版）。"""

__version__ = "0.1.0"
```

**`provider.json.example`**

```json
{
  "baseURL": "https://api.deepseek.com",
  "apiKey": "你的 API Key",
  "model": "deepseek-v4-flash"
}
```

**提交**：`git commit -m "chore: 初始化项目骨架"`

### 三、写 config 模块

要让大模型理你，得先给它三样东西：接口地址 `baseURL`、密钥 `apiKey`、模型名 `model`。我们把它们塞进 `provider.json`，由 `load_config()` 读进来，顺便做道安检：

1. **密钥和代码分家**：apiKey 只放在配置文件里（这个文件进 `.gitignore`），不写死进代码，也不进 git；
2. **配置错了说人话**：文件丢了、JSON 坏了、字段缺了，都抛带中文说明的 `ConfigError`，而不是甩给读者一串 traceback；
3. **换个目录也能找到**：`load_config()` 按「当前目录 → `~/.powercode/`」的顺序找 `provider.json`，不会因为你在别的目录跑就找不到。

`provider.json` 沿用了原作者的字段名（`baseURL`/`apiKey`），代码里再映射成 Python 习惯的 snake_case：

**`powercode_py/config.py`**

```python
"""加载并校验 provider.json 配置。"""

import json
from dataclasses import dataclass
from pathlib import Path


class ConfigError(Exception):
    """配置加载或校验失败。"""


DEFAULT_FILENAME = "provider.json"


@dataclass
class Config:
    """运行所需的 provider 配置（snake_case 字段）。"""

    base_url: str
    api_key: str
    model: str


def _candidate_paths() -> list[Path]:
    """按优先级返回查找配置的候选路径：当前目录 → 用户目录 ~/.powercode/。"""
    return [
        Path.cwd() / DEFAULT_FILENAME,
        Path.home() / ".powercode" / DEFAULT_FILENAME,
    ]


def _load(path: Path) -> Config:
    """读取并校验指定路径的 provider.json。"""
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ConfigError(f"配置文件 {path} 不是合法的 JSON：{exc}") from exc

    if not isinstance(raw, dict):
        raise ConfigError(f"配置文件 {path} 顶层必须是 JSON 对象。")

    field_map = {
        "baseURL": "base_url",
        "apiKey": "api_key",
        "model": "model",
    }
    invalid = [
        key
        for key in field_map
        if not isinstance(raw.get(key), str) or not raw.get(key).strip()
    ]
    if invalid:
        raise ConfigError(
            f"配置文件 {path} 的字段缺失或不是非空字符串：{', '.join(invalid)}"
        )

    return Config(
        base_url=raw["baseURL"].strip(),
        api_key=raw["apiKey"].strip(),
        model=raw["model"].strip(),
    )


def load_config(path: str | Path | None = None) -> Config:
    """加载并校验 provider.json 配置。

    优先使用显式传入的 path；否则按「当前目录 → 用户目录 ~/.powercode/」顺序
    查找第一个存在的 provider.json。

    provider.json 沿用原作者字段名（baseURL/apiKey/model，camelCase），
    这里映射为 Python 侧的 snake_case 字段。
    """
    if path is not None:
        p = Path(path)
        if not p.exists():
            raise ConfigError(
                f"找不到配置文件 {p}。请先复制 provider.json.example 为 provider.json 并填入你的 API Key。"
            )
        return _load(p)

    candidates = _candidate_paths()
    for candidate in candidates:
        if candidate.exists():
            return _load(candidate)

    searched = "\n".join(f"  - {p}" for p in candidates)
    raise ConfigError(
        "找不到配置文件 provider.json。请复制 provider.json.example 为 provider.json 并填入你的 API Key，放在以下任一位置：\n"
        + searched
    )
```

**提交**：`git commit -m "feat(config): 加载并校验 provider.json 配置"`

### 四、写 ChatClient

`openai` SDK 本身调用很固定，但直接拿来用有几个坑，于是我们包一层 `ChatClient`，相当于给模型配个专职联络员：

- **错要分清**：`apiKey` 填错（认证失败）、网断了（连接失败）、响应太慢（超时），补救动作各不相同，所以各转成一句人话；
- **设个超时**：默认可能等十几分钟，这里显式设 60 秒，网络黑洞也不至于干等；
- **空结果兜底**：模型万一返回空 `choices` 或空 `message`，返回空串而不是抛错。

**`powercode_py/chat.py`**

```python
"""封装 OpenAI 兼容 SDK，提供一问一答能力。"""

import openai
from openai import OpenAI

from .config import Config


class ChatError(Exception):
    """调用模型失败。"""


class ChatClient:
    """OpenAI 兼容客户端的一层薄封装。"""

    def __init__(self, config: Config, client=None, timeout: float = 60.0):
        self.config = config
        self.client = client if client is not None else OpenAI(
            base_url=config.base_url,
            api_key=config.api_key,
            timeout=timeout,
        )

    def complete(self, prompt: str) -> str:
        """发送一句用户消息，返回模型回复文本。"""
        try:
            completion = self.client.chat.completions.create(
                model=self.config.model,
                messages=[{"role": "user", "content": prompt}],
            )
        except openai.AuthenticationError as exc:
            raise ChatError(
                f"认证失败，请检查 provider.json 里的 apiKey 是否正确：{exc}"
            ) from exc
        except openai.APITimeoutError as exc:
            raise ChatError(f"请求超时，请稍后重试或检查网络：{exc}") from exc
        except openai.APIConnectionError as exc:
            raise ChatError(f"网络连接失败，请检查网络或 baseURL：{exc}") from exc
        except openai.APIError as exc:
            raise ChatError(f"调用模型失败：{exc}") from exc

        if not completion.choices:
            return ""
        message = completion.choices[0].message
        if message is None:
            return ""
        return message.content or ""
```

**提交**：`git commit -m "feat(chat): 封装 OpenAI 兼容 SDK 的 ChatClient"`

### 五、写 CLI 入口

最后写 `main()`，它就是整支队伍的"接线员"：解析参数 → 读配置 → 调模型 → 打印结果；哪一步出错，把清晰错误打到 stderr 并返回 1。

`argparse` 是标准库自带的参数解析器，`prompt` 用 `nargs="?"` 表示"可选的单个参数"，这样 `powercode` 不带参数时会给出用法提示。

**`powercode_py/cli.py`**

```python
"""powercode 命令行入口：一问一答。"""

import argparse
import sys

from .chat import ChatClient, ChatError
from .config import ConfigError, load_config


def main(argv: list[str] | None = None) -> int:
    """CLI 入口：`powercode "你的问题"` 打印模型回复，返回 0/1。"""
    parser = argparse.ArgumentParser(
        prog="powercode",
        description="从零手搓的 AI Agent：一问一答。",
    )
    parser.add_argument("prompt", nargs="?", help="要发给模型的问题")
    parser.add_argument(
        "--provider",
        help="指定 provider.json 路径（默认按当前目录 → ~/.powercode/ 查找）",
    )
    args = parser.parse_args(argv)

    if not args.prompt:
        print('用法：powercode "你的问题"', file=sys.stderr)
        return 1

    try:
        config = load_config(args.provider)
        reply = ChatClient(config).complete(args.prompt)
    except (ConfigError, ChatError) as exc:
        print(f"错误：{exc}", file=sys.stderr)
        return 1

    print(reply)
    return 0
```

**提交**：`git commit -m "feat(cli): 提供 powercode 命令行一问一答入口"`

## 安装并运行

代码齐了，装依赖并让 `powercode` 命令生效：

```bash
uv venv && uv pip install -e .      # 或用 pip install -e .
```

然后复制配置模板，填上你自己的 API Key：

```bash
cp provider.json.example provider.json   # 填 baseURL / apiKey / model
```

> 也可以放到 `~/.powercode/provider.json`（Windows 是 `C:\Users\你\.powercode\provider.json`），这样在任何目录都能跑；或运行时用 `powercode --provider 路径 "你的问题"` 显式指定。

跑一下：

```bash
$ powercode "用一句话解释什么是 Python"
Python 是一种语法简洁、易读易学且应用广泛的通用高级编程语言。
```

看到这样的回答，这一篇就算落地了。

## 总结

这一篇只搭了三块积木：`config` 读配置、`ChatClient` 封装调用、`cli` 提供入口。它们仨，就是后面所有能力的地基——严格说，它现在还算不上 Agent，因为还看不到你的项目；下一篇就给它配装备。

## 预告

下一篇，给这位"指挥官"配上第一件装备——读取文件的能力，让它不再只凭脑子答，而是能翻开你的项目代码来说话。
