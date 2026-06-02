const STORAGE_KEY = "asignador-comercial-v1";
const USER_KEY = "asignador-usuario-activo";
const AUDIT_KEY = "asignador-auditoria-v1";
const PASSWORD_KEY = "asignador-passwords-v1";
const DEFAULT_PASSWORD = "Altron2026..";

// URL del Web App de Apps Script.
// Esta URL conecta la aplicación web con la base central en Google Sheets.
const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/a/macros/altroningenieria.com/s/AKfycby5RyzWJR0ejUhE9nZZN3e8-OYT-fLMHT5qkw7WFvAuGfjsDR8PaV75hqqtR10PD-nl/exec";
const APP_TOKEN = "ALTRON-ASIGNADOR-2026";
// Activa la nube tanto para URLs normales como para URLs corporativas de Google Workspace.
const CLOUD_ENABLED = GOOGLE_APPS_SCRIPT_URL.includes("script.google.com") && GOOGLE_APPS_SCRIPT_URL.includes("/exec");


const typeLabels = {
    visita: "Visita comercial",
    departamento: "Tarea por departamento",
    oferta: "Oferta comercial",
    viaje: "Viaje",
    pendiente: "Pendiente general"
};

const form = document.querySelector("#assignmentForm");
const cards = document.querySelector("#cards");
const metrics = document.querySelector("#metrics");
const template = document.querySelector("#cardTemplate");
const sessionTitle = document.querySelector("#sessionTitle");
const sessionDescription = document.querySelector("#sessionDescription");
const sessionPill = document.querySelector("#sessionPill");
const departmentSelect = document.querySelector("#department");
const ownerSelect = document.querySelector("#ownerSelect");
const externalDepartment = document.querySelector("#externalDepartment");
const externalPerson = document.querySelector("#externalPerson");
const loginForm = document.querySelector("#loginForm");
const changePasswordForm = document.querySelector("#changePasswordForm");
const loginEmail = document.querySelector("#loginEmail");
const loginPassword = document.querySelector("#loginPassword");
const newPassword = document.querySelector("#newPassword");
const authMessage = document.querySelector("#authMessage");
const forgotButton = document.querySelector("#forgotButton");
const logoutButton = document.querySelector("#logoutButton");
const searchInput = document.querySelector("#searchInput");
const typeFilter = document.querySelector("#typeFilter");
const taskViewButtons = document.querySelectorAll("[data-task-view]");
let taskViewMode = "assigned";
const seedButton = document.querySelector("#seedButton");
const exportCsvButton = document.querySelector("#exportCsvButton");
const reportButton = document.querySelector("#reportButton");
const notifyButton = document.querySelector("#notifyButton");
const docxInput = document.querySelector("#docxInput");
const importResults = document.querySelector("#importResults");
const adminPanel = document.querySelector("#adminPanel");
const adminToggle = document.querySelector("#adminToggle");
const auditList = document.querySelector("#auditList");

let users = [];
let assignments = readAssignments();
let auditLog = readAuditLog();
let passwordStore = readPasswordStore();
let pendingPasswordUser = null;
let currentUser = null;
let metricFilter = "todos";
let auditExpanded = false;
let selectedAssignmentId = null;

initializeAuth();

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = getFormData();
    if (new Date(data.end) <= new Date(data.start)) {
        alert("La fecha de fin debe ser posterior a la fecha de inicio.");
        return;
    }
    assignments = [data, ...assignments];
    addAudit("creo", data, `Creo tarea para ${data.department}`);

    await saveAssignment(data);
    await sendAssignmentEmail(data);

    console.log("Asignación enviada a Google Sheets.");

    form.reset();
    setDefaultDates();
    render();
});

searchInput.addEventListener("input", render);
typeFilter.addEventListener("change", render);
taskViewButtons.forEach((button) => {
    button.addEventListener("click", () => {
        const nextView = button.dataset.taskView;

        if (nextView === "all" && !isSystemsAdmin()) {
            alert("Solo Sistemas puede ver todas las tareas.");
            return;
        }

        taskViewMode = nextView;
        selectedAssignmentId = null;

        taskViewButtons.forEach((item) => item.classList.remove("active"));
        button.classList.add("active");

        render();
    });
});
seedButton.addEventListener("click", loadExampleData);
exportCsvButton.addEventListener("click", exportCsv);
reportButton.addEventListener("click", downloadTrackingReport);
notifyButton.addEventListener("click", enableNotifications);
docxInput.addEventListener("change", importDocxNotes);
metrics.addEventListener("click", (event) => {
    const metricCard = event.target.closest(".metric");
    if (!metricCard) {
        return;
    }
    selectedAssignmentId = null;
    metricFilter = metricCard.dataset.filter;
    render();
});
departmentSelect.addEventListener("change", () => {
    populateResponsibleOptions();
    populateExternalDepartments();
});
ownerSelect.addEventListener("change", () => {
    applyResponsibleSelection();
});
externalDepartment.addEventListener("change", () => {
    populateExternalPeople();
});
externalPerson.addEventListener("change", () => {
    applyExternalShareSelection();
});
loginForm.addEventListener("submit", handleLogin);
changePasswordForm.addEventListener("submit", handlePasswordChange);
forgotButton.addEventListener("click", handleForgotPassword);
logoutButton.addEventListener("click", logout);
adminToggle.addEventListener("click", () => {
    auditExpanded = !auditExpanded;
    renderAudit();
});

registerAppShell();
scheduleReminderChecks();


async function readPasswordRecord(email) {
    if (!CLOUD_ENABLED) {
        return passwordStore[email] || { password: DEFAULT_PASSWORD, mustChange: true };
    }
    try {
        const response = await cloudGet("password", { email });
        const record = response?.record || { password: DEFAULT_PASSWORD, mustChange: true };
        passwordStore[email] = record;
        savePasswordStore();
        return record;
    } catch (error) {
        console.warn("No se pudo validar contra Google. Se usa copia local.", error);
        authMessage.textContent = "No se pudo conectar con Google. Validando con copia local.";
        return passwordStore[email] || { password: DEFAULT_PASSWORD, mustChange: true };
    }
}

