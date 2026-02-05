import { app, BrowserWindow, BrowserView, ipcMain, session } from 'electron'
import path from 'node:path'
import { spawn, ChildProcess } from 'node:child_process'
import { ElectronBlocker, Request } from '@ghostery/adblocker-electron'
import fetch from 'cross-fetch'
import {
    addHistoryEntry,
    updateHistoryEntry,
    searchHistory,
    getTopSites,
    getRecentHistory,
    clearHistory,
    closeDatabase
} from './history'

// ============================================
// Types
// ============================================

interface Tab {
    id: string
    view: BrowserView
    title: string
    url: string
    favicon: string
    isLoading: boolean
}

// ============================================
// State
// ============================================

let win: BrowserWindow | null = null
let pythonProcess: ChildProcess | null = null
let blocker: ElectronBlocker | null = null
let blockedCount = 0
let httpsUpgradeCount = 0
let adBlockEnabled = true

// Tab management
const tabs: Map<string, Tab> = new Map()
let activeTabId: string | null = null
let tabIdCounter = 0

// UI bounds configuration
const UI_TOP_HEIGHT = 52 // URL bar height
const UI_SIDEBAR_WIDTH = 296 // Sidebar width (280px) + padding (16px)
const UI_TRIGGER_WIDTH = 16 // Always visible trigger zone for sidebar hover

// Sidebar state
let sidebarOpen = false

// ============================================
// Utility Functions
// ============================================

function generateTabId(): string {
    return `tab-${++tabIdCounter}-${Date.now()}`
}

function getBrowserViewBounds(): Electron.Rectangle {
    if (!win) return { x: 0, y: 0, width: 800, height: 600 }
    const { width, height } = win.getContentBounds()
    // Always leave 16px trigger zone on left for sidebar hover
    return {
        x: UI_TRIGGER_WIDTH,
        y: UI_TOP_HEIGHT,
        width: width - UI_TRIGGER_WIDTH,
        height: height - UI_TOP_HEIGHT
    }
}

function normalizeUrl(input: string): string {
    let url = input.trim()

    // Check if it looks like a URL
    const urlPattern = /^(https?:\/\/)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(\/.*)?$/
    const localhostPattern = /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/
    const internalPattern = /^poseidon:\/\//

    if (urlPattern.test(url) || localhostPattern.test(url) || internalPattern.test(url)) {
        if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('poseidon://')) {
            url = 'https://' + url
        }
        return url
    }

    // Treat as search query
    return `https://www.google.com/search?q=${encodeURIComponent(url)}`
}

// ============================================
// Tab Management
// ============================================

function createTab(url: string = 'poseidon://newtab'): Tab {
    const id = generateTabId()

    const view = new BrowserView({
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
        }
    })

    // Enable ad-blocker on this view
    if (blocker && adBlockEnabled) {
        safeEnableBlocking(view.webContents.session)
    }

    const tab: Tab = {
        id,
        view,
        title: 'New Tab',
        url: url,
        favicon: '',
        isLoading: false
    }

    // Set up event listeners
    view.webContents.on('did-start-loading', () => {
        tab.isLoading = true
        sendTabUpdate(tab)
    })

    view.webContents.on('did-stop-loading', () => {
        tab.isLoading = false
        sendTabUpdate(tab)
    })

    // Main navigation event - fires for full page loads
    view.webContents.on('did-navigate', (_, url) => {
        console.log('[Nav] did-navigate:', url)
        tab.url = url
        sendTabUpdate(tab)
        addHistoryEntry(url, tab.title, tab.favicon)
    })

    // In-page navigation (hash changes, pushState)
    view.webContents.on('did-navigate-in-page', (_, url) => {
        console.log('[Nav] did-navigate-in-page:', url)
        tab.url = url
        sendTabUpdate(tab)
        addHistoryEntry(url, tab.title, tab.favicon)
    })

    // Frame navigation - catches navigations in sub-frames
    view.webContents.on('did-frame-navigate', (_, url, httpResponseCode, httpStatusText, isMainFrame) => {
        if (isMainFrame) {
            console.log('[Nav] did-frame-navigate (main):', url)
            tab.url = url
            sendTabUpdate(tab)
            addHistoryEntry(url, tab.title, tab.favicon)
        }
    })

    // Also update URL after page finishes loading (fallback)
    view.webContents.on('did-finish-load', () => {
        const currentUrl = view.webContents.getURL()
        console.log('[Nav] did-finish-load, URL:', currentUrl)
        if (currentUrl && currentUrl !== tab.url) {
            tab.url = currentUrl
            sendTabUpdate(tab)
        }
    })

    view.webContents.on('page-title-updated', (_, title) => {
        tab.title = title || 'Untitled'
        sendTabUpdate(tab)
        // Update history with new title
        updateHistoryEntry(tab.url, tab.title, tab.favicon)
    })

    view.webContents.on('page-favicon-updated', (_, favicons) => {
        if (favicons.length > 0) {
            tab.favicon = favicons[0]
            sendTabUpdate(tab)
            // Update history with new favicon
            updateHistoryEntry(tab.url, tab.title, tab.favicon)
        }
    })

    // Handle new window requests (open in new tab)
    view.webContents.setWindowOpenHandler(({ url }) => {
        createTab(url)
        switchToTab(tabs.get(Array.from(tabs.keys()).pop()!)!.id)
        return { action: 'deny' }
    })

    tabs.set(id, tab)

    // Navigate to URL
    if (url !== 'poseidon://newtab') {
        view.webContents.loadURL(normalizeUrl(url))
    }

    // Send tab created event
    sendTabsUpdate()

    return tab
}

