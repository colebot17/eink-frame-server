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
    formData.set("photo", file);
    formData.set("fit", document.getElementById("fit-input").value);
    formData.set("color", document.getElementById("color-input").value);

    const processingLabel = document.getElementById("processing-label");
    const fileInputForm = document.getElementById("upload-form");
    processingLabel.style.display = "";
    fileInputForm.style.display = "none";

    try {
        const res = await fetch("/upload", {
            method: "POST",
            body: formData
        });
        const { id, preview } = await res.json();
        processingLabel.style.display = "none";
        fileInputForm.style.display = "";
        setPreview(preview);
        addPreview(document.getElementById("preview-container"), id, preview);
    } catch (err) {
        processingLabel.style.display = "none";
        const errorEl = document.getElementById("error");
        errorEl.style.display = "";
        errorEl.innerHTML = "An error occurred:<br>" + err;
    }
}

async function clearDisplay() {
    const res = await fetch("/clear", { method: "GET" });
    const { preview } = await res.json();
    setPreview(preview);
}

// load initial image preview
async function loadPreview() {
    const res = await fetch("/current");
    const { id, preview } = await res.json();
    setPreview(preview);
}
loadPreview();

async function loadPreviews() {
    const res = await fetch("/all");
    const images = await res.json();
    const container = document.getElementById("preview-container");
    container.innerHTML = "";
    for (let i = 0; i < images.length; i++) {
        addPreview(container, images[i].id, images[i].preview);
    }

    if (images.length === 0) {
        container.innerHTML = "<i>No images yet</i>";
    }
}
loadPreviews();

function addPreview(container, id, path) {
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
    deleteBtn.addEventListener("click", async () => {
        if (!confirm("Are you sure you want to delete this image?")) return;
        const res = await fetch("/delete", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ id })
        });
        const { preview: pv } = await res.json();
        div.remove();
        setPreview(pv);
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
            body: JSON.stringify({ id })
        });
        const { preview: pv } = await res.json();
        setPreview(pv);
    });
    selectBtn.innerHTML = "Select";
    previewBtnContainer.appendChild(selectBtn);
}

function setPreview(path) {
    if (path) {
        document.getElementById("preview").src = path;
    } else {
        document.getElementById("preview").src = "";
    }
}