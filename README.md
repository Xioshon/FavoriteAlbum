# ONE / ONE · Eason

一个双人实时选歌小游戏：从 8 张陈奕迅代表专辑中逐张选择最喜欢的一首，支持陌生人匹配、私人房间、PASS、进度恢复和网易云／YouTube／Apple Music 搜索预览。

## 启用实时功能

1. 打开 Supabase 项目的 **Authentication → Sign In / Providers → Anonymous Sign-Ins** 并启用。
2. 打开 **SQL Editor**，复制并执行 [supabase.sql](./supabase.sql) 的全部内容。
3. GitHub Pages 会自动发布前端。

前端只使用 Supabase publishable key；不要在仓库放入 service role key 或数据库密码。

曲目资料来自 MusicBrainz，封面来自 Cover Art Archive。网站不储存或提供音讯。
