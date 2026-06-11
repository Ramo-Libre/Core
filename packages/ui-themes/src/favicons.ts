// @ts-nocheck
import faviconWeb from './assets/web.svg?raw';
import faviconLab from './assets/lab.svg?raw';
import faviconHub from './assets/hub.svg?raw';

const clean = (svg: string): string =>
    svg.trim()
    .replace(/\r?\n|\r/g, '')
    .replace(/\s+/g, ' ')
    .replace(/#/g, '%23');

const toURL = (svg: string): string => `data:image/svg+xml;utf8,${clean(svg)}`;

export const SuiteFavicons = {
    web: toURL(faviconWeb),
    lab: toURL(faviconLab),
    hub: toURL(faviconHub)
};
