let currentLangData = {};
let currentUser = null;
let viewMode = 'grid';

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const res = await fetch('/api/check-setup');
        const data = await res.json();
        if (data.needsSetup) {
            document.getElementById('setup-modal').classList.remove('hidden');
            return;
        }
    } catch (e) {
        console.error('Error comprobando setup', e);
    }

    const savedUser = localStorage.getItem('boxxed_user');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        initApp();
    } else {
        document.getElementById('login-screen').classList.remove('hidden');
    }

    const savedTheme = localStorage.getItem('theme') || 'light';
    const savedAccent = localStorage.getItem('accent') || 'blue';
    const savedLang = localStorage.getItem('lang') || 'es-ES';
    viewMode = localStorage.getItem('view_mode') || 'grid';

    changeTheme(savedTheme, false);
    changeAccent(savedAccent, false);
    await loadLanguage(savedLang);
});

async function handleSetup(e) {
    e.preventDefault();
    const username = document.getElementById('setup-user').value;
    const password = document.getElementById('setup-pass').value;

    const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });

    if (res.ok) {
        document.getElementById('setup-modal').classList.add('hidden');
        document.getElementById('login-screen').classList.remove('hidden');
    } else {
        alert('Error al crear el superusuario');
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('login-user').value;
    const password = document.getElementById('login-pass').value;

    const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (res.ok && data.success) {
        currentUser = data.user;
        localStorage.setItem('boxxed_user', JSON.stringify(currentUser));
        document.getElementById('login-screen').classList.add('hidden');
        initApp();
    } else {
        alert(data.error || 'Credenciales inválidas');
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('boxxed_user');
    document.getElementById('app-container').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
}

function initApp() {
    document.getElementById('app-container').classList.remove('hidden');
    loadItems();
    loadGroupsToSelects();
    
    if (currentUser && currentUser.is_superuser) {
        const btnAdmin = document.getElementById('nav-tab-admin');
        if (btnAdmin) btnAdmin.classList.remove('hidden');
    }
}

async function loadLanguage(lang) {
    try {
        const res = await fetch(`/api/loc/${lang}`);
        currentLangData = await res.json();
        
        document.getElementById('app-title').innerText = currentLangData.app_title || 'Boxxed - Inventario';
        document.getElementById('search-bar').placeholder = currentLangData.search || 'Buscar...';
        document.getElementById('lang-select').value = lang;
        
        document.getElementById('btn-view-mode').innerText = viewMode === 'grid' ? (currentLangData.view_table || 'Vista Tabla') : (currentLangData.view_grid || 'Vista Tarjetas');
        document.getElementById('btn-nav-categories').innerText = currentLangData.categories || 'Categorías';
        document.getElementById('btn-nav-settings').innerText = currentLangData.settings || 'Ajustes';
        document.getElementById('btn-logout').innerText = currentLangData.logout || 'Salir';

        // Traducción de la pantalla de ajustes
        document.getElementById('settings-header-title').innerText = currentLangData.settings || 'Ajustes';
        document.getElementById('btn-back-inventory').innerText = currentLangData.back_to_inventory || 'Volver al inventario';
        document.getElementById('nav-tab-appearance').innerText = currentLangData.settings_appearance || 'Aspecto';
        document.getElementById('nav-tab-language').innerText = currentLangData.settings_language || 'Idioma';
        document.getElementById('nav-tab-admin').innerText = currentLangData.settings_administration || 'Administración';
        document.getElementById('txt-appearance-title').innerText = currentLangData.settings_appearance || 'Aspecto';
        document.getElementById('txt-language-title').innerText = currentLangData.settings_language || 'Idioma';
        document.getElementById('txt-admin-title').innerText = currentLangData.settings_administration || 'Administración';

        localStorage.setItem('lang', lang);
        loadItems();
    } catch (e) {
        console.error('Error cargando idioma', e);
    }
}

function changeTheme(theme, save = true) {
    document.body.className = theme;
    document.getElementById('theme-select').value = theme;
    if (save) localStorage.setItem('theme', theme);
}

function changeAccent(accent, save = true) {
    document.body.setAttribute('data-accent', accent);
    if (save) localStorage.setItem('accent', accent);
}

function changeLanguage(lang) {
    loadLanguage(lang);
}

function toggleViewMode() {
    viewMode = viewMode === 'grid' ? 'table' : 'grid';
    localStorage.setItem('view_mode', viewMode);
    document.getElementById('btn-view-mode').innerText = viewMode === 'grid' ? (currentLangData.view_table || 'Vista Tabla') : (currentLangData.view_grid || 'Vista Tarjetas');
    loadItems();
}

// Control de la pantalla de Ajustes (Estilo Immich)
function openSettingsView() {
    document.getElementById('settings-view').classList.remove('hidden');
    // Por defecto abrimos la pestaña Aspecto
    const firstTab = document.getElementById('nav-tab-appearance');
    switchSettingsTab('appearance', firstTab);
}

function closeSettingsView() {
    document.getElementById('settings-view').classList.add('hidden');
}

function switchSettingsTab(tabName, btnElement) {
    document.querySelectorAll('.settings-panel-section').forEach(sec => sec.classList.add('hidden'));
    document.querySelectorAll('.settings-nav-item').forEach(btn => btn.classList.remove('active'));

    document.getElementById(`settings-tab-${tabName}`).classList.remove('hidden');
    if (btnElement) btnElement.classList.add('active');

    if (tabName === 'administration' && currentUser && currentUser.is_superuser) {
        loadGroupsToSelects();
        loadUsersList();
        resetUserForm();
    }
}

async function togglePanel(type) {
    const panel = document.getElementById('side-panel');
    const itemForm = document.getElementById('item-form');
    const categoryContent = document.getElementById('category-content');
    const panelTitle = document.getElementById('panel-title');

    panel.classList.add('open');
    panel.classList.remove('hidden');

    itemForm.classList.add('hidden');
    categoryContent.classList.add('hidden');

    if (type === 'item') {
        panelTitle.innerText = currentLangData.create_item || 'Crear Ítem';
        itemForm.classList.remove('hidden');
        await loadCategoriesToSelect();
        await loadGroupsToSelects();
    } else if (type === 'category') {
        panelTitle.innerText = currentLangData.categories || 'Gestión de Categorías';
        categoryContent.classList.remove('hidden');
        await loadGroupsToSelects();
        await loadCategoriesList();
    }
}

function closePanel() {
    document.getElementById('side-panel').classList.remove('open');
}

async function loadGroupsToSelects() {
    try {
        const res = await fetch('/api/groups');
        const groups = await res.json();
        
        const selects = ['item-group', 'cat-group', 'new-user-group'];
        selects.forEach(selectId => {
            const select = document.getElementById(selectId);
            if (!select) return;
            const currentVal = select.value;
            select.innerHTML = `<option value="">${currentLangData.public_none || '(Ninguno / Público)'}</option>`;
            groups.forEach(g => {
                select.innerHTML += `<option value="${g.id}">${g.name}</option>`;
            });
            select.value = currentVal;
        });
    } catch (e) {
        console.error('Error cargando grupos', e);
    }
}

async function loadCategoriesToSelect() {
    const res = await fetch('/api/categories');
    const categories = await res.json();
    const select = document.getElementById('item-category');
    select.innerHTML = `<option value="" disabled selected>${currentLangData.category || 'Selecciona categoría'}</option>`;
    categories.forEach(c => {
        select.innerHTML += `<option value="${c.id}">${c.name}</option>`;
    });
}

async function loadCategoriesList() {
    const res = await fetch('/api/categories');
    const categories = await res.json();
    const list = document.getElementById('categories-list');
    
    if (categories.length === 0) {
        list.innerHTML = `<p style="color: var(--text-muted); font-size: 0.85rem; margin:0;">Sin categorías.</p>`;
        return;
    }

    list.innerHTML = categories.map(c => `
        <div style="background: var(--bg-color); padding: 0.75rem; border-radius: var(--radius); border: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
            <div>
                <strong>${escapeHtml(c.name)}</strong>
            </div>
        </div>
    `).join('');
}

async function saveCategory() {
    const name = document.getElementById('cat-name').value;
    const group_id = document.getElementById('cat-group').value;
    if (!name) return alert('Introduce un nombre');

    const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, group_id: group_id || null })
    });

    if (res.ok) {
        document.getElementById('cat-name').value = '';
        loadCategoriesList();
    } else {
        alert('Error al crear categoría');
    }
}

