/**
 * Берет стиль онлайна и добавляет в него слои для отображения дорог и разметки.
 *
 * Для успешного добавления слоев необходимо, чтобы в стиле были определены слоты:
 *  1) overpassSlot - для добавления слоев развязки, насыпей, опор
 *  2) markingsSlot - для добавления разметки.
 *  3) roadbedSlot - для добавления слоев дорожного полотна.
 */
const fs = require('fs');
const execSync = require('child_process').execSync;

const styleName = process.argv[2];

const srcdir = `./styles/${styleName}`;
const modelsPath = `${srcdir}/models`;
const iconsPath = `${srcdir}/icons`;

const outdir = `./out/${styleName}`;
const outModelsPath = `${outdir}/models`;
const outIconsPath = `${outdir}/icons`;

const assetsPath = `./assets`;

/** Стилевые настройки */
// Зум, с которого появляется дорожно полотно
const roadbedMinZoom = 16;
// Зум, с которого появляется дорожная разметка
const markingMinZoom = 16;
// Зум, с которого появляются развязки
// Развязки полявляются чуть раньше, чтобы на них еще рисовались оранжевые дороги, 
// которые потом плавно перейдут в широкие
const overpassMinZoom = 15;

// Цвета
// (все цвета пока должны быть в формате #RRGGBB, иначе скрипт некорректно отработает)
const markingWhite = '#eeeeee';
const markingYellow = '#FBED7A';
const markingBlue = '#ccccff';
const markingGray = '#cccccc';

// Цвет асфальта
const roadbedAsphalt = '#A09E9E';
// Цвет насыпи
const embankmentGreen = '#9AC78B';

// Эта фунция плавно тушит цвет широких дорог и разметки, чтобы они превращались в обычные.
// Если хочется сделать это быстрее, то можно заменить `zoom + 0.5` на к примеру  `zoom + 0.1`
const fadeout = (color: string, zoom: number) => ['interpolate', ['linear'], ['zoom'], zoom, transparent(color), zoom + 0.5, color];

// Превращает цвет в прозрачный, сохраняя цветовые компоненты.
const transparent = (color: string) => color.slice(0, 7) + '00';

const embankmentTextures: Record<string, string> = {
    bricks: 'Visiwig-Bricks',
    dots: 'dust_texture',
    squares: 'protruding-squares',
};

const models: { [key: string]: string } = {
    pillar: 'pillar',
};

const laneIcons = {
    '0': 'non-information',
    '2': 'straight-0',
    '4': 'right-0',
    '6': 'straight-right-0-0',
    '8': 'left-0',
    '10': 'left-straight-0-0',
    '12': 'left-right-0-0',
    '14': 'left-straight-right-0-0-0',
    '16': 'slightly_right-0',
    '18': 'straight-slightly_right-0-0',
    '20': 'slightly_right-right-0-0',
    '24': 'left-slightly_right-0-0',
    '32': 'slightly_left-0',
    '34': 'slightly_left-straight-0-0',
    '36': 'slightly_left-right-0-0',
    '40': 'left-slightly_left-0-0',
    '48': 'slightly_left-slightly_right-0-0',
    '64': 'sharply_right-0',
    '66': 'straight-sharply_right-0-0',
    '68': 'right-sharply_right-0-0',
    '80': 'slightly_right-sharply_right-0-0',
    '96': 'slightly_left-sharply_right-0-0',
    '128': 'sharply_left-0',
    '130': 'sharply_left-straight-0-0',
    '132': 'sharply_left-right-0-0',
    '136': 'sharply_left-left-0-0',
    '144': 'sharply_left-slightly_right-0-0',
    '160': 'sharply_left-slightly_left-0-0',
    '256': 'right_with_left_turn-0',
    '258': 'straight-right_with_left_turn-0-0',
    '1024': 'turnover-0',
    '1026': 'straight-turnover-0-0',
    '1028': 'right-turnover-0-0',
    '1030': 'straight-right-turnover-0-0-0',
    '1032': 'left-turnover-0-0',
    '1034': 'left-straight-turnover-0-0-0',
    '1040': 'slightly_right-turnover-0-0',
    '1042': 'straight-slightly_right-turnover-0-0-0',
    '1056': 'slightly_left-turnover-0-0',
    '1058': 'slightly_left-straight-turnover-0-0-0',
    '1088': 'sharply_right-turnover-0-0',
    '1090': 'straight-sharply_right-turnover-0-0-0',
    '1152': 'sharply_left-turnover-0-0',
    '1154': 'sharply_left-straight-turnover-0-0-0',
};
const directionsMatcher: any[] = ['match', ['get', 'db_lane_directions']];

