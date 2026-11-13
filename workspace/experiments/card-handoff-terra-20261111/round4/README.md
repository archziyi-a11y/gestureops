# 第四轮独立单卡测试
日期：2026-11-11。每卡 INPUT 为当前工作台观测与生成器的快照。只读维护测试，不是业务写入或修复授权。
- bots: 01a1c9b6-e88b-7ac3-abfe-6ac94cc43c4f / Aristotle
- connections: 01a1c9b6-e9d4-75b1-9ee2-6c0a53ceda32 / Feynman
- sales-sources: 01a1c9b6-eb49-7351-a252-87fb6d5061c1 / Harvey
bots 首次启动返回 Bad Request，不计业务或上下文失败；替代任务 01a1c9b9-9a67-76b1-8834-97267923e086 / Huygens。
connections 首次启动返回 Bad Request，不计业务或上下文失败；替代任务 01a1c9b9-9b94-7bd3-9031-85be28d8b21d / Planck。
每卡仅写本目录 RESULT.md 与 CONTEXT-FEEDBACK.md。不读取其他轮次/卡片报告；不改共享系统。完成后主协作者核对，不将已启动写成已通过。
