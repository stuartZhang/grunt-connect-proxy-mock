module.exports = function(grunt) {
	grunt.registerTask('configureProxyMock', '增强devServer实现Restful API的Mock功能', function(config) {
		var configKey = 'connect.' + (config || 'livereload');
		var connectOptions = grunt.config(configKey);
		if (!connectOptions && config != 'livereload') {
			connectOptions = grunt.config('connect.livereload');
		}
		if (!connectOptions) {
			grunt.log.error('No connect configuration found.');
			return;
		}
		var R = require('ramda');
		/* {
			webSocketMockRouteRules: [{
				pathname: string,
				onConnection: (ws, wss) => void,
				onMessage: (message, ws, wss) => void,
				onError: (err, ws, wss) => void
			}, ...]
		} */
		R.is(Array)(connectOptions.webSocketMockRouteRules) && (function(){
			var webSocketServer = R.partial(function onCreateServer(routeRules/* [{
				pathname: string,
				onConnection: (ws, wss) => void,
				onMessage: (message, ws, wss) => void,
				onError: (err, ws, wss) => void,
				wss,
			}, ...] */, server, connect, options){
				var WebSocket = require('ws');
				R.forEach(function(routeRule){
					routeRule.wss = new WebSocket.Server({ noServer: true });
					routeRule.wss.on('connection', function(ws){
						ws.on('error', function(err){
							grunt.log.warn('[configureProxyMock][webSocketServer][onError]', err);
							typeof routeRule.onError == 'function' && routeRule.onError(err, ws, routeRule.wss);
						}).on('message', function(message){
							typeof routeRule.onMessage == 'function' && routeRule.onMessage(message, ws, routeRule.wss);
						});
						typeof routeRule.onConnection == 'function' && routeRule.onConnection(ws, routeRule.wss);
					});
				})(routeRules);
				server.on('upgrade', function(request, socket, head){
					var matchRouteRules = R.pipe(
						R.filter(R.propSatisfies(R.equals(request.url), 'pathname')),
						R.forEach(function(routeRule){
							routeRule.wss.handleUpgrade(request, socket, head, function(ws){
								routeRule.wss.emit('connection', ws, request);
							});
						})
					)(routeRules);
					R.isEmpty(matchRouteRules) && socket.destroy();
				});
			}, [connectOptions.webSocketMockRouteRules]);
			if (typeof connectOptions.options.onCreateServer == 'function') {
				var onCreateServer_ = connectOptions.options.onCreateServer.bind(connectOptions);
			}
			connectOptions.options.onCreateServer = function(server, connect, options){
				onCreateServer_ && onCreateServer_(server, connect, options);
				webSocketServer(server, connect, options);
			};
			grunt.config(configKey + '.options.onCreateServer', connectOptions.options.onCreateServer);
		})();
		/*
			webMockRouteRules: [ [method, pathname, object | callback], ... ]
		 */
		R.is(Array)(connectOptions.webMockRouteRules) && (function(){
			var webMockServer = R.partial(function middleware(routeRules/* [
				[method, pathname, object | callback],
			] */, connect, options, middleware){
				var bodyParser = require('body-parser');
				var pathParser = require('path-parser');
				var co = require('co');
				R.forEach(R.apply(function(method, pathName, response){
					middleware.unshift(function(req, res, next){
						if (req.method == method && testPathName()) {
							return co(function *(){
								var resolver = R.partial(function(resolve, reject, err){
									if (err) {
										reject(err);
									} else {
										resolve();
									}
								});
								yield new Promise(function(resolve, reject){
									bodyParser.json({limit: '150mb'})(req, res, resolver([resolve, reject]));
								});
								yield new Promise(function(resolve, reject){
									bodyParser.urlencoded({extended: false})(req, res, resolver([resolve, reject]));
								});
								buildQuery();
								var result = response;
								if (typeof result == 'function') {
									result = yield result(req, res);
								}
								res.setHeader('Content-Type', 'application/json');
								res.statusCode = 200;
								if (typeof result == 'object') {
									res.write(JSON.stringify(result));
								} else {
									res.write(result);
								}
							}).catch(function(err){
								console.error('[webMockRouteRules][' + method + '-' + pathName + ']', err);
								res.setHeader('Content-Type', 'text/plain');
								res.statusCode = 500;
								res.write(err.stack || err);
							}).finally(function(){
								res.end();
							});
						}
						return next();
						function testPathName(){
							if (req._parsedUrl.pathname == pathName) {
								return true;
							}
							var params = new pathParser.Path(pathName).test(req._parsedUrl.pathname);
							if (params) {
								req.params = params;
								return true;
							}
							return false;
						}
						function buildQuery(){
							req.query = req.query || {};
							var searchParams = new URL('http://127.0.0.1' + req.originalUrl).searchParams;
							R.forEach(function(key){
								var values = searchParams.getAll(key);
								if (values.length == 1) {
									req.query[key] = values[0];
								} else if (values.length > 1) {
									req.query[key] = values;
								}
							})(Array.from(searchParams.keys()));
						}
					});
				}))(routeRules);
				return middleware;
			}, [connectOptions.webMockRouteRules]);
			if (typeof connectOptions.options.middleware == 'function') {
				var middleware_ = connectOptions.options.middleware.bind(connectOptions);
			}
			connectOptions.options.middleware = function(connect, options, middleware){
				middleware = middleware_ ? middleware_(connect, options, middleware) : middleware;
				return webMockServer(connect, options, middleware);
			};
			grunt.config(configKey + '.options.middleware', connectOptions.options.middleware);
		})();
		/*
			webProxyRouteRules: [ [method, pathname, query, object | callback], ... ]
		 */
		R.is(Array)(connectOptions.webProxyRouteRules) && (function(){
			var webProxyServer = R.partial(function middleware(routeRules/* [
				[method, pathname, query, object | callback],
			] */, connect, options, middleware){
				var zlib = require('zlib');
				var util = require('util');
				var proxyUtils = require('grunt-connect-proxy/lib/utils');
				options.selfHandleResponse = true;
				if (middleware.length > 0) { // Setup the proxy
					middleware.splice(middleware.length - 1, 0, proxyUtils.proxyRequest);
				} else {
					middleware.push(proxyUtils.proxyRequest);
				}
				proxyUtils.proxies().forEach(function(proxy){
					proxy.server.on('proxyReq', function(proxyReq, req, res, options){
						proxyReq.removeAllListeners('response');
						options.selfHandleResponse = true;
						proxyReq.on('response', function(proxyRes){
							R.pipe(
								R.toPairs,
								R.forEach(R.apply(function(key, value){
									res.setHeader(key, value);
								}))
							)(proxyRes.headers);
							proxy.server.emit('proxyRes', proxyRes, req, res);
							if (!res.finished) {
								proxyRes.on('end', function () {
									proxy.server.emit('end', req, res, proxyRes);
								});
							} else {
								proxy.server.emit('end', req, res, proxyRes);
							}
						});
					});
					proxy.server.on('proxyRes', function(proxyRes, req, res){
						var searchParams = new URL('http://127.0.0.1' + req.originalUrl).searchParams;
						var buffer;
						proxyRes.on('data', function (chunk){
							if (buffer) {
								buffer = Buffer.concat([buffer, chunk]);
							} else {
								buffer = chunk;
							}
						});
						proxyRes.on('end', function(){
							var routeRule = R.find(R.apply(function(method, pathName, query, callback){
								return req.method == method && req._parsedUrl.pathname == pathName && R.pipe(
									R.toPairs,
									R.ifElse(
										R.isEmpty,
										R.always(true),
										R.all(R.apply(function(key, value){
											return searchParams.get(key) == String(value);
										}))
									)
								)(query);
							}))(routeRules);
							if (routeRule) {
								if (proxyRes.headers['content-encoding'] == 'gzip') {
									return util.promisify(zlib.gunzip)(buffer).then(function(buffer){
										res.setHeader('content-encoding', 'identity');
										return send(R.last(routeRule)(buffer, req, res));
									});
								}
								return send(R.last(routeRule)(buffer, req, res));5
							}
							return send(buffer);
							function send(result){
								var resWrite = util.promisify(res.write.bind(res));
								var resEnd = util.promisify(res.end.bind(res));
								return (result ? resWrite(result) : Promise.resolve()).then(function(){
									return resEnd();
								});
							}
						});
					});
				});
				return middleware;
			}, [connectOptions.webProxyRouteRules]);
			if (typeof connectOptions.options.middleware == 'function') {
				var middleware_ = connectOptions.options.middleware.bind(connectOptions);
			}
			connectOptions.options.middleware = function(connect, options, middleware){
				middleware = middleware_ ? middleware_(connect, options, middleware) : middleware;
				return webProxyServer(connect, options, middleware);
			};
			grunt.config(configKey + '.options.middleware', connectOptions.options.middleware);
		})();
	});
};
