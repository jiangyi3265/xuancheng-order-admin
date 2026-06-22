# 玄成科技接单系统管理后台

玄成科技接单系统管理后台面向老板和员工使用，覆盖快速建单、订单看板、状态流转、附件预览、工作台待办、数据驾驶舱和系统设置等场景，连接后端服务完成接单协同管理。

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
