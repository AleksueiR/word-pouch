import { app, protocol, BrowserWindow } from 'electron';
import * as path from 'path';
import { format as formatUrl } from 'url';
import { createProtocol, installVueDevtools } from 'vue-cli-plugin-electron-builder/lib';

const isDevelopment = process.env.NODE_ENV !== 'production';

if (isDevelopment) {
    // Don't load any native (external) modules until the following line is run:
    require('module').globalPaths.push(process.env.NODE_MODULES_PATH);
}

// global reference to mainWindow (necessary to prevent window from being garbage collected)
let mainWindow: any;

// Standard scheme must be registered before the app is ready
protocol.registerStandardSchemes(['app'], { secure: true });

function createMainWindow() {
    const window = new BrowserWindow({
        width: 1440,
        height: 820,
        webPreferences: { webSecurity: false }
    });

    if (isDevelopment) {
        // Load the url of the dev server if in development mode
        window.loadURL(process.env.WEBPACK_DEV_SERVER_URL as string);
        if (!process.env.IS_TEST) window.webContents.openDevTools();
    } else {
        createProtocol('app');
        //   Load the index.html when not in development
        window.loadURL(
            formatUrl({
                pathname: path.join(__dirname, 'index.html'),
                protocol: 'file',
                slashes: true
            })
        );
    }

    window.on('closed', () => {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        mainWindow = null;
    });

    window.webContents.on('devtools-opened', () => {
        window.focus();
        setImmediate(() => {
            window.focus();
        });
    });

    return window;
}

// quit application when all windows are closed
app.on('window-all-closed', () => {
    // on macOS it is common for applications to stay open until the user explicitly quits
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    // on macOS it is common to re-create a window even after all windows have been closed
    if (mainWindow === null) {
        mainWindow = createMainWindow();
    }
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
// create main BrowserWindow when electron is ready
app.on('ready', async () => {
    if (isDevelopment && !process.env.IS_TEST) {
        // Install Vue Devtools
        await installVueDevtools();
    }
    mainWindow = createMainWindow();
});