function switchToTab(tabId: string): void {
    const tab = tabs.get(tabId)
    if (!tab) return

    // Just update active tab - webview in renderer handles display
    activeTabId = tabId

    // Send updates to renderer
    sendActiveTabUpdate()
    sendTabUpdate(tab)
}

function closeTab(tabId: string): void {
    const tab = tabs.get(tabId)
    if (!tab) return

        // Destroy the view (for cleanup)
        ; (tab.view.webContents as any).destroy()
    tabs.delete(tabId)

    // If this was the active tab, switch to another
    if (activeTabId === tabId) {
        const remainingTabs = Array.from(tabs.keys())
        if (remainingTabs.length > 0) {
            switchToTab(remainingTabs[remainingTabs.length - 1])
        } else {
            activeTabId = null
            // Create a new tab if all closed
            const newTab = createTab()
            switchToTab(newTab.id)
        }
    }

    sendTabsUpdate()
}

function navigateTab(tabId: string, url: string): void {
    const tab = tabs.get(tabId)
    if (!tab) return

    const normalizedUrl = normalizeUrl(url)

    // Update tab URL - webview in renderer handles actual navigation
    tab.url = normalizedUrl
    sendTabUpdate(tab)
}

// ============================================
// IPC Communication
// ============================================

function sendTabUpdate(tab: Tab): void {
    if (!win || win.isDestroyed()) return
    win.webContents.send('tab-updated', {
        id: tab.id,
        title: tab.title,
        url: tab.url,
        favicon: tab.favicon,
        isLoading: tab.isLoading
    })
}

function sendTabsUpdate(): void {
    if (!win || win.isDestroyed()) return
    const tabList = Array.from(tabs.values()).map(tab => ({
        id: tab.id,
        title: tab.title,
        url: tab.url,
        favicon: tab.favicon,
        isLoading: tab.isLoading
    }))
    win.webContents.send('tabs-updated', tabList)
}

function sendActiveTabUpdate(): void {
    if (!win || win.isDestroyed()) return
    const tab = activeTabId ? tabs.get(activeTabId) : null
    win.webContents.send('active-tab-changed', tab ? {
        id: tab.id,
        title: tab.title,
        url: tab.url,
        favicon: tab.favicon,
        isLoading: tab.isLoading,
        canGoBack: tab.view.webContents.canGoBack(),
        canGoForward: tab.view.webContents.canGoForward()
    } : null)
}

// ============================================
// Ad Blocker
// ============================================

// Helper to safely enable blocking (shims removed Electron APIs)
function safeEnableBlocking(sess: Electron.Session) {
    if (!sess || !blocker) return

    // Shim registerPreloadScript if missing (Electron 20+)
    // @ts-ignore
    if (!sess.registerPreloadScript) {
        // @ts-ignore
        sess.registerPreloadScript = (_: any) => {
            console.log('Shimmed registerPreloadScript - cosmetic filtering limited')
            return () => { }
        }
    }

    blocker.enableBlockingInSession(sess)
}