for (const [code, icon] of Object.entries(laneIcons)) {
    directionsMatcher.push([Number(code)], icon);
}
directionsMatcher.push('');

const linearMarking: any = {
    LinearMarking_Broken: {
        filter: ['==', ['get', 'sublayer'], 'LinearMarking_Broken'],
        type: 'line',
        style: {
            width: ['meters-to-pixels', 0.1],
            color: fadeout(markingWhite, markingMinZoom),
            pattern: ['pattern', 'stripe', ['meters-to-pixels', 3], ['meters-to-pixels', 3]],
        },
        minzoom: markingMinZoom,
    },
    LinearMarking_Double: {
        filter: ['==', ['get', 'sublayer'], 'LinearMarking_Double'],
        type: 'line',
        style: {
            width: ['meters-to-pixels', 0.3],
            color: fadeout(markingWhite, markingMinZoom),
            pattern: ['pattern', 'doubledash', 10, ['meters-to-pixels', 0.1], 10, 10],
        },
        minzoom: markingMinZoom,
    },
    LinearMarking_GiveWayLine: {
        filter: ['==', ['get', 'sublayer'], 'LinearMarking_GiveWayLine'],
        type: 'line',
        style: {
            width: ['meters-to-pixels', 0.5],
            color: fadeout(markingWhite, markingMinZoom),
            pattern: [
                'pattern',
                'triangles',
                ['meters-to-pixels', 0.5],
                ['meters-to-pixels', 0.5],
                'left',
            ],
        },
        minzoom: markingMinZoom,
    },
    LinearMarking_ParkingPlaces: {
        filter: ['==', ['get', 'sublayer'], 'LinearMarking_ParkingPlaces'],
        type: 'line',
        style: {
            width: ['meters-to-pixels', 0.1],
            color: fadeout(markingGray, markingMinZoom),
        },
        minzoom: markingMinZoom,
    },
    LinearMarking_Reversal: {
        filter: ['==', ['get', 'sublayer'], 'LinearMarking_Reversal'],
        type: 'line',
        style: {
            width: ['meters-to-pixels', 0.3],
            color: fadeout(markingWhite, markingMinZoom),
            pattern: [
                'pattern',
                'doubledash',
                ['meters-to-pixels', 4],
                ['meters-to-pixels', 0.1],
                ['meters-to-pixels', 2],
                ['meters-to-pixels', 4],
            ],
        },
        minzoom: markingMinZoom,
    },
    LinearMarking_ReverseTraffic: {
        filter: ['==', ['get', 'sublayer'], 'LinearMarking_ReverseTraffic'],
        type: 'line',
        style: {
            width: ['meters-to-pixels', 0.3],
            color: fadeout(markingWhite, markingMinZoom),
            pattern: [
                'pattern',
                'doubledash',
                ['meters-to-pixels', 10],
                ['meters-to-pixels', 0.1],
                ['meters-to-pixels', 5],
                ['meters-to-pixels', 5],
            ],
        },
        minzoom: markingMinZoom,
    },
    LinearMarking_Roughness: {
        filter: ['==', ['get', 'sublayer'], 'LinearMarking_Roughness'],
        type: 'line',
        style: {
            width: ['meters-to-pixels', 0.5],
            color: fadeout(markingWhite, markingMinZoom),
            pattern: ['pattern', 'chess', ['meters-to-pixels', 0.5]],
        },
        minzoom: markingMinZoom,
    },
    LinearMarking_ShortIntermittentBlue: {
        filter: ['==', ['get', 'sublayer'], 'LinearMarking_ShortIntermittentBlue'],
        type: 'line',
        style: {
            width: ['meters-to-pixels', 0.1],
            color: fadeout(markingBlue, markingMinZoom),
            pattern: ['pattern', 'stripe', ['meters-to-pixels', 0.5], ['meters-to-pixels', 0.5]],
        },
        minzoom: markingMinZoom,
    },
    LinearMarking_ShortIntermittentWhite: {
        filter: ['==', ['get', 'sublayer'], 'LinearMarking_ShortIntermittentWhite'],
        type: 'line',
        style: {
            width: ['meters-to-pixels', 0.1],
            color: fadeout(markingWhite, markingMinZoom),
            pattern: ['pattern', 'stripe', ['meters-to-pixels', 0.5], ['meters-to-pixels', 0.5]],
        },
        minzoom: markingMinZoom,
    },
    LinearMarking_Solid: {
        filter: ['==', ['get', 'sublayer'], 'LinearMarking_Solid'],
        type: 'line',
        style: {
            width: ['meters-to-pixels', 0.1],
            color: fadeout(markingWhite, markingMinZoom),
        },
        minzoom: markingMinZoom,
    },
    LinearMarking_Stop: {
        filter: ['==', ['get', 'sublayer'], 'LinearMarking_Stop'],
        type: 'line',
        style: {
            width: ['meters-to-pixels', 0.1],
            color: fadeout(markingYellow, markingMinZoom),
            geometryModifier: ['geometry-modifier', ['line-to-zigzag', 2, 2, false]],
        },
        minzoom: markingMinZoom,
    },
    LinearMarking_StopLine: {
        filter: ['==', ['get', 'sublayer'], 'LinearMarking_StopLine'],
        type: 'line',
        style: {
            width: ['meters-to-pixels', 0.3],
            color: fadeout(markingWhite, markingMinZoom),
        },
        minzoom: markingMinZoom,
    },
    LinearMarking_TramStop: {
        filter: ['==', ['get', 'sublayer'], 'LinearMarking_TramStop'],
        type: 'line',
        style: {
            width: ['meters-to-pixels', 0.1],
            color: fadeout(markingYellow, markingMinZoom),
            geometryModifier: ['geometry-modifier', ['line-to-zigzag', 1, 1, false]],
        },
        minzoom: markingMinZoom,
    },
    LinearMarking_TurnStraight: {
        filter: ['==', ['get', 'sublayer'], 'LinearMarking_TurnStraight'],
        type: 'line',
        style: {
            width: ['meters-to-pixels', 0.3],
            color: fadeout(markingWhite, markingMinZoom),
            pattern: [
                'pattern',
                'doubledash',
                ['meters-to-pixels', 4],
                ['meters-to-pixels', 0.1],
                ['meters-to-pixels', 4],
                ['meters-to-pixels', 2],
            ],
        },
        minzoom: markingMinZoom,
    },
};

