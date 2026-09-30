# cf-demo · 带登录的留言板

一个「前后端分离」的 Cloudflare 全栈 demo：前端部署到 **Pages**，后端部署到 **Workers**，数据落在 **D1**，头像存 **R2**，验证邮件走 **Resend**。

目的是把这条零运维路线的每个环节都真实跑一遍——包括跨域、JWT 认证、边缘 SQLite、对象存储预签名直传和邮件发信。

## 线上地址

| 部分 | 地址 |
| --- | --- |
| 前端（Pages） | https://cf-demo-web.pages.dev |
| 后端（Workers） | https://cf-demo-api.tiger09527.workers.dev |

当前部署里 **R2 和 Resend 都没启用**（R2 需要先绑定支付方式才能激活），所以：

- 头像上传接口返回 `503 头像功能未启用：当前部署没有绑定 R2 存储桶`，前端会自动隐藏「换头像」按钮
- 注册后的验证邮件不会真的发出，改为在响应里返回 `devVerifyLink`，注册成功页上有个按钮可直接点开验证

另外 **注册接口已开启口令保护**：口令存在 D1 的 `app_settings` 表里（**不在仓库里**），
注册表单会多出一个「注册口令」输入框，不带或带错口令分别返回 `400 需要填写注册口令` / `403 注册口令不正确`。
详见「[注册口令](#注册口令)」。

想启用 R2 / Resend 只要按下面「部署到 Cloudflare」里对应的一节改配置重部署即可，**业务代码一行都不用动**。

---

## 技术栈

| 层 | 选型 |
| --- | --- |
| 前端 | Vite + React + TypeScript（纯 SPA） |
| 前端托管 | Cloudflare Pages |
| 后端 | Hono + TypeScript |
| 后端运行时 | Cloudflare Workers |
| 数据库 | Cloudflare D1 + Drizzle ORM |
| 对象存储 | Cloudflare R2（预签名直传 / Worker 中转双路径） |
| 邮件 | Resend REST API |
| 认证 | JWT（jose，HS256）+ `Authorization: Bearer` |
| 密码哈希 | WebCrypto PBKDF2-SHA256，10 万次迭代 |
| 包管理 | npm workspaces（monorepo） |

---

## 目录结构

```
cf-demo/
├── apps/
│   ├── api/                     # 后端：部署到 Workers
│   │   ├── wrangler.jsonc       # Workers 配置 + D1/R2 绑定
│   │   ├── drizzle.config.ts
│   │   ├── migrations/          # D1 SQL 迁移
│   │   └── src/
│   │       ├── index.ts         # Hono 入口、CORS、错误处理
│   │       ├── env.ts           # 绑定与密钥类型
│   │       ├── db/              # schema.ts / client.ts
│   │       ├── lib/             # password / jwt / mail / validate / serialize / r2
│   │       ├── middleware/      # auth.ts
│   │       └── routes/          # auth / messages / uploads / avatars
│   └── web/                     # 前端：部署到 Pages
│       ├── public/_redirects    # SPA 回退规则
│       └── src/
│           ├── api.ts           # fetch 封装，自动附带 Bearer
│           ├── auth.tsx         # 登录态 Context
│           ├── router.ts        # 极简路由
│           └── pages/           # Login / Register / Board / VerifyEmail
└── .github/workflows/deploy-api.yml
```

---

## 快速开始（本地）

```bash
# 1. 安装依赖
npm install

# 2. 生成 D1 迁移文件（已提交，改过 schema 才需要重跑）
npm run db:generate

# 3. 应用迁移到本地 D1
npm run db:migrate:local

# 4. 配置本地密钥
cp apps/api/.dev.vars.example apps/api/.dev.vars
#    至少填 JWT_SECRET：
#    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 5. 配置前端 API 地址
cp apps/web/.env.example apps/web/.env

# 6. 同时启动前后端
npm run dev
```

- 前端：http://localhost:5173
- 后端：http://localhost:8787
- 健康检查：http://localhost:8787/api/health

> 本地开发**不需要**任何 Cloudflare 账号或联网授权：D1 和 R2 都由 wrangler 在本地模拟。
> 但如果 `wrangler.jsonc` 里的 `database_id` 变了（比如填了真实的线上 id），
> 本地库会按新 id 换一个文件，需要重跑一次 `npm run db:migrate:local`。

### 没配邮件服务也能跑

`RESEND_API_KEY` 留空时，验证邮件不会真的发出，而是**打印到 `wrangler dev` 的控制台**，同时注册接口会在响应里带上 `devVerifyLink`，前端注册成功页会直接给出「打开验证链接」按钮。整条注册 → 验证 → 登录 → 留言流程照样走通。

### 没启用 R2 也能跑

`wrangler.jsonc` 里的 `r2_buckets` 绑定默认是**注释掉的**，此时头像相关接口统一返回 `503 头像功能未启用`，
`/api/health` 的 `features.avatarUpload` 为 `false`，前端自动隐藏「换头像」按钮。留言板核心功能不受影响。

---

## API

所有接口前缀 `/api`。

| 方法 | 路径 | 认证 | 说明 |
| --- | --- | --- | --- |
| GET | `/health` | — | 健康检查，附带 `features.{avatarUpload,mail}` 能力开关 |
| POST | `/auth/register` | — | 注册并发送验证邮件（配了 `REGISTER_CODE` 时须带 `inviteCode`） |
| POST | `/auth/login` | — | 邮箱密码换 JWT |
| GET | `/auth/me` | Bearer | 当前用户 |
| POST | `/auth/verify-email` | — | 消费邮箱验证令牌 |
| GET | `/messages?limit=20&cursor=` | — | 留言列表（游标分页，时间倒序） |
| POST | `/messages` | Bearer | 发表留言（1–500 字） |
| DELETE | `/messages/:id` | Bearer | 删除自己的留言 |
| POST | `/uploads/avatar` | Bearer | 申请头像上传目标 |
| POST | `/uploads/avatar/direct` | Bearer | 降级路径：经 Worker 中转上传 |
| POST | `/uploads/avatar/confirm` | Bearer | 确认上传，落库并清理旧头像 |
| GET | `/avatars/:userId` | — | 读出头像（由 Worker 从 R2 转发） |

错误统一返回 `{ "error": "中文错误信息" }`。

---

## 部署到 Cloudflare

下面是**实际跑过一遍**的步骤（本项目就是按这个顺序上线的）。

### 1. 登录并创建数据库

```bash
cd apps/api
npx wrangler login              # 交互式浏览器授权，必须本人操作
npx wrangler d1 create cf-demo-db
```

`d1 create` 会打印一段配置。**只取 `database_id`**，填进 `apps/api/wrangler.jsonc` 替换占位符 `00000000-0000-0000-0000-000000000000`。

> 它建议的 `binding: "cf_demo_db"` **不要用** —— 那是 wrangler 按库名自动生成的默认值，
> 本项目配置里已有 `"binding": "DB"`，代码里全部引用 `env.DB`。binding 只是本地别名，
> 由 `wrangler.jsonc` 定义，跟服务端没有约定关系，随便叫什么都可以，但改了就要同步改代码。

> ⚠️ 填完 `database_id` 后本地库会「空掉」：wrangler 按 database_id 区分本地 D1 文件，换了 id 等于换了个库。
> 重跑一次 `npm run db:migrate:local` 就好。

### 2. 写入后端密钥

```bash
cd apps/api
npx wrangler secret put JWT_SECRET          # 32 字节随机 hex，必填
# 下面都是可选，不配就走降级路径
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put R2_ACCOUNT_ID
npx wrangler secret put R2_ACCESS_KEY_ID
npx wrangler secret put R2_SECRET_ACCESS_KEY
```

`vars.ALLOWED_ORIGINS`（CORS 白名单，逗号分隔）和 `vars.APP_BASE_URL`（拼验证邮件链接用）都在 `wrangler.jsonc` 里，
默认已包含 `http://localhost:5173` 和 `https://cf-demo-web.pages.dev`，换成自己的域名即可。

本地开发想保持指向 localhost，把这两个变量写进 `apps/api/.dev.vars` 覆盖就行 —— `.dev.vars` 优先级高于 `wrangler.jsonc` 的 `vars`。

### 3. 迁移并部署后端

```bash
npm run db:migrate:remote
npm run deploy:api
```

部署完会打印 Worker 地址，形如 `https://cf-demo-api.<你的子域>.workers.dev`。

### 4. 部署前端

**方式 A：本地构建 + wrangler 直传**（本项目用的就是这条，不需要连仓库）

```bash
cd apps/web
npx wrangler pages project create cf-demo-web --production-branch=main
VITE_API_BASE_URL=https://cf-demo-api.<你的子域>.workers.dev npm run build
npx wrangler pages deploy dist --project-name=cf-demo-web --branch=main
```

**方式 B：Pages 连接 Git 仓库**（push 即自动构建）

| 项 | 值 |
| --- | --- |
| Root directory | `apps/web` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| 环境变量 | `VITE_API_BASE_URL=https://cf-demo-api.<你的子域>.workers.dev` |

> Pages 需要在**根目录**安装 workspace 依赖，如果构建时找不到依赖，把 Root directory 留空、构建命令改为 `npm install && npm run build -w @cf-demo/web`、输出目录改为 `apps/web/dist`。

### 5. 启用 R2（可选）

R2 免费额度必须先**绑定支付方式**才能激活，否则 `wrangler r2 bucket create` 会直接报
`code 10042 Please enable R2 through the Cloudflare Dashboard`。没启用时项目照常运行，只是没有头像功能。

启用后三步：

1. `npx wrangler r2 bucket create cf-demo-avatars`
2. 把 `apps/api/wrangler.jsonc` 里被注释掉的 `r2_buckets` 段取消注释
3. 重新 `npm run deploy:api`

前端会自动从 `/api/health` 的 `features.avatarUpload` 读到开关，把「换头像」按钮放出来。**业务代码一行都不用改。**

### 6. 可选：配置 CI 自动部署

在 GitHub 仓库的 Settings → Secrets and variables → Actions 添加：

- `CLOUDFLARE_API_TOKEN`（权限需要 Workers Scripts:Edit、D1:Edit）
- `CLOUDFLARE_ACCOUNT_ID`

之后 push 到 `main` 且改动落在 `apps/api/` 时，`.github/workflows/deploy-api.yml` 会自动跑迁移并部署 Worker。

---

## 注册口令

留言板是公开页面，注册接口默认谁都能调，容易被脚本批量灌垃圾账号。配一个口令就能关上这道门。

**口令存在 D1 的 `app_settings` 表里**，既不进代码、也不进 `wrangler secret`。三个选项的取舍：

| 放哪 | 保密？ | 自己事后能查？ |
| --- | --- | --- |
| 代码 / `wrangler.jsonc` | ❌ 本仓库是公开的 | ✅ |
| `wrangler secret` | ✅ | ❌ **写进去就读不出来** |
| **D1 `app_settings` 表** | ✅ | ✅ |

建表的迁移（`0001_*.sql`）会进仓库，但**值不进仓库** —— 值在部署时手工 insert 一次。

**写入 / 查看**：

```bash
cd apps/api

# 写入。换口令就是重跑这条，on conflict 直接覆盖
npx wrangler d1 execute cf-demo-db --remote --command "insert into app_settings (key, value, updated_at) values ('register_code', '你的口令', strftime('%s','now') * 1000) on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at"

# 查看（只有你自己的 Cloudflare 账号能查）
npx wrangler d1 execute cf-demo-db --remote --command "select value from app_settings where key = 'register_code'"
```

本地开发把 `--remote` 换成 `--local`。**换口令不需要重新部署代码**，下一个注册请求就会用新值。

**行为**：

| 情况 | 响应 |
| --- | --- |
| 表里没这行、环境变量也没配 | 注册接口完全开放（本地开发默认如此） |
| 配了但请求没带 `inviteCode` | `400 需要填写注册口令` |
| 配了但 `inviteCode` 不匹配 | `403 注册口令不正确` |
| 匹配 | 正常注册 |

三层优先级：`app_settings.register_code` > 环境变量 `REGISTER_CODE` > 不设限。
环境变量那层只给本地开发和「迁移还没跑、表还不存在」兜底 —— 读表失败时会打一条 `console.error` 再回退，不让注册接口直接 500。

前端从 `/api/health` 的 `features.registerCodeRequired` 读开关，**没配就不显示输入框**，不会平白给用户添堵。这个开关要读一次 D1（主键查，很轻）。

**三个实现细节**：

1. 口令校验放在**最前面**，在 `requireEmail` / `hashPassword` 之前 —— 被拦掉的请求不该再花 PBKDF2 十万次迭代的算力。
2. 比较用「两边各自 SHA-256 成等长摘要 + 常数时间逐字节比较」。直接逐字符比会在第一个不同的位置提前返回，攻击者能靠响应时间逐位猜出口令。
3. 表里读出来的值会 `.trim()` 一次，防止复制粘贴带进来的首尾空白；用户输入的值不 trim（跟密码的处理保持一致）。

**⚠️ 口令要选一个真正的秘密。** 别用会出现在仓库里的东西（D1 的 `database_id`、账号 ID、域名……）——
本仓库是公开的，`wrangler.jsonc` 里的 `database_id` 谁都能看到，拿它当口令等于没设。

---

## 三个值得注意的设计决定

### 1. 用 Bearer Token 而不是 Cookie

前后端在不同域名下，Cookie 方案需要 `SameSite=None; Secure` + CORS 允许凭据，还要对抗浏览器对第三方 Cookie 的拦截。Bearer 方案只需要服务端放行 `Authorization` 头，简单可靠。

**代价**：token 存在 `localStorage`，存在 XSS 窃取风险。生产环境建议改成同域部署 + `HttpOnly` Cookie。

### 2. 密码哈希用 WebCrypto 而不是 bcrypt

Workers 免费版单次请求只有 **10ms CPU** 额度。纯 JS 实现的 bcrypt 十万次迭代要几百毫秒，会直接打爆额度。改用原生 `crypto.subtle.deriveBits` 做 PBKDF2-SHA256，十万次迭代实测约 3–8ms，跑在 native 层不占 JS CPU 时间。

存储格式：`pbkdf2$100000$<saltBase64>$<hashBase64>`。

### 3. 头像上传有两条路径

- **预签名直传**（配了 R2 S3 凭据时）：后端用 `aws4fetch` 签一个 PUT URL，浏览器直接传到 R2，**不经过 Worker，不消耗请求与 CPU 额度**。这是 R2 的正确用法。
- **Worker 中转**（没配凭据时）：走 `/uploads/avatar/direct`，由 Worker 流式写入 R2。功能等价，但会占用额度。

前端会自动根据接口返回的 `mode` 选择路径，无需手工切换。无论走哪条，最后都要调 `confirm` 落库——`confirm` 会校验 key 前缀必须是 `avatars/<当前用户id>/`，防止把别人的对象挂到自己头上。

---

## 环境变量与密钥

**后端**（`apps/api/.dev.vars` 本地 / `wrangler secret put` 线上）

| 名称 | 必填 | 说明 |
| --- | --- | --- |
| `JWT_SECRET` | 是 | 32 字节随机 hex |
| `REGISTER_CODE` | 否 | 注册口令的**兜底**值。主存在 D1 的 `app_settings` 表里，见「注册口令」 |
| `RESEND_API_KEY` | 否 | 不填则邮件降级为控制台输出 |
| `R2_ACCOUNT_ID` | 否 | 三项齐备才启用预签名直传 |
| `R2_ACCESS_KEY_ID` | 否 | |
| `R2_SECRET_ACCESS_KEY` | 否 | |

**后端普通变量**（`wrangler.jsonc` 的 `vars`）

| 名称 | 说明 |
| --- | --- |
| `APP_BASE_URL` | 用于拼验证邮件里的链接，指向前端地址 |
| `MAIL_FROM` | 发件人，如 `cf-demo <onboarding@resend.dev>` |
| `ALLOWED_ORIGINS` | 逗号分隔的 CORS 白名单 |
| `R2_BUCKET_NAME` | 预签名 URL 里使用的 bucket 名 |

**前端**（`apps/web/.env` / Pages 环境变量）

| 名称 | 说明 |
| --- | --- |
| `VITE_API_BASE_URL` | 后端地址，结尾不带斜杠 |

---

## 已知限制

1. **Resend 免费版未验证域名时只能发到你注册 Resend 用的那个邮箱**。要让别人收到邮件，必须验证一个自有域名并把 `MAIL_FROM` 改成该域名下的地址。免费额度为每月 3000 封、每天上限 100 封。
2. **Workers 免费版每天 10 万次请求、单次 CPU 10ms**。本项目的密码哈希已按此优化，但不要在这里加重计算逻辑。
3. **D1 是单点写**。SQLite 一个写者，高并发写入会排队。demo 量级完全够用。
4. **本地 D1 和线上 D1 是两套数据**，迁移要分别执行 `--local` 和 `--remote`。
5. **R2 的 S3 API 凭据和 Cloudflare 账号密码不是一回事**，需要在控制台 R2 → Manage R2 API Tokens 单独创建。
6. 本项目是 demo，未包含：找回密码、限流、邮箱唯一性的并发保护、CSRF 防护（Bearer 方案下影响较小）。
7. **R2 免费额度需要先绑定支付方式才能激活**（额度内不扣费）。未激活时 `wrangler r2 bucket create` 报 `code 10042`，本项目自动降级为「无头像」模式。
8. **`*.workers.dev` 在部分企业/校园网络下不可达**：这类网络常用 DNS 劫持把整个 `workers.dev` 泛解析到无关地址，代理也可能只放行白名单域名。如果前端加载出来但接口全部失败，先确认后端域名能不能直接访问；不行的话给 Worker 绑一个**自定义域名**（Workers → Settings → Domains & Routes）即可绕开。`pages.dev` 一般不受影响。
9. **注册口令是「一把全局共享的钥匙」**：没有按人发码、没有一次性邀请码、也没有尝试次数限流。它只解决「挡住脚本批量注册」，解决不了「拿到口令的人想注册几次就注册几次」。口令泄露了就整体轮换一次。
10. **口令在 `app_settings` 里是明文存的**，没有哈希 —— 这是刻意的取舍：哈希之后就查不出来了，而「自己能查」正是把它从 `wrangler secret` 挪进数据库的理由。表里只会有这一行，且只有账号持有者能通过 `wrangler d1 execute` 读到。真要更严，可以改成存哈希 + 另存一份明文到密码管理器。

---

## 仓库可见性：为什么这个仓库保持公开

**这个仓库是公开的，而且不打算改成私有。** 判断依据如下，将来若有人（包括未来的我）想改，先看这一段。

**仓库里没有凭据。** 对当前全部已跟踪文件、以及全部提交历史做过敏感值扫描（API key、私钥、JWT secret、注册口令），零命中。唯一出现在仓库里的「敏感长相」的值是 `apps/api/wrangler.jsonc` 里的 `database_id`，但它**不是凭据**：它是 D1 数据库的标识符，必须写进配置才能部署，而**没有 Cloudflare API Token 的话，拿到这个 id 也读不到任何数据**。Cloudflare 账号 ID 不在仓库里（它在被 gitignore 的 `.dev.vars`）。

**私有化挡不住真正想访问服务的人。** `cf-demo-web.pages.dev` 和 `cf-demo-api.tiger09527.workers.dev` 是应用本身的地址，无论仓库是公开还是私有，任何人都能直接访问。改私有只能藏源码，藏不住服务。

**改私有有两个实际代价：**

| 影响面 | 公开仓库 | 私有仓库 |
| --- | --- | --- |
| GitHub Actions | 标准托管 runner **无限免费** | 受配额限制，Free 计划 **2000 分钟/月**，超出且无付款方式会被阻断 |
| Cloudflare Pages Git 集成 | 可用 | 可用（授权 Cloudflare GitHub App 即可） |

> 注：本项目前端用的是 **Direct Upload**（`wrangler pages deploy dist`），Cloudflare 文档明确写了 Direct Upload **无法再切回** Git 集成，所以「私有化会破坏 Pages 免费自动构建」这条对本项目不成立。

**结论与规则：**

- 保持公开。省下 Actions 配额，也让别人能参考这份 Cloudflare 全栈 demo。
- **只有在真的把凭据提交进仓库时，才应该转私有** —— 而且顺序是**先轮换那个凭据，再转私有**。事后转私有并不能把已经泄露出去的东西收回来（GitHub 上被 force-push 掉的旧提交，在一段时间内仍能通过 commit SHA 直接访问）。
- 换句话说：**安全性不应该依赖仓库可见性**。上面那 10 条已知限制里的每一条，都是按「代码完全公开」这个前提设计的。

如果你确实要转私有，一次 API 调用即可（可逆，不影响默认分支）：

```bash
curl -X PATCH -H "Authorization: Bearer <你的 token>" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/<owner>/<repo> \
  -d '{"private": true}'
```

---

## 参考

- [Cloudflare Workers 定价](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare D1](https://developers.cloudflare.com/d1/)
- [Cloudflare R2](https://developers.cloudflare.com/r2/)
- [Hono 文档](https://hono.dev/)
- [Drizzle ORM](https://orm.drizzle.team/)
- [Resend 文档](https://resend.com/docs)
