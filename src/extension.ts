import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const isDebugMode = vscode.workspace.getConfiguration('pickleViewer').get('debug', false);
// プラットフォームに応じて Python 実行コマンドを切り替える
const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';

// ログファイルパス
const logFilePath = path.join(__dirname, 'debug.log');

// ログ出力用の関数
function logMessage(message: string) {
    if (isDebugMode) {
        const timestamp = new Date().toISOString();
        const formattedMessage = `[${timestamp}] ${message}\n`;
        fs.appendFileSync(logFilePath, formattedMessage, 'utf8');
    }
}

// クリティカルなエラーログの出力
function logCriticalError(error: string) {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] CRITICAL: ${error}\n`;
    fs.appendFileSync(logFilePath, formattedMessage, 'utf8');
}

// エラー用の関数
function logError(error: string) {
    if (isDebugMode) {
        logMessage(`ERROR: ${error}`);
    }
}

// 初期化時のテストログ
logMessage('Log system initialized: Writing to debug.log');

export function activate(context: vscode.ExtensionContext) {
    const command = vscode.commands.registerCommand('pickleViewer.open', (uri: vscode.Uri) => {
        logMessage(`Activated command for file: ${uri.fsPath}`);

        const panel = vscode.window.createWebviewPanel(
            'pickleViewer',
            `Pickle Viewer - ${uri.fsPath}`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }

        );

        const scriptPath = path.join(context.extensionPath, 'scripts', 'read_pickle.py');
        const filePath = uri.fsPath;

        logMessage('Fetching total rows...');
        exec(`${pythonCommand} ${context.extensionPath}/scripts/check_dependencies.py`, (error, stdout, stderr) => {
            if (error || stderr.includes("Missing packages")) {
                vscode.window.showErrorMessage(
                    `必要なPythonパッケージが不足しています。\n` +
                    `不足しているパッケージ: ${stderr.trim() || stdout.trim()}` +
                    `\n\n以下のコマンドを実行してインストールしてください:\n` +
                    `pip install numpy pandas joblib`
                );
                return;
            }
            logMessage("Python環境の依存関係が確認されました。");
            exec(`${pythonCommand} ${scriptPath} "${filePath}" 0 -1`, (error, stdout, stderr) => {
                if (error) {
                    logError(`Failed to get total rows: ${error.message}`);
                    vscode.window.showErrorMessage(`Failed to get total rows: ${stderr || error.message}`);
                    return;
                }
                let totalRows = 0;
                try {
                    totalRows = JSON.parse(stdout).totalRows;
                } catch (parseError) {
                    const errorMessage = (parseError as Error).message;
                    logError(`Failed to parse total rows: ${errorMessage}`);
                    vscode.window.showErrorMessage('Failed to parse total rows from Python output.');
                    return;
                }

                logMessage(`Total rows fetched: ${totalRows}`);

                logMessage('Fetching initial data...');
                exec(`${pythonCommand} ${scriptPath} "${filePath}" 0 50`, (error, stdout, stderr) => {
                    if (stderr) {
                        logError(`Python STDERR (Initial Data): ${stderr}`);
                    }
                    if (error) {
                        logError(`Failed to load initial data: ${error.message}`);
                        vscode.window.showErrorMessage(`Failed to load initial data: ${stderr || error.message}`);
                        return;
                    }

                    logMessage(`Initial data fetched: ${stdout.substring(0, 200)}...`);

                    // Webview の初期化処理をコールバック形式で扱う
                    initializeWebview(panel, filePath, scriptPath, totalRows, stdout);
                });
            });
        });
    });
    context.subscriptions.push(command);
}

function initializeWebview(
    panel: vscode.WebviewPanel,
    filePath: string,
    scriptPath: string,
    totalRows: number,
    initialData: string
) {
    //const initialDataString = JSON.stringify(JSON.parse(initialData)); // JSONとしてエンコード
    const initialDataString = JSON.stringify(initialData); // JSONとしてエンコード
    panel.webview.html = getWebviewContent(filePath, scriptPath, totalRows, initialDataString);

    panel.webview.onDidReceiveMessage(message => {
        logMessage(`Received message from Webview: ${JSON.stringify(message)}`);

        if (message.command === 'fetchData') {
            const start: number = message.start;
            const end: number = message.end;

            logMessage(`Fetching data for range ${start}-${end}`);
            exec(`${pythonCommand} ${scriptPath} "${filePath}" ${start} ${end}`, (error, stdout, stderr) => {
                if (stderr) {
                    logError(`Python STDERR (Paging Data): ${stderr}`);
                }
                if (error) {
                    logError(`Failed to fetch data from ${start} to ${end}: ${error.message}`);
                    panel.webview.postMessage({
                        command: 'renderTable',
                        jsonData: JSON.stringify({ error: stderr || error.message })
                    });
                    return;
                }

                logMessage(`Fetched data for range ${start} to ${end}: ${stdout.substring(0, 200)}...`);
                panel.webview.postMessage({
                    command: 'renderTable',
                    jsonData: stdout
                });
            });
        }
    });
}

export function deactivate() {
    logMessage('Extension deactivated');
}

function getWebviewContent(filePath: string, scriptPath: string, totalRows: number, initialData: string): string {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Pickle Viewer</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    background-color: #f5f5f5;
                    color: #333;
                    margin: 20px;
                }
                table {
                    border-collapse: collapse;
                    width: 100%;
                    margin-top: 20px;
                }
                th, td {
                    border: 1px solid #ccc;
                    padding: 10px;
                    text-align: left;
                }
                th {
                    background-color: #e0e0e0;
                    color: #333;
                }
                tr:nth-child(even) {
                    background-color: #f1f1f1;
                }
                tr:nth-child(odd) {
                    background-color: #ffffff;
                }
                tr:hover {
                    background-color: #d6eaf8;
                }
            </style>
        </head>
        <body>
            <h1>Pickle Viewer</h1>
            <div class="pagination">
                <button id="first-btn" disabled>先頭ページ</button>
                <button id="prev-btn" disabled>前へ</button>
                <input type="number" id="row-input" min="0" max="${totalRows - 1}" value="0" />
                <button id="next-btn">次へ</button>
                <button id="last-btn">最終ページ</button>
            </div>
            <div id="content"></div>
            <script>
                const vscode = acquireVsCodeApi(); // vscodeオブジェクトを取得
                const totalRows = ${totalRows};
                const rowsPerPage = 50;
                let currentPage = 1;

                const initialData = ${initialData};
                const contentDiv = document.getElementById('content');

                const firstBtn = document.getElementById('first-btn');
                const prevBtn = document.getElementById('prev-btn');
                const nextBtn = document.getElementById('next-btn');
                const lastBtn = document.getElementById('last-btn');
                const rowInput = document.getElementById('row-input');

                // テーブルの描画
                function renderTable(data) {
                    if (data.error) {
                        contentDiv.innerHTML = '<p style="color: red;">Error: ' + data.error + '</p>';
                        return;
                    }

                    let table = '<table><tr>' + data.columns.map(col => '<th>' + col + '</th>').join('') + '</tr>';
                    data.data.forEach(row => {
                        table += '<tr>' + row.map(cell => '<td>' + cell + '</td>').join('') + '</tr>';
                    });
                    table += '</table>';
                    contentDiv.innerHTML = table;

                    // ボタンの有効・無効を設定
                    updateButtonStates();
                }

                // ボタンイベントリスナー
                firstBtn.addEventListener('click', () => {
                    currentPage = 1;
                    fetchData(0, rowsPerPage);
                });
                prevBtn.addEventListener('click', () => {
                    if (currentPage > 1) {
                        currentPage--;
                        fetchData((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);
                    }
                });
                nextBtn.addEventListener('click', () => {
                    if (currentPage * rowsPerPage < totalRows) {
                        currentPage++;
                        fetchData((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);
                    }
                });
                lastBtn.addEventListener('click', () => {
                    currentPage = Math.ceil(totalRows / rowsPerPage);
                    fetchData((currentPage - 1) * rowsPerPage, totalRows);
                });
                rowInput.addEventListener('change', () => {
                    const row = parseInt(rowInput.value, 10);
                    if (!isNaN(row) && row >= 0 && row < totalRows) {
                        currentPage = Math.floor(row / rowsPerPage) + 1; // ページ番号を計算
                        fetchData(row, row + rowsPerPage); // 指定行から表示
                    }
                });

                // データのフェッチ
                function fetchData(start, end) {
                    vscode.postMessage({ command: 'fetchData', start, end });
                }

                // ボタンの有効/無効状態を更新
                function updateButtonStates() {                    
                    firstBtn.disabled = currentPage === 1;
                    prevBtn.disabled = currentPage === 1;
                    nextBtn.disabled = currentPage * rowsPerPage >= totalRows;
                    lastBtn.disabled = currentPage * rowsPerPage >= totalRows;
                    rowInput.value = (currentPage - 1) * rowsPerPage; // 現在の先頭行を表示
                }

                // 拡張機能からのメッセージを受信
                window.addEventListener('message', event => {
                    const message = event.data;
                    if (message.command === 'renderTable') {
                        renderTable(JSON.parse(message.jsonData)); // データを描画
                    }
                });

                // 初期データを描画
                renderTable(JSON.parse(initialData));
            </script>
        </body>
        </html>
    `;
}
