"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const https = require("https");
const path = require("path");
const EXT_ID = 'endoflife-ai';
const API_BASE = 'https://api.endoflife.ai/v1';
const cache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour
// ─── HTTP ─────────────────────────────────────────────────────────────────────
function fetchJson(url, apiKey) {
    return new Promise((resolve, reject) => {
        const headers = {
            'User-Agent': 'vscode-eol-check/1.0',
        };
        if (apiKey)
            headers['X-API-Key'] = apiKey;
        https.get(url, { headers }, (res) => {
            if (res.statusCode === 404) {
                resolve(null);
                return;
            }
            if (res.statusCode === 429) {
                resolve(null);
                return;
            } // rate limited — silent fail
            if (res.statusCode !== 200) {
                resolve(null);
                return;
            }
            let data = '';
            res.on('data', (c) => data += c);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                }
                catch {
                    resolve(null);
                }
            });
        }).on('error', () => resolve(null));
    });
}
async function getStatus(slug, version, apiKey) {
    const key = `${slug}:${version}`;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_TTL)
        return cached.data;
    const url = `${API_BASE}/status/${encodeURIComponent(slug)}/${encodeURIComponent(version)}`;
    const data = await fetchJson(url, apiKey);
    cache.set(key, { data, ts: Date.now() });
    return data;
}
function detectNvmrc(text) {
    const raw = text.trim().replace(/^v/, '');
    const major = raw.split('.')[0];
    if (major && !isNaN(Number(major))) {
        const col = text.indexOf(raw.split('.')[0]);
        return [{ slug: 'nodejs', version: major, line: 0, col: Math.max(0, col), len: raw.length }];
    }
    return [];
}
function detectPythonVersion(text) {
    const raw = text.trim();
    const parts = raw.split('.');
    if (parts.length >= 2) {
        const version = `${parts[0]}.${parts[1]}`;
        return [{ slug: 'python', version, line: 0, col: 0, len: raw.length }];
    }
    return [];
}
function detectRubyVersion(text) {
    const raw = text.trim().replace(/^ruby-/, '');
    const parts = raw.split('.');
    if (parts.length >= 2) {
        const version = `${parts[0]}.${parts[1]}`;
        return [{ slug: 'ruby', version, line: 0, col: 0, len: raw.length }];
    }
    return [];
}
function detectPackageJson(text) {
    const results = [];
    try {
        const pkg = JSON.parse(text);
        if (pkg.engines?.node) {
            const match = pkg.engines.node.match(/(\d+)/);
            if (match) {
                const lines = text.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].includes('"node"')) {
                        const col = lines[i].indexOf(pkg.engines.node);
                        results.push({ slug: 'nodejs', version: match[1], line: i, col: Math.max(0, col), len: pkg.engines.node.length });
                        break;
                    }
                }
            }
        }
    }
    catch { /* skip */ }
    return results;
}
function detectDockerfile(text) {
    const results = [];
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const fromMatch = line.match(/^FROM\s+(\S+)/i);
        if (!fromMatch)
            continue;
        const img = fromMatch[1].toLowerCase();
        const nodeMatch = img.match(/^node:(\d+)/);
        const pythonMatch = img.match(/^python:(\d+\.\d+)/);
        const phpMatch = img.match(/^php:(\d+\.\d+)/);
        const rubyMatch = img.match(/^ruby:(\d+\.\d+)/);
        const addResult = (slug, version) => {
            const col = line.toLowerCase().indexOf(version);
            results.push({ slug, version, line: i, col: Math.max(0, col), len: version.length });
        };
        if (nodeMatch)
            addResult('nodejs', nodeMatch[1]);
        if (pythonMatch)
            addResult('python', pythonMatch[1]);
        if (phpMatch)
            addResult('php', phpMatch[1]);
        if (rubyMatch)
            addResult('ruby', rubyMatch[1]);
    }
    return results;
}
function detectGoMod(text) {
    const match = text.match(/^go\s+(\d+\.\d+)/m);
    if (match) {
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const m = lines[i].match(/^go\s+(\d+\.\d+)/);
            if (m) {
                const col = lines[i].indexOf(m[1]);
                return [{ slug: 'go', version: m[1], line: i, col, len: m[1].length }];
            }
        }
    }
    return [];
}
function detectComposerJson(text) {
    try {
        const composer = JSON.parse(text);
        const phpVer = composer?.require?.php;
        if (phpVer) {
            const match = phpVer.match(/(\d+\.\d+)/);
            if (match) {
                const lines = text.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].includes('"php"')) {
                        const col = lines[i].indexOf(phpVer);
                        return [{ slug: 'php', version: match[1], line: i, col: Math.max(0, col), len: phpVer.length }];
                    }
                }
            }
        }
    }
    catch { /* skip */ }
    return [];
}
function detectToolVersions(text) {
    const results = [];
    const slugMap = { nodejs: 'nodejs', node: 'nodejs', python: 'python', ruby: 'ruby', golang: 'go', go: 'go' };
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const parts = lines[i].trim().split(/\s+/);
        if (parts.length < 2)
            continue;
        const [tool, ver] = parts;
        const slug = slugMap[tool.toLowerCase()];
        if (!slug || !ver)
            continue;
        const verParts = ver.split('.');
        const version = slug === 'nodejs' ? verParts[0] : `${verParts[0]}.${verParts[1]}`;
        const col = lines[i].indexOf(ver);
        results.push({ slug, version, line: i, col, len: ver.length });
    }
    return results;
}
function getDetections(fileName, text) {
    const base = path.basename(fileName);
    if (base === '.nvmrc' || base === '.node-version')
        return detectNvmrc(text);
    if (base === '.python-version')
        return detectPythonVersion(text);
    if (base === '.ruby-version')
        return detectRubyVersion(text);
    if (base === 'package.json')
        return detectPackageJson(text);
    if (base === 'Dockerfile' || base.startsWith('Dockerfile.'))
        return detectDockerfile(text);
    if (base === 'go.mod')
        return detectGoMod(text);
    if (base === 'composer.json')
        return detectComposerJson(text);
    if (base === '.tool-versions')
        return detectToolVersions(text);
    return [];
}
// ─── Diagnostics ─────────────────────────────────────────────────────────────
const DIAG_SOURCE = 'endoflife.ai';
async function checkDocument(doc, diagCollection) {
    const config = vscode.workspace.getConfiguration(EXT_ID);
    if (!config.get('enabled', true))
        return;
    const apiKey = config.get('apiKey', '');
    const warningDays = config.get('warningDays', 90);
    const text = doc.getText();
    const fileName = doc.fileName;
    const detections = getDetections(fileName, text);
    if (detections.length === 0) {
        diagCollection.set(doc.uri, []);
        return;
    }
    const diagnostics = [];
    for (const d of detections) {
        const status = await getStatus(d.slug, d.version, apiKey);
        if (!status)
            continue;
        const range = new vscode.Range(new vscode.Position(d.line, d.col), new vscode.Position(d.line, d.col + d.len));
        const scoreUrl = `https://endoflife.ai/score/${d.slug}/${d.version}`;
        if (status.is_eol) {
            const days = status.days_past_eol;
            const msg = `${d.slug} ${d.version} is EOL${status.eol_date ? ` since ${status.eol_date}` : ''}${days ? ` (${days} days past EOL)` : ''}. No security patches. → ${scoreUrl}`;
            const diag = new vscode.Diagnostic(range, msg, vscode.DiagnosticSeverity.Error);
            diag.source = DIAG_SOURCE;
            diag.code = { value: 'eol', target: vscode.Uri.parse(scoreUrl) };
            diagnostics.push(diag);
        }
        else if (status.eol_approaching && status.days_until_eol !== null && status.days_until_eol <= warningDays) {
            const msg = `${d.slug} ${d.version} reaches EOL in ${status.days_until_eol} days${status.eol_date ? ` (${status.eol_date})` : ''}. Plan your upgrade. → ${scoreUrl}`;
            const diag = new vscode.Diagnostic(range, msg, vscode.DiagnosticSeverity.Warning);
            diag.source = DIAG_SOURCE;
            diag.code = { value: 'eol-approaching', target: vscode.Uri.parse(scoreUrl) };
            diagnostics.push(diag);
        }
    }
    diagCollection.set(doc.uri, diagnostics);
}
// ─── Extension lifecycle ──────────────────────────────────────────────────────
function activate(context) {
    const diagCollection = vscode.languages.createDiagnosticCollection(EXT_ID);
    context.subscriptions.push(diagCollection);
    // Check on open
    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(doc => checkDocument(doc, diagCollection)));
    // Check on save
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(doc => checkDocument(doc, diagCollection)));
    // Check all open docs on startup
    vscode.workspace.textDocuments.forEach(doc => checkDocument(doc, diagCollection));
    // Manual scan command
    context.subscriptions.push(vscode.commands.registerCommand(`${EXT_ID}.checkNow`, async () => {
        cache.clear();
        vscode.workspace.textDocuments.forEach(doc => checkDocument(doc, diagCollection));
        vscode.window.showInformationMessage('EOL Check: Scanning workspace...');
    }));
    // Open score card command
    context.subscriptions.push(vscode.commands.registerCommand(`${EXT_ID}.openScoreCard`, async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        const doc = editor.document;
        const text = doc.getText();
        const detections = getDetections(doc.fileName, text);
        if (detections.length === 0) {
            vscode.window.showInformationMessage('No EOL runtimes detected in this file.');
            return;
        }
        const items = detections.map(d => ({
            label: `${d.slug} ${d.version}`,
            url: `https://endoflife.ai/score/${d.slug}/${d.version}`,
        }));
        const picked = await vscode.window.showQuickPick(items.map(i => i.label));
        if (picked) {
            const item = items.find(i => i.label === picked);
            if (item)
                vscode.env.openExternal(vscode.Uri.parse(item.url));
        }
    }));
}
function deactivate() { }
//# sourceMappingURL=extension.js.map