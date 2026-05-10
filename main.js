'use strict';
const obsidian = require('obsidian');

const VIEW_TYPE = 'wiki-manager-view';
const PENDING_TASKS_PATH = '.claude/pending-ingest.json';

// ============================================
// Configuration — change these to match your vault structure
// ============================================
const CONFIG = {
    rawDir: 'raw/',                    // Raw source materials
    rawExclude: 'raw/README.md',       // Excluded from scanning
    wikiDir: 'wiki/',                  // Wiki root
    sourcesDir: 'wiki/来源/',           // Source summary pages
    conceptsDir: 'wiki/概念/',          // Concept pages
    entitiesDir: 'wiki/实体/',          // Entity pages
    comparisonsDir: 'wiki/对比/',       // Comparison pages
    indexPath: 'wiki/index.md',        // Content index
};

/**
 * Check if a file is a markdown file in raw/ (excluding README)
 */
function isRawMdFile(file) {
    return file.path.startsWith(CONFIG.rawDir) && file.path.endsWith('.md') && file.path !== CONFIG.rawExclude;
}

/**
 * Extract YAML frontmatter from markdown content
 */
function parseFrontmatter(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return {};
    try {
        return obsidian.parseYaml(match[1]);
    } catch (e) {
        return {};
    }
}

/**
 * Normalize source references to check against file paths.
 * Handles: "[[raw/xxx.md]]", "raw/xxx.md", "xxx.md"
 */
function sourceRefsToPaths(sources) {
    const paths = new Set();
    if (!sources) return paths;

    const rawPrefix = CONFIG.rawDir;
    const items = Array.isArray(sources) ? sources : [sources];
    for (const item of items) {
        const s = String(item);
        // Match [[raw/xxx.md]] wikilink
        const wikiMatch = s.match(new RegExp('\\[\\[(' + rawPrefix + '.+?)\\]\\]'));
        if (wikiMatch) {
            paths.add(wikiMatch[1]);
            continue;
        }
        // Match raw/xxx.md plain path
        if (s.startsWith(rawPrefix)) {
            paths.add(s);
        }
    }
    return paths;
}

// ===== Plugin =====