async function syncFromCloud() {
    if (!CLOUD_ENABLED || !currentUser) {
        return;
    }

    try {
        sessionPill.textContent = isSystemsAdmin() ? "Administrador Sistemas - sincronizando" : "Usuario departamento - sincronizando";

        const response = await cloudGet("snapshot", { email: currentUser.email });

        if (Array.isArray(response.users)) {
            users = response.users
                .filter((user) => user.email)
                .map((user) => ({
                    ...user,
                    email: String(user.email || "").trim().toLowerCase(),
                    admin: Boolean(user.admin),
                    active: user.active !== false
                }))
                .filter((user) => user.active !== false);

            const refreshedUser = users.find((user) => user.email === currentUser.email);
            if (refreshedUser) {
                currentUser = refreshedUser;
            }
        }

        if (Array.isArray(response.assignments)) {
            assignments = response.assignments;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(assignments));
        }

        if (Array.isArray(response.auditLog)) {
            auditLog = response.auditLog;
            localStorage.setItem(AUDIT_KEY, JSON.stringify(auditLog));
        }

        sessionPill.textContent = isSystemsAdmin() ? "Administrador Sistemas - Google activo" : "Usuario departamento - Google activo";
        render();
    } catch (error) {
        console.warn("No se pudo sincronizar con Google.", error);
        sessionPill.textContent = isSystemsAdmin() ? "Administrador Sistemas - error de sincronización" : "Usuario departamento - error de sincronización";
    }
}

