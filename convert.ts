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

const roadsGroupId = '515493';

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
// Зум, до которого анимируется цвет
const roadbedMaxZoom = 18;
// Зум, с которого появляется основная дорожная разметка
const markingMinZoom = 16;
// Зум, с которого появляется дополнительная дорожная разметка
const markingAddMinZoom = 17;
// Зум, с которого появляются развязки
// Развязки полявляются чуть раньше, чтобы на них еще рисовались оранжевые дороги, 
// которые потом плавно перейдут в широкие
const overpassMinZoom = 15;

// Цвета
// (все цвета пока должны быть в формате #RRGGBB, иначе скрипт некорректно отработает)
const markingWhite = '#E0E0E0';
const markingYellow = '#EBE74D';
const markingBlue = '#E0E0E0';
const markingGray = '#E0E0E0';
const markingPoint = '#FFFFFF';

// Цвет асфальта
const roadbedAsphalt = '#C7C7C7';
const roadbedAsphaltDark = '#B3B3B3';
// Цвет насыпи
const embankmentGreen = '#9AC78B';

// Эта фунция плавно тушит цвет широких дорог и разметки, чтобы они превращались в обычные.
// Если хочется сделать это быстрее, то можно заменить `zoom + 0.5` на к примеру  `zoom + 0.1`
const fadeout = (color: string, zoom: number) => ['interpolate', ['linear'], ['zoom'], zoom, transparent(color), zoom + 0.1, color];

// Константа для плавного изменения цвета
const linearchangecolor = (color1: string, zoom1: number, color2: string, zoom2: number) => ['interpolate', ['linear'], ['zoom'], zoom1, transparent(color1), zoom1 + 0.1, color1, zoom2, color2];

// Превращает цвет в прозрачный, сохраняя цветовые компоненты.
const transparent = (color: string) => color.slice(0, 7) + '00';

const embankmentTextures: Record<string, string> = {
    bricks: 'Visiwig-Bricks',
    dots: 'dust_texture',
    squares: 'protruding-squares',
    waffle3x: 'waffle3x',
    waffle: 'waffle',
    'immersive-sign-give-way': 'immersive-sign-give-way',
    'immersive-sign-electroparking': 'immersive-sign-electroparking',
    'immersive-sign-disabled-person': 'immersive-sign-disabled-person', 
    'immersive-sign-bus-line': 'immersive-sign-bus-line'
};

const models: { [key: string]: string } = {
    pillar: 'pillar',
};

