/**
 * Скрипт, который парсит названия иконок направлений и формирует
 * из них коды для атрибута db_lane_direction.
 *
 * Использование:
 *
 *    npx ts-node --esm encodeDirections.ts > directions.json
 *
 * Написан в соавторстве с Copilot Chat.
 */
import fs from 'fs';
import path from 'path';

const directions: { [key: string]: number } = {
    straight: 2 ** 1,
    right: 2 ** 2,
    left: 2 ** 3,
    slightly_right: 2 ** 4,
    slightly_left: 2 ** 5,
    sharply_right: 2 ** 6,
    sharply_left: 2 ** 7,
    right_with_left_turn: 2 ** 8,
    on_circle: 2 ** 9,
    turnover: 2 ** 10,
};

function encodeDirections(filename: string): number {
    const parts = filename.split('-');
    let code = 0;
    for (const part of parts) {
        if (part in directions) {
            code |= directions[part];
        }
    }
    return code;
}

// function encodeFilesInDirectory(directory: string): { [key: number]: string } {
//     const files = fs.readdirSync(directory);
//     const result: { [key: number]: string } = {};
//     const usedCodes: { [key: number]: boolean } = {};
//     for (const file of files) {
//         if (path.extname(file) === '.svg') {
//             const name = path.basename(file, '.svg');
//             const code = encodeDirections(name);
//             if (!(code in usedCodes)) {
//                 result[code] = name;
//                 usedCodes[code] = true;
//             }
//         }
//     }
//     return result;
// }

function encodeFilesInDirectory(directory: string): { [key: number]: string } {
    const files = fs.readdirSync(directory);
    const result: { [key: number]: string } = {};
    const usedCodes: { [key: number]: boolean } = {};
    for (const file of files) {
        if (path.extname(file) === '.svg') {
            const name = path.basename(file, '.svg');
            if (name.includes('ot-')) {
                continue;
            }
            const code = encodeDirections(name);
            if (!(code in usedCodes)) {
                result[code] = name;
                usedCodes[code] = true;
            }
        }
    }
    return result;
}

const directory = '.';
const result = encodeFilesInDirectory(directory);
console.log(JSON.stringify(result, null, 2));