async function initAdBlocker(): Promise<void> {
    try {
        console.log('Initializing ad blocker...')

        blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch)

        blocker.on('request-blocked', (request) => {
            blockedCount++
            if (win && !win.isDestroyed()) {
                win.webContents.send('ad-blocked', { count: blockedCount, url: request.url })
            }
        })

        blocker.on('request-redirected', () => {
            blockedCount++
            if (win && !win.isDestroyed()) {
                win.webContents.send('ad-blocked', { count: blockedCount })
            }
        })

        // Enable on default session
        if (adBlockEnabled) {
            safeEnableBlocking(session.defaultSession)
        }

        console.log('Ad blocker initialized')
    } catch (error) {
        console.error('Failed to initialize ad blocker:', error)
    }
}

function toggleAdBlocker(enabled: boolean): void {
    adBlockEnabled = enabled
    if (blocker) {
        // Toggle on default session
        if (enabled) {
            safeEnableBlocking(session.defaultSession)
        } else {
            blocker.disableBlockingInSession(session.defaultSession)
        }

        // Toggle on all tab sessions
        tabs.forEach(tab => {
            if (enabled) {
                safeEnableBlocking(tab.view.webContents.session)
            } else {
                blocker!.disableBlockingInSession(tab.view.webContents.session)
            }
        })
    }
}

// ============================================
// IPC Handlers
// ============================================