function cloudGet(action, params = {}) {
    return new Promise((resolve, reject) => {
        if (!CLOUD_ENABLED) {
            resolve({ ok: false, local: true });
            return;
        }
        const callbackName = `asignadorCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const script = document.createElement("script");
        const url = new URL(GOOGLE_APPS_SCRIPT_URL);
        url.searchParams.set("action", action);
        url.searchParams.set("callback", callbackName);
        url.searchParams.set("token", APP_TOKEN);
        Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

        const timeout = setTimeout(() => {
            cleanup();
            reject(new Error("Tiempo agotado consultando Apps Script."));
        }, 15000);

        function cleanup() {
            clearTimeout(timeout);
            delete window[callbackName];
            script.remove();
        }

        window[callbackName] = (payload) => {
            cleanup();
            if (payload?.ok === false) {
                reject(new Error(payload.error || "Error en Apps Script."));
                return;
            }
            resolve(payload || {});
        };

        script.onerror = () => {
            cleanup();
            reject(new Error("No se pudo cargar respuesta de Apps Script."));
        };
        script.src = url.toString();
        document.body.appendChild(script);
    });
}

async function cloudPost(action, payload = {}) {
    if (!CLOUD_ENABLED) {
        console.warn("Google Cloud no está activo.", { action, payload });
        return { ok: false, local: true };
    }

    try {
        console.log("Enviando a Google Sheets:", action, payload);

        cloudGet(action, {
            payload: JSON.stringify(payload)
        }).then((response) => {
            console.log("Guardado confirmado por Google Sheets:", action, response);
        }).catch((error) => {
            console.warn("No se pudo confirmar guardado en Google Sheets:", action, error);
        });

        return { ok: true, pending: true };
    } catch (error) {
        console.error("No se pudo iniciar guardado en Google Sheets:", action, error);
        return { ok: false, error: error.message || String(error) };
    }
}

function readAssignments() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? [];
    } catch {
        return [];
    }
}

async function saveAssignments() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(assignments));
    const response = await cloudPost("saveAssignments", { assignments });
    console.log("Resultado guardando tareas:", response);
    return response;
}
async function saveAssignment(assignment) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(assignments));

    const response = await cloudPost("saveAssignment", {
        assignment
    });

    console.log("Resultado guardando tarea individual:", response);
    return response;
}
async function sendAssignmentEmail(assignment) {
    const response = await cloudPost("sendAssignmentEmail", {
        assignment,
        appUrl: "https://sistemasaltron.github.io/asignador-altron/"
    });

    console.log("Resultado enviando correo de asignación:", response);
    return response;
}

async function deleteAssignmentCloud(id) {
    const response = await cloudPost("deleteAssignment", {
        id
    });

    console.log("Resultado eliminando tarea individual:", response);
    return response;
}
function readAuditLog() {
    try {
        return JSON.parse(localStorage.getItem(AUDIT_KEY)) ?? [];
    } catch {
        return [];
    }
}

async function saveAuditLog() {
    localStorage.setItem(AUDIT_KEY, JSON.stringify(auditLog));
    const response = await cloudPost("saveAuditLog", { auditLog });
    console.log("Resultado guardando auditoría:", response);
    return response;
}
async function saveAuditEntry(auditEntry) {
    localStorage.setItem(AUDIT_KEY, JSON.stringify(auditLog));

    const response = await cloudPost("saveAuditEntry", {
        auditEntry
    });

    console.log("Resultado guardando auditoría individual:", response);
    return response;
}

function readCurrentUser() {
    const storedEmail = String(localStorage.getItem(USER_KEY) || "").trim().toLowerCase();
    return users.find((user) => String(user.email || "").trim().toLowerCase() === storedEmail && user.active !== false) || null;
}

function readPasswordStore() {
    try {
        return JSON.parse(localStorage.getItem(PASSWORD_KEY)) ?? {};
    } catch {
        return {};
    }
}

function savePasswordStore() {
    localStorage.setItem(PASSWORD_KEY, JSON.stringify(passwordStore));
}

async function initializeAuth() {
    authMessage.textContent = CLOUD_ENABLED ? "Cargando usuarios desde Google..." : "Modo local sin Google.";

    await loadUsersFromCloud();

    currentUser = readCurrentUser();

    if (currentUser) {
        openApp();
        return;
    }

    document.body.classList.remove("authenticated");
    loginForm.classList.remove("is-hidden");
    changePasswordForm.classList.add("is-hidden");

    authMessage.textContent = CLOUD_ENABLED ? "" : "Google no está activo. Revisa la URL de Apps Script.";
}

async function loadUsersFromCloud() {
    if (!CLOUD_ENABLED) {
        users = [];
        return;
    }

    try {
        const response = await cloudGet("users");

        if (Array.isArray(response.users)) {
            users = response.users
                .filter((user) => user.email)
                .map((user) => ({
                    ...user,
                    email: String(user.email || "").trim().toLowerCase(),
                    admin: Boolean(user.admin),
                    active: user.active !== false
                }))
                .filter((user) => user.active !== false);
        }

        if (!users.length) {
            authMessage.textContent = "No hay usuarios activos en Google Sheets.";
        }
    } catch (error) {
        console.warn("No se pudieron cargar usuarios desde Google.", error);
        authMessage.textContent = "No se pudieron cargar usuarios desde Google. Revisa Apps Script.";
        users = [];
    }
}

function applyCurrentUserToUi() {
    if (!currentUser) {
        return;
    }
    document.body.classList.toggle("systems-admin", isSystemsAdmin());
    sessionTitle.textContent = currentUser.name;
    sessionDescription.textContent = `${currentUser.role} - ${currentUser.department}`;
    sessionPill.textContent = isSystemsAdmin() ? "Administrador Sistemas" : "Usuario departamento";
    departmentSelect.value = currentUser.department;
    populateResponsibleOptions();
    populateExternalDepartments();
}

function populateResponsibleOptions(preferredEmail = "") {
    const department = departmentSelect.value;
    const departmentUsers = users.filter((user) => user.department === department && user.email);
    ownerSelect.innerHTML = "";

    const allOption = document.createElement("option");
    allOption.value = "__all__";
    allOption.textContent = `Todos - ${department}`;
    ownerSelect.appendChild(allOption);

    departmentUsers.forEach((user) => {
        const option = document.createElement("option");
        option.value = user.email;
        option.textContent = `${user.name} - ${user.role}`;
        ownerSelect.appendChild(option);
    });

    if (preferredEmail && departmentUsers.some((user) => user.email.toLowerCase() === preferredEmail.toLowerCase())) {
        ownerSelect.value = preferredEmail;
    } else if (departmentUsers.some((user) => user.email === currentUser?.email)) {
        ownerSelect.value = currentUser.email;
    } else {
        ownerSelect.value = "__all__";
    }
    applyResponsibleSelection();
}

function applyResponsibleSelection() {
    const department = departmentSelect.value;
    const departmentUsers = users.filter((user) => user.department === department && user.email);

    if (ownerSelect.value === "__all__") {
        document.querySelector("#email").value = departmentUsers.map((user) => user.email).join(", ");
        document.querySelector("#phone").value = departmentUsers.map((user) => user.phone).filter(Boolean).join(", ");
        return;
    }

    const selectedUser = users.find((user) => user.email === ownerSelect.value);
    document.querySelector("#email").value = selectedUser?.email || "";
    document.querySelector("#phone").value = selectedUser?.phone || "";
}

function populateExternalDepartments() {
    const departments = [...new Set(users.map((user) => user.department))]
        .filter((department) => department)
        .sort((a, b) => a.localeCompare(b));
    externalDepartment.innerHTML = '<option value="">Seleccionar departamento</option>';
    departments.forEach((department) => {
        const option = document.createElement("option");
        option.value = department;
        option.textContent = department;
        externalDepartment.appendChild(option);
    });
    populateExternalPeople();
}

function populateExternalPeople() {
    const department = externalDepartment.value;
    const departmentUsers = users.filter((user) => user.department === department && user.email);
    externalPerson.innerHTML = '<option value="">Seleccionar persona</option>';
    if (!department) {
        return;
    }
    const allOption = document.createElement("option");
    allOption.value = "__all__";
    allOption.textContent = `Todos - ${department}`;
    externalPerson.appendChild(allOption);
    departmentUsers.forEach((user) => {
        const option = document.createElement("option");
        option.value = user.email;
        option.textContent = `${user.name} - ${user.role}`;
        externalPerson.appendChild(option);
    });
}

function applyExternalShareSelection() {
    const department = externalDepartment.value;
    const selected = externalPerson.value;
    if (!department || !selected) {
        return;
    }
    const selectedEmails = selected === "__all__"
        ? users.filter((user) => user.department === department && user.email).map((user) => user.email)
        : [selected];
    const currentEmails = parseEmailList(document.querySelector("#sharedWith").value);
    const merged = [...new Set([...currentEmails, ...selectedEmails.map((email) => email.toLowerCase())])];
    document.querySelector("#sharedWith").value = merged.join(", ");
}

async function handleLogin(event) {
    event.preventDefault();

    if (!users.length) {
        await loadUsersFromCloud();
    }

    const email = loginEmail.value.trim().toLowerCase();
    const password = loginPassword.value;
    const user = users.find((entry) => String(entry.email || "").trim().toLowerCase() === email && entry.active !== false);

    if (!user) {
        authMessage.textContent = "Correo no registrado o usuario inactivo en Google Sheets.";
        return;
    }

    authMessage.textContent = CLOUD_ENABLED ? "Validando con Google..." : "";

    const record = await readPasswordRecord(email);

    if (password !== record.password) {
        authMessage.textContent = "Clave incorrecta.";
        return;
    }

    if (record.mustChange || password === DEFAULT_PASSWORD) {
        pendingPasswordUser = user;
        authMessage.textContent = "";
        loginForm.classList.add("is-hidden");
        changePasswordForm.classList.remove("is-hidden");
        newPassword.focus();
        return;
    }

    currentUser = user;
    localStorage.setItem(USER_KEY, currentUser.email);
    openApp();
}

async function handlePasswordChange(event) {
    event.preventDefault();
    const password = newPassword.value;
    if (!password) {
        return;
    }
    if (password === DEFAULT_PASSWORD) {
        newPassword.setCustomValidity("Debes cambiar la clave generica.");
        newPassword.reportValidity();
        newPassword.setCustomValidity("");
        return;
    }
    const email = pendingPasswordUser.email.toLowerCase();
    const record = { password, mustChange: false, changedAt: new Date().toISOString() };
    passwordStore[email] = record;
    savePasswordStore();
    await cloudPost("setPassword", { email, record });
    currentUser = pendingPasswordUser;
    pendingPasswordUser = null;
    localStorage.setItem(USER_KEY, currentUser.email);
    openApp();
}

async function handleForgotPassword() {
    const email = loginEmail.value.trim().toLowerCase();
    const user = users.find((entry) => String(entry.email || "").trim().toLowerCase() === email && entry.active !== false);
    if (!user) {
        authMessage.textContent = "Escribe primero un correo registrado.";
        return;
    }
    const record = { password: DEFAULT_PASSWORD, mustChange: true, resetAt: new Date().toISOString() };
    passwordStore[email] = record;
    savePasswordStore();
    await cloudPost("setPassword", { email, record });
    const subject = "Recuperacion clave Asignador Altron";
    const body = `Hola ${user.name},\n\nTu clave temporal es: ${DEFAULT_PASSWORD}\n\nAl ingresar, la aplicacion te pedira cambiarla obligatoriamente.`;
    window.location.href = `mailto:${email}?${new URLSearchParams({ subject, body }).toString()}`;
    authMessage.textContent = "Se preparo el correo de recuperacion con la clave temporal.";
}

function openApp() {
    document.body.classList.add("authenticated");
    loginForm.classList.add("is-hidden");
    changePasswordForm.classList.add("is-hidden");
    applyCurrentUserToUi();
    setDefaultDates();
    render();
    syncFromCloud();
}

function logout() {
    localStorage.removeItem(USER_KEY);
    currentUser = null;
    document.body.classList.remove("systems-admin");
    loginPassword.value = "";
    newPassword.value = "";
    document.body.classList.remove("authenticated");
    loginForm.classList.remove("is-hidden");
    changePasswordForm.classList.add("is-hidden");
}

function setDefaultDates() {
    const start = new Date();
    start.setMinutes(0, 0, 0);
    start.setHours(start.getHours() + 2);
    const end = new Date(start);
    end.setHours(end.getHours() + 1);
    document.querySelector("#start").value = toLocalInputValue(start);
    document.querySelector("#end").value = toLocalInputValue(end);
}

function getFormData() {
    return {
        id: createId(),
        type: valueOf("#type"),
        title: valueOf("#title"),
        owner: ownerNameFromSelection(),
        email: valueOf("#email"),
        phone: valueOf("#phone"),
        department: valueOf("#department"),
        recipient: valueOf("#recipient"),
        sharedWith: parseEmailList(valueOf("#sharedWith")),
        status: valueOf("#status"),
        start: valueOf("#start"),
        end: valueOf("#end"),
        place: valueOf("#place"),
        priority: valueOf("#priority"),
        progress: progressValue(),
        notes: valueOf("#notes"),
        createdBy: currentUser.email,
        createdByName: currentUser.name,
        createdByDepartment: currentUser.department,
        createdAt: new Date().toISOString(),
        followUps: []
    };
}

function ownerNameFromSelection() {
    if (ownerSelect.value === "__all__") {
        return `Todos - ${departmentSelect.value}`;
    }
    return users.find((user) => user.email === ownerSelect.value)?.name || "";
}

function valueOf(selector) {
    return document.querySelector(selector).value.trim();
}

function render() {
    renderMetrics();
    renderAudit();
    cards.innerHTML = "";
    const filtered = filteredAssignments();

    if (!filtered.length) {
        cards.innerHTML = '<div class="empty-state">No hay asignaciones con esos filtros.</div>';
        return;
    }

    filtered.forEach((assignment) => {
        const node = template.content.firstElementChild.cloneNode(true);
        node.querySelector(".pill").textContent = typeLabels[assignment.type];
        const priority = node.querySelector(".priority");
        priority.textContent = `Prioridad ${assignment.priority}`;
        priority.classList.add(assignment.priority);
        node.querySelector("h3").textContent = assignment.title;
        node.querySelector('[data-field="owner"]').textContent = emailLabel(assignment);
        node.querySelector('[data-field="createdBy"]').textContent = creatorLabel(assignment);
        node.querySelector('[data-field="recipient"]').textContent = assignment.recipient || "Por definir";
        node.querySelector('[data-field="sharedWith"]').textContent = (assignment.sharedWith || []).join(", ") || "Solo departamento";
        node.querySelector('[data-field="department"]').textContent = assignment.department;
        node.querySelector('[data-field="date"]').textContent = dateRange(assignment);
        node.querySelector('[data-field="overdue"]').textContent = overdueLabel(assignment);
        node.querySelector('[data-field="overdue"]').className = overdueDays(assignment) > 0 ? "overdue-text" : "ok-text";
        node.querySelector('[data-field="place"]').textContent = assignment.place || "Sin lugar definido";
        const progress = normalizedProgress(assignment);
        node.querySelector('[data-field="progressText"]').textContent = `${progress}%`;
        node.querySelector('[data-field="progressBar"]').style.width = `${progress}%`;
        const statusControl = node.querySelector('[data-action="status"]');
        const progressControl = node.querySelector('[data-action="progress"]');
        statusControl.value = assignment.status;
        progressControl.value = progress;
        statusControl.addEventListener("change", () => updateAssignment(assignment.id, { status: statusControl.value, progress: statusControl.value === "completado" ? 100 : normalizedProgress(assignment) }, "actualizo estado"));
        progressControl.addEventListener("change", () => updateAssignment(assignment.id, { progress: Math.min(100, Math.max(0, Number(progressControl.value) || 0)), status: Number(progressControl.value) >= 100 ? "completado" : assignment.status }, "actualizo avance"));
        node.querySelector(".notes").textContent = assignment.notes || "Sin detalles adicionales.";
        const followUpBox = document.createElement("div");
        followUpBox.className = "followup-box";

        const followUpTitle = document.createElement("strong");
        followUpTitle.textContent = "Seguimiento de la tarea";

        const followUpList = document.createElement("div");
        followUpList.className = "followup-list";

        const followUps = assignment.followUps || [];

        followUpList.innerHTML = followUps.length
            ? followUps.map((item) => `
                <div class="followup-item">
                    <span>${escapeHtml(item.userName || "Usuario")} - ${escapeHtml(formatDate(item.at))}</span>
                    <p>${escapeHtml(item.text)}</p>
                </div>
            `).join("")
            : '<p class="followup-empty">Sin seguimientos registrados.</p>';

        const followUpTextarea = document.createElement("textarea");
        followUpTextarea.className = "followup-textarea";
        followUpTextarea.placeholder = "Escribe aquí el avance, novedad o comentario sobre esta tarea...";

        const followUpButton = document.createElement("button");
        followUpButton.type = "button";
        followUpButton.className = "small-button";
        followUpButton.textContent = "Guardar seguimiento";

        followUpButton.addEventListener("click", () => {
            saveFollowUp(assignment.id, followUpTextarea.value);
        });

        followUpBox.append(followUpTitle, followUpList, followUpTextarea, followUpButton);
        node.querySelector(".notes").after(followUpBox);
        node.querySelector(".calendar-link").href = googleCalendarUrl(assignment);
        node.querySelector(".whatsapp-link").href = whatsappUrl(assignment);
        node.querySelector(".download-ics").addEventListener("click", () => downloadIcs(assignment));
        node.querySelector(".copy-summary").addEventListener("click", () => copySummary(assignment));
        const deleteButton = node.querySelector(".delete-card");

        if (isSystemsAdmin()) {
            deleteButton.addEventListener("click", () => deleteAssignment(assignment.id));
        } else {
            deleteButton.remove();
        }
        if (assignment.id === selectedAssignmentId) {
            node.classList.add("selected-task-card");
        }
        node.addEventListener("click", (event) => {
            if (event.target.closest("a, button, input, select, textarea")) {
                return;
            }
            selectedAssignmentId = assignment.id;
            metricFilter = "todos";
            render();
        });
        cards.appendChild(node);
    });
}

async function registerAppShell() {
    if ("serviceWorker" in navigator) {
        try {
            await navigator.serviceWorker.register("./sw.js");
        } catch {
            // La app funciona aunque el navegador no permita instalarla.
        }
    }
}

async function enableNotifications() {
    if (!("Notification" in window)) {
        alert("Este navegador no permite notificaciones.");
        return;
    }

    const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    if (permission !== "granted") {
        alert("Las notificaciones no quedaron activas. Puedes habilitarlas desde los permisos del navegador.");
        return;
    }

    notifyButton.textContent = "Notificaciones activas";
    notifyButton.disabled = true;
    showDueNotifications(true);
}

function scheduleReminderChecks() {
    showDueNotifications(false);
    setInterval(() => showDueNotifications(false), 30 * 60 * 1000);
}

function showDueNotifications(force) {
    if (!("Notification" in window) || Notification.permission !== "granted") {
        return;
    }

    const todayKey = new Date().toISOString().slice(0, 10);
    const sentKey = `notificaciones-${todayKey}`;
    const sent = force ? [] : JSON.parse(localStorage.getItem(sentKey) || "[]");
    const dueSoon = assignments.filter((item) => item.status !== "completado" && daysUntilDue(item) <= 2);

    dueSoon.forEach((assignment) => {
        if (!force && sent.includes(assignment.id)) {
            return;
        }
        const due = daysUntilDue(assignment);
        const body = due < 0
            ? `${Math.abs(due)} dia(s) vencida. Responsable: ${assignment.owner}.`
            : due === 0
                ? `Vence hoy. Responsable: ${assignment.owner}.`
                : `Vence en ${due} dia(s). Responsable: ${assignment.owner}.`;
        new Notification(assignment.title, {
            body,
            icon: "assets/logo-altron.png",
            tag: assignment.id
        });
        sent.push(assignment.id);
    });
    localStorage.setItem(sentKey, JSON.stringify([...new Set(sent)]));
}

function filteredAssignments() {
    const query = searchInput.value.trim().toLowerCase();
    const type = typeFilter.value;

    return assignments.filter((assignment) => {
        const text = [
            assignment.title,
            assignment.owner,
            assignment.email,
            assignment.phone,
            assignment.department,
            assignment.recipient,
            assignment.place,
            assignment.notes
        ].join(" ").toLowerCase();

        const matchesQuery = !query || text.includes(query);
        const matchesType = type === "todos" || assignment.type === type;

        return canViewAssignment(assignment)
            && matchesTaskView(assignment)
            && matchesMetricFilter(assignment)
            && matchesQuery
            && matchesType;
    });
}
function matchesTaskView(assignment) {
    if (taskViewMode === "all") {
        return isSystemsAdmin();
    }

    if (taskViewMode === "created") {
        return isCreatedByCurrentUser(assignment);
    }

    return isAssignedOrSharedWithCurrentUser(assignment);
}

function isAssignedOrSharedWithCurrentUser(assignment) {
    const userEmail = currentUser.email.toLowerCase();

    const assignedEmails = parseEmailList(assignment.email || "");

    const sharedEmails = (assignment.sharedWith || [])
        .map((email) => String(email || "").trim().toLowerCase())
        .filter(Boolean);

    return assignedEmails.includes(userEmail) || sharedEmails.includes(userEmail);
}

function isCreatedByCurrentUser(assignment) {
    const userEmail = currentUser.email.toLowerCase();
    return String(assignment.createdBy || "").trim().toLowerCase() === userEmail;
}

function matchesMetricFilter(assignment) {
    if (metricFilter === "todos") {
        return true;
    }
    if (metricFilter === "pendientes") {
        return assignment.status !== "completado";
    }
    if (metricFilter === "vencidas") {
        return overdueDays(assignment) > 0;
    }
    if (metricFilter === "visitas") {
        return assignment.type === "visita";
    }
    if (metricFilter === "ofertas") {
        return assignment.type === "oferta";
    }
    if (metricFilter === "viajes") {
        return assignment.type === "viaje";
    }
    return true;
}

function canViewAssignment(assignment) {
    if (isSystemsAdmin()) {
        return true;
    }

    const userEmail = currentUser.email.toLowerCase();

    const assignedEmails = parseEmailList(assignment.email || "");
    const sharedEmails = (assignment.sharedWith || [])
        .map((email) => String(email || "").trim().toLowerCase())
        .filter(Boolean);

    return assignment.createdBy?.toLowerCase() === userEmail
        || assignedEmails.includes(userEmail)
        || sharedEmails.includes(userEmail);
}

function visibleAssignments() {
    return assignments.filter(canViewAssignment);
}

function renderMetrics() {
    const selected = selectedAssignmentId ? assignments.find((item) => item.id === selectedAssignmentId && canViewAssignment(item)) : null;
    const scoped = selected ? [selected] : visibleAssignments();
    const pending = scoped.filter((item) => item.status !== "completado").length;
    const overdue = scoped.filter((item) => overdueDays(item) > 0).length;
    const average = scoped.length ? Math.round(scoped.reduce((sum, item) => sum + normalizedProgress(item), 0) / scoped.length) : 0;
    const visits = scoped.filter((item) => item.type === "visita").length;
    const offers = scoped.filter((item) => item.type === "oferta").length;
    const trips = scoped.filter((item) => item.type === "viaje").length;
    metrics.innerHTML = [
        metric("Pendientes", pending, "pendientes"),
        metric("Vencidas", overdue, "vencidas"),
        metric("Avance promedio", `${average}%`, "todos"),
        metric("Visitas", visits, "visitas"),
        metric("Ofertas comerciales", offers, "ofertas"),
        metric("Viajes", trips, "viajes")
    ].join("");
}

function metric(label, value, filter) {
    const active = metricFilter === filter ? " active-metric" : "";
    return `<button class="metric${active}" type="button" data-filter="${filter}" title="Filtrar por ${label}"><strong>${value}</strong><span>${label}</span></button>`;
}

function statusLabel(status) {
    const labels = {
        pendiente: "Pendiente",
        programado: "Programado",
        "en-proceso": "En proceso",
        completado: "Completado"
    };
    return labels[status] || status;
}

function progressValue() {
    const value = Number(valueOf("#progress"));
    return Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
}

function googleCalendarUrl(assignment) {
    const params = new URLSearchParams({
        action: "TEMPLATE",
        text: `[${typeLabels[assignment.type]}] ${assignment.title}`,
        dates: `${calendarDate(assignment.start)}/${calendarDate(assignment.end)}`,
        details: summaryText(assignment),
        location: assignment.place || "",
        add: assignment.email || ""
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function whatsappUrl(assignment) {
    const phone = (assignment.phone || "").replace(/\D/g, "");
    const text = `${summaryText(assignment)}\n\nAgregar a Google Calendar:\n${googleCalendarUrl(assignment)}`;
    const params = new URLSearchParams({ text });
    return phone ? `https://wa.me/${phone}?${params.toString()}` : `https://wa.me/?${params.toString()}`;
}

function downloadIcs(assignment) {
    const ics = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Asignador Comercial//ES",
        "BEGIN:VEVENT",
        `UID:${assignment.id}@asignador-comercial`,
        `DTSTAMP:${calendarDate(new Date().toISOString())}`,
        `DTSTART:${calendarDate(assignment.start)}`,
        `DTEND:${calendarDate(assignment.end)}`,
        `SUMMARY:${escapeIcs(`[${typeLabels[assignment.type]}] ${assignment.title}`)}`,
        `LOCATION:${escapeIcs(assignment.place || "")}`,
        `DESCRIPTION:${escapeIcs(summaryText(assignment))}`,
        assignment.email ? `ATTENDEE;CN=${escapeIcs(assignment.owner)}:MAILTO:${assignment.email}` : "",
        "END:VEVENT",
        "END:VCALENDAR"
    ].filter(Boolean).join("\r\n");

    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    downloadBlob(blob, `${slug(assignment.title)}.ics`);
}

function copySummary(assignment) {
    navigator.clipboard.writeText(summaryText(assignment));
}

async function deleteAssignment(id) {
    if (!isSystemsAdmin()) {
        alert("No tienes permisos para eliminar tareas. Solo los administradores pueden hacerlo.");
        return;
    }

    const confirmar = confirm("¿Seguro que deseas eliminar esta tarea? Esta acción quedará registrada en la bitácora.");

    if (!confirmar) {
        return;
    }

    const deleted = assignments.find((assignment) => assignment.id === id);

    if (deleted) {
        addAudit("borro", deleted, `Borro tarea de ${deleted.department}`);
    }

    assignments = assignments.filter((assignment) => assignment.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(assignments));

    await deleteAssignmentCloud(id);

    render();
}

async function updateAssignment(id, changes, action = "actualizo") {
    const target = assignments.find((assignment) => assignment.id === id);

    assignments = assignments.map((assignment) => assignment.id === id
        ? { ...assignment, ...changes, updatedAt: new Date().toISOString(), updatedBy: currentUser.email }
        : assignment
    );

    if (target) {
        addAudit(action, { ...target, ...changes }, `${action} en ${target.department}`);
    }

    const updatedAssignment = assignments.find((assignment) => assignment.id === id);

    if (updatedAssignment) {
        await saveAssignment(updatedAssignment);
    }

    render();
}
async function saveFollowUp(id, text) {
    const cleanText = String(text || "").trim();

    if (!cleanText) {
        alert("Escribe una descripción o avance antes de guardar.");
        return;
    }

    let updatedAssignment = null;

    assignments = assignments.map((assignment) => {
        if (assignment.id !== id) {
            return assignment;
        }

        const followUps = assignment.followUps || [];

        updatedAssignment = {
            ...assignment,
            followUps: [
                ...followUps,
                {
                    id: createId(),
                    text: cleanText,
                    userEmail: currentUser.email,
                    userName: currentUser.name,
                    at: new Date().toISOString()
                }
            ],
            updatedAt: new Date().toISOString(),
            updatedBy: currentUser.email
        };

        return updatedAssignment;
    });

    if (!updatedAssignment) {
        alert("No se encontró la tarea para guardar el seguimiento.");
        return;
    }

    addAudit("seguimiento", updatedAssignment, `Agregó seguimiento a la tarea ${updatedAssignment.title}`);

    await saveAssignment(updatedAssignment);
    render();
}
function addAudit(action, assignment, detail) {
    const entry = {
        id: createId(),
        action,
        detail,
        taskId: assignment.id,
        taskTitle: assignment.title,
        taskDepartment: assignment.department,
        userEmail: currentUser.email,
        userName: currentUser.name,
        userDepartment: currentUser.department,
        at: new Date().toISOString()
    };

    auditLog = [entry, ...auditLog].slice(0, 200);
    localStorage.setItem(AUDIT_KEY, JSON.stringify(auditLog));

    saveAuditEntry(entry);

    return entry;
}

    function renderAudit() {
        adminPanel.hidden = !isSystemsAdmin();
        if (!isSystemsAdmin()) {
            return;
        }
        adminToggle.setAttribute("aria-expanded", String(auditExpanded));
        adminPanel.classList.toggle("expanded", auditExpanded);
        auditList.hidden = !auditExpanded;
        if (!auditLog.length) {
            auditList.innerHTML = '<p class="audit-empty">Sin movimientos registrados.</p>';
            return;
        }
        auditList.innerHTML = "";
        auditLog.slice(0, 20).forEach((entry) => {
            const item = document.createElement("div");
            item.className = "audit-item";
            item.innerHTML = `
      <strong>${escapeHtml(entry.action)}: ${escapeHtml(entry.taskTitle)}</strong>
      <span>${escapeHtml(entry.userName)} (${escapeHtml(entry.userEmail)}) - ${escapeHtml(formatDate(entry.at))}</span>
      <p>${escapeHtml(entry.detail)}</p>
    `;
            auditList.appendChild(item);
        });
    }

    function exportCsv() {
        const header = ["tipo", "titulo", "responsable", "correo", "whatsapp", "departamento", "presentar_a", "compartido_con", "estado", "avance", "dias_vencidos", "inicio", "fin", "lugar", "prioridad", "detalles"];
        const rows = visibleAssignments().map((item) => [
            typeLabels[item.type],
            item.title,
            item.owner,
            item.email,
            item.phone,
            item.department,
            item.recipient,
            (item.sharedWith || []).join("; "),
            item.status,
            normalizedProgress(item),
            overdueDays(item),
            item.start,
            item.end,
            item.place,
            item.priority,
            item.notes
        ]);
        const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
        downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), "asignaciones-comerciales.csv");
    }

    function downloadTrackingReport() {
        const rows = visibleAssignments()
            .map((item) => `
      <tr class="${overdueDays(item) > 0 ? "overdue" : ""}">
        <td>${escapeHtml(typeLabels[item.type])}</td>
        <td>${escapeHtml(item.title)}</td>
        <td>${escapeHtml(item.owner)}</td>
        <td>${escapeHtml(item.department)}</td>
        <td>${escapeHtml(item.recipient || "Por definir")}</td>
        <td>${escapeHtml(item.status)}</td>
        <td>${normalizedProgress(item)}%</td>
        <td>${overdueLabel(item)}</td>
        <td>${escapeHtml(formatDate(item.end))}</td>
        <td>${escapeHtml(item.place || "")}</td>
      </tr>
    `)
            .join("");

        const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Reporte de seguimiento comercial</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 32px; color: #18212f; }
    h1 { margin: 0 0 6px; }
    p { color: #607086; }
    table { border-collapse: collapse; width: 100%; margin-top: 20px; }
    th, td { border: 1px solid #d9e1ea; padding: 9px; text-align: left; vertical-align: top; }
    th { background: #e6f4f1; color: #0b5560; }
    .overdue td { background: #fff1f0; }
  </style>
</head>
<body>
  <h1>Reporte de seguimiento comercial</h1>
  <p>Generado el ${escapeHtml(formatDate(new Date().toISOString()))}. Comparte este archivo por Google Drive para que otras personas puedan verlo.</p>
  <table>
    <thead>
      <tr>
        <th>Tipo</th><th>Tarea</th><th>Responsable</th><th>Departamento</th><th>Presentar a</th><th>Estado</th><th>Avance</th><th>Vencimiento</th><th>Fecha limite</th><th>Lugar</th>
      </tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="10">Sin asignaciones.</td></tr>'}</tbody>
  </table>
</body>
</html>`;
        downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), "reporte-seguimiento-comercial.html");
    }

    async function importDocxNotes(event) {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        if (!window.JSZip) {
            importResults.innerHTML = "<p>No se pudo cargar el lector DOCX. Revisa la conexion a internet y vuelve a abrir la app.</p>";
            return;
        }

        try {
            importResults.innerHTML = "<p>Leyendo documento...</p>";
            const zip = await JSZip.loadAsync(await file.arrayBuffer());
            const documentXml = await zip.file("word/document.xml").async("string");
            const paragraphs = extractDocxParagraphs(documentXml);
            const importedTasks = extractNextSteps(paragraphs);
            renderImportedTasks(importedTasks);
        } catch (error) {
            importResults.innerHTML = "<p>No pude leer ese DOCX. Verifica que sea un archivo de Word valido.</p>";
        } finally {
            event.target.value = "";
        }
    }

    function extractDocxParagraphs(xmlText) {
        const xml = new DOMParser().parseFromString(xmlText, "application/xml");
        return [...xml.getElementsByTagName("w:p")]
            .map((paragraph) => [...paragraph.getElementsByTagName("w:t")].map((node) => node.textContent).join(""))
            .map((text) => text.replace(/\s+/g, " ").trim())
            .filter(Boolean);
    }

    function extractNextSteps(paragraphs) {
        const startIndex = paragraphs.findIndex((text) => text.toLowerCase().includes("proximos pasos") || text.toLowerCase().includes("próximos pasos"));
        if (startIndex === -1) {
            return [];
        }

        const tasks = [];
        for (let index = startIndex + 1; index < paragraphs.length; index += 1) {
            const text = paragraphs[index];
            if (/^detalles$/i.test(text)) {
                break;
            }

            const match = text.match(/^\[([^\]]+)\]\s*([^:]+):\s*(.+)$/);
            if (match) {
                tasks.push({
                    owner: match[1].trim(),
                    title: match[2].trim(),
                    notes: match[3].trim()
                });
            }
        }
        return tasks;
    }

    function renderImportedTasks(importedTasks) {
        if (!importedTasks.length) {
            importResults.innerHTML = "<p>No encontre tareas en la seccion Proximos pasos. Puedes crearlas manualmente en el formulario.</p>";
            return;
        }

        importResults.innerHTML = "";
        importedTasks.forEach((task, index) => {
            const item = document.createElement("div");
            item.className = "import-task";
            const title = document.createElement("strong");
            const owner = document.createElement("span");
            const notes = document.createElement("p");
            const button = document.createElement("button");
            title.textContent = task.title;
            owner.textContent = `Responsable sugerido: ${task.owner}`;
            notes.textContent = task.notes;
            button.className = "small-button";
            button.type = "button";
            button.textContent = "Pasar al formulario";
            button.addEventListener("click", () => fillFormFromImportedTask(task, index));
            item.append(title, owner, notes, button);
            importResults.appendChild(item);
        });
    }

    function fillFormFromImportedTask(task, index) {
        const start = new Date();
        start.setDate(start.getDate() + index + 1);
        start.setHours(9, 0, 0, 0);
        const end = new Date(start);
        end.setHours(end.getHours() + 1);

        document.querySelector("#type").value = "pendiente";
        document.querySelector("#title").value = task.title;
        departmentSelect.value = "Sistemas";
        populateResponsibleOptions();
        ownerSelect.value = "__all__";
        applyResponsibleSelection();
        document.querySelector("#recipient").value = "";
        document.querySelector("#sharedWith").value = "";
        document.querySelector("#status").value = "pendiente";
        document.querySelector("#start").value = toLocalInputValue(start);
        document.querySelector("#end").value = toLocalInputValue(end);
        document.querySelector("#place").value = "";
        document.querySelector("#priority").value = "alta";
        document.querySelector("#progress").value = "0";
        document.querySelector("#notes").value = `${task.notes}\n\nCompletar: fecha de presentacion, responsable final, destinatario y posible lugar.`;
        document.querySelector("#title").focus();
    }

    function loadExampleData() {
        assignments = [
            {
                id: createId(),
                type: "visita",
                title: "Visita a cliente Distribuciones Andina",
                owner: "Laura Gomez",
                email: "laura@empresa.com",
                phone: "573001234567",
                department: "Comercial",
                recipient: "Gerencia comercial",
                sharedWith: ["gerencia@altroningenieria.com"],
                status: "programado",
                start: nextDate(1, 9),
                end: nextDate(1, 10),
                place: "Bogota - Sede Norte",
                priority: "alta",
                progress: 35,
                notes: "Confirmar requerimientos, levantar oportunidades y reportar acuerdos al cierre.",
                createdAt: new Date().toISOString()
            },
            {
                id: createId(),
                type: "oferta",
                title: "Subir oferta comercial para cliente",
                owner: "Equipo RRHH",
                email: "rrhh@empresa.com",
                phone: "",
                department: "Talento humano",
                recipient: "Cliente asignado",
                sharedWith: ["angelc@altroningenieria.com"],
                status: "pendiente",
                start: nextDate(2, 8),
                end: nextDate(2, 9),
                place: "Google Jobs / LinkedIn",
                priority: "media",
                progress: 15,
                notes: "Preparar propuesta, validar precios y enviar enlace al lider comercial.",
                createdAt: new Date().toISOString()
            },
            {
                id: createId(),
                type: "viaje",
                title: "Viaje comercial Medellin",
                owner: "Carlos Ruiz",
                email: "carlos@empresa.com",
                phone: "573009876543",
                department: "Comercial",
                recipient: "Direccion comercial",
                sharedWith: ["gerencia@altroningenieria.com"],
                status: "programado",
                start: nextDate(5, 6),
                end: nextDate(7, 18),
                place: "Medellin",
                priority: "alta",
                progress: 60,
                notes: "Agenda de clientes, hotel, transporte y reporte diario de visitas.",
                createdAt: new Date().toISOString()
            }
        ];
        saveAssignments();
        render();
    }

    function summaryText(assignment) {
        return [
            `Tipo: ${typeLabels[assignment.type]}`,
            `Titulo: ${assignment.title}`,
            `Responsable: ${assignment.owner}`,
            assignment.email ? `Correo: ${assignment.email}` : "",
            assignment.phone ? `WhatsApp: ${assignment.phone}` : "",
            `Departamento: ${assignment.department}`,
            assignment.recipient ? `Presentar a: ${assignment.recipient}` : "",
            assignment.sharedWith?.length ? `Compartido con: ${assignment.sharedWith.join(", ")}` : "",
            `Estado: ${assignment.status}`,
            `Avance: ${normalizedProgress(assignment)}%`,
            `Vencimiento: ${overdueLabel(assignment)}`,
            `Inicio: ${formatDate(assignment.start)}`,
            `Fin: ${formatDate(assignment.end)}`,
            assignment.place ? `Lugar: ${assignment.place}` : "",
            `Prioridad: ${assignment.priority}`,
            assignment.notes ? `Detalles: ${assignment.notes}` : ""
        ].filter(Boolean).join("\n");
    }

    function emailLabel(assignment) {
        return assignment.email ? `${assignment.owner} (${assignment.email})` : assignment.owner;
    }

    function creatorLabel(assignment) {
        const creator = users.find((user) => user.email === assignment.createdBy);
        const name = assignment.createdByName || creator?.name || assignment.createdBy || "Sin registro";
        const phone = creator?.phone ? ` - ${creator.phone}` : "";
        return `${name}${phone}`;
    }

    function dateRange(assignment) {
        return `${formatDate(assignment.start)} - ${formatDate(assignment.end)}`;
    }

    function normalizedProgress(assignment) {
        const statusProgress = assignment.status === "completado" ? 100 : 0;
        const value = Number(assignment.progress ?? statusProgress);
        return Math.min(100, Math.max(0, Number.isFinite(value) ? value : statusProgress));
    }

    function overdueDays(assignment) {
        if (assignment.status === "completado") {
            return 0;
        }
        const dueDate = new Date(assignment.end);
        const today = new Date();
        dueDate.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);
        return Math.max(0, Math.floor((today - dueDate) / 86400000));
    }

    function daysUntilDue(assignment) {
        const dueDate = new Date(assignment.end);
        const today = new Date();
        dueDate.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);
        return Math.ceil((dueDate - today) / 86400000);
    }

    function overdueLabel(assignment) {
        const days = overdueDays(assignment);
        if (days > 0) {
            return `${days} dia${days === 1 ? "" : "s"} vencido${days === 1 ? "" : "s"}`;
        }
        return assignment.status === "completado" ? "Completado" : "A tiempo";
    }

    function formatDate(value) {
        return new Intl.DateTimeFormat("es-CO", {
            dateStyle: "medium",
            timeStyle: "short"
        }).format(new Date(value));
    }

    function calendarDate(value) {
        return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    }

    function toLocalInputValue(date) {
        const offset = date.getTimezoneOffset();
        return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
    }

    function createId() {
        if (crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    function isSystemsAdmin() {
        return Boolean(currentUser?.admin) || currentUser?.email?.toLowerCase() === "sistemas@altroningenieria.com";
    }

    function parseEmailList(value) {
        return value
            .split(",")
            .map((email) => email.trim().toLowerCase())
            .filter(Boolean);
    }

    function nextDate(days, hour) {
        const date = new Date();
        date.setDate(date.getDate() + days);
        date.setHours(hour, 0, 0, 0);
        return toLocalInputValue(date);
    }

    function escapeIcs(value) {
        return String(value)
            .replace(/\\/g, "\\\\")
            .replace(/;/g, "\\;")
            .replace(/,/g, "\\,")
            .replace(/\n/g, "\\n");
    }

    function csvCell(value) {
        return `"${String(value ?? "").replace(/"/g, '""')}"`;
    }

    function slug(value) {
        return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "evento";
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
    }
