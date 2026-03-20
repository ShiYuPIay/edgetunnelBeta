

import { connect } from 'cloudflare:sockets';

const CONFIG_KEY = 'config';

const DEFAULT_CONFIG = {
  uuid: '',
  path: '/ws',
  name: '🇺🇸 美国-443 | 🔥0欺诈·AI解锁',
  host: 'https://www.microsoft.com',
  proxyIPs: '',
  socks5: '',
  bestIPs: '',
  ports: '443,2053,2083,2087,2096,8443',
  ruleTimestamp: 0,
  rules: {},
  enableHealthCheck: false,
};


async function sha256(value) {
  const buf = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const arr = Array.from(new Uint8Array(digest));
  return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function getConfig(env) {
  const raw = await env.KV.get(CONFIG_KEY);
  let config;
  if (raw) {
    try {
      config = JSON.parse(raw);
    } catch (err) {
      console.error('Failed to parse config from KV:', err);
    }
  }
  if (!config) {
    
    const uuid = crypto.randomUUID();
    config = { ...DEFAULT_CONFIG, uuid };
    await env.KV.put(CONFIG_KEY, JSON.stringify(config));
  }
  return config;
}

async function saveConfig(env, config) {
  await env.KV.put(CONFIG_KEY, JSON.stringify(config));
}


async function isAuthenticated(request, env) {
  const password = env.ADMIN;
  if (!password) return false;
  const userAgent = request.headers.get('User-Agent') || '';
  const expected = await sha256(password + userAgent);
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/auth=([0-9a-f]{64})/);
  if (match && match[1] === expected) {
    return true;
  }
  return false;
}


function buildAuthResponse(body, value) {
  const headers = {
    'Content-Type': 'text/html; charset=utf-8',
    'Set-Cookie': `auth=${value}; Path=/admin; HttpOnly; Max-Age=${7 * 86400}`,
  };
  return new Response(body, { headers });
}


