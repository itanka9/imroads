import fs from 'fs';
import fetch, { Response } from 'node-fetch';

const authEndpoint = 'https://api.auth.2gis.com/2.1';
const stylesEndpoint = 'https://styles-editor.api.2gis.com';

const styleName = process.argv[2];

const uploadIds: Record<string, string> = {
    online: '9c73b6cf-5d37-44a2-9a3e-68737b72d9a4'
}

const styleId = uploadIds[styleName];

if (!styleId) {
    console.error(`Unknown style name: ${styleName}`);
    process.exit(1);
}

uploadStyle(styleId).catch((error) => {
    console.error(`STYLE DOWNLOAD ERROR: ${String(error)}`);
});

/**
 * Главная функция скрипта. Реализует весь алгоритм экспорта стилей:
 *   1. Авторизуемся на бекенде авторазиции
 *   2. Обновляем стиль в виде черновика
 *   3. Публикуем черновик
 */
async function uploadStyle(id: string) {
    const styleBody = JSON.parse(fs.readFileSync(`./out/${styleName}/style.json`, 'utf8'));
    console.log('performing auth...');
    const authToken: string = await getAuthToken();
    console.log('creating session...');
    const sessionId = await openEditSession(id, authToken);
    console.log('uploading icons...');
    const assets: Array<'images' | 'models'> = ['images', 'models'];
    const assetFolders = {
        images: 'icons',
        models: 'models'
    }
    for (const assetGroup of assets) {
        const newAssets = getNewAssets(assetFolders[assetGroup]);
        const assetsFolder = assetFolders[assetGroup];
        const styleMap = styleBody[assetsFolder];
        for (const asset in styleMap) {
            const url = styleMap[asset].url;
            if (newAssets.has(url) && asset !== 'non-information') {
                const postResult = await postAsset(id, asset, assetGroup, `./out/${styleName}/${assetsFolder}/${url}`, authToken, sessionId);
                styleMap[asset].url = postResult.filename;
            }
        }
    }
    console.log('uploading style...');
    await updateStyle(id, authToken, sessionId, styleBody);
    console.log('publishing style...');
    await publishStyle(id, authToken, sessionId);
    console.log('releasing session...');
    await closeEditSession(id, sessionId, authToken);
    console.log('Done.');
}

function getNewAssets(assetGroup: string) {
    const outAssets = new Set();
    const inAssets = new Set();
    for (const fn of fs.readdirSync(`./styles/${styleName}/${assetGroup}`)) {
        inAssets.add(fn);
    }
    for (const fn of fs.readdirSync(`./out/${styleName}/${assetGroup}`)) {
        outAssets.add(fn);
    }
    return new Set(Array.from(outAssets).filter(fn => !inAssets.has(fn)));
}

/**
 * Копирует референсный стиль. Этот метод нужен, чтобы скопировать к нам в проект на бекенде стилей
 * дефолтный стиль MapGL API (Андрея Кочанова), потому что только наши стили мы можем экспортировать.
 * @param originId - id референсного стиля.
 * @returns - id скопированного стиля.
 */
function copyFromOrigin(originId: string, authToken: string): Promise<string> {
    return fetch(stylesEndpoint + `/projects/${originId}/copy`, {
        method: 'POST',
        headers: {
            'x-token-auth': authToken,
            'Content-Type': 'application/json',
        },
    })
        .then((raw: Response) => raw.json())
        .then((response: any) => {
            return response.result.id;
        });
}

/**
 * Запускает задачу на экспорт стиля
 * @param id - id экспортируемого стиля.
 * @returns структуру, содержающую id и статус задачи
 */
function startDownloadTask(id: string, authToken: string) {
    return fetch(stylesEndpoint + '/webgl/tasks', {
        method: 'POST',
        headers: {
            'x-token-auth': authToken,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            name: 'Get style for on-premise release',
            projects: [id],
        }),
    }).then((r: any) => r.json());
}

/**
 * Запрашивает статус задачи экспорта стилей
 *
 * @param taskId - id задачи экспорта
 * @returns структуру, содержающую id и статус задачи
 */
function getTaskStatus(taskId: string, authToken: string) {
    return fetch(`${stylesEndpoint}/webgl/tasks/${taskId}`, {
        headers: {
            'x-token-auth': authToken,
            'Content-Type': 'application/json',
        },
    }).then((r: any) => r.json());
}

