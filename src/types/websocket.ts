import type { Img } from "./misc.js";
import type { EPDColor, Mode, State } from "./state.js";

type MessageMap = {
    // server -> client
    init: { state: State, draft: State, images: Img[] };
    state: { state: State };
    draft_state: { state: State };
    saved_images: { images: Img[] };

    // client -> server
    commit: {};
    reset_draft: {};
    update_begin: {};
    update_complete: {};
    set_mode: { mode: Mode };
    set_color: { color: EPDColor };
    set_image: { id: string };
    delete_image: { id: string };
};

export type Message = {
    [K in keyof MessageMap]: { type: K } & MessageMap[K]
}[keyof MessageMap];