module.exports = class WikiManagerPlugin extends obsidian.Plugin {
    async onload() {
        console.log('[Wiki Manager] Loading...');

        // Register the sidebar view
        this.registerView(VIEW_TYPE, (leaf) => new WikiManagerView(leaf, this));

        // Ribbon icon
        this.addRibbonIcon('library', 'Wiki Manager', () => {
            this.activateView();
        });

        // Status bar
        const statusBar = this.addStatusBarItem();
        statusBar.addClass('wiki-manager-status');

        // Commands
        this.addCommand({
            id: 'open-wiki-manager',
            name: 'Open Wiki Manager panel',
            callback: () => this.activateView(),
        });
        this.addCommand({
            id: 'wiki-manager-scan',
            name: 'Scan raw/ for unprocessed files',
            callback: async () => {
                const pending = await this.getPendingFiles();
                new obsidian.Notice(`📚 Found ${pending.length} unprocessed file(s) in raw/`);
                this.refreshViews();
            },
        });
        this.addCommand({
            id: 'wiki-manager-ingest-all',
            name: 'Ingest all pending raw files',
            callback: async () => {
                const pending = await this.getPendingFiles();
                if (pending.length === 0) {
                    new obsidian.Notice('✓ No pending files to ingest');
                    return;
                }
                const paths = pending.map(f => f.path);
                await this.requestIngest(paths);
                this.refreshViews();
            },
        });

        // Periodic status refresh (every 30s)
        this.registerInterval(window.setInterval(async () => {
            const pending = await this.getPendingFiles();
            statusBar.setText(`📚 Wiki: ${pending.length} pending`);
        }, 30000));

        // Initial scan
        this.app.workspace.onLayoutReady(async () => {
            const pending = await this.getPendingFiles();
            statusBar.setText(`📚 Wiki: ${pending.length} pending`);
        });
    }

    onunload() {
        console.log('[Wiki Manager] Unloading...');
        this.app.workspace.detachLeavesOfType(VIEW_TYPE);
    }

    /**
     * Open or switch to the Wiki Manager sidebar view
     */
    async activateView() {
        const { workspace } = this.app;
        let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
        if (!leaf) {
            // Open in right sidebar (or left if right unavailable)
            leaf = workspace.getRightLeaf(false);
            if (!leaf) {
                leaf = workspace.getLeaf('split', 'vertical');
            }
            await leaf.setViewState({
                type: VIEW_TYPE,
                active: true,
            });
        }
        workspace.revealLeaf(leaf);
    }

    /**
     * Scan raw/ for markdown files not yet referenced by any wiki/来源/ page
     */
    async getPendingFiles() {
        try {
            const files = this.app.vault.getFiles();
            const rawFiles = files.filter(f => isRawMdFile(f));
            if (rawFiles.length === 0) return [];

            // Read all source pages and collect referenced raw paths
            const sourceFiles = files.filter(f =>
                f.path.startsWith(CONFIG.sourcesDir) && f.path.endsWith('.md')
            );

            const referencedPaths = new Set();
            for (const sf of sourceFiles) {
                try {
                    const content = await this.app.vault.read(sf);
                    const fm = parseFrontmatter(content);
                    // Check both 'sources' (plural, array) and 'source' (singular, string)
                    const refs = sourceRefsToPaths(fm.sources || fm.source);
                    refs.forEach(p => referencedPaths.add(p));
                } catch (e) {
                    console.error(`[Wiki Manager] Error reading ${sf.path}:`, e);
                }
            }

            // Also check content for raw/ wikilinks as a fallback
            for (const sf of sourceFiles) {
                try {
                    const content = await this.app.vault.read(sf);
                    const regex = new RegExp('\\[\\[(' + CONFIG.rawDir + '[^\\]]+?)\\]\\]', 'g');
                    let m;
                    while ((m = regex.exec(content)) !== null) {
                        referencedPaths.add(m[1]);
                    }
                } catch (e) { /* skip */ }
            }

            // Normalize: ensure all referenced paths end with .md for matching
            const normalizedRefs = new Set();
            for (const p of referencedPaths) {
                normalizedRefs.add(p.endsWith('.md') ? p : p + '.md');
            }

            return rawFiles.filter(f => !normalizedRefs.has(f.path));
        } catch (e) {
            console.error('[Wiki Manager] Scan error:', e);
            return [];
        }
    }

    /**
     * Count pages in each wiki subdirectory
     */
    async getWikiStats() {
        const files = this.app.vault.getFiles();
        return {
            sources: files.filter(f => f.path.startsWith(CONFIG.sourcesDir) && f.path.endsWith('.md')).length,
            concepts: files.filter(f => f.path.startsWith(CONFIG.conceptsDir) && f.path.endsWith('.md')).length,
            entities: files.filter(f => f.path.startsWith(CONFIG.entitiesDir) && f.path.endsWith('.md')).length,
            comparisons: files.filter(f => f.path.startsWith(CONFIG.comparisonsDir) && f.path.endsWith('.md')).length,
        };
    }

    /**
     * Send a message directly to the Claudian chat (real-time).
     * Uses DOM approach to find the textarea and dispatch Enter key event.
     */
    sendToClaudian(prompt) {
        try {
            // Step 1: Find Claudian leaf
            const leaves = this.app.workspace.getLeavesOfType('claudian-view');
            if (!leaves || leaves.length === 0) {
                console.warn('[Wiki Manager] No Claudian leaf found');
                new obsidian.Notice('⚠️ 未找到 Claudian 面板');
                return false;
            }

            // Step 2: Get the Claudian view
            const view = leaves[0].view;
            if (!view) {
                console.warn('[Wiki Manager] No view on leaf');
                new obsidian.Notice('⚠️ Claudian view 不存在');
                return false;
            }

            // Step 3: Access tabManager and get active tab
            const tabManager = view.tabManager;
            if (!tabManager) {
                console.warn('[Wiki Manager] No tabManager on view');
                new obsidian.Notice('⚠️ Claudian tabManager 未初始化');
                return false;
            }

            const activeTab = tabManager.getActiveTab();
            if (!activeTab) {
                console.warn('[Wiki Manager] No active tab');
                new obsidian.Notice('⚠️ Claudian 无活跃对话标签');
                return false;
            }

            // Step 4: Get inputController
            const inputController = activeTab.controllers && activeTab.controllers.inputController;
            if (!inputController) {
                console.warn('[Wiki Manager] No inputController on active tab');
                new obsidian.Notice('⚠️ Claudian inputController 未初始化');
                return false;
            }

            // Step 5: Navigate to Claudian and send
            this.app.workspace.revealLeaf(leaves[0]);

            // Use a small delay to let revealLeaf settle, then call sendMessage directly
            setTimeout(() => {
                try {
                    inputController.sendMessage({ content: prompt });
                    console.log('[Wiki Manager] sendMessage called with content');
                } catch (e2) {
                    console.error('[Wiki Manager] sendMessage error:', e2);
                }
            }, 150);

            return true;
        } catch (e) {
            console.error('[Wiki Manager] sendToClaudian error:', e);
            new obsidian.Notice(`❌ 发送失败: ${e.message}`);
            return false;
        }
    }

    /**
     * Request ingest (or other actions).
     * First tries real-time send to Claudian, falls back to file queue.
     */
    async requestIngest(filePaths) {
        const isLint = filePaths.length === 1 && filePaths[0] === 'wiki/lint-request';

        // Build prompt
        let prompt;
        if (isLint) {
            prompt = `📋 **Wiki Manager**: 请执行 Wiki Lint 健康检查，检查以下项目：\n\n- 页面间是否存在矛盾\n- 孤儿页面（无入链）\n- 缺页链接（链接目标不存在）\n- 过时信息\n- index.md 是否与实际文件同步\n- 是否值得新建对比/汇总页\n\n完成后请告知结果。`;
        } else {
            const fileList = filePaths.map(fp => `- ${fp}`).join('\n');
            prompt = `📋 **Wiki Manager**: 请 Ingest 以下文件，执行标准 Ingest 工作流（阅读 → 讨论 → 创建摘要页 → 回溯概念 → 更新 index/log）：\n\n${fileList}\n\n请开始处理第一个文件。`;
        }

        // Try real-time: send directly to Claudian chat
        if (this.sendToClaudian(prompt)) {
            new obsidian.Notice(`✅ 请求已发送到 Claudian`);
            return true;
        }

        // Fallback: write to file queue
        new obsidian.Notice('⚠️ Claudian 未检测到，使用文件队列（下次对话时处理）');

        let existing = { version: 1, pending: [], completed: [] };
        try {
            const existingFile = this.app.vault.getAbstractFileByPath(PENDING_TASKS_PATH);
            if (existingFile instanceof obsidian.TFile) {
                const content = await this.app.vault.read(existingFile);
                existing = JSON.parse(content);
                if (!existing.pending) existing.pending = [];
                if (!existing.completed) existing.completed = [];
            }
        } catch (e) { /* start fresh */ }

        const existingFiles = new Set(existing.pending.map(t => t.file));
        const newTasks = [];
        for (const fp of filePaths) {
            if (!existingFiles.has(fp)) {
                newTasks.push({
                    id: `task-${Date.now()}-${newTasks.length}`,
                    action: isLint ? 'lint' : 'ingest',
                    file: fp,
                    requested_at: new Date().toISOString(),
                    status: 'pending',
                });
                existingFiles.add(fp);
            }
        }

        if (newTasks.length === 0) {
            new obsidian.Notice('These files are already queued');
            return true;
        }

        existing.pending.push(...newTasks);
        const jsonContent = JSON.stringify(existing, null, 2);

        // Ensure .claude directory exists (catch if already exists)
        try {
            const claudeDir = this.app.vault.getAbstractFileByPath('.claude');
            if (!claudeDir) {
                await this.app.vault.createFolder('.claude');
            }
        } catch (e) {
            // Folder already exists, that's fine
        }

        // Write task file
        try {
            const taskFile = this.app.vault.getAbstractFileByPath(PENDING_TASKS_PATH);
            if (taskFile instanceof obsidian.TFile) {
                await this.app.vault.modify(taskFile, jsonContent);
            } else {
                await this.app.vault.create(PENDING_TASKS_PATH, jsonContent);
            }
            new obsidian.Notice(`✅ 已排队 ${newTasks.length} 个任务`);
            return true;
        } catch (e2) {
            console.error('[Wiki Manager] Queue write error:', e2);
            new obsidian.Notice('❌ 写入队列文件失败');
            return false;
        }
    }

    /**
     * Refresh all open Wiki Manager views
     */
    refreshViews() {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
        for (const leaf of leaves) {
            if (leaf.view instanceof WikiManagerView) {
                leaf.view.refresh();
            }
        }
    }
};

