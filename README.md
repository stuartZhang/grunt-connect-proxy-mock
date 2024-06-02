# grunt-connect-proxy-mock

给`grunt`的`Dev Server`提供了

1. `Mock`功能 — 既能`mock`普通的`Restful API`，也能伪装`WebSocket Server`推送`ws`假数据。
2. `Proxy`功能 — 额外配备了对真实后端响应数据结果集的篡改能力。

的中间件。

## 用法概述

在`npm i -D grunt-connect-proxy-mock`安装之后，不需要显式地向`Gruntfile`上下文导入该插件。而仅需向`grunt`任务清单插入`configureProxyMock`任务。其位置在`configureProxies`之后与`connect`之前。例如，

```javascript
    grunt.registerTask('serve', function (target) {
        grunt.task.run([
            'configureProxies:serve',
            // 这里是插入点
            'configureProxyMock:livereload',
            'connect:livereload'
        ]);
    });
```

在`grunt-contrib-connect`插件配置结点`connect`下的自定义任务配置子节点内（例如，任务为`livereload`的配置结点），添加三个新配置节点`webSocketMockRouteRules`，`webMockRouteRules`和`webProxyRouteRules`。

```javascript
{
    connect: {
        livereload: {
            // WebSocket Mock Server 的路由清单
            webSocketMockRouteRules: [..., {
                //【必填】监听 WebSocket 请求的 url 路径
                pathname: string,
                //【可选】WebSocket 连接成功后的回调函数
                onConnection: (ws, wss) => void,
                //【必填】当收到来自网页端 WebSocket 推送消息时的回调函数
                // - 在 onMessage 回调函数体内，以 ws.send(string) 成员方法回发消息给网页端。
                onMessage: (message, ws, wss) => void,
                //【可选】WebSocket 连接失败时的回调函数
                onError: (err, ws, wss) => void
            }, ...],
            // Web Mock Server 的路由清单
            webMockRouteRules: [..., [
                //【必填】监听 HTTP 请求的全大写方法名
                method, 
                //【必填】监听 HTTP 请求的 url 路径。而且，支持
                // - 路径参数       req.params 
                // - 查询字符串参数 req.query
                // - 表单参数       req.body
                pathname, 
                //【必填】Mock Server 中间件反复给网页端的假数据
                // - 在回调函数内，不需要显式地 res.send() 回发数据集。将回发消息作为函数返回值返回即可
                object | (req, res) => object
            ], ...],
            // Web Proxy Server 的路由清单
            webProxyRouteRules: [..., [
                //【必填】监听 HTTP 请求的全大写方法名
                method, 
                //【必填】监听 HTTP 请求的 url 路径。
                pathname, 
                //【可选】监听 HTTP 请求的 url 查询字符串参数
                // - 若任务，必须全部出现在被拦截的请求体内
                query, 
                //【必填】真响应数据集的篡改函数
                // - buffer 内容需手工转为字符串，以备篡改使用。
                // - 在回调函数内，不需要显式地 res.send() 回发数据集。将回发消息作为函数返回值返回即可
                (buffer: Buffer, req, res) => string | Buffer
            ], ...]
        }
    }
}
```

### 开启`Proxy Dev Server`中间件的先决条件

第一，在宿主工程内，与`grunt-connect-proxy-mock`依赖项平级安装`peer dependency`依赖项`grunt-connect-proxy@^0.2.0`。

第二，在`connect`中相同的任务配置结点下，给`grunt-connect-proxy`插件添加配置结点`proxies`

```javascript
{
    connect: {
        livereload: {
            proxies: [..., {
                //【必填】监听 HTTP 请求的 url 路径。
                context: string,
                //【必填】转发给后端真实服务的主机域名
                host: string,
                //【必填】转发给后端真实服务的端口号
                port: number,
                //【可选】转发后端真实服务是否是 ssl 的
                https: boolean
            }, ...]
        }
    }
}
```

## 完整的`Gruntfile`配置例程

```javascript
{
    // 
    // 供 grunt-connect 插件的配置结点
    //
    connect: {
        livereload: {
            // 
            // 供 grunt-connect-proxy 插件的配置结点
            //
            proxies: [..., {
                //【必填】监听 HTTP 请求的 url 路径。
                context: string,
                //【必填】转发给后端真实服务的主机域名
                host: string,
                //【必填】转发给后端真实服务的端口号
                port: number,
                //【可选】转发后端真实服务是否是 ssl 的
                https: boolean
            }, ...],
            // 
            // 供 grunt-connect-proxy-mock 插件的（多个）配置结点
            //
            // WebSocket Mock Server 的路由清单
            webSocketMockRouteRules: [..., {
                //【必填】监听 WebSocket 请求的 url 路径
                pathname: string,
                //【可选】WebSocket 连接成功后的回调函数
                onConnection: (ws, wss) => void,
                //【必填】当收到来自网页端 WebSocket 推送消息时的回调函数
                // - 在 onMessage 回调函数体内，以 ws.send(string) 成员方法回发消息给网页端。
                onMessage: (message, ws, wss) => void,
                //【可选】WebSocket 连接失败时的回调函数
                onError: (err, ws, wss) => void
            }, ...],
            // Web Mock Server 的路由清单
            webMockRouteRules: [..., [
                //【必填】监听 HTTP 请求的全大写方法名
                method, 
                //【必填】监听 HTTP 请求的 url 路径。而且，支持
                // - 路径参数       req.params 
                // - 查询字符串参数 req.query
                // - 表单参数       req.body
                pathname, 
                //【必填】Mock Server 中间件反复给网页端的假数据
                // - 在回调函数内，不需要显式地 res.send() 回发数据集。将回发消息作为函数返回值返回即可
                object | (req, res) => object
            ], ...],
            // Web Proxy Server 的路由清单
            webProxyRouteRules: [..., [
                //【必填】监听 HTTP 请求的全大写方法名
                method, 
                //【必填】监听 HTTP 请求的 url 路径。
                pathname, 
                //【可选】监听 HTTP 请求的 url 查询字符串参数
                // - 若任务，必须全部出现在被拦截的请求体内
                query, 
                //【必填】真响应数据集的篡改函数
                // - buffer 内容需手工转为字符串，以备篡改使用。
                // - 在回调函数内，不需要显式地 res.send() 回发数据集。将回发消息作为函数返回值返回即可
                (buffer: Buffer, req, res) => string | Buffer
            ], ...]
        }
    }
}
```
