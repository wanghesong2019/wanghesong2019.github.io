import { getCollection } from 'astro:content';

export const COLUMNS = [
  {
    id: 'handbuilt-agent',
    name: '手搓 AI Agent',
    blurb: '不靠框架，从零把一个只会聊天的 LLM，一步步手搓成能读、能写、能跑、能规划的 Agent。',
  },
  {
    id: 'langgraph',
    name: 'LangGraph 实战入门',
    blurb: '每个知识点 = 一个可运行 demo + 一篇博客 + 标注到章节的参考文献。',
  },
  {
    id: 'agent-systems',
    name: 'AI Agent 系统底层',
    blurb: '哈佛 CS2680 学习笔记，拆 agent 系统最下面的那几层：loop、harness、上下文、GPU。持续更新。',
  },
] as const;

export function columnName(id: string): string {
  return COLUMNS.find((c) => c.id === id)?.name ?? id;
}

// 文章按时间升序、同天按专栏再按序号，保证全局「RUN #N」稳定
export async function sortedPosts() {
  const posts = await getCollection('blog');
  return posts.sort((a, b) => {
    const d = a.data.date.getTime() - b.data.date.getTime();
    if (d !== 0) return d;
    const c = a.data.column.localeCompare(b.data.column);
    if (c !== 0) return c;
    return a.data.order - b.data.order;
  });
}

// glob loader 的 entry.id 形如 "handbuilt-agent/01-chat"，取最后一段即 slug
export function slugOf(entry: { id: string }): string {
  return entry.id.split('/').pop() ?? entry.id;
}
