# T4 验证证据（2026-09-24）

命令：`pnpm test`（8 文件 77 例全过，见 test-output.txt）、`pnpm typecheck`（exit 0，见 typecheck.txt）。T4 用例清单见 t4-cases.txt。

| 完成标准 | 用例 |
| --- | --- |
| decide：view_table→act 后停止；say+act+updateWorkingMemory 同步执行、WM 落 SQLite（mastra_resources） | agents.test.ts「opponent decide」前两例 |
| 信息隔离（T2 真实引擎：30 个种子 × 弃牌到摊牌 / 全员全下 runout 含边池 / 全弃不摊牌，每个行动前后逐座位检查） | views.test.ts「buildSeatView」「publicHandResult」；agents.test.ts「hand_history …」 |
| 意图取舍：两个 act 取第一个；pause 优先于 hint | agents.test.ts「一步里两个 act」「proactive：pause 优先于 hint」 |
| review 不暴露 updateWorkingMemory | agents.test.ts「review 不暴露…」（模型收到的工具仅 recent_hands，且无消息落库） |
| 泄牌过滤正反例 | leak.test.ts |
| AgentQueue：抢占等待、超 2 秒直接执行、丢弃非 durable、durable 先执行、idle | queue.test.ts |
| resolveModel：内置不传 url、兼容传 url、未配置/悬空引用/解密失败未就绪 | resolve.test.ts |
| testProvider：required 成功/被拒转 auto/端点变更不写回 | resolve.test.ts（本地假 OpenAI 兼容端点） |