function renderLoginPage() {
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><title>shiplay 管理登录</title>
  <style>body{font-family:Arial,Helvetica,sans-serif;background:#f8f8f8;padding:2rem;}
  .container{max-width:400px;margin:auto;background:#fff;padding:2rem;border-radius:6px;box-shadow:0 0 10px rgba(0,0,0,.1);}input[type=password],button{width:100%;padding:.5rem;margin:.5rem 0;}</style>
</head><body><div class="container">
  <h2>shiplay 管理登录</h2>
  <form method="POST" action="/admin">
    <label for="password">密码：</label>
    <input type="password" id="password" name="password" required>
    <button type="submit">登录</button>
  </form>
</div></body></html>`;
}


function renderMissingAdminPage() {
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><title>管理员密码未配置</title>
  <style>body{font-family:Arial,Helvetica,sans-serif;background:#fefefe;padding:2rem;color:#333;} .container{max-width:600px;margin:auto;background:#fff;padding:2rem;border-radius:8px;box-shadow:0 0 10px rgba(0,0,0,.1);} h2{margin-top:0;} ul{padding-left:1.25rem;} li{margin:0.5rem 0;}</style>
</head><body><div class="container">
  <h2>管理员密码未配置</h2>
  <p>为了保护您的节点配置，必须先在 Cloudflare 控制台中设置 <code>ADMIN</code> 环境变量作为管理密码。</p>
  <p>请按照以下步骤操作：</p>
  <ul>
    <li>登录 Cloudflare Dashboard，进入您的 <strong>Workers &amp; Pages</strong> 项目。</li>
    <li>点击 <strong>Settings</strong> &gt; <strong>Variables</strong>。</li>
    <li>在 <strong>Text variables</strong> 区域点击 <strong>Add variable</strong> 按钮。</li>
    <li>变量名填写 <code>ADMIN</code>，值填写您想要的<strong>强密码</strong>（建议包含大小写字母、数字和符号）。</li>
    <li>保存后重新访问 <code>/admin</code> 即可登录控制面板。</li>
  </ul>
  <p style="color:#d9534f;font-weight:bold;">提示：务必使用复杂密码防止暴力破解。</p>
</div></body></html>`;
}


function renderAdminPage(config) {
  const escape = (str) => (str || '').replace(/"/g, '&quot;');
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><title>shiplay 控制面板</title>
  <style>body{font-family:Arial,Helvetica,sans-serif;background:#fafafa;padding:1rem;color:#333;}
  .container{max-width:900px;margin:auto;background:#fff;border-radius:8px;box-shadow:0 0 10px rgba(0,0,0,.1);padding:2rem;}
  h1{margin-top:0;}
  label{display:block;margin-top:1rem;font-weight:bold;}
  input,textarea,select{width:100%;padding:.5rem;margin-top:.3rem;}
  button{margin-top:1rem;padding:.6rem 1rem;background:#0070f3;color:#fff;border:none;border-radius:4px;cursor:pointer;}
  pre{background:#f5f5f5;padding:1rem;overflow:auto;}
  .links-section div{margin-bottom:.5rem;}
  .pref-item{display:flex;align-items:center;margin:0.25rem 0;}
  .pref-item span{flex:1;}
  .usage{background:#eef4ff;padding:1rem;border-radius:6px;margin-bottom:1rem;}
  details{margin-top:.5rem;}
  </style>
</head><body><div class="container">
  <h1>shiplay 控制面板</h1>
  <p>在此页面配置您的 VLESS 节点参数，保存后立即生效，无需重新部署。</p>
  
  <div class="usage">
    <h3>Workers/Pages 使用统计</h3>
    <p id="usageStats">此功能暂未实装</p>
    <p id="networkInfo">当前网络：未知</p>
  </div>
  
  <form id="configForm">
    <label>UUID
      <input type="text" name="uuid" value="${escape(config.uuid)}" required>
    </label>
    <label>WebSocket 路径（例如 /ws）
      <input type="text" name="path" value="${escape(config.path)}" required>
    </label>
    <label>节点名称标语（显示在订阅中，可使用 emoji）
      <input type="text" name="name" value="${escape(config.name)}" required>
    </label>
    <label>伪装站点（例如 https://www.microsoft.com）
      <input type="text" name="host" value="${escape(config.host)}">
    </label>
    <label>Proxy IP 列表（逗号分隔）
      <input type="text" name="proxyIPs" value="${escape(config.proxyIPs)}">
    </label>
    <label>SOCKS5 二级代理链（可选，host:port）
      <input type="text" name="socks5" value="${escape(config.socks5)}">
    </label>
    <label>优选 IP 列表（备用）
      <input type="text" name="bestIPs" value="${escape(config.bestIPs)}">
    </label>
    <label>端口列表（逗号分隔）
      <input type="text" name="ports" value="${escape(config.ports)}">
    </label>
    <button type="submit">保存配置</button>
  </form>
  <hr>
  
  <h2>获取节点链接</h2>
  <div class="links-section">
    <div>
      <label>节点链接：</label>
      <input id="nodeLink" type="text" readonly>
      <button id="copyNodeLink">复制节点</button>
    </div>
    <div>
      <label>订阅链接：</label>
      <input id="subscribeUrl" type="text" readonly>
      <button id="copySubscribeUrl">复制订阅</button>
    </div>
  </div>
  <hr>
  
  <h2>优选订阅生成</h2>
  <p>基于优选 IP 和端口组合生成多个节点，点击复制即可导入客户端。</p>
  <div id="preferredList"></div>
  <hr>
  
  <h2>订阅链接生成</h2>
  <p>根据当前配置生成多格式订阅，可复制到剪贴板。</p>
  <button id="genBase64">生成 Base64 (V2Ray/Shadowrocket)</button>
  <button id="genClash">生成 Clash Meta YAML</button>
  <button id="genSingBox">生成 Sing-box JSON</button>
  <button id="genSurge">生成 Surge</button>
  <button id="genQuanX">生成 Quantumult X</button>
  <pre id="output"></pre>
  <hr>
  
  <h2>IP 纯净度检测</h2>
  <p>输入一个 IP 地址后点击“检测”，查询 geolocation 和欺诈评分。</p>
  <input type="text" id="ipInput" placeholder="1.2.3.4">
  <button id="checkIP">检测</button>
  <pre id="ipResult"></pre>
  <hr>
  
  <h2>规则集更新</h2>
  <p>点击按钮立即从 GitHub 更新黑白矩阵规则并存入 KV。</p>
  <button id="updateRules">更新规则集</button>
  <pre id="ruleStatus"></pre>
  <hr>
  
  <h2>高级模式</h2>
  <button id="toggleAdvanced">展开/收起 高级模式</button>
  <div id="advancedSection" style="display:none;">
    <details>
      <summary>详细配置信息</summary>
      <pre id="configDetails"></pre>
    </details>
    <details>
      <summary>Encrypted Client Hello</summary>
      <p>此功能暂未实现。</p>
    </details>
    <details>
      <summary>Cloudflare CDN 访问设置</summary>
      <p>此功能暂未实现。</p>
    </details>
    <details>
      <summary>订阅转换配置</summary>
      <p>此功能暂未实现。</p>
    </details>
    <details>
      <summary>消息通知设置</summary>
      <p>此功能暂未实现。</p>
    </details>
    <details>
      <summary>查看操作日志</summary>
      <p>日志功能暂未实现。</p>
    </details>
  </div>
  <hr>
  
  <h2>登出</h2>
  <button id="logout">退出登录</button>
</div>
<script>
 
const configData = ${JSON.stringify(config)};

 
document.getElementById('configForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const data = {};
  for (const el of form.elements) {
    if (el.name) data[el.name] = el.value.trim();
  }
  const res = await fetch('/api/config', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)});
  const text = await res.text();
  alert(text);
});

 
async function generate(type) {
  const res = await fetch('/api/subscribe?type='+type);
  const text = await res.text();
  document.getElementById('output').textContent = text;
}
document.getElementById('genBase64').onclick = () => generate('base64');
document.getElementById('genClash').onclick = () => generate('clash');
document.getElementById('genSingBox').onclick = () => generate('singbox');
document.getElementById('genSurge').onclick = () => generate('surge');
document.getElementById('genQuanX').onclick = () => generate('quanx');

 
document.getElementById('checkIP').onclick = async () => {
  const ip = document.getElementById('ipInput').value.trim();
  if(!ip) {alert('请输入 IP'); return;}
  const res = await fetch('/api/ip-check?ip=' + encodeURIComponent(ip));
  const json = await res.json();
  document.getElementById('ipResult').textContent = JSON.stringify(json, null, 2);
};

 
document.getElementById('updateRules').onclick = async () => {
  const res = await fetch('/api/update-rules');
  const text = await res.text();
  document.getElementById('ruleStatus').textContent = text;
};

 
document.getElementById('logout').onclick = () => {
  document.cookie = 'auth=; Max-Age=0; Path=/admin';
  location.reload();
};

 
document.getElementById('copyNodeLink').onclick = () => {
  const val = document.getElementById('nodeLink').value;
  navigator.clipboard.writeText(val).then(() => alert('已复制节点链接'));
};
document.getElementById('copySubscribeUrl').onclick = () => {
  const val = document.getElementById('subscribeUrl').value;
  navigator.clipboard.writeText(val).then(() => alert('已复制订阅链接'));
};

 
function populateLinks() {
  const uuid = configData.uuid;
  const path = configData.path.startsWith('/') ? configData.path : '/' + configData.path;
  const ports = (configData.ports || '').split(',').map(p => p.trim()).filter(Boolean);
  const ips = (configData.proxyIPs || location.hostname).split(',').map(p => p.trim()).filter(Boolean);
  const ip = ips[0] || location.hostname;
  const port = ports[0] || '443';
  const host = location.hostname;
  const name = encodeURIComponent(configData.name);
  const node = `vless://${uuid}@${ip}:${port}?encryption=none&security=tls&type=ws&host=${host}&path=${encodeURIComponent(path)}#${name}`;
  document.getElementById('nodeLink').value = node;
  document.getElementById('subscribeUrl').value = location.origin + '/api/subscribe';
}

 
function populatePreferred() {
  const listDiv = document.getElementById('preferredList');
  listDiv.innerHTML = '';
  const uuid = configData.uuid;
  const path = configData.path.startsWith('/') ? configData.path : '/' + configData.path;
  const host = location.hostname;
  const nameEnc = encodeURIComponent(configData.name);
  const ips = (configData.bestIPs || '').split(',').map(p => p.trim()).filter(Boolean);
  const ports = (configData.ports || '').split(',').map(p => p.trim()).filter(Boolean);
  if (!ips.length || !ports.length) return;
  ips.forEach(ip => {
    ports.forEach(port => {
      const link = `vless://${uuid}@${ip}:${port}?encryption=none&security=tls&type=ws&host=${host}&path=${encodeURIComponent(path)}#${nameEnc}`;
      const div = document.createElement('div');
      div.className = 'pref-item';
      div.innerHTML = `<span>${ip}:${port}</span> <button>复制</button>`;
      div.querySelector('button').onclick = () => {
        navigator.clipboard.writeText(link).then(() => alert('已复制 '+ip+':'+port));
      };
      listDiv.appendChild(div);
    });
  });
}

 
document.getElementById('toggleAdvanced').onclick = () => {
  const sec = document.getElementById('advancedSection');
  const show = sec.style.display === 'none';
  sec.style.display = show ? 'block' : 'none';
  if (show) {
    document.getElementById('configDetails').textContent = JSON.stringify(configData, null, 2);
  }
};

 
populateLinks();
populatePreferred();
</script></body></html>`;
}


async function parseJSON(request) {
  try {
    const text = await request.text();
    return JSON.parse(text);
  } catch (err) {
    return null;
  }
}


function buildSubscription(config, host, type) {
  const uuid = config.uuid;
  const path = config.path.startsWith('/') ? config.path : '/' + config.path;
  const name = encodeURIComponent(config.name);
  const ports = (config.ports || '').split(',').map((p) => p.trim()).filter(Boolean);
  const ips = (config.proxyIPs || host).split(',').map((p) => p.trim()).filter(Boolean);
  
  const nodes = [];
  for (const ip of ips) {
    for (const port of ports) {
      const url = `vless://${uuid}@${ip}:${port}?encryption=none&security=tls&type=ws&host=${host}&path=${encodeURIComponent(path)}#${name}`;
      nodes.push(url);
    }
  }
  switch (type) {
    case 'base64': {
      const joined = nodes.join('\n');
      return btoa(joined);
    }
    case 'clash': {
      
      const proxies = nodes.map((link, idx) => {
        const url = new URL(link);
        const params = url.searchParams;
        return `  - name: node${idx+1}
    type: vless
    server: ${url.hostname}
    port: ${url.port}
    uuid: ${uuid}
    tls: true
    udp: true
    network: ws
    ws-opts:
      path: ${params.get('path')}
      headers:
        Host: ${params.get('host')}
   `; });
      const rules = config.rules || {};
      const ruleLines = Object.entries(rules).map(([k, url]) => `  - ${k},${url}`);
      return `proxies:\n${proxies.join('\n')}\nproxy-groups:\n  - name: Auto\n    type: select\n    proxies:\n      - DIRECT\n${nodes.map((_, idx) => '      - node'+(idx+1)).join('\n')}\nrules:\n${ruleLines.join('\n')}`;
    }
    case 'singbox': {
      const outbounds = nodes.map((link, idx) => {
        const url = new URL(link);
        const params = url.searchParams;
        return {
          tag: `node${idx+1}`,
          type: 'vless',
          server: url.hostname,
          server_port: Number(url.port),
          uuid,
          packet_encoding: 'xudp',
          tls: {
            enabled: true,
            server_name: params.get('host'),
          },
          transport: {
            type: 'ws',
            path: params.get('path'),
            headers: { Host: params.get('host') },
          },
        };
      });
      return JSON.stringify({ outbounds }, null, 2);
    }
    case 'surge': {
      const lines = nodes.map((link, idx) => {
        const url = new URL(link);
        const params = url.searchParams;
        return `node${idx+1} = vless, ${url.hostname}, ${url.port}, tls=true, uuid=${uuid}, ws=true, ws-path=${params.get('path')}, ws-headers=Host:${params.get('host')}`;
      });
      return lines.join('\n');
    }
    case 'quanx': {
      const lines = nodes.map((link, idx) => {
        const url = new URL(link);
        const params = url.searchParams;
        return `node${idx+1} = vless, ${url.hostname}, port=${url.port}, uuid=${uuid}, encryption=none, tls=true, type=ws, host=${params.get('host')}, path="${params.get('path')}", udp-relay=true`;
      });
      return lines.join('\n');
    }
    default:
      return nodes.join('\n');
  }
}


async function checkIP(ip) {
  const result = { ip };
  try {
    
    const geoRes = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,regionName,city,isp,proxy`);
    const geo = await geoRes.json();
    result.geo = geo;
  } catch (err) {
    result.geoError = err.toString();
  }
  try {
    const resp = await fetch(`https://scamalytics.com/ip/${ip}`);
    const html = await resp.text();
    const match = html.match(/score:\s*(\d{1,3})/i) || html.match(/Fraud Score.*?(\d{1,3})/i);
    if (match) result.fraudScore = parseInt(match[1]);
  } catch (err) {
    result.fraudError = err.toString();
  }
  return result;
}


async function updateRules(env, config) {
  const categories = {
    'AI': 'https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/OpenAI/OpenAI.list',
    'Streaming': 'https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/StreamingMedia/Netflix.list',
    'Shopping': 'https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Amazon/Amazon.list',
    'Google': 'https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Google/Google.list',
  };
  const rules = {};
  for (const [name, url] of Object.entries(categories)) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url} ${res.status}`);
      const text = await res.text();
      
      const key = `rule_${name}`;
      await env.KV.put(key, text);
      rules[name] = url;
    } catch (err) {
      console.error('Failed to update rule', name, err);
    }
  }
  config.rules = rules;
  config.ruleTimestamp = Date.now();
  await saveConfig(env, config);
  return '规则集已更新';
}


async function pingHost(addr, port) {
  try {
    const socket = connect({ hostname: addr, port });
    await socket.close();
    return true;
  } catch (err) {
    return false;
  }
}


async function healthCheckProxies(config) {
  const ips = (config.proxyIPs || '').split(',').map((p) => p.trim()).filter(Boolean);
  if (!ips.length) return 0;
  const ports = (config.ports || '').split(',').map((p) => p.trim()).filter(Boolean).map((n) => parseInt(n));
  const alive = [];
  for (const ip of ips) {
    let ok = false;
    for (const port of ports) {
      if (await pingHost(ip, port)) { ok = true; break; }
    }
    if (ok) alive.push(ip);
  }
  const removed = ips.length - alive.length;
  config.proxyIPs = alive.join(',');
  return removed;
}


async function handleVLESS(request, config) {
  const upgradeHeader = request.headers.get('Upgrade');
  if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
    return new Response('Expected Upgrade: websocket', { status: 426 });
  }
  
  const { 0: client, 1: server } = new WebSocketPair();
  server.accept();
  
  let firstChunk = new Uint8Array();
  
  const reader = server.readable.getReader();
  let remote = null;
  const remoteWriter = { value: null };
  const handleRemote = async (addr, port, initialData) => {
    
    const socket = connect({ hostname: addr, port });
    remote = socket;
    
    if (initialData && initialData.length) {
      const writer = socket.writable.getWriter();
      await writer.write(initialData);
      writer.releaseLock();
    }
    
    (async () => {
      const srcReader = socket.readable.getReader();
      while (true) {
        const { value, done } = await srcReader.read();
        if (done) break;
        if (value) server.send(value);
      }
      server.close();
    })().catch((err) => {
      console.error('remote->ws error', err);
      server.close();
    });
  };
  (async () => {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      let data = new Uint8Array(value);
      
      if (!remote) {
        
        const buf = new Uint8Array(firstChunk.length + data.length);
        buf.set(firstChunk, 0);
        buf.set(data, firstChunk.length);
        firstChunk = buf;
        
        if (firstChunk.length < 22) continue;
        const dv = new DataView(firstChunk.buffer);
        
        const ver = dv.getUint8(0);
        const id = [...new Uint8Array(firstChunk.buffer.slice(1, 17))].map((b) => b.toString(16).padStart(2,'0')).join('-');
        
        if (id.toLowerCase() !== config.uuid.toLowerCase()) {
          server.close(1008, 'Invalid UUID');
          break;
        }
        const optLen = dv.getUint8(17);
        const cmd = dv.getUint8(18 + optLen);
        if (cmd !== 0x01) {
          server.close(1008, 'Unsupported command');
          break;
        }
        
        let offset = 19 + optLen;
        const addrType = dv.getUint8(offset);
        offset += 1;
        let addr = '';
        if (addrType === 0x01) {
          
          addr = Array.from(new Uint8Array(firstChunk.buffer.slice(offset, offset + 4))).join('.');
          offset += 4;
        } else if (addrType === 0x03) {
          
          const len = dv.getUint8(offset);
          offset += 1;
          addr = new TextDecoder().decode(firstChunk.buffer.slice(offset, offset + len));
          offset += len;
        } else if (addrType === 0x04) {
          
          const arr = [];
          for (let i = 0; i < 8; i++) {
            arr.push(dv.getUint16(offset + i*2).toString(16));
          }
          addr = arr.join(':');
          offset += 16;
        } else {
          server.close(1008, 'Invalid addrType');
          break;
        }
        const port = dv.getUint16(offset);
        offset += 2;
        const payload = firstChunk.slice(offset);
        await handleRemote(addr, port, payload);
      } else {
        
        const writer = remote.writable.getWriter();
        await writer.write(data);
        writer.releaseLock();
      }
    }
  })().catch((err) => {
    console.error('ws->remote error', err);
    try { if (remote) remote.close(); } catch {}
    server.close();
  });
  return new Response(null, { status: 101, webSocket: client });
}


export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const config = await getConfig(env);
    
    const wsPath = config.path.startsWith('/') ? config.path : '/' + config.path;
    
    if (url.pathname === wsPath) {
      return handleVLESS(request, config);
    }
    
    if (url.pathname.startsWith('/admin')) {
      
      if (!env.ADMIN) {
        return new Response(renderMissingAdminPage(), { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 500 });
      }
      
      if (request.method === 'POST') {
        const formData = await request.formData();
        const password = formData.get('password') || '';
        const userAgent = request.headers.get('User-Agent') || '';
        const digest = await sha256(password + userAgent);
        const expected = await sha256(env.ADMIN + userAgent);
        if (digest === expected) {
          return buildAuthResponse('<meta http-equiv="refresh" content="0;url=/admin">', expected);
        }
        return new Response('密码错误', { status: 401 });
      }
      
      const authed = await isAuthenticated(request, env);
      if (!authed) {
        return new Response(renderLoginPage(), { headers: { 'Content-Type': 'text/html' } });
      }
      return new Response(renderAdminPage(config), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    
    if (url.pathname === '/api/config') {
      const authed = await isAuthenticated(request, env);
      if (!authed) return new Response('Unauthorized', { status: 401 });
      if (request.method === 'GET') {
        return new Response(JSON.stringify(config), { headers: { 'Content-Type': 'application/json' } });
      }
      if (request.method === 'POST' || request.method === 'PUT') {
        const data = await parseJSON(request);
        if (!data) return new Response('Invalid JSON', { status: 400 });
        
        const allowed = ['uuid','path','name','host','proxyIPs','socks5','bestIPs','ports'];
        for (const key of allowed) {
          if (typeof data[key] === 'string') {
            config[key] = data[key];
          }
        }
        await saveConfig(env, config);
        return new Response('配置已保存');
      }
      return new Response('Method Not Allowed', { status: 405 });
    }
    
    if (url.pathname === '/api/subscribe') {
      const type = url.searchParams.get('type') || 'base64';
      const host = request.headers.get('Host') || url.host;
      const content = buildSubscription(config, host, type);
      const contentType = (type === 'clash') ? 'text/yaml' : (type === 'singbox' ? 'application/json' : 'text/plain');
      return new Response(content, { headers: { 'Content-Type': contentType + '; charset=utf-8' } });
    }
    
    if (url.pathname === '/api/ip-check') {
      const ip = url.searchParams.get('ip');
      if (!ip) return new Response(JSON.stringify({ error: 'Missing ip parameter' }), { headers: { 'Content-Type': 'application/json' }, status: 400 });
      const info = await checkIP(ip);
      return new Response(JSON.stringify(info), { headers: { 'Content-Type': 'application/json' } });
    }
    
    if (url.pathname === '/api/update-rules') {
      const authed = await isAuthenticated(request, env);
      if (!authed) return new Response('Unauthorized', { status: 401 });
      const msg = await updateRules(env, config);
      return new Response(msg);
    }
    
    if (url.pathname.startsWith('/api/')) {
      return new Response('Not Found', { status: 404 });
    }
    
    let target = config.host || 'https://www.microsoft.com';
    if (!/^https?:/.test(target)) target = 'https://' + target;
    try {
      const proxyUrl = new URL(request.url);
      const dest = new URL(target);
      dest.pathname = proxyUrl.pathname;
      dest.search = proxyUrl.search;
      const newReq = new Request(dest.toString(), {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });
      return fetch(newReq);
    } catch (err) {
      return new Response('Proxy error: ' + err.toString(), { status: 502 });
    }
  },
  
  async scheduled(event, env, ctx) {
    const config = await getConfig(env);
    const now = Date.now();
    
    if (!config.ruleTimestamp || now - config.ruleTimestamp > 86400000) {
      await updateRules(env, config);
    }
    
    if (config.enableHealthCheck) {
      const removed = await healthCheckProxies(config);
      if (removed > 0) {
        await saveConfig(env, config);
      }
    }
  },
};