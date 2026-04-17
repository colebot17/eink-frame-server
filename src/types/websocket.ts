import type { Img } from "./misc.js";
import type { EPDColor, Mode, State } from "./state.js";

type MessageMap = {
    // server -> client
    init: { state: State, draft: State, images: Img[] };
    state: { state: State };
    draft_state: { state: State };
    saved_images: { images: Img[] };
    response: { reqid: number } & ({ status: "success" | "noop" } | { status: "error", message: string});
    progress: { reqid: number, progress?: number, secsRemaining?: number };

    // display -> server
    update_begin: {};
    update_complete: {};

    // app -> server
    commit: { reqid: number };
    reset_draft: { reqid: number };
    set_mode: { mode: Mode, reqid: number};
    set_color: { color: EPDColor, reqid: number};
    set_image: { id: string, reqid: number};
    delete_image: { id: string, reqid: number};
};

export type Message = {
    [K in keyof MessageMap]: { type: K } & MessageMap[K]
}[keyof MessageMap];