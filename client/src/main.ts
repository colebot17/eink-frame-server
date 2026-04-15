import './style.css';
import { isEPDColor, isMode, type EPDColor, type Item, type Mode, type State } from "../../src/types/state.ts";
import { type Message } from "../../src/types/websocket.ts";
import type { Img } from '../../src/types/misc.ts';

let state: State;
let draftState: State;
let savedImages: Img[];

const SERVER_URL = import.meta.env.VITE_SERVER_URL;

// initialize the websocket first thing
const socket = new WebSocket(SERVER_URL);
socket.addEventListener("message", e => {
    const m = JSON.parse(e.data);
    switch (m.type) {
        case "init":
            state = m.state;
            draftState = m.draft;
            updateDraftState();
            savedImages = m.images;
            updateImageList();
            break;
        case "state":
            state = m.state;
            draftState = m.state;
            updateDraftState();
            break;
        case "draft_state":
            draftState = m.state;
            updateDraftState();
            break; 
        case "saved_images":
            savedImages = m.images;
            updateImageList();
            break;
    }
});

// send a message to the server (to perform some action)
function sendMessage(m: Message) {
    socket.send(JSON.stringify(m));
    document.body.style.cursor = "wait";
}


// update the ui based on the state
const commitContainers = document.querySelectorAll<HTMLElement>(".commit-container");
function updateDraftState() {
    updateMode(draftState.mode);
    switch (draftState.mode) {
        case "static":
            updateStaticItem(draftState.item);
            break;
        case "blank":
            updateBlankColor(draftState.color);
            break;
        default:

    }
    document.body.style.cursor = "";

    if (hasChanges()) {
        // show the commit containers
        for (const cont of commitContainers) cont.style.display = "";
    } else {
        // hide the commit containers
        for (const cont of commitContainers) cont.style.display = "none";
    }
}

function hasChanges() {
    return JSON.stringify(state) !== JSON.stringify(draftState);
}

// handle commit and reset buttons
const commitButtons = document.querySelectorAll<HTMLButtonElement>(".commit-button");
for (const btn of commitButtons) {
    btn.addEventListener("click", () => {
        sendMessage({ "type": "commit" });
    });
}
const resetButtons = document.querySelectorAll<HTMLButtonElement>(".reset-button");
for (const btn of resetButtons) {
    btn.addEventListener("click", () => {
        sendMessage({ "type": "reset_draft" });
    });
}


// handle mode buttons
const modeButtons = document.querySelectorAll<HTMLButtonElement>(".mode-button");
for (const el of modeButtons) {
    el.addEventListener("click", () => {
        const m = el.dataset.mode;
        if (!m || !isMode(m)) return;
        changeMode(m);
    });
}

const modePages = document.querySelectorAll<HTMLElement>(".mode-page");

function changeMode(mode: Mode) {
    sendMessage({ "type": "set_mode", mode });
}

function updateMode(mode: Mode) {
    // highlight the correct button
    for (const el of modeButtons) {
        if (el.dataset.mode === mode) {
            el.classList.add("set");
        } else {
            el.classList.remove("set");
        }
    }

    // display the correct page
    for (const el of modePages) {
        if (el.dataset.mode === mode) {
            el.style.display = "";
        } else {
            el.style.display = "none";
        }
    }
}

// static mode
const fileInput = document.querySelector<HTMLInputElement>("#file-input");
if (fileInput) {
    fileInput.addEventListener("change", () => {
        openFileUploadDialog();
    });
}
const fileUploadDialog = document.querySelector<HTMLDialogElement>("#confirm-upload-dialog");
function openFileUploadDialog() {
    fileUploadDialog?.showModal();
}
function closeFileUploadDialog() {
    fileUploadDialog?.close();
}
const fileUploadCancelButtons = document.querySelectorAll<HTMLButtonElement>(".file-upload-cancel-button");
for (const btn of fileUploadCancelButtons) {
    btn.addEventListener("click", () => {
        closeFileUploadDialog();
    });
}
const fileUploadSubmitButtons = document.querySelectorAll<HTMLButtonElement>(".file-upload-submit-button");
for (const btn of fileUploadSubmitButtons) {
    btn.addEventListener("click", () => {
        submitFile();
    });
}
const fitInput = document.querySelector<HTMLSelectElement>("#fit-input");
const colorInput = document.querySelector<HTMLSelectElement>("#color-input");
const backgroundInput = document.querySelector<HTMLSelectElement>("#background-input");
function submitFile() {
    // get the file
    const file = fileInput?.files?.[0];
    if (!file) return;

    // gather all parameters
    const formData = new FormData();
    formData.set("photo", file);
    if (fitInput) formData.set("fit", fitInput.value);
    if (colorInput) formData.set("color", colorInput.value);
    if (backgroundInput) formData.set("background", backgroundInput.value);

    document.body.style.cursor = "wait";

    // send the request
    fetch(SERVER_URL + "/upload", {
        method: "POST",
        body: formData
    });

    // close the dialog
    closeFileUploadDialog();
}

const previewEls = document.querySelectorAll<HTMLImageElement>(".preview");
function updateStaticItem(item: Item | null) {
    if (item === null) {
        // clear the currently displayed preview
        for (const el of previewEls) el.src = "";
        return;
    }

    // display a preview of the item
    switch (item.type) {
        case "image":
            for (const el of previewEls) el.src = SERVER_URL + "/preview/" + item.id + ".png";
            break;
        default:
            for (const el of previewEls) el.src = "";
    }
}

const imageLists = document.querySelectorAll<HTMLElement>(".image-list");
function updateImageList() {
    document.body.style.cursor = "";
    for (const list of imageLists) {
        list.innerHTML = "";
        for (const img of savedImages) {
            addImageToList(list, img);
        }
    }
}
function addImageToList(container: HTMLElement, i: Img) {
    const path = SERVER_URL + "/preview/" + i.id + ".png";

    const div = document.createElement("div");
    div.className = "preview-image";
    container.appendChild(div);

    const img = document.createElement("img");
    img.src = path;
    img.width = 400;
    div.appendChild(img);

    const previewBtnContainer = document.createElement("div");
    previewBtnContainer.className = "preview-button-container";
    div.appendChild(previewBtnContainer);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-button";
    deleteBtn.addEventListener("click", () => sendMessage({ type: "delete_image", id: i.id }));
    deleteBtn.innerHTML = "Delete";
    previewBtnContainer.appendChild(deleteBtn);

    const selectBtn = document.createElement("button");
    selectBtn.className = "select-button";
    selectBtn.addEventListener("click", () => sendMessage({ type: "set_image", id: i.id }));
    selectBtn.innerHTML = "Select";
    previewBtnContainer.appendChild(selectBtn);
}

// blank mode
const blankColorDropdowns = document.querySelectorAll<HTMLSelectElement>(".blank-color-dropdown");
for (const el of blankColorDropdowns) {
    el.addEventListener("change", () => {
        const c = el.value;
        if (!isEPDColor(c)) return;
        changeBlankColor(c);
    });
}

const colorNames = document.querySelectorAll<HTMLElement>(".color-name");
const colorDisplays = document.querySelectorAll<HTMLElement>(".color-display");

function changeBlankColor(color: EPDColor) {
    sendMessage({ type: "set_color", color });
}

function updateBlankColor(color: EPDColor) {
    const capColor = color[0].toUpperCase() + color.slice(1);
    for (const el of colorNames) el.innerHTML = capColor;
    for (const el of colorDisplays) el.style.backgroundColor = color;
    for (const el of blankColorDropdowns) el.value = color;
}