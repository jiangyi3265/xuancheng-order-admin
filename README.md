# 玄成科技接单系统管理后台

玄成科技接单系统管理后台面向老板和员工使用，覆盖快速建单、订单看板、状态流转、附件预览、工作台待办、数据驾驶舱、客户账号管理和系统设置等场景，连接后端服务完成接单协同管理。

老板和员工可在「客户账号」页为客户创建登录账号、重置密码、删除账号（删除时自动解绑其名下项目）；建单/编辑时可在「客户账号」下拉选择或快捷新建并绑定，绑定后客户即可在客户端登录查看该项目并双向沟通。

## 技术栈

- Vue 3
- Vite 5
- Element Plus
- Vue Router
- ECharts
- vuedraggable
- Sass

## 关联仓库

| 子项目 | GitHub 仓库 | 说明 |
| --- | --- | --- |
| 后端服务 | [xuancheng-order-backend](https://github.com/jiangyi3265/xuancheng-order-backend) | 提供订单、提醒、时间线、系统配置等业务 API |
| 管理后台 | [xuancheng-order-admin](https://github.com/jiangyi3265/xuancheng-order-admin) | 面向老板和员工的接单管理后台 |
| 用户端 | [xuancheng-order-app](https://github.com/jiangyi3265/xuancheng-order-app) | 面向客户的公开需求提交入口 |

## 快速启动

```bash
# 后端默认运行在 http://localhost:8080
npm install
npm run dev
```

默认访问地址为 `http://localhost:5173`。开发环境通过 `vite.config.js` 将 `/jiedan` 和 `/login` 代理到后端服务。

## 简历描述示例

使用 Vue3 + Element Plus 构建接单协同管理后台，实现订单看板、快捷建单、附件处理、数据图表和角色视角切换，提升小团队订单交付跟踪效率。

## 当前部署（2026-10-29）

- 管理后台：https://jiedanxt.oksja.cn/
- 客户端：https://jiedanxt.oksja.cn/client/
- 后端由同域名 `/jiedan/**`、`/login`、`/captchaImage` 代理，服务监听 `127.0.0.1:18091`。
- AI 改码流水线已移除；订单、客户账号、双向沟通、Bug 跟进和附件功能保留。
- GitHub Actions 负责构建并保存产物，已移除指向旧域名的自动部署。发布操作见后端 `deploy/production.md`。
- 正式管理员密码单独交付；客户账号由管理员在「客户账号」中创建。线上没有预置演示客户和演示订单。
