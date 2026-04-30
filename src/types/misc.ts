export type RGBColor = [number, number, number];

export type Img = {
    id: string;
}

export const DEVICE_STATUSES = ["idle", "fetching", "updating", "error", "offline"] as const;
export type DeviceStatus = typeof DEVICE_STATUSES[number];
export function isStatus(x: string): x is DeviceStatus  {
    return (DEVICE_STATUSES as readonly string[]).includes(x);
}