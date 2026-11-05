# 玄成科技接单系统管理后台

面向总管理员和下属管理员的接单管理后台：工作台待办、接单看板 / 列表（筛选、分页、导出 Excel）、项目详情与沟通、Bug 跟进、项目记事本、回收站、客户账号、成员管理、操作日志、数据站和设置。

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

访问 `http://localhost:5173`。开发服务器把 `/jiedan`、`/login`、`/captchaImage` 代理到后端，后端默认 `http://localhost:8080`；本机 8080 被占用时用环境变量 `XC_BACKEND` 指向别处，例如 `XC_BACKEND=http://localhost:18091 npm run dev`。

## 当前部署

- 管理后台：https://jiedanxt.oksja.cn/
- 客户端：https://jiedanxt.oksja.cn/client/
- 后端由同域名 `/jiedan/**`、`/login`、`/captchaImage` 代理。
- GitHub Actions 只构建并保存产物，不自动部署。发布操作见后端仓库 `deploy/production.md`。
- 正式管理员密码单独交付；客户账号由管理员在「客户账号」中创建。线上没有预置演示数据。

## 新电脑协作

当前开发版本已合并至默认 main 分支。安装 Node.js 22 后执行 npm ci、npm run dev。完整的克隆、本地数据库、Redis 和后端启动步骤见 [后端开发说明](https://github.com/jiangyi3265/xuancheng-order-backend#新电脑协作开发)。