async function loadUsersList() {
    const res = await fetch('/api/users');
    const users = await res.json();
    const list = document.getElementById('users-list');
    
    list.innerHTML = users.map(u => `
        <div style="background: var(--bg-color); padding: 0.75rem; border-radius: var(--radius); border: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
            <div>
                <strong>${escapeHtml(u.username)}</strong> <span style="font-size: 0.8rem; color: var(--text-muted);">(${u.group_name || 'Sin grupo'})</span> ${u.is_superuser ? '<b>[Super]</b>' : ''}
            </div>
            <div style="display: flex; gap: 5px;">
                <button onclick="editUser(${u.id}, '${u.username}', ${u.group_id || 'null'})" style="padding: 4px 8px; font-size: 0.75rem; background: var(--border-color); color: var(--text-color); border: none; border-radius: 4px; cursor: pointer;">${currentLangData.edit || 'Editar'}</button>
                ${!u.is_superuser ? `<button onclick="deleteUser(${u.id})" style="padding: 4px 8px; font-size: 0.75rem; background: var(--danger); color: white; border: none; border-radius: 4px; cursor: pointer;">${currentLangData.delete || 'Eliminar'}</button>` : ''}
            </div>
        </div>
    `).join('');
}

function editUser(id, username, group_id) {
    document.getElementById('edit-user-id').value = id;
    document.getElementById('new-user-name').value = username;
    document.getElementById('new-user-pass').value = '';
    document.getElementById('new-user-group').value = group_id === 'null' ? '' : group_id;
    
    document.getElementById('user-form-title').innerText = currentLangData.edit_item || 'Editar Usuario';
    document.getElementById('btn-save-user').innerText = currentLangData.save || 'Guardar Cambios';
    document.getElementById('btn-cancel-user').classList.remove('hidden');
}

