/**
 * 前后端分离：只启动 API，不托管 dist。
 * 等价于 SERVE_STATIC=false node server/src/index.js。
 */
process.env.SERVE_STATIC = 'false';

await import('../server/src/index.js');