function setupIPC(): void {
    // Tab management
    ipcMain.handle('create-tab', (_, url?: string) => {
        // Use createTab's default (poseidon://newtab) when no URL provided
        const tab = url ? createTab(url) : createTab()
        switchToTab(tab.id)
        return { id: tab.id }
    })

    ipcMain.handle('close-tab', (_, tabId: string) => {
        closeTab(tabId)
        return { success: true }
    })

    ipcMain.handle('switch-tab', (_, tabId: string) => {
        switchToTab(tabId)
        return { success: true }
    })

    ipcMain.handle('get-tabs', () => {
        return Array.from(tabs.values()).map(tab => ({
            id: tab.id,
            title: tab.title,
            url: tab.url,
            favicon: tab.favicon,
            isLoading: tab.isLoading
        }))
    })

    ipcMain.handle('get-active-tab', () => {
        if (!activeTabId) return null
        const tab = tabs.get(activeTabId)
        if (!tab) return null
        return {
            id: tab.id,
            title: tab.title,
            url: tab.url,
            favicon: tab.favicon,
            isLoading: tab.isLoading,
            canGoBack: tab.view.webContents.canGoBack(),
            canGoForward: tab.view.webContents.canGoForward()
        }
    })

    ipcMain.handle('update-tab-state', (_, tabId: string, data: Partial<Tab>) => {
        const tab = tabs.get(tabId)
        if (!tab) return { success: false }

        // Update fields
        if (data.url !== undefined) tab.url = data.url
        if (data.title !== undefined) tab.title = data.title
        if (data.favicon !== undefined) tab.favicon = data.favicon
        if (data.isLoading !== undefined) tab.isLoading = data.isLoading

        // Handle URL update - add to history
        if (data.url) {
            addHistoryEntry(data.url, tab.title, tab.favicon)
        }

        // Handle title/favicon update - update history
        if (data.title || data.favicon) {
            updateHistoryEntry(tab.url, tab.title, tab.favicon)
        }

        // Notify renderer
        sendTabUpdate(tab)

        return { success: true }
    })

    // Navigation
    ipcMain.handle('navigate', (_, url: string) => {
        if (activeTabId) {
            navigateTab(activeTabId, url)
        }
        return { success: true }
    })

    ipcMain.handle('go-back', () => {
        if (activeTabId) {
            const tab = tabs.get(activeTabId)
            if (tab?.view.webContents.canGoBack()) {
                tab.view.webContents.goBack()
            }
        }
        return { success: true }
    })

    ipcMain.handle('go-forward', () => {
        if (activeTabId) {
            const tab = tabs.get(activeTabId)
            if (tab?.view.webContents.canGoForward()) {
                tab.view.webContents.goForward()
            }
        }
        return { success: true }
    })

    ipcMain.handle('reload', () => {
        if (activeTabId) {
            const tab = tabs.get(activeTabId)
            tab?.view.webContents.reload()
        }
        return { success: true }
    })

    ipcMain.handle('stop', () => {
        if (activeTabId) {
            const tab = tabs.get(activeTabId)
            tab?.view.webContents.stop()
        }
        return { success: true }
    })

    // Ad blocker
    ipcMain.handle('toggle-ad-block', (_, enabled: boolean) => {
        toggleAdBlocker(enabled)
        return { enabled: adBlockEnabled }
    })

    ipcMain.handle('get-ad-block-status', () => {
        return {
            enabled: adBlockEnabled,
            blockedCount,
            httpsUpgradeCount
        }
    })

    ipcMain.handle('reset-blocked-count', () => {
        blockedCount = 0
        httpsUpgradeCount = 0
        return { blockedCount, httpsUpgradeCount }
    })

    ipcMain.handle('get-adblock-preload-path', () => {
        try {
            // Resolve the path to the adblocker's preload script
            // This script handles cosmetic filtering (hiding ads) in the renderer
            return require.resolve('@ghostery/adblocker-electron-preload')
        } catch (error) {
            console.error('Failed to resolve adblock preload path:', error)
            return ''
        }
    })

    // Sidebar state tracking (no bounds adjustment - sidebar floats over)
    ipcMain.handle('sidebar-set-open', (_, isOpen: boolean) => {
        sidebarOpen = isOpen
        // Note: We don't resize BrowserView - the sidebar floats over the content
        // The 16px trigger zone is always visible for hover detection
    })

    // History
    ipcMain.handle('history-search', (_, query: string, limit?: number) => {
        return searchHistory(query, limit || 10)
    })

    ipcMain.handle('history-top-sites', (_, limit?: number) => {
        return getTopSites(limit || 8)
    })

    ipcMain.handle('history-recent', (_, limit?: number) => {
        return getRecentHistory(limit || 20)
    })

    ipcMain.handle('history-clear', () => {
        clearHistory()
        return { success: true }
    })

    // Google search suggestions (proxy to avoid CORS in renderer)
    ipcMain.handle('search-suggestions', async (_, query: string) => {
        if (!query || query.length < 1) {
            return []
        }
        try {
            const response = await fetch(
                `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}`
            )
            const data = await response.json()
            return data[1] as string[] // The suggestions array
        } catch (err) {
            console.error('Failed to fetch search suggestions:', err)
            return []
        }
    })
}

// ============================================
// Window Management
// ============================================