/**
 * Открывает сессию на редактирование
 *
 * @param styleId - id стиля, который нужно редакторовать
 * @returns id сессии
 */
function openEditSession(styleId: string, authToken: string) {
    return fetch(stylesEndpoint + `/projects/${styleId}/editorsession`, {
        method: 'PUT',
        headers: {
            'x-token-auth': authToken,
            'Content-Type': 'application/json',
        },
    }).then((r) => r.json())
      .then(resp => {
        if (resp.result.id) {
            return resp.result.id;
        }
        console.log(JSON.stringify(resp, null, 2));
        throw new Error('Failed to open edit session');
    })
}

/**
 * Закрывет сессию на редактирование
 *
 * @param styleId - id стиля, который нужно редакторовать
 */
function closeEditSession(styleId: string, sessionId: string, authToken: string) {
    return fetch(stylesEndpoint + `/projects/${styleId}/editorsession`, {
        method: 'DELETE',
        headers: {
            'x-token-auth': authToken,
            'Content-Type': 'application/json',
            'X-Editorsession-Id': sessionId 
        },
    }).then((r) => r.json());
}


/**
 * Удаляет стиль. В данном случае используется, чтобы удалить скопированный стиль, потому
 * как после экспорта он нам более не нужен.
 *
 * @param copiedId - id стиля
 */
function deleteCopiedStyle(copiedId: string, authToken: string) {
    return fetch(stylesEndpoint + `/projects/${copiedId}`, {
        method: 'DELETE',
        headers: {
            'x-token-auth': authToken,
            'Content-Type': 'application/json',
        },
    }).then((r) => r.json());
}

function updateStyle(copiedId: string, authToken: string, sessionId: string, style: any) {
    if (style) {
        style.name = `[upload] ${style.name}`;
    }
    return fetch(stylesEndpoint + `/projects/${copiedId}/draft`, {
        method: 'PUT',
        headers: {
            'x-token-auth': authToken,
            'Content-Type': 'application/json',
            'X-Editorsession-Id': sessionId 
        },
        body: JSON.stringify({ config: style })
    })
        .then((r) => r.json())
        .then(json => { console.log(json) });
}

function publishStyle(styleId: string, authToken: string, sessionId: string) {
    return fetch(stylesEndpoint + `/projects/${styleId}/sync-with-draft`, {
        method: 'POST',
        headers: {
            'x-token-auth': authToken,
            'Content-Type': 'application/json',
            'X-Editorsession-Id': sessionId
        },
    })
    .then((r) => r.json())
    .then(json => { console.log(json) });
}


function postAsset(styleId: string, assetId: string, assetGroup: 'images' | 'models', fn: string, authToken: string, sessionId: string) {
    return fetch(stylesEndpoint + `/projects/${styleId}/${assetGroup}/draft`, {
        method: 'POST',
        headers: {
            'x-token-auth': authToken,
            'Content-Type': 'application/json',
            'X-Editorsession-Id': sessionId 
        },
        body: JSON.stringify({
            id: assetId,
            sourceCode: fs.readFileSync(fn, 'base64')
        })
    })
        .then((r) => r.json())
        .then(resp => {
            console.log(`[${assetGroup}] ${assetId}=${resp.result.filename}`);
            return resp.result;
        });
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Получает oauth2-токен для дальнейшей работы с API бекенда стилей.
 *
 * @returns токен для авторизации
 */
function getAuthToken() {
    const username = process.env.STYLES_BACKEND_USERNAME;
    if (username === undefined) {
        return Promise.reject(
            'To access styles backend, username should be specified via STYLES_BACKEND_USERNAME environment variable',
        );
    }
    const password = process.env.STYLES_BACKEND_PASSWORD;
    if (password === undefined) {
        return Promise.reject(
            'To access styles backend, password should be specified via STYLES_BACKEND_PASSWORD environment variable',
        );
    }
    const params = new URLSearchParams();
    params.append('grant_type', 'password');
    params.append('client_id', 'online');
    params.append('username', username);
    params.append('password', password);
    return fetch(authEndpoint + '/oauth/token', {
        method: 'POST',
        headers: {
            Accept: 'application/json',
        },
        body: params,
    })
        .then((r) => r.json())
        .then((authResponse: any) => {
            const authToken: string = authResponse.access_token;
            if (!authToken) {
                return Promise.reject(
                    `Getting auth token failed:\n${JSON.stringify(authResponse, null, 2)}`,
                );
            }
            return authToken;
        });
}