function resetUserForm() {
    document.getElementById('edit-user-id').value = '';
    document.getElementById('new-user-name').value = '';
    document.getElementById('new-user-pass').value = '';
    document.getElementById('new-user-group').value = '';
    
    document.getElementById('user-form-title').innerText = currentLangData.new_user || 'Nuevo Usuario';
    document.getElementById('btn-save-user').innerText = currentLangData.create_superuser || 'Crear Usuario';
    document.getElementById('btn-cancel-user').classList.add('hidden');
}

async function saveUser() {
    const editId = document.getElementById('edit-user-id').value;
    const username = document.getElementById('new-user-name').value;
    const password = document.getElementById('new-user-pass').value;
    const group_id = document.getElementById('new-user-group').value;

    if (!username) return alert('Introduce un nombre de usuario');

    const url = editId ? `/api/users/${editId}` : '/api/users';
    const method = editId ? 'PUT' : 'POST';

    const res = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, group_id: group_id || null })
    });

    if (res.ok) {
        resetUserForm();
        loadUsersList();
    } else {
        alert('Error al guardar el usuario');
    }
}

async function deleteUser(id) {
    if (!confirm('¿Seguro que deseas eliminar/deshabilitar este usuario?')) return;
    const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
    if (res.ok) {
        loadUsersList();
    } else {
        alert('Error al eliminar usuario');
    }
}

function formatDate(isoString) {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return date.toLocaleString();
}