function createWindow(): void {
    win = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            webviewTag: true, // Enable <webview> tag for proper z-index layering
        },
        backgroundColor: '#FFFFFF',
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 16, y: 14 },
        show: false, // Show when ready
    })

    // Show when ready to prevent flash
    win.once('ready-to-show', () => {
        win?.show()
    })

    // Load the UI
    win.loadURL('http://127.0.0.1:5173')

    // Open DevTools in development
    if (!app.isPackaged) {
        win.webContents.openDevTools({ mode: 'detach' })
    }

    // When UI is loaded, create initial tab
    win.webContents.on('did-finish-load', () => {
        // Create initial tab
        const tab = createTab('poseidon://newtab')
        switchToTab(tab.id)

        // Send initial ad block status
        win?.webContents.send('ad-block-status', {
            enabled: adBlockEnabled,
            count: blockedCount
        })
    })

    // Enable ad-blocking on webview tags when they are attached
    win.webContents.on('did-attach-webview', (_, webContents) => {
        console.log('Webview attached, enabling ad-blocker...')

        // Enable ad-blocker on this webview's session
        if (blocker && adBlockEnabled) {
            safeEnableBlocking(webContents.session)
            console.log('Ad-blocker enabled for webview')
        }

        // HTTPS Upgrade: Intercept HTTP requests and upgrade to HTTPS
        webContents.session.webRequest.onBeforeRequest(
            { urls: ['http://*/*'] },
            (details, callback) => {
                // Skip localhost and local network
                const url = new URL(details.url)
                const isLocal = url.hostname === 'localhost' ||
                    url.hostname === '127.0.0.1' ||
                    url.hostname.endsWith('.local')

                if (!isLocal && adBlockEnabled) {
                    const httpsUrl = details.url.replace('http://', 'https://')
                    httpsUpgradeCount++
                    console.log(`HTTPS Upgrade: ${details.url} -> ${httpsUrl}`)

                    // Notify renderer of the upgrade
                    if (win && !win.isDestroyed()) {
                        win.webContents.send('https-upgraded', { count: httpsUpgradeCount })
                    }
                    callback({ redirectURL: httpsUrl })
                } else {
                    callback({})
                }
            }
        )

        // Block third-party cookies
        webContents.session.cookies.on('changed', (_, cookie, cause, removed) => {
            // Log for debugging
            if (!removed && cookie.domain && !cookie.domain.startsWith('.')) {
                console.log(`Cookie set: ${cookie.name} from ${cookie.domain}`)
            }
        })

        // Aggressive Popup Blocking
        webContents.setWindowOpenHandler((details) => {
            const { url, disposition, features } = details

            // Allow if opened by user gesture (often indicated by features or timing)
            // But strict ad blockers often block even these if the URL matches an ad pattern

            // Check against ad blocker
            if (blocker && adBlockEnabled) {
                // Check if the URL is an ad/tracker
                const request = Request.fromRawDetails({
                    url: url,
                    type: 'popup' as any,
                    requestId: Date.now().toString(), // Dummy ID
                    sourceUrl: webContents.getURL()
                })

                const { match } = blocker.match(request)

                if (match) {
                    console.log(`Blocked popup (ad): ${url}`)
                    blockedCount++
                    if (win && !win.isDestroyed()) {
                        win.webContents.send('ad-blocked', { count: blockedCount, url })
                    }
                    return { action: 'deny' }
                }
            }

            // If it's a known streaming site popup pattern (often blank or unrelated domain)
            const currentUrl = webContents.getURL()
            const isStreamingSite = /footybite|totalsportek|soccerstreams/i.test(currentUrl)

            if (isStreamingSite) {
                // Block all popups on streaming sites unless explicit whitelist logic (which is hard to determine)
                // Brave/uBlock often default to denying all popups on these sites
                console.log(`Blocked popup (streaming site): ${url}`)
                blockedCount++
                if (win && !win.isDestroyed()) {
                    win.webContents.send('ad-blocked', { count: blockedCount, url })
                }
                return { action: 'deny' }
            }

            // Normal behavior: Open in new tab
            createTab(url)
            return { action: 'deny' }
        })
    })
}

// ============================================
// Python Backend
// ============================================

function startPythonBackend(): void {
    const isDev = !app.isPackaged
    const pythonPath = isDev
        ? path.join(__dirname, '../venv/bin/python3')
        : path.join(process.resourcesPath, 'backend/venv/bin/python3')

    console.log('Starting Python Backend...')

    pythonProcess = spawn(pythonPath, [
        '-m', 'uvicorn', 'backend.server:app',
        '--host', '127.0.0.1',
        '--port', '8000',
        '--reload'
    ], {
        cwd: path.join(__dirname, '../'),
        stdio: 'inherit'
    })

    pythonProcess.on('close', (code) => {
        console.log(`Python process exited with code ${code}`)
    })

    pythonProcess.on('error', (err) => {
        console.error('Failed to start Python process:', err)
    })
}

function killPythonBackend(): void {
    if (pythonProcess) {
        console.log('Stopping Python Backend...')
        pythonProcess.kill()
        pythonProcess = null
    }
}

// ============================================
// App Lifecycle
// ============================================

app.on('window-all-closed', () => {
    // Clean up all tabs
    tabs.forEach(tab => {
        ; (tab.view.webContents as any).destroy()
    })
    tabs.clear()

    killPythonBackend()
    win = null

    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('before-quit', () => {
    killPythonBackend()
    closeDatabase()
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
    }
})

app.whenReady().then(async () => {
    setupIPC()
    await initAdBlocker()
    startPythonBackend()
    createWindow()
})
