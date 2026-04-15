export type State = StaticState | BlankState;

export type StaticState = {
    "mode": "static"
    "item": Item | null
}

export type BlankState = {
    "mode": "blank",
    "color": EPDColor
}

export const MODES = ["static", "blank"] as const;
export type Mode = typeof MODES[number];
export function isMode(x: string): x is Mode {
    return (MODES as readonly string[]).includes(x);
}

export const EPD_COLORS = ["black", "white", "yellow", "red", "blue", "green"] as const;
export type EPDColor = typeof EPD_COLORS[number];
export function isEPDColor(x: string): x is EPDColor {
    return (EPD_COLORS as readonly string[]).includes(x);
}

export type Item = ImageItem;

export type ImageItem = {
    "type": "image",
    "id": string
}

export type ItemType = "image";