const polygonMarking: any = {
    PolygonMarkings_save_island: {
        filter: ['==', ['get', 'sublayer'], 'PolygonMarkings_save_island'],
        type: 'polygon',
        style: {
            color: fadeout('#505050', markingMinZoom),
        },
        minzoom: markingMinZoom,
    },
    PolygonMarkings_save_island_strokes: {
        filter: ['==', ['get', 'sublayer'], 'PolygonMarkings_save_island_strokes'],
        type: 'polygon',
        style: {
            color: fadeout(markingWhite, markingMinZoom),
        },
        minzoom: markingMinZoom,
    },
    PolygonMarkings_waffle: {
        filter: ['==', ['get', 'sublayer'], 'PolygonMarkings_waffle'],
        type: 'polygon',
        style: {
            color: fadeout(markingYellow + '60', markingMinZoom),
        },
        minzoom: markingMinZoom,
    },
};

const pointMarking: any = {
    PointMarkings_lane_directions: {
        type: 'metricPoint',
        filter: ['==', ['get', 'sublayer'], 'PointMarkings_lane_directions'],
        style: {
            iconImage: directionsMatcher as any,
            color: fadeout(markingWhite, markingMinZoom),
            rotation: ['get', 'db_rotation_angle'],
            width: 1,
            height: 3,
        },
        minzoom: markingMinZoom,
    },
};

const overpassLayers: Record<string, any> = {
    EmbankmentPolygon: {
        type: 'embankment',
        style: {
            color: fadeout(embankmentGreen, roadbedMinZoom),
            visibility: 'visible',
            textureSize: [128, 128],
            textureImage: 'dust_texture',
        },
        filter: [
            'all',
            ['match', ['global', 'immersiveRoadsOn'], [true], true, false],
            ['match', ['get', 'sublayer'], ['Embankment_polygon'], true, false],
        ],
        minzoom: overpassMinZoom
    },
    RoadSupport: {
        type: 'model',
        style: {
            scale: [
                'literal',
                [
                    1,
                    1,
                    ['+', ['*', ['get', 'db_nominal_height'], ['*', ['get', 'db_level'], 5]], -0.3],
                ],
            ],
            modelSrc: 'pillar',
            rotation: ['literal', [0, 0, ['get', 'db_rotation_angle']]],
            nearCameraFade: 1000,
        },
        filter: [
            'all',
            ['match', ['global', 'immersiveRoadsOn'], [true], true, false],
            ['match', ['get', 'db_sublayer'], ['Road_support', 'Road_support_new'], true, false],
        ],
        minzoom: overpassMinZoom
    },
    Roadbed: {
        type: 'overpass',
        style: {
            color: fadeout(roadbedAsphalt, roadbedMinZoom),
            sideColor: ['interpolate', ['linear'], ['height'], 0, '#cfcfcf', 0.99, '#FCFBF2'],
            thickness: 0.5,
            visibility: 'visible',
            borderWidth: 0.7,
            bottomColor: '#CFCFCF',
            strokeColor: '#C3C3C3',
            borderHeight: 0.3,
            borderTopColor: '#FCFBF2',
            nearCameraFade: 0,
        },
        filter: [
            'all',
            ['match', ['global', 'immersiveRoadsOn'], [true], true, false],
            [
                'match',
                ['get', 'sublayer'],
                ['Roadbed', 'Road_bed_outline', 'Roadbed_outline'],
                true,
                false,
            ],
        ],
        minzoom: overpassMinZoom
    },
};