// ===== Sidebar View =====

class WikiManagerView extends obsidian.ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() { return VIEW_TYPE; }
    getDisplayText() { return 'Wiki Manager'; }
    getIcon() { return 'library'; }

    async onOpen() {
        await this.render();
    }

    async onClose() {
        // Nothing to clean up
    }

    async render() {
        const container = this.containerEl;
        container.empty();
        container.addClass('wiki-manager-container');

        // ===== Header =====
        container.createEl('h3', {
            text: '📚 Wiki Manager',
            cls: 'wiki-manager-header',
        });

        // ===== Pending Files Section =====
        this.renderPendingSection(container);

        // ===== Divider =====
        container.createEl('hr', { cls: 'wiki-divider' });

        // ===== Stats Section =====
        await this.renderStatsSection(container);

        // ===== Divider =====
        container.createEl('hr', { cls: 'wiki-divider' });

        // ===== Actions Section =====
        this.renderActionsSection(container);

        // ===== Footer =====
        container.createEl('hr', { cls: 'wiki-divider' });
        container.createDiv({
            text: `Updated: ${new Date().toLocaleTimeString()}`,
            cls: 'wiki-footer',
        });
    }

    async renderPendingSection(container) {
        const section = container.createDiv({ cls: 'wiki-section' });

        const pending = await this.plugin.getPendingFiles();
        const title = section.createEl('h4', {
            cls: 'wiki-section-title',
        });
        title.setText(`📋 待处理文件 (${pending.length})`);

        const list = section.createDiv({ cls: 'wiki-pending-list' });

        if (pending.length === 0) {
            list.createDiv({
                text: '✓ 所有 raw/ 文件均已处理',
                cls: 'wiki-empty-state',
            });
            return;
        }

        for (const file of pending) {
            const item = list.createDiv({ cls: 'wiki-file-item' });

            const nameEl = item.createSpan({
                text: `📄 ${file.name}`,
                cls: 'wiki-file-name',
            });
            nameEl.title = file.path;

            const btnGroup = item.createDiv({ cls: 'wiki-btn-group' });

            const ingestBtn = btnGroup.createEl('button', {
                text: 'Ingest',
                cls: 'wiki-btn wiki-btn-primary wiki-btn-sm',
            });
            ingestBtn.addEventListener('click', async () => {
                ingestBtn.setText('⏳');
                ingestBtn.disabled = true;
                await this.plugin.requestIngest([file.path]);
                await this.render();
            });
        }

        // Ingest All button
        const ingestAll = section.createEl('button', {
            text: '📥 Ingest All',
            cls: 'wiki-btn wiki-btn-primary wiki-btn-block',
        });
        ingestAll.addEventListener('click', async () => {
            ingestAll.setText('⏳ Queuing...');
            ingestAll.disabled = true;
            const paths = pending.map(f => f.path);
            await this.plugin.requestIngest(paths);
            await this.render();
        });
    }

    async renderStatsSection(container) {
        const section = container.createDiv({ cls: 'wiki-section' });
        section.createEl('h4', {
            text: '📊 Wiki Stats',
            cls: 'wiki-section-title',
        });

        const stats = await this.plugin.getWikiStats();
        const grid = section.createDiv({ cls: 'wiki-stats-grid' });

        const items = [
            { label: '来源', value: stats.sources, icon: '📄' },
            { label: '概念', value: stats.concepts, icon: '💡' },
            { label: '实体', value: stats.entities, icon: '🏢' },
            { label: '对比', value: stats.comparisons, icon: '⚖️' },
        ];

        for (const item of items) {
            const card = grid.createDiv({ cls: 'wiki-stat-card' });
            card.createDiv({
                text: `${item.icon} ${item.value}`,
                cls: 'wiki-stat-value',
            });
            card.createDiv({
                text: item.label,
                cls: 'wiki-stat-label',
            });
        }
    }

    renderActionsSection(container) {
        const section = container.createDiv({ cls: 'wiki-section' });
        section.createEl('h4', {
            text: '⚡ Actions',
            cls: 'wiki-section-title',
        });

        const actions = [
            { text: '🔄 扫描 raw/', id: 'scan' },
            { text: '🧹 Run Lint', id: 'lint' },
            { text: '📖 Open Index', id: 'index' },
        ];

        for (const action of actions) {
            const btn = section.createEl('button', {
                text: action.text,
                cls: 'wiki-btn wiki-btn-secondary wiki-btn-block',
            });
            btn.addEventListener('click', () => this.handleAction(action.id));
        }
    }

    async handleAction(actionId) {
        switch (actionId) {
            case 'scan':
                await this.render();
                new obsidian.Notice('🔄 Scan complete');
                break;
            case 'lint':
                this.showLintModal();
                break;
            case 'index':
                this.openFile(CONFIG.indexPath);
                break;
        }
    }

    openFile(path) {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof obsidian.TFile) {
            this.app.workspace.getLeaf(false).openFile(file);
        } else {
            new obsidian.Notice(`File not found: ${path}`);
        }
    }

    showLintModal() {
        const modal = new obsidian.Modal(this.app);
        modal.titleEl.setText('🧹 Wiki Lint Checklist');

        const { contentEl } = modal;
        const checks = [
            '页面间是否存在矛盾',
            '孤儿页面（无入链）',
            '缺页链接（链接目标不存在）',
            '过时信息',
            'index.md 是否与实际文件同步',
            '是否值得新建对比/汇总页',
        ];

        const checkboxes = [];
        for (const text of checks) {
            const label = contentEl.createEl('label', { cls: 'wiki-lint-item' });
            const cb = label.createEl('input', { attr: { type: 'checkbox' } });
            label.createSpan({ text: `  ${text}` });
            label.createEl('br');
            checkboxes.push(cb);
        }

        contentEl.createEl('br');
        const btnRow = contentEl.createDiv({ cls: 'wiki-modal-actions' });

        const queueBtn = btnRow.createEl('button', {
            text: 'Notify Claude to run lint',
            cls: 'wiki-btn wiki-btn-primary',
        });
        queueBtn.addEventListener('click', async () => {
            const checksText = checks
                .map((c, i) => `- [${checkboxes[i].checked ? 'x' : ' '}] ${c}`)
                .join('\n');
            await this.plugin.requestIngest(['wiki/lint-request']);
            new obsidian.Notice('✅ Lint task queued for Claude');
            modal.close();
        });

        const closeBtn = btnRow.createEl('button', {
            text: 'Close',
            cls: 'wiki-btn wiki-btn-secondary',
        });
        closeBtn.addEventListener('click', () => modal.close());

        modal.open();
    }

    async refresh() {
        await this.render();
    }
}