const laneIcons = {
    //'0': 'non-information',
    '2': 'immersive-straight',
    '4': 'immersive-right',
    '6': 'immersive-right-straight',
    '8': 'immersive-left',
    '10': 'immersive-left-straight',
    '12': 'immersive-left-right',
    '14': 'immersive-left-straight-right',
    //'16': 'slightly_right-0',
    //'18': 'straight-slightly_right-0-0',
    //'20': 'slightly_right-right-0-0',
    //'24': 'left-slightly_right-0-0',
    //'32': 'slightly_left-0',
    //'34': 'slightly_left-straight-0-0',
    //'36': 'slightly_left-right-0-0',
    //'40': 'left-slightly_left-0-0',
    //'48': 'slightly_left-slightly_right-0-0',
    '64': 'immersive-sharply-right',
    //'66': 'straight-sharply_right-0-0',
    //'68': 'right-sharply_right-0-0',
    //'80': 'slightly_right-sharply_right-0-0',
    //'96': 'slightly_left-sharply_right-0-0',
    '128': 'immersive-sharply-left',
    //'130': 'sharply_left-straight-0-0',
    //'132': 'sharply_left-right-0-0',
    //'136': 'sharply_left-left-0-0',
    //'144': 'sharply_left-slightly_right-0-0',
    //'160': 'sharply_left-slightly_left-0-0',
    //'256': 'right_with_left_turn-0',
    //'258': 'straight-right_with_left_turn-0-0',
    '1024': 'immersive-turnover-left',
    '1026': 'immersive-turnover-left-straight',
    //'1028': 'right-turnover-0-0',
    //'1030': 'straight-right-turnover-0-0-0',
    //'1032': 'left-turnover-0-0',
    //'1034': 'left-straight-turnover-0-0-0',
    //'1040': 'slightly_right-turnover-0-0',
    //'1042': 'straight-slightly_right-turnover-0-0-0',
    //'1056': 'slightly_left-turnover-0-0',
    //'1058': 'slightly_left-straight-turnover-0-0-0',
    //'1088': 'sharply_right-turnover-0-0',
    //'1090': 'straight-sharply_right-turnover-0-0-0',
    //'1152': 'sharply_left-turnover-0-0',
    //'1154': 'sharply_left-straight-turnover-0-0-0',
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
            width: ['meters-to-pixels', 0.15],
            color: fadeout(markingWhite, markingAddMinZoom),
            pattern: ['pattern', 'stripe', ['meters-to-pixels', 3], ['meters-to-pixels', 3]],
            startCap: 'butt',
            endCap: 'butt'
        },
        minzoom: markingAddMinZoom,
    },
    LinearMarking_Double: {
        filter: ['==', ['get', 'sublayer'], 'LinearMarking_Double'],
        type: 'line',
        style: {
            width: ['meters-to-pixels', ['interpolate', ['linear'], ['zoom'], 16, 2.4, 18, 0.6]],
            color: fadeout(markingWhite, markingMinZoom),
            pattern: [
                'pattern',
                'doubledash', 10,
                ['meters-to-pixels', ['interpolate', ['linear'], ['zoom'], 16, 0.8, 18, 0.2]],
                10,
                10
            ],
            startCap: 'butt',
            endCap: 'butt'

        },
        minzoom: markingMinZoom,
    },
    /*
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
    */
    LinearMarking_ParkingPlaces: {
        filter: ['==', ['get', 'sublayer'], 'LinearMarking_ParkingPlaces'],
        type: 'line',
        style: {
            width: ['meters-to-pixels', 0.15],
            color: fadeout(markingGray, markingMinZoom),
        },
        minzoom: markingMinZoom,
    },
    LinearMarking_Reversal: {
        filter: ['==', ['get', 'sublayer'], 'LinearMarking_Reversal'],
        type: 'line',
        style: {
            width: ['meters-to-pixels', ['interpolate', ['linear'], ['zoom'], 16, 2.4, 18, 0.6]],
            color: fadeout(markingWhite, markingMinZoom),
            pattern: [
                'pattern',
                'doubledash',
                ['meters-to-pixels', 4],
                ['meters-to-pixels', ['interpolate', ['linear'], ['zoom'], 16, 0.8, 18, 0.2]],
                ['meters-to-pixels', 2],
                ['meters-to-pixels', 4],
            ],
            startCap: 'butt',
            endCap: 'butt'
        },
        minzoom: markingMinZoom,
    },
    LinearMarking_ReverseTraffic: {
        filter: ['==', ['get', 'sublayer'], 'LinearMarking_ReverseTraffic'],
        type: 'line',
        style: {
            width: ['meters-to-pixels', ['interpolate', ['linear'], ['zoom'], 16, 2.4, 18, 0.6]],
            color: fadeout(markingWhite, markingAddMinZoom),
            pattern: [
                'pattern',
                'doubledash',
                ['meters-to-pixels', 10],
                ['meters-to-pixels', ['interpolate', ['linear'], ['zoom'], 16, 0.8, 18, 0.2]],
                ['meters-to-pixels', 5],
                ['meters-to-pixels', 5],
            ],
            startCap: 'butt',
            endCap: 'butt'
        },
        minzoom: markingAddMinZoom,
    },
    /*
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
    */
    LinearMarking_ShortIntermittentBlue: {
        filter: ['==', ['get', 'sublayer'], 'LinearMarking_ShortIntermittentBlue'],
        type: 'line',
        style: {
            width: ['meters-to-pixels', 0.15],
            color: fadeout(markingBlue, markingAddMinZoom),
            pattern: ['pattern', 'stripe', ['meters-to-pixels', 0.5], ['meters-to-pixels', 0.5]],
            startCap: 'butt',
            endCap: 'butt'
        },
        minzoom: markingAddMinZoom,
    },
    LinearMarking_ShortIntermittentWhite: {
        filter: ['==', ['get', 'sublayer'], 'LinearMarking_ShortIntermittentWhite'],
        type: 'line',
        style: {
            width: ['meters-to-pixels', 0.15],
            color: fadeout(markingWhite, markingAddMinZoom),
            pattern: ['pattern', 'stripe', ['meters-to-pixels', 0.5], ['meters-to-pixels', 0.5]],
            startCap: 'butt',
            endCap: 'butt'
        },
        minzoom: markingAddMinZoom,
    },
    LinearMarking_Solid: {
        filter: ['==', ['get', 'sublayer'], 'LinearMarking_Solid'],
        type: 'line',
        style: {
            width: ['meters-to-pixels', ['interpolate', ['linear'], ['zoom'], 16, 0.8, 18, 0.2]],
            color: fadeout(markingWhite, markingMinZoom),
        },
        minzoom: markingMinZoom,
    },
    LinearMarking_Stop: {
        filter: ['==', ['get', 'sublayer'], 'LinearMarking_Stop'],
        type: 'line',
        style: {
            width: ['meters-to-pixels', 0.15],
            color: fadeout(markingYellow, markingAddMinZoom),
            geometryModifier: ['geometry-modifier', ['line-to-zigzag', 2, 2, false]],
        },
        minzoom: markingAddMinZoom,
    },
    LinearMarking_StopLine: {
        filter: ['==', ['get', 'sublayer'], 'LinearMarking_StopLine'],
        type: 'line',
        style: {
            width: ['meters-to-pixels', 0.3],
            color: fadeout(markingWhite, markingMinZoom),
            startCap: 'butt',
            endCap: 'butt'
        },
        minzoom: markingAddMinZoom,
    },
    LinearMarking_TramStop: {
        filter: ['==', ['get', 'sublayer'], 'LinearMarking_TramStop'],
        type: 'line',
        style: {
            width: ['meters-to-pixels', 0.15],
            color: fadeout(markingYellow, markingAddMinZoom),
            geometryModifier: ['geometry-modifier', ['line-to-zigzag', 1, 1, false]],
        },
        minzoom: markingAddMinZoom,
    },
    LinearMarking_TurnStraight: {
        filter: ['==', ['get', 'sublayer'], 'LinearMarking_TurnStraight'],
        type: 'line',
        style: {
            width: ['meters-to-pixels', ['interpolate', ['linear'], ['zoom'], 16, 2.4, 18, 0.6]],
            color: fadeout(markingWhite, markingAddMinZoom),
            pattern: [
                'pattern',
                'doubledash',
                ['meters-to-pixels', 4],
                ['meters-to-pixels', ['interpolate', ['linear'], ['zoom'], 16, 0.8, 18, 0.2]],
                ['meters-to-pixels', 4],
                ['meters-to-pixels', 2],
            ],
            startCap: 'butt',
            endCap: 'butt'
        },
        minzoom: markingAddMinZoom,
    },
    LinearMarking_save_island_contour: {
        filter: ['==', ['get', 'sublayer'], 'LinearMarking_save_island_contour'],
        type: 'line',
        style: {
            width: ['meters-to-pixels', ['interpolate', ['linear'], ['zoom'], 16, 0.8, 18, 0.2]],
            color: fadeout(markingWhite, markingMinZoom),
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
            strokeColor: fadeout(markingYellow + '60', markingMinZoom),
            strokeWidth: ['meters-to-pixels', 0.1],
            color: linearchangecolor(roadbedAsphalt, roadbedMinZoom, roadbedAsphaltDark, roadbedMaxZoom),
            textureSize: [51, 51],
            textureImage: "waffle",
            textureOpacity: ['interpolate', ['linear'], ['zoom'], markingAddMinZoom + 0.1, 0, markingAddMinZoom, 0.7]
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
            color: fadeout(markingPoint, markingMinZoom),
            rotation: ['get', 'db_rotation_angle'],
            width: 2.4,
            height: 4.6,
        },
        minzoom: markingMinZoom,
    },
    PointMarkings_public_transport: {
        type: 'metricPoint',
        filter: ['==', ['get', 'sublayer'], 'PointMarkings_public_transport'],
        style: {
            iconImage: 'immersive-sign-bus-line',
            color: fadeout(markingPoint, markingMinZoom),
            rotation: ['get', 'db_rotation_angle'],
            width: 1.8,
            height: 3.2,
        },
        minzoom: markingMinZoom,
    },
    PointMarkings_ParkingHandicapped: {
        type: 'metricPoint',
        filter: ['==', ['get', 'sublayer'], 'PointMarkings_ParkingHandicapped'],
        style: {
            iconImage: 'immersive-sign-disabled-person',
            color: fadeout(markingPoint, markingMinZoom),
            rotation: ['get', 'db_rotation_angle'],
            width: 2.2,
            height: 3.2,
        },
        minzoom: markingMinZoom,
    },
    PointMarkings_ParkingElectricFilling: {
        type: 'metricPoint',
        filter: ['==', ['get', 'sublayer'], 'PointMarkings_ParkingElectricFilling'],
        style: {
            iconImage: 'immersive-sign-electroparking',
            color: fadeout(markingPoint, markingMinZoom),
            rotation: ['get', 'db_rotation_angle'],
            width: 1.8,
            height: 3.2,
        },
        minzoom: markingMinZoom,
    },
    PointMarkings_Triangle: {
        type: 'metricPoint',
        filter: ['==', ['get', 'sublayer'], 'PointMarkings_Triangle'],
        style: {
            iconImage: 'immersive-sign-give-way',
            color: fadeout(markingPoint, markingMinZoom),
            rotation: ['get', 'db_rotation_angle'],
            width: 1.8,
            height: 4.2,
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
    Roadbed: {
        type: 'overpass',
        style: {
            color: linearchangecolor(roadbedAsphalt, roadbedMinZoom, roadbedAsphaltDark, roadbedMaxZoom),
            sideColor: ['interpolate', ['linear'], ['height'], 0, '#A6A9AD', 0.99, '#D9D9D9'],
            thickness: 0.5,
            visibility: 'visible',
            borderWidth: 0.7,
            bottomColor: '#A6A9AD',
            strokeColor: '#D9D9D9',
            borderHeight: 0.3,
            borderTopColor: '#D9D9D9',
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
};

const roadbedLayers: Record<string, any> = {
    Roadbed: {
        type: 'polygon',
        style: {
            color: linearchangecolor(roadbedAsphalt, roadbedMinZoom, roadbedAsphaltDark, roadbedMaxZoom),
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
                if (layer.id === roadsGroupId) {
                    sublayer.ignoreTier = ['match', ['get', 'db_has_immersive_counterpart'], [1], false, true];
                }
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