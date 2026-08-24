import './style.css';
import { isEPDColor, isMode, type EPDColor, type Item, type Mode, type State } from "../../src/types/state.ts";
import { type Message } from "../../src/types/websocket.ts";
import type { DeviceStatus, Img } from '../../src/types/misc.ts';

let state: State;
let draftState: State;
let savedImages: Img[];

const SERVER_URL = import.meta.env.VITE_SERVER_URL;

// initialize the websocket first thing
const socket = new WebSocket(SERVER_URL);
socket.addEventListener("message", e => {
    const m = JSON.parse(e.data) as Message;
    switch (m.type) {
        case "init":
            state = m.state;
            draftState = m.draft;
            updateDraftState();
            savedImages = m.images;
            updateImageList();
            statuses = m.statuses;
            updateStatuses();
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
        case "response":
            reqidFinished(m.reqid);
            if (m.status === "error") {
                showError(m.message);
            } else {
                clearError();
            }
            break;
        case "device_statuses":
            statuses = m.statuses;
            updateStatuses();
            break;
        case "device_status":
            updateDeviceStatus(m.device, m.status);
            break;
    }
});

const loadingBars = document.querySelectorAll<HTMLElement>(".loading-bar");
let openRequests = new Set<number>();
let reqidCounter = 1;
let loadDisplayTimeout: number;
function makeReqid() {
    // start loading
    if (openRequests.size === 0) {
        loadDisplayTimeout = setTimeout(() => {
            for (const bar of loadingBars) bar.style.display = "";
            document.body.style.cursor = "wait";
        }, 200);
    }

    const reqid = reqidCounter++;
    openRequests.add(reqid);
    return reqid;
}
function reqidFinished(reqid: number) {
    openRequests.delete(reqid);

    // stop loading
    if (openRequests.size === 0) {
        clearTimeout(loadDisplayTimeout);
        for (const bar of loadingBars) bar.style.display = "none";
        document.body.style.cursor = "";
    }
}

const errors = document.querySelectorAll<HTMLElement>(".error");
const errorMsgs = document.querySelectorAll<HTMLElement>(".error-message");
function showError(msg: string) {
    for (const el of errors) el.style.display = "";
    for (const el of errorMsgs) el.innerHTML = msg;
}
function clearError() {
    for (const el of errors) el.style.display = "none";
}

// send a message to the server (to perform some action)
function sendMessage(m: Message) {
    socket.send(JSON.stringify(m));
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
        const reqid = makeReqid();
        sendMessage({ type: "commit", reqid });
    });
}
const resetButtons = document.querySelectorAll<HTMLButtonElement>(".reset-button");
for (const btn of resetButtons) {
    btn.addEventListener("click", () => {
        const reqid = makeReqid();
        sendMessage({ type: "reset_draft", reqid });
    });
}

// update display previews
let statuses: Record<string, DeviceStatus> = {};
const displayContainers = document.querySelectorAll<HTMLElement>(".displays-container");
function updateStatuses() {
    for (const displayContainer of displayContainers) {
        displayContainer.innerHTML = "";
        for (const [d, s] of Object.entries(statuses)) {
            const display = document.createElement("div");
            display.className = "display";
            displayContainer.appendChild(display);

            const pvImg = document.createElement("img");
            pvImg.className = "display-image";
            display.appendChild(pvImg);

            updateDisplay(display, pvImg, d, s);
        }
    }
}

let flashIntervals: Record<string, number> = {};
function updateDisplay(display: HTMLElement, img: HTMLImageElement, d: string, s: DeviceStatus) {
    display.dataset.device = d;
    display.dataset.status = s;
    
    if (s == "idle" && state.mode == "static" && state.item?.type == "image") {
        img.src = SERVER_URL + "/preview/" + state.item.id + ".png";
    } else if (s == "fetching") {
        img.src = "loading.gif";
    } else if (s == "error") {
        img.src = "error.png";
    } else if (s == "offline") {
        img.src = "offline.png";
    } else {
        img.src = "";
    }

    if (s == "idle" && state.mode == "blank") {
        display.style.backgroundColor = state.color;
    } else {
        display.style.backgroundColor = "white";
    }

    clearInterval(flashIntervals[d]);
    if (s == "updating") {
        const int = setInterval(() => {
            display.style.backgroundColor = display.style.backgroundColor == "white" ? "#333": "white";
        }, 250);
        flashIntervals[d] = int;
    }

    if (s == "error") {
        display.title = "An error occured with this display. Check display for more details.";
    }
}
function updateDeviceStatus(d: string, s: DeviceStatus) {
    const displays = document.querySelectorAll<HTMLElement>(".display[data-device=\"" + d + "\"]");
    for (const display of displays) {
        const img = display.querySelectorAll<HTMLImageElement>(".display-image")[0];
        updateDisplay(display, img, d, s);
    }
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
    const reqid = makeReqid();
    sendMessage({ "type": "set_mode", mode, reqid });
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
var currentlyAddingImage: Blob; // holds the image currently being added (between the user selecting it and it being uploaded)

const addItemButton = document.querySelector<HTMLButtonElement>("#add-item-button");
if (addItemButton) {
    addItemButton.addEventListener("click", () => {
        openAddDialog();
    });
}
const addDialog = document.querySelector<HTMLDialogElement>("#add-dialog");
const linkInput = document.querySelector<HTMLInputElement>("#image-link-input");
function openAddDialog() {
    if (linkInput) linkInput.value = "";
    addDialog?.showModal();
}
function closeAddDialog() {
    addDialog?.close();
}
const addCancelButtons = document.querySelectorAll<HTMLButtonElement>(".add-cancel-button");
for (const btn of addCancelButtons) {
    btn.addEventListener("click", () => {
        closeAddDialog();
    });
}
const fileInput = document.querySelector<HTMLInputElement>("#file-input");
fileInput?.addEventListener("change", () => {
    previewImageFromUpload();
});

// previews an image based on the file in the file upload dialog
function previewImageFromUpload() {
    // get the file
    const file = fileInput?.files?.[0];
    if (!file) return;

    // preview the file
    previewImage(file);
}

const fitInput = document.querySelector<HTMLSelectElement>("#fit-input");
const colorInput = document.querySelector<HTMLSelectElement>("#color-input");
const backgroundInput = document.querySelector<HTMLSelectElement>("#background-input");
fitInput?.addEventListener("change", updateImagePreview);
colorInput?.addEventListener("change", updateImagePreview);
backgroundInput?.addEventListener("change", updateImagePreview);

// uploads the currently previewed file to the server
function uploadImage() {
    // make a file out of the saved blob
    const file = new File([currentlyAddingImage], "img");

    // gather all parameters
    const formData = new FormData();
    formData.set("photo", file);
    if (fitInput) formData.set("fit", fitInput.value);
    if (colorInput) formData.set("color", colorInput.value);
    if (backgroundInput) formData.set("background", backgroundInput.value);

    const reqid = makeReqid();

    // send the request
    fetch(SERVER_URL + "/upload", {
        method: "POST",
        body: formData
    }).finally(() => reqidFinished(reqid));

    // close the dialog
    closePreviewDialog();
}

// preview the image from link when pressing enter or pasting
linkInput?.addEventListener("keyup", e => {
    if (e.key == "Enter") {
        previewImageFromLink();
    }
});
linkInput?.addEventListener("input", e => {
    if (e.inputType === "insertFromPaste") {
        previewImageFromLink();
    }
});

// previews an image based on the link in the linkInput
async function previewImageFromLink(link = linkInput?.value) {
    if (!link) return;

    // request the preview from the server
    const reqid = makeReqid();
    try {
        const formData = new FormData();
        formData.set("link", link);
        const res = await fetch(SERVER_URL + "/preview", {
            method: "POST",
            body: formData
        });
        if (!res.ok) return showError("Invalid Image URL");

        const blob = await res.blob();
        previewImage(blob);
    } catch {
        showError("Error Fetching Image Preview");
    } finally {
        reqidFinished(reqid);
    }
}

const previewDialog = document.querySelector<HTMLDialogElement>("#confirm-upload-dialog");
function openPreviewDialog() {
    previewDialog?.showModal();
}
function closePreviewDialog() {
    previewDialog?.close();
}
const previewCancelButtons = document.querySelectorAll<HTMLButtonElement>(".file-upload-cancel-button");
for (const btn of previewCancelButtons) {
    btn.addEventListener("click", () => {
        closePreviewDialog();
    });
}
const previewSubmitButtons = document.querySelectorAll<HTMLButtonElement>(".file-upload-submit-button");
for (const btn of previewSubmitButtons) {
    btn.addEventListener("click", () => {
        uploadImage();
    });
}

const imagePreviewEl = document.querySelector<HTMLImageElement>("#image-upload-preview");
// open the image preview with a given blob
async function previewImage(blob: Blob) {
    if (!imagePreviewEl) return;

    const url : string | ArrayBuffer | null = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
    if (typeof url !== "string") return;

    imagePreviewEl.src = url;
    updateImagePreview();
    currentlyAddingImage = blob;
    openPreviewDialog();
    closeAddDialog();
}

// updates the display of the image preview (when the inputs are changed)
function updateImagePreview() {
    if (!imagePreviewEl) return;
    imagePreviewEl.style.filter = colorInput?.value == "bw" ? "grayscale(100%)" : "none";
    imagePreviewEl.style.objectFit = fitInput?.value == "cover" ? "cover" : "contain";
    imagePreviewEl.style.backgroundColor = backgroundInput?.value || "white";
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
    deleteBtn.addEventListener("click", () => sendMessage({ type: "delete_image", id: i.id, reqid: makeReqid() }));
    deleteBtn.innerHTML = "Delete";
    previewBtnContainer.appendChild(deleteBtn);

    const selectBtn = document.createElement("button");
    selectBtn.className = "select-button";
    selectBtn.addEventListener("click", () => sendMessage({ type: "set_image", id: i.id, reqid: makeReqid() }));
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
    const reqid = makeReqid();
    sendMessage({ type: "set_color", color, reqid });
}

function updateBlankColor(color: EPDColor) {
    const capColor = color[0].toUpperCase() + color.slice(1);
    for (const el of colorNames) el.innerHTML = capColor;
    for (const el of colorDisplays) el.style.backgroundColor = color;
    for (const el of blankColorDropdowns) el.value = color;
}