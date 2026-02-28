// handle form submission
const form = document.getElementById("upload-form");
form.addEventListener("submit", async e => {
    e.preventDefault();
});

const fileInput = document.getElementById("file-input");
fileInput.addEventListener("change", () => submitFile());

const clearDisplayButton = document.getElementById("clear-display-button");
clearDisplayButton.addEventListener("click", () => clearDisplay());

async function submitFile() {
    document.getElementById("preview").src = "";

    const file = fileInput.files[0];

    if (!file) return;

    const formData = new FormData();
    formData.append("photo", file);
    formData.append("fit", document.getElementById("fit-input").value);

    const processingLabel = document.getElementById("processing-label");
    const fileInputForm = document.getElementById("upload-form");
    processingLabel.style.display = "";
    fileInputForm.style.display = "none";

    try {
        const res = await fetch("/upload", {
            method: "POST",
            body: formData
        });
        const { filename } = await res.json();
        processingLabel.style.display = "none";
        fileInputForm.style.display = "";
        setPreview(filename);
        addPreview(document.getElementById("preview-container"), filename);
    } catch (err) {
        processingLabel.style.display = "none";
        const errorEl = document.getElementById("error");
        errorEl.style.display = "";
        errorEl.innerHTML = "An error occurred:<br>" + err;
    }
}

async function clearDisplay() {
    const res = await fetch("/clear", { method: "GET" });
    const { filename } = await res.json();
    setPreview(filename);
}

// load initial image preview
async function loadPreview() {
    const res = await fetch("/current");
    const { filename } = await res.json();
    setPreview(filename);
}
loadPreview();

async function loadPreviews() {
    const res = await fetch("/all");
    const { files } = await res.json();
    const container = document.getElementById("preview-container");
    container.innerHTML = "";
    for (let i = 0; i < files.length; i++) {
        addPreview(container, files[i]);
    }

    if (files.length === 0) {
        container.innerHTML = "<i>No images yet</i>";
    }
}
loadPreviews();

function addPreview(container, filename) {
    const div = document.createElement("div");
    div.className = "preview-image";
    container.appendChild(div);

    const img = document.createElement("img");
    img.src = "/image/" + filename;
    img.width = 400;
    div.appendChild(img);

    const previewBtnContainer = document.createElement("div");
    previewBtnContainer.className = "preview-button-container";
    div.appendChild(previewBtnContainer);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-button";
    deleteBtn.addEventListener("click", async () => {
        if (!confirm("Are you sure you want to delete this image?")) return;
        const res = await fetch("/delete", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                filename
            })
        });
        const { filename: fn } = await res.json();
        div.remove();
        setPreview(fn);
    });
    deleteBtn.innerHTML = "Delete";
    previewBtnContainer.appendChild(deleteBtn);

    const selectBtn = document.createElement("button");
    selectBtn.className = "select-button";
    selectBtn.addEventListener("click", async () => {
        const res = await fetch("/select", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ filename })
        });
        const { filename: fn } = await res.json();
        setPreview(fn);
    });
    selectBtn.innerHTML = "Select";
    previewBtnContainer.appendChild(selectBtn);
}

function setPreview(filename) {
    if (filename) {
        document.getElementById("preview").src = "/image/" + filename;
    } else {
        document.getElementById("preview").src = "";
    }
}

document.getElementById("wifi-config-button").addEventListener("click", () => wifiConfig());

async function wifiConfig() {
    const networks = [];
    do {
        const ssid = prompt("Enter the wifi SSID:");
        if (!ssid) break;
        const password = prompt("Enter the wifi password:");
        if (password === undefined) break;
        networks.push({ ssid, password });
    } while (confirm("Would you like to add another network?"));

    if (networks.length > 0 || confirm("No networks were added. Really remove all networks?")) {
        const res = await fetch("/setWifi", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(networks)
        });

        if (res.ok) {
            alert("Wi-Fi set");
        } else {
            alert("Error setting Wi-Fi");
        }
    }
}

document.getElementById("ota-button").addEventListener("click", () => otaUpdate());

async function otaUpdate() {
    const res = await fetch("/ota", { method: "GET" });
    if (res.ok) {
        alert("OTA sent");
    } else {
        alert("Error sending OTA");
    }
}