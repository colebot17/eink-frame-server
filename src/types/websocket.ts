import type { DeviceStatus, Img } from "./misc.js";
import type { EPDColor, Mode, State } from "./state.js";

type MessageMap = {
    // server -> client
    init: { state: State, draft: State, images: Img[], statuses: Record<string, DeviceStatus> };
    state: { state: State };
    draft_state: { state: State };
    saved_images: { images: Img[] };
    response: { reqid: number } & ({ status: "success" | "noop" } | { status: "error", message: string });
    device_status: { device: string, status: DeviceStatus };
    device_statuses: { statuses: Record<string, DeviceStatus> };

    // web client -> server
    commit: { reqid: number };
    reset_draft: { reqid: number };
    set_mode: { mode: Mode, reqid: number };
    set_color: { color: EPDColor, reqid: number };
    set_image: { id: string, reqid: number };
    delete_image: { id: string, reqid: number };
};

export type Message = {
    [K in keyof MessageMap]: { type: K } & MessageMap[K]
}[keyof MessageMap];