async function loadItems() {
    const search = document.getElementById('search-bar').value;
    const res = await fetch(`/api/items?search=${encodeURIComponent(search)}`);
    const items = await res.json();

    const container = document.getElementById('items-container');
    container.innerHTML = '';

    if (items.length === 0) {
        container.innerHTML = `<p style="color: var(--text-muted);">${currentLangData.no_items || 'No hay ítems registrados.'}</p>`;
        return;
    }

    if (viewMode === 'grid') {
        const grid = document.createElement('div');
        grid.className = 'items-grid';
        items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'item-card';
            card.innerHTML = `
                <h3>${escapeHtml(item.name)}</h3>
                <p>${escapeHtml(item.description || '')}</p>
                <p><strong>${currentLangData.quantity || 'Cant'}:</strong> ${item.quantity} | <strong>${currentLangData.category || 'Cat'}:</strong> ${escapeHtml(item.category_name || '-')}</p>
                <div class="item-meta">
                    <span>${currentLangData.group || 'Grupo'}: ${escapeHtml(item.group_name || 'Público')}</span>
                    <span>${currentLangData.created_by || 'Creado por'}: ${escapeHtml(item.created_by)} (${formatDate(item.created_at)})</span>
                    <span>${currentLangData.modified_by || 'Modificado por'}: ${escapeHtml(item.modified_by || item.created_by)} (${formatDate(item.modified_at || item.created_at)})</span>
                </div>
            `;
            grid.appendChild(card);
        });
        container.appendChild(grid);
    } else {
        const wrapper = document.createElement('div');
        wrapper.className = 'table-responsive';
        
        const table = document.createElement('table');
        table.className = 'items-table';
        table.innerHTML = `
            <thead>
                <tr>
                    <th>${currentLangData.name || 'Nombre'}</th>
                    <th>${currentLangData.description || 'Descripción'}</th>
                    <th>${currentLangData.quantity || 'Cantidad'}</th>
                    <th>${currentLangData.category || 'Categoría'}</th>
                    <th>${currentLangData.group || 'Grupo'}</th>
                    <th>${currentLangData.created_by || 'Creado por'}</th>
                    <th>${currentLangData.created_at || 'Creado'}</th>
                    <th>${currentLangData.modified_by || 'Modificado por'}</th>
                    <th>${currentLangData.modified_at || 'Modificado'}</th>
                </tr>
            </thead>
            <tbody>
                ${items.map(item => `
                    <tr>
                        <td><strong>${escapeHtml(item.name)}</strong></td>
                        <td>${escapeHtml(item.description || '')}</td>
                        <td>${item.quantity}</td>
                        <td>${escapeHtml(item.category_name || '-')}</td>
                        <td>${escapeHtml(item.group_name || 'Público')}</td>
                        <td>${escapeHtml(item.created_by)}</td>
                        <td>${formatDate(item.created_at)}</td>
                        <td>${escapeHtml(item.modified_by || item.created_by)}</td>
                        <td>${formatDate(item.modified_at || item.created_at)}</td>
                    </tr>
                `).join('')}
            </tbody>
        `;
        wrapper.appendChild(table);
        container.appendChild(wrapper);
    }
}

async function saveItem(e) {
    e.preventDefault();
    const name = document.getElementById('item-name').value;
    const description = document.getElementById('item-desc').value;
    const quantity = document.getElementById('item-qty').value;
    const category_id = document.getElementById('item-category').value;
    const group_id = document.getElementById('item-group').value;
    const tags = document.getElementById('item-tags').value;

    const res = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json'}},
        body: JSON.stringify({ 
            name, description, quantity, category_id, tags, 
            group_id: group_id || null, 
            username: currentUser ? currentUser.username : 'admin' 
        })
    );

    if (res.ok) {
        document.getElementById('item-form').reset();
        closePanel();
        loadItems();
    } else {
        alert('Error al guardar el ítem');
    }
}

function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}