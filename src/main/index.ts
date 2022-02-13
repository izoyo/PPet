import os from 'os'
import { join } from 'path'
import { app, BrowserWindow, protocol, session } from 'electron'
import windowStateKeeper from 'electron-window-state'
import remoteMain from '@electron/remote/main'

import initTray from './tray'

remoteMain.initialize()

const isWin7 = os.release().startsWith('6.1')
if (isWin7) app.disableHardwareAcceleration()

if (app.isPackaged) {
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    process.exit(0)
  }
  if (process.platform === 'darwin') {
    app.dock.hide()
  }
}

app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

let mainWindowState: windowStateKeeper.State

const winPagePathMap: Map<string, BrowserWindow> = new Map()

export async function createWindow(
  options: Electron.BrowserWindowConstructorOptions,
  pagePath: string = '',
) {
  const lastWin = winPagePathMap.get(pagePath)
  if (lastWin && !lastWin.isDestroyed()) {
    lastWin.focus()
    return
  }

  const win = new BrowserWindow(options)

  if (app.isPackaged) {
    win.loadFile(join(__dirname, '../renderer/index.html') + pagePath)
  } else {
    const pkg = await import('../../package.json')
    const url =
      `http://${pkg.env.HOST || '127.0.0.1'}:${pkg.env.PORT}` + pagePath

    win.loadURL(url, {
      // userAgent:
      //   'Mozilla/5.0 (iPhone; CPU iPhone OS 10_3 like Mac OS X) AppleWebKit/603.1.23 (KHTML, like Gecko) Version/10.0 Mobile/14E5239e Safari/602.1',
    })
    win.webContents.openDevTools()
  }

  winPagePathMap.set(pagePath, win)

  return win
}

app
  .whenReady()
  .then(() => {
    protocol.registerFileProtocol('file', (request, callback) => {
      const url = request.url.replace('file://', '')
      const decodedUrl = decodeURI(url)
      try {
        return callback(decodedUrl)
      } catch (error) {
        console.error('Could not get file path:', error)
        return callback('404')
      }
    })
  })
  .then(() => {
    mainWindowState = windowStateKeeper({
      defaultHeight: 350,
      defaultWidth: 600,
    })
  })
  .then(async () => {
    const options = {
      title: 'PPet',
      alwaysOnTop: true,
      autoHideMenuBar: true,
      hasShadow: false,
      transparent: true,
      frame: false,
      x: mainWindowState.x,
      y: mainWindowState.y,
      width: mainWindowState.width,
      height: mainWindowState.height,
      skipTaskbar: true,
      minimizable: false,
      maximizable: false,
      resizable: false,
      // titleBarStyle: 'hidden',
      webPreferences: {
        preload: join(__dirname, '../preload/index.cjs'),
        webSecurity: false,
        backgroundThrottling: false,
      },
    }

    const win = await createWindow(options)
    if (win) {
      mainWindowState.manage(win)

      initTray(win)
    }
  })

app.on('window-all-closed', () => {
  winPagePathMap.clear()
  app.quit()
})

app.on('browser-window-created', (ev, win) => {
  remoteMain.enable(win.webContents)
})

app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    // Someone tried to run a second instance, we should focus our window.
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  }
})
