# 玄成接单 · 一体化协作系统

面向总管理员和下属管理员的接单管理后台：工作台待办、接单看板 / 列表（筛选、分页、导出 Excel）、项目详情与沟通、Bug 跟进、项目记事本、回收站、客户账号、成员管理、操作日志、数据站和设置。

## 统一应用（2026-11-05 改版）

本仓库现在同时承载管理端、员工端和客户门户。`/login` 只登录一次，通过 `/getInfo` 确认身份；管理人员进入工作台，客户进入 `/projects`。客户组件位于 `src/customer/`，复用既有门户接口，内部数据仍由后端隔离。

- 手机主导航：工作台、项目、消息、我的；客户为我的项目、提交需求、消息、我的。
- 新增消息汇总、独立审批中心、个人中心及账号安全页。
- 客户、成员、回收站、审计日志在手机上使用卡片，桌面保留表格。
- 设计画布中的接单、交回、收款、验收等页面对应项目内操作，手机以全屏表单呈现，桌面使用对话框。
- `src/styles/design.scss` 定义蓝白视觉规范；项目封面优先使用真实图片附件，否则显示示意图。
- `/client/` 旧入口由 `public/client/index.html` 保留跳转，项目深链接继续可用。发布本仓库 `dist/` 即包含兼容入口，无须再覆盖客户端构建。
- Nginx 登录代理需包含 `/getInfo`，例如 `location ~ ^/(login|logout|captchaImage|getInfo)$`。

验证：`npm ci && npx playwright install chromium && npm run test:ui && npm run build`。浏览器测试使用隔离的接口响应，覆盖角色登录、权限导航、项目分区、表单及 320/390/1440 像素布局；不会写入生产数据。

## 谁能看到什么

| 角色 | 项目范围 | 菜单 |
| --- | --- | --- |
| 总管理员 | 全部项目 | 全部菜单，含「成员管理」「操作日志」，可在「回收站」彻底删除 |
| 下属管理员 | 只有负责人是自己的项目 | 没有「成员管理」「操作日志」；「回收站」只显示自己名下的 |

身份来自登录令牌（后端 `/jiedan/staff/me`），页面上不能手动切换角色。数据范围由后端强制，前端隐藏菜单只是体验层面的。
右上角的钥匙图标可以修改自己的登录密码，修改后其他设备会被自动退出。

## 几个值得知道的行为

- **删除项目 = 放进回收站**，聊天记录、Bug、记事本都还在，可恢复；只有总管理员能“彻底删除”。
- **列表刷新**：每 10 秒只问后端一个很轻的“变更戳”，有变化才重新拉列表。
- **导出 Excel**：按当前筛选条件导出，后端只会导出当前账号有权看到的项目，并记入操作日志。
- 看板的「已完成」列只显示最近 30 个，更早的在「列表」里分页查看。

## 技术栈

Vue 3 · Vite 5 · Element Plus · Vue Router · ECharts · vuedraggable · Sass

## 关联仓库

| 子项目 | GitHub 仓库 | 说明 |
| --- | --- | --- |
| 后端服务 | [xuancheng-order-backend](https://github.com/jiangyi3265/xuancheng-order-backend) | 订单、权限、日志、备份脚本等业务 API 与部署文档 |
| 管理后台 | [xuancheng-order-admin](https://github.com/jiangyi3265/xuancheng-order-admin) | 本仓库 |
| 用户端 | [xuancheng-order-app](https://github.com/jiangyi3265/xuancheng-order-app) | 面向客户的项目查看、沟通与需求提交 |

## 本机开发

```bash
npm install
npm run dev
```

访问 `http://localhost:5173`。开发服务器把 `/jiedan`、`/login`、`/getInfo`、`/captchaImage` 代理到后端，后端默认 `http://localhost:8080`；本机 8080 被占用时用环境变量 `XC_BACKEND` 指向别处，例如 `XC_BACKEND=http://localhost:18091 npm run dev`。

## 当前部署

- 管理后台：https://jiedanxt.oksja.cn/
- 客户端：https://jiedanxt.oksja.cn/client/
- 后端由同域名 `/jiedan/**`、`/login`、`/captchaImage` 代理。
- GitHub Actions 只构建并保存产物，不自动部署。发布操作见后端仓库 `deploy/production.md`。
- 正式管理员密码单独交付；客户账号由管理员在「客户账号」中创建。线上没有预置演示数据。

## 新电脑协作

当前开发版本已合并至默认 main 分支。安装 Node.js 22 后执行 npm ci、npm run dev。完整的克隆、本地数据库、Redis 和后端启动步骤见 [后端开发说明](https://github.com/jiangyi3265/xuancheng-order-backend#新电脑协作开发)。