const roadbedLayers: Record<string, any> = {
    Roadbed: {
        type: 'polygon',
        style: {
            color: fadeout(roadbedAsphalt, roadbedMinZoom),
            visibility: 'visible',
            strokeWidth: ['interpolate', ['linear'], ['zoom'], 16, 1, 19, 3],
        },
        filter: [
            'all',
            ['match', ['global', 'immersiveRoadsOn'], [true], true, false],
            ['match', ['get', 'sublayer'], ['Roadbed'], true, false],
        ],
        minzoom: roadbedMinZoom
    },
};

const slotLayers = {
    overpassSlot: overpassLayers,
    markingsSlot: {
        ...polygonMarking,
        ...linearMarking,
        ...pointMarking,
    },
    roadbedSlot: roadbedLayers,
};

function patchImmersiveStyle() {
    let injectedIndex = 0;
    const style = JSON.parse(fs.readFileSync(`${srcdir}/style.json`, 'utf-8'));
    for (const laneIcon of Object.values(laneIcons)) {
        const hash = execSync(`md5 -q ${assetsPath}/images/lanes/${laneIcon}.svg`).toString().split('\n')[0].trim();
        fs.copyFileSync(
            `${assetsPath}/images/lanes/${laneIcon}.svg`,
            `${outIconsPath}/${laneIcon}-${hash}.svg`,
        );
        style.icons[laneIcon] = { url: `${laneIcon}-${hash}.svg` };
    }
    for (const texIcon of Object.values(embankmentTextures)) {
        const hash = execSync(`md5 -q ${assetsPath}/images/${texIcon}.svg`).toString().split('\n')[0].trim();
        fs.copyFileSync(
            `${assetsPath}/images/${texIcon}.svg`,
            `${outIconsPath}/${texIcon}-${hash}.svg`,
        );
        style.icons[texIcon] = { url: `${texIcon}-${hash}.svg` };
    }
    for (const model in models) {
        const hash = execSync(`md5 -q ${assetsPath}/models/${models[model]}.glb`).toString().split('\n')[0].trim();
        fs.copyFileSync(
            `${assetsPath}/models/${models[model]}.glb`,
            `${outModelsPath}/${models[model]}-${hash}.glb`,
        );
        style.models[model] = { url: `${models[model]}-${hash}.glb` };
    }

    const slotsLeft = new Set(Object.keys(slotLayers));
    const outlayers: any[] = [];
    for (const layer of style.layers) {
        outlayers.push(layer);
        checkAndInjectSlots(layer.id, slotLayers, outlayers);
        if (layer.type === 'group') {
            const sublayers = layer.layers.slice();
            layer.layers = [];
            for (const sublayer of sublayers) {
                layer.layers.push(sublayer);
                checkAndInjectSlots(sublayer.id, slotLayers, layer.layers);
            }
        }
    }
    style.layers = outlayers;

    function checkAndInjectSlots(id: string, slotLayers: any, collection: any[]) {
        if (id in slotLayers) {
            slotsLeft.delete(id);
            const injectedLayers = slotLayers[id];
            for (const ilayer in injectedLayers) {
                injectedIndex += 1;
                collection.push({
                    id: `${ilayer}-${injectedIndex}`,
                    ...injectedLayers[ilayer],
                });
            }
        }
    }

    if (slotsLeft.size > 0) {
        console.error(`${styleName}: Not all slots were injected: ${Array.from(slotsLeft)}`);
        process.exit(1);
    }

    fs.writeFileSync(`${outdir}/style.json`, JSON.stringify(style));
}

execSync(`rm -rf ${outdir}`);
execSync(`mkdir -p ${outdir}`);
execSync(`mkdir -p ${outdir}/icons`);
execSync(`mkdir -p ${outdir}/models`);
execSync(`mkdir -p ${outdir}/fonts`);

execSync(`cp -r ${srcdir}/fonts/* ${outdir}/fonts/`);
execSync(`cp -r ${srcdir}/icons/* ${outdir}/icons/`);
execSync(`cp -r ${srcdir}/models/* ${outdir}/models/`);

patchImmersiveStyle();