let currentLangData = {};
let currentUser = null;
let viewMode = 'grid';
let currentItems = [];
let scannerStream = null;
let availableTags = [];
let selectedTagNames = [];

// Inicio de la aplicacion
document.addEventListener('DOMContentLoaded', async () => {
    setupTagPicker();
    const savedTheme = localStorage.getItem('theme') || 'light';
    const savedAccent = localStorage.getItem('accent') || 'blue';
    const savedLang = localStorage.getItem('lang') || 'es-ES';
    viewMode = localStorage.getItem('view_mode') || 'grid';

    changeTheme(savedTheme, false);
    changeAccent(savedAccent, false);
    await loadLanguage(savedLang);

    try {
        const setupResponse = await fetch('/api/check-setup');
        const setupData = await readApiResponse(setupResponse);

        if (!setupResponse.ok) {
            throw new Error(
                setupData.error || 'No se pudo comprobar la configuracion'
            );
        }

        if (setupData.needsSetup) {
            document.getElementById('setup-modal').classList.remove('hidden');
            return;
        }
    } catch (error) {
        console.error('Error comprobando setup:', error);
        alert('No se pudo comprobar la configuracion inicial');
        return;
    }

    try {
        const sessionResponse = await fetch('/api/session');
        const sessionData = await readApiResponse(sessionResponse);

        if (!sessionResponse.ok || !sessionData.authenticated) {
            localStorage.removeItem('boxxed_user');
            window.location.replace('/login.html');
            return;
        }

        currentUser = sessionData.user;
        localStorage.setItem('boxxed_user', JSON.stringify(currentUser));
        initApp();
    } catch (error) {
        console.error('Error comprobando la sesion:', error);
        localStorage.removeItem('boxxed_user');
        window.location.replace('/login.html');
    }
});

// Utilidades de API
async function readApiResponse(response) {
    try {
        return await response.json();
    } catch (error) {
        console.error('La respuesta no contiene JSON valido:', error);
        return {
            error: `Respuesta no valida del servidor (${response.status})`
        };
    }
}

async function handleApiFailure(response, fallbackMessage) {
    const data = await readApiResponse(response);

    if (response.status === 401) {
        localStorage.removeItem('boxxed_user');
        alert(data.error || 'La sesion ha caducado');
        window.location.replace('/login.html');
        return data;
    }

    alert(data.error || fallbackMessage || `Error HTTP ${response.status}`);
    return data;
}

// Setup, sesion y acceso
async function handleSetup(event) {
    event.preventDefault();

    const username = document.getElementById('setup-user').value.trim();
    const password = document.getElementById('setup-pass').value;

    if (!username || !password) {
        alert('El usuario y la contrasena son obligatorios');
        return;
    }

    try {
        const response = await fetch('/api/setup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await readApiResponse(response);

        if (!response.ok) {
            alert(data.error || 'Error al crear el superusuario');
            return;
        }

        currentUser = data.user;
        localStorage.setItem('boxxed_user', JSON.stringify(currentUser));
        document.getElementById('setup-modal').classList.add('hidden');
        initApp();
    } catch (error) {
        console.error('Error creando el superusuario:', error);
        alert('No se pudo conectar con el servidor');
    }
}

async function handleLogin(event) {
    event.preventDefault();

    const username = document.getElementById('login-user').value.trim();
    const password = document.getElementById('login-pass').value;

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await readApiResponse(response);

        if (response.ok && data.success) {
            currentUser = data.user;
            localStorage.setItem('boxxed_user', JSON.stringify(currentUser));
            window.location.replace('/');
            return;
        }

        alert(data.error || 'Credenciales invalidas');
    } catch (error) {
        console.error('Error iniciando sesion:', error);
        alert('No se pudo conectar con el servidor');
    }
}

async function logout() {
    try {
        await fetch('/api/logout', { method: 'POST' });
    } catch (error) {
        console.error('Error cerrando la sesion:', error);
    } finally {
        currentUser = null;
        localStorage.removeItem('boxxed_user');
        window.location.replace('/login.html');
    }
}

function initApp() {
    document.getElementById('app-container').classList.remove('hidden');

    const adminButton = document.getElementById('nav-tab-admin');

    if (adminButton) {
        adminButton.classList.toggle(
            'hidden',
            !(currentUser && currentUser.is_superuser)
        );
    }

    loadItems();
    loadGroupsToSelects();
    loadItemFilters();
}

// Idioma, tema y visualizacion
async function loadLanguage(lang) {
    try {
        const response = await fetch(`/api/loc/${lang}`);

        if (response.ok) {
            currentLangData = await readApiResponse(response);
        } else {
            currentLangData = {};
        }
    } catch (error) {
        console.warn('No se pudo cargar el idioma. Se usan textos base.', error);
        currentLangData = {};
    }

    setText('app-title', currentLangData.app_title || 'Boxxed - Inventario');
    setPlaceholder('search-bar', currentLangData.search || 'Buscar...');
    applyTranslatedPlaceholders();
    setValue('lang-select', lang);

    updateViewToggle();

    setText(
        'btn-nav-categories',
        currentLangData.categories || 'Categorias'
    );
    setText('btn-create-item', currentLangData.create_item || 'Crear Item');
    setText('txt-existing-item-photos', currentLangData.existing_photos || 'Fotos actuales');
    setText('btn-expand-panel', currentLangData.expand || 'Ampliar');
    setText('lbl-item-barcode', currentLangData.barcode || 'Codigo o valor escaneable');
    setText('lbl-item-photos', currentLangData.photos || 'Fotos del articulo');
    setText('lbl-item-tags', currentLangData.tags || 'Etiquetas');
    setText('btn-scan-item', currentLangData.scan || 'Escanear');
    setText('item-form-title', t('new_item', 'Nuevo ítem'));
    setText('btn-save-item', t('create_item', 'Crear ítem'));
    setText('txt-new-category-title', t('new_category', 'Nueva categoría'));
    setText('btn-create-cat', t('new_category', 'Crear categoría'));
    setText('group-form-title', t('new_group', 'Nuevo grupo'));
    setText('txt-existing-categories', t('existing_categories', 'Categorías existentes'));
    setText('lbl-user-group', t('user_group', 'Grupo asignado'));
    setText('btn-nav-settings', currentLangData.settings || 'Ajustes');
    setText('btn-logout', currentLangData.logout || 'Salir');
    document.documentElement.lang = lang;
    setText('settings-header-title', currentLangData.settings || 'Ajustes');
    setText(
        'btn-back-inventory',
        currentLangData.back_to_inventory || 'Volver al inventario'
    );
    setText(
        'nav-tab-appearance',
        currentLangData.settings_appearance || 'Aspecto'
    );
    setText(
        'nav-tab-language',
        currentLangData.settings_language || 'Idioma'
    );
    setText(
        'nav-tab-admin',
        currentLangData.settings_administration || 'Administracion'
    );
    setText(
        'txt-appearance-title',
        currentLangData.settings_appearance || 'Aspecto'
    );
    setText(
        'txt-language-title',
        currentLangData.settings_language || 'Idioma'
    );
    setText(
        'txt-admin-title',
        currentLangData.settings_administration || 'Administracion'
    );

    localStorage.setItem('lang', lang);

    if (currentUser) {
        loadItems();
        loadItemFilters();
    }
}

function setText(id, text) {
    const element = document.getElementById(id);
    if (element) element.innerText = text;
}

function setPlaceholder(id, text) {
    const element = document.getElementById(id);
    if (element) element.placeholder = text;
}

function t(key, fallback) {
    return currentLangData[key] || fallback;
}

function setValue(id, value) {
    
    const element = document.getElementById(id);
    if (element) element.value = value;
}

function applyTranslatedPlaceholders() {
        setPlaceholder('item-name', t('item_name_placeholder', 'Nombre'));
        setPlaceholder('item-desc', t('item_description_placeholder', 'Descripción'));
        setPlaceholder('item-qty', t('item_quantity_placeholder', 'Cantidad'));
        setPlaceholder('tag-search', t('tag_search_placeholder', 'Buscar o crear etiqueta'));
        setPlaceholder('item-barcode', t('barcode_placeholder', 'Código de barras, QR o referencia'));
}

function changeTheme(theme, save = true) {
    document.body.className = theme;
    setValue('theme-select', theme);
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

    updateViewToggle();

    loadItems();
}

function updateViewToggle() {
    const button = document.getElementById('btn-view-mode');
    if (!button) return;
    const isGrid = viewMode === 'grid';
    button.innerHTML = `<span aria-hidden="true">${isGrid ? '▤' : '▦'}</span>`;
    button.title = isGrid
        ? t('switch_to_table', 'Cambiar a tabla')
        : t('switch_to_grid', 'Cambiar a grid');
    button.setAttribute('aria-label', button.title);
}

// Pantalla de ajustes
function openSettingsView() {
    const appContainer = document.getElementById('app-container');
    const settingsView = document.getElementById('settings-view');
    const firstTab = document.getElementById('nav-tab-appearance');

    if (!appContainer || !settingsView) {
        console.error(
            'No se encontraron app-container o settings-view'
        );
        return;
    }

    appContainer.classList.add('hidden');
    settingsView.classList.remove('hidden');

    switchSettingsTab('appearance', firstTab);
}

function closeSettingsView() {
    const appContainer = document.getElementById('app-container');
    const settingsView = document.getElementById('settings-view');

    if (!appContainer || !settingsView) {
        console.error(
            'No se encontraron app-container o settings-view'
        );
        return;
    }

    settingsView.classList.add('hidden');
    appContainer.classList.remove('hidden');

    loadItems();
}

function switchSettingsTab(tabName, buttonElement) {
    document
        .querySelectorAll('.settings-panel-section')
        .forEach(section => section.classList.add('hidden'));

    document
        .querySelectorAll('.settings-nav-item')
        .forEach(button => button.classList.remove('active'));

    const section = document.getElementById(`settings-tab-${tabName}`);
    if (section) section.classList.remove('hidden');
    if (buttonElement) buttonElement.classList.add('active');

    if (
        tabName === 'administration' &&
        currentUser &&
        currentUser.is_superuser
    ) {
        resetGroupForm();
        resetUserForm();
        loadGroupsToSelects();
        loadGroupsList();
        loadUsersList();
    }
}

// Panel lateral
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
        resetItemForm();

        panelTitle.innerText =
            t('create_item', 'Crear ítem');

        itemForm.classList.remove('hidden');

        await loadCategoriesToSelect();
        await loadGroupsToSelects();
        await loadTagsToSelect();
    } else if (type === 'category') {
        panelTitle.innerText =
            currentLangData.categories || 'Gestion de Categorias';
        categoryContent.classList.remove('hidden');
        resetCategoryForm();
        await loadGroupsToSelects();
        await loadCategoriesList();
    }
}

function closePanel() {
    const panel = document.getElementById('side-panel');
    panel.classList.remove('open');
    panel.classList.add('hidden');
}

function togglePanelSize() {
    const panel = document.getElementById('side-panel');
    const button = document.getElementById('btn-expand-panel');
    const expanded = panel.classList.toggle('expanded');

    button.innerText = expanded
        ? currentLangData.collapse || 'Reducir'
        : currentLangData.expand || 'Ampliar';
}

// Grupos
async function loadGroupsToSelects() {
    try {
        const response = await fetch('/api/groups');

        if (!response.ok) {
            await handleApiFailure(response, 'No se pudieron cargar los grupos');
            return;
        }

        const groups = await readApiResponse(response);
        const selectIds = ['item-group', 'cat-group', 'new-user-group'];

        selectIds.forEach(selectId => {
            const select = document.getElementById(selectId);
            if (!select) return;

            const currentValue = select.value;
            select.innerHTML = '';

            const emptyOption = document.createElement('option');
            emptyOption.value = '';
            emptyOption.textContent =
                currentLangData.public_none || '(Ninguno / Publico)';
            select.appendChild(emptyOption);

            groups.forEach(group => {
                const option = document.createElement('option');
                option.value = String(group.id);
                option.textContent = group.name;
                select.appendChild(option);
            });

            const valueStillExists = Array.from(select.options).some(
                option => option.value === currentValue
            );
            select.value = valueStillExists ? currentValue : '';
        });
    } catch (error) {
        console.error('Error cargando grupos:', error);
    }
}

async function loadItemFilters() {
    const categoryFilter = document.getElementById('filter-category');
    const groupFilter = document.getElementById('filter-group');
    if (!categoryFilter || !groupFilter) return;

    try {
        const [categoriesResponse, groupsResponse] = await Promise.all([
            fetch('/api/categories'),
            fetch('/api/groups')
        ]);
        const categories = categoriesResponse.ok
            ? await readApiResponse(categoriesResponse)
            : [];
        const groups = groupsResponse.ok
            ? await readApiResponse(groupsResponse)
            : [];
        const categoryValue = categoryFilter.value;
        const groupValue = groupFilter.value;

        categoryFilter.innerHTML = `<option value="">${escapeHtml(currentLangData.all_categories || 'Todas las categorias')}</option>`;
        groupsFilterOptions(groupFilter, groups, currentLangData.all_groups || 'Todos los grupos');
        categories.forEach(category => categoryFilter.add(new Option(category.name, category.id)));
        categoryFilter.value = categoryValue;
        groupFilter.value = groupValue;
    } catch (error) {
        console.error('Error cargando filtros:', error);
    }
}

function groupsFilterOptions(select, groups, emptyLabel) {
    select.innerHTML = `<option value="">${escapeHtml(emptyLabel)}</option>`;
    groups.forEach(group => select.add(new Option(group.name, group.id)));
}

async function loadGroupsList() {
    const list = document.getElementById('groups-list');
    if (!list) return;

    try {
        const response = await fetch('/api/groups');

        if (!response.ok) {
            await handleApiFailure(response, 'No se pudieron cargar los grupos');
            return;
        }

        const groups = await readApiResponse(response);

        if (groups.length === 0) {
            list.innerHTML = `
                <p style="color: var(--text-muted); margin: 0;">
                    No hay grupos registrados.
                </p>
            `;
            return;
        }

        list.innerHTML = groups.map(group => `
            <div style="background: var(--bg-color); padding: 0.75rem;
                border-radius: var(--radius); border: 1px solid var(--border-color);
                display: flex; justify-content: space-between; align-items: center;
                gap: 10px;">
                <div>
                    <strong>${escapeHtml(group.name)}</strong>
                    <div style="margin-top: 4px; font-size: 0.8rem;
                        color: var(--text-muted);">
                        Usuarios: ${Number(group.user_count) || 0}
                        · Categorias: ${Number(group.category_count) || 0}
                        · Items: ${Number(group.item_count) || 0}
                    </div>
                </div>
                <div style="display: flex; gap: 5px;">
                    <button
                        type="button"
                        data-action="edit-group"
                        data-id="${group.id}"
                        data-name="${escapeAttribute(group.name)}"
                        style="padding: 4px 8px; font-size: 0.75rem;
                            background: var(--border-color); color: var(--text-color);
                            border: none; border-radius: 4px; cursor: pointer;">
                        Editar
                    </button>
                    <button
                        type="button"
                        data-action="delete-group"
                        data-id="${group.id}"
                        data-users="${Number(group.user_count) || 0}"
                        data-categories="${Number(group.category_count) || 0}"
                        data-items="${Number(group.item_count) || 0}"
                        style="padding: 4px 8px; font-size: 0.75rem;
                            background: var(--danger); color: white; border: none;
                            border-radius: 4px; cursor: pointer;">
                        Eliminar
                    </button>
                </div>
            </div>
        `).join('');

        list.querySelectorAll('[data-action="edit-group"]').forEach(button => {
            button.addEventListener('click', () => {
                editGroup(Number(button.dataset.id), button.dataset.name);
            });
        });

        list.querySelectorAll('[data-action="delete-group"]').forEach(button => {
            button.addEventListener('click', () => {
                deleteGroup(
                    Number(button.dataset.id),
                    Number(button.dataset.users),
                    Number(button.dataset.categories),
                    Number(button.dataset.items)
                );
            });
        });
    } catch (error) {
        console.error('Error cargando la lista de grupos:', error);
        alert('No se pudo conectar con el servidor');
    }
}

function editGroup(id, name) {
    document.getElementById('edit-group-id').value = String(id);
    document.getElementById('new-group-name').value = name;
    document.getElementById('group-form-title').innerText = 'Editar Grupo';
    document.getElementById('btn-save-group').innerText = 'Guardar Cambios';
    document.getElementById('btn-cancel-group').classList.remove('hidden');
}

function resetGroupForm() {
    const editId = document.getElementById('edit-group-id');
    if (!editId) return;

    editId.value = '';
    document.getElementById('new-group-name').value = '';
    document.getElementById('group-form-title').innerText = 'Nuevo Grupo';
    document.getElementById('btn-save-group').innerText = 'Crear Grupo';
    document.getElementById('btn-cancel-group').classList.add('hidden');
}

async function saveGroup() {
    const editId = document.getElementById('edit-group-id').value;
    const name = document.getElementById('new-group-name').value.trim();

    if (!name) {
        alert('Introduce un nombre para el grupo');
        return;
    }

    const url = editId ? `/api/groups/${editId}` : '/api/groups';
    const method = editId ? 'PUT' : 'POST';

    try {
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });

        if (!response.ok) {
            await handleApiFailure(response, 'No se pudo guardar el grupo');
            return;
        }

        resetGroupForm();
        await Promise.all([loadGroupsList(), loadGroupsToSelects()]);
    } catch (error) {
        console.error('Error guardando el grupo:', error);
        alert('No se pudo conectar con el servidor');
    }
}

async function deleteGroup(id, userCount, categoryCount, itemCount) {
    const message = [
        '¿Seguro que deseas eliminar este grupo?',
        '',
        `Usuarios asignados: ${userCount}`,
        `Categorias asociadas: ${categoryCount}`,
        `Items asociados: ${itemCount}`,
        '',
        'Los registros no se eliminaran.',
        'Quedaran sin grupo asignado.'
    ].join('\n');

    if (!confirm(message)) return;

    try {
        const response = await fetch(`/api/groups/${id}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            await handleApiFailure(response, 'No se pudo eliminar el grupo');
            return;
        }

        resetGroupForm();
        await Promise.all([
            loadGroupsList(),
            loadGroupsToSelects(),
            loadUsersList(),
            loadCategoriesList(),
            loadItems()
        ]);
    } catch (error) {
        console.error('Error eliminando el grupo:', error);
        alert('No se pudo conectar con el servidor');
    }
}

// Categorias
async function loadCategoriesToSelect() {
    const select = document.getElementById('item-category');
    if (!select) return;

    try {
        const response = await fetch('/api/categories');

        if (!response.ok) {
            await handleApiFailure(
                response,
                'No se pudieron cargar las categorias'
            );
            return;
        }

        const categories = await readApiResponse(response);
        const currentValue = select.value;
        select.innerHTML = '';

        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.disabled = true;
        placeholder.textContent =
            currentLangData.category || 'Selecciona categoria';
        select.appendChild(placeholder);

        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = String(category.id);
            option.textContent = category.name;
            select.appendChild(option);
        });

        const valueStillExists = Array.from(select.options).some(
            option => option.value === currentValue
        );
        select.value = valueStillExists ? currentValue : '';
    } catch (error) {
        console.error('Error cargando categorias:', error);
    }
}

async function loadCategoriesList() {
    const list = document.getElementById('categories-list');
    if (!list) return;

    try {
        const response = await fetch('/api/categories');

        if (!response.ok) {
            await handleApiFailure(
                response,
                'No se pudieron cargar las categorias'
            );
            return;
        }

        const categories = await readApiResponse(response);

        if (categories.length === 0) {
            list.innerHTML = `
                <p style="color: var(--text-muted); font-size: 0.85rem; margin: 0;">
                    Sin categorias.
                </p>
            `;
            return;
        }

        list.innerHTML = categories.map(category => `
            <div style="background: var(--bg-color); padding: 0.75rem;
                border-radius: var(--radius); border: 1px solid var(--border-color);
                display: flex; justify-content: space-between; align-items: center;
                gap: 10px;">
                <div>
                    <strong>${escapeHtml(category.name)}</strong>
                    <div style="margin-top: 4px; color: var(--text-muted);
                        font-size: 0.8rem;">
                        Grupo: ${escapeHtml(category.group_name || 'Ninguno')}
                        · Items: ${Number(category.item_count) || 0}
                    </div>
                </div>
                <div style="display: flex; gap: 5px;">
                    <button
                        type="button"
                        data-action="edit-category"
                        data-id="${category.id}"
                        data-name="${escapeAttribute(category.name)}"
                        data-group-id="${category.group_id ?? ''}"
                        style="padding: 4px 8px; font-size: 0.75rem;
                            background: var(--border-color); color: var(--text-color);
                            border: none; border-radius: 4px; cursor: pointer;">
                        Editar
                    </button>
                    <button
                        type="button"
                        data-action="delete-category"
                        data-id="${category.id}"
                        data-items="${Number(category.item_count) || 0}"
                        style="padding: 4px 8px; font-size: 0.75rem;
                            background: var(--danger); color: white; border: none;
                            border-radius: 4px; cursor: pointer;">
                        Eliminar
                    </button>
                </div>
            </div>
        `).join('');

        list.querySelectorAll('[data-action="edit-category"]').forEach(button => {
            button.addEventListener('click', () => {
                editCategory(
                    Number(button.dataset.id),
                    button.dataset.name,
                    button.dataset.groupId || null
                );
            });
        });

        list.querySelectorAll('[data-action="delete-category"]').forEach(button => {
            button.addEventListener('click', () => {
                deleteCategory(
                    Number(button.dataset.id),
                    Number(button.dataset.items)
                );
            });
        });
    } catch (error) {
        console.error('Error cargando la lista de categorias:', error);
        alert('No se pudo conectar con el servidor');
    }
}

function editCategory(id, name, groupId) {
    document.getElementById('edit-category-id').value = String(id);
    document.getElementById('cat-name').value = name;
    document.getElementById('cat-group').value = groupId
        ? String(groupId)
        : '';
    document.getElementById('txt-new-category-title').innerText =
        'Editar Categoria';
    document.getElementById('btn-create-cat').innerText = 'Guardar Cambios';
    document.getElementById('btn-cancel-category').classList.remove('hidden');
}

function resetCategoryForm() {
    const editId = document.getElementById('edit-category-id');
    if (!editId) return;

    editId.value = '';
    document.getElementById('cat-name').value = '';
    document.getElementById('cat-group').value = '';
    document.getElementById('txt-new-category-title').innerText =
        t('new_category', 'Nueva categoría');
    document.getElementById('btn-create-cat').innerText = 'Crear Categoria';
    document.getElementById('btn-cancel-category').classList.add('hidden');
}

async function saveCategory() {
    const editId = document.getElementById('edit-category-id').value;
    const name = document.getElementById('cat-name').value.trim();
    const groupId = document.getElementById('cat-group').value;

    if (!name) {
        alert('Introduce un nombre');
        return;
    }

    const url = editId
        ? `/api/categories/${editId}`
        : '/api/categories';
    const method = editId ? 'PUT' : 'POST';

    try {
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                group_id: groupId || null
            })
        });

        if (!response.ok) {
            await handleApiFailure(
                response,
                'No se pudo guardar la categoria'
            );
            return;
        }

        resetCategoryForm();
        await Promise.all([
            loadCategoriesList(),
            loadCategoriesToSelect(),
            loadGroupsList()
        ]);
    } catch (error) {
        console.error('Error guardando la categoria:', error);
        alert('No se pudo conectar con el servidor');
    }
}

async function deleteCategory(id, itemCount) {
    const message = [
        '¿Seguro que deseas eliminar esta categoria?',
        '',
        `Items asignados: ${itemCount}`,
        '',
        'Los items no se eliminaran.',
        'Quedaran sin categoria asignada.'
    ].join('\n');

    if (!confirm(message)) return;

    try {
        const response = await fetch(`/api/categories/${id}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            await handleApiFailure(
                response,
                'No se pudo eliminar la categoria'
            );
            return;
        }

        resetCategoryForm();
        await Promise.all([
            loadCategoriesList(),
            loadCategoriesToSelect(),
            loadGroupsList(),
            loadItems()
        ]);
    } catch (error) {
        console.error('Error eliminando la categoria:', error);
        alert('No se pudo conectar con el servidor');
    }
}

// Usuarios
async function loadUsersList() {
    const list = document.getElementById('users-list');
    if (!list) return;

    try {
        const response = await fetch('/api/users');

        if (!response.ok) {
            await handleApiFailure(
                response,
                'No se pudieron cargar los usuarios'
            );
            return;
        }

        const users = await readApiResponse(response);

        if (users.length === 0) {
            list.innerHTML = `
                <p style="color: var(--text-muted); margin: 0;">
                    No hay usuarios registrados.
                </p>
            `;
            return;
        }

        list.innerHTML = users.map(user => `
            <div style="background: var(--bg-color); padding: 0.75rem;
                border-radius: var(--radius); border: 1px solid var(--border-color);
                display: flex; justify-content: space-between; align-items: center;
                gap: 10px;">
                <div>
                    <strong>${escapeHtml(user.username)}</strong>
                    <span style="font-size: 0.8rem; color: var(--text-muted);">
                        (${escapeHtml(user.group_name || 'Sin grupo')})
                    </span>
                    ${user.is_superuser ? '<b>[Super]</b>' : ''}
                </div>
                <div style="display: flex; gap: 5px;">
                    <button
                        type="button"
                        data-action="edit-user"
                        data-id="${user.id}"
                        data-username="${escapeAttribute(user.username)}"
                        data-group-id="${user.group_id ?? ''}"
                        style="padding: 4px 8px; font-size: 0.75rem;
                            background: var(--border-color); color: var(--text-color);
                            border: none; border-radius: 4px; cursor: pointer;">
                        ${currentLangData.edit || 'Editar'}
                    </button>
                    ${user.is_superuser ? '' : `
                        <button
                            type="button"
                            data-action="delete-user"
                            data-id="${user.id}"
                            style="padding: 4px 8px; font-size: 0.75rem;
                                background: var(--danger); color: white; border: none;
                                border-radius: 4px; cursor: pointer;">
                            ${currentLangData.delete || 'Eliminar'}
                        </button>
                    `}
                </div>
            </div>
        `).join('');

        list.querySelectorAll('[data-action="edit-user"]').forEach(button => {
            button.addEventListener('click', () => {
                editUser(
                    Number(button.dataset.id),
                    button.dataset.username,
                    button.dataset.groupId || null
                );
            });
        });

        list.querySelectorAll('[data-action="delete-user"]').forEach(button => {
            button.addEventListener('click', () => {
                deleteUser(Number(button.dataset.id));
            });
        });
    } catch (error) {
        console.error('Error cargando usuarios:', error);
        alert('No se pudo conectar con el servidor');
    }
}

function editUser(id, username, groupId) {
    document.getElementById('edit-user-id').value = String(id);
    document.getElementById('new-user-name').value = username;
    document.getElementById('new-user-pass').value = '';
    document.getElementById('new-user-group').value = groupId
        ? String(groupId)
        : '';
    document.getElementById('user-form-title').innerText = 'Editar Usuario';
    document.getElementById('btn-save-user').innerText = 'Guardar Cambios';
    document.getElementById('btn-cancel-user').classList.remove('hidden');
}

function resetUserForm() {
    const editId = document.getElementById('edit-user-id');
    if (!editId) return;

    editId.value = '';
    document.getElementById('new-user-name').value = '';
    document.getElementById('new-user-pass').value = '';
    document.getElementById('new-user-group').value = '';
    document.getElementById('user-form-title').innerText = 'Nuevo Usuario';
    document.getElementById('btn-save-user').innerText = 'Crear Usuario';
    document.getElementById('btn-cancel-user').classList.add('hidden');
}

async function saveUser() {
    const editId = document.getElementById('edit-user-id').value;
    const username = document.getElementById('new-user-name').value.trim();
    const password = document.getElementById('new-user-pass').value;
    const groupId = document.getElementById('new-user-group').value;

    if (!username) {
        alert('Introduce un nombre de usuario');
        return;
    }

    const url = editId ? `/api/users/${editId}` : '/api/users';
    const method = editId ? 'PUT' : 'POST';

    try {
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username,
                password,
                group_id: groupId || null
            })
        });

        if (!response.ok) {
            await handleApiFailure(
                response,
                'No se pudo guardar el usuario'
            );
            return;
        }

        resetUserForm();
        await Promise.all([loadUsersList(), loadGroupsList()]);
    } catch (error) {
        console.error('Error guardando el usuario:', error);
        alert('No se pudo conectar con el servidor');
    }
}

async function deleteUser(id) {
    if (!confirm('¿Seguro que deseas eliminar este usuario?')) return;

    try {
        const response = await fetch(`/api/users/${id}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            await handleApiFailure(
                response,
                'No se pudo eliminar el usuario'
            );
            return;
        }

        await Promise.all([loadUsersList(), loadGroupsList()]);
    } catch (error) {
        console.error('Error eliminando el usuario:', error);
        alert('No se pudo conectar con el servidor');
    }
}

async function loadTagsToSelect(selectedTags = []) {
    const list = document.getElementById('item-tags-list');
    if (!list) return;

    try {
        const response = await fetch('/api/tags');
        if (!response.ok) {
            await handleApiFailure(response, 'No se pudieron cargar las etiquetas');
            return;
        }

        availableTags = await readApiResponse(response);
        selectedTagNames = selectedTags.map(tag => tag.trim()).filter(Boolean);
        renderSelectedTags();
        renderTagSuggestions();
    } catch (error) {
        console.error('Error cargando etiquetas:', error);
    }
}

function getSelectedTags() {
    return [...selectedTagNames];
}

function renderSelectedTags() {
    const selected = document.getElementById('selected-tags');
    if (!selected) return;
    selected.innerHTML = selectedTagNames.map(tag => `
        <span class="tag-badge">${escapeHtml(tag)}
            <button type="button" aria-label="${escapeAttribute(`${t('remove_tag', 'Quitar etiqueta')} ${tag}`)}" onclick="removeSelectedTag('${escapeAttribute(tag)}')">×</button>
        </span>
    `).join('');
}

function renderTagSuggestions() {
    const list = document.getElementById('item-tags-list');
    const input = document.getElementById('tag-search');
    if (!list || !input) return;
    const query = input.value.trim().toLowerCase();
    const selected = new Set(selectedTagNames.map(tag => tag.toLowerCase()));
    const matches = availableTags.filter(tag => !selected.has(tag.name.toLowerCase()) && (!query || tag.name.toLowerCase().includes(query)));
    list.innerHTML = matches.map(tag => `<button type="button" class="tag-suggestion" onclick="selectTag('${escapeAttribute(tag.name)}')">${escapeHtml(tag.name)}</button>`).join('');
    const isFocused = document.activeElement === input;
    list.classList.toggle('hidden', !isFocused || !matches.length);
}

function selectTag(name) {
    if (!selectedTagNames.some(tag => tag.toLowerCase() === name.toLowerCase())) selectedTagNames.push(name);
    document.getElementById('tag-search').value = '';
    renderSelectedTags();
    renderTagSuggestions();
}

function removeSelectedTag(name) {
    selectedTagNames = selectedTagNames.filter(tag => tag.toLowerCase() !== name.toLowerCase());
    renderSelectedTags();
    renderTagSuggestions();
}

function setupTagPicker() {
    const input = document.getElementById('tag-search');
    const list = document.getElementById('item-tags-list');
    if (!input || !list || input.dataset.ready) return;
    input.dataset.ready = 'true';
    input.addEventListener('input', renderTagSuggestions);
    input.addEventListener('focus', renderTagSuggestions);
    input.addEventListener('blur', () => {
        setTimeout(() => list.classList.add('hidden'), 150);
    });
    input.addEventListener('keydown', event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const query = input.value.trim();
        const match = availableTags.find(tag => tag.name.toLowerCase() === query.toLowerCase());
        if (match) selectTag(match.name);
        else if (query) createTag(query);
    });
}

async function createTag() {
    const tagSearch = document.getElementById('tag-search');
    const name = tagSearch?.value.trim() || '';
    if (!name) return;

    try {
        const response = await fetch('/api/tags', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });

        if (!response.ok) {
            await handleApiFailure(response, 'No se pudo crear la etiqueta');
            return;
        }

        const data = await readApiResponse(response);
        if (tagSearch) tagSearch.value = '';
        await loadTagsToSelect([...getSelectedTags(), data.tag.name]);
    } catch (error) {
        console.error('Error creando etiqueta:', error);
        alert('No se pudo conectar con el servidor');
    }
}

// Items
async function loadItems() {
    const searchElement = document.getElementById('search-bar');
    const container = document.getElementById('items-container');

    if (!searchElement || !container || !currentUser) return;

    const search = searchElement.value;
    const categoryFilter = document.getElementById('filter-category')?.value || '';
    const groupFilter = document.getElementById('filter-group')?.value || '';
    const query = new URLSearchParams({ search });
    if (categoryFilter) query.set('category_id', categoryFilter);
    if (groupFilter) query.set('group_id', groupFilter);

    try {
        const response = await fetch(
            `/api/items?${query.toString()}`
        );

        if (!response.ok) {
            await handleApiFailure(
                response,
                'No se pudieron cargar los items'
            );
            return;
        }

        const items = await readApiResponse(response);

        currentItems = Array.isArray(items)
            ? items
            : [];

        container.innerHTML = '';

        if (currentItems.length === 0) {
            container.innerHTML = `
        <div class="empty-state">
            <div class="empty-state__icon">□</div>
            <h3>Sin ítems</h3>
            <p>
                ${currentLangData.no_items || 'No hay ítems registrados.'}
            </p>
        </div>
    `;
            return;
        }

        if (viewMode === 'grid') {
            renderItemsGrid(container, currentItems);
        } else {
            renderItemsTable(container, currentItems);
        }
    } catch (error) {
        console.error('Error cargando items:', error);
        container.innerHTML = `
            <p style="color: var(--danger);">
                No se pudieron cargar los items.
            </p>
        `;
    }
}

function renderItemsGrid(container, items) {
    const grid = document.createElement('div');
    grid.className = 'items-grid';

    items.forEach(item => {
        const card = document.createElement('article');
        card.className = 'item-card';

        const tags = String(item.tags || '')
            .split(',')
            .map(tag => tag.trim())
            .filter(Boolean);

        card.innerHTML = `
            <div class="item-card__visual">
                ${item.first_photo_id
        ? `<img class="item-card__image" src="/api/items/${item.id}/photos/${item.first_photo_id}" alt="${escapeAttribute(item.name)}">`
        : `<div class="item-placeholder">
                    ${escapeHtml(
            String(item.name || '?')
                .charAt(0)
                .toUpperCase()
        )}
                </div>`}
                
            </div>

            <div class="item-card__body">
                <div class="item-card__heading">
                    <h3>${escapeHtml(item.name)}</h3>

                    <span class="quantity-badge">
                        ${Number(item.quantity)} ${t('units', 'uds.')}
                    </span>
                </div>

                <p class="item-description">
                    ${escapeHtml(
            item.description || t('no_description', 'Sin descripción')
        )}
                </p>

                <div class="chip-row">
                    <span class="chip chip-accent">
                        ${escapeHtml(
            item.category_name || t('no_category', 'Sin categoría')
        )}
                    </span>

                    <span class="chip">
                        ${escapeHtml(
            item.group_name || t('public', 'Público')
        )}
                    </span>

                    ${tags.map(tag => `
                        <span class="chip">
                            ${escapeHtml(tag)}
                        </span>
                    `).join('')}
                </div>

                ${item.barcode_value ? `<div class="code-line"><span>${currentLangData.code || 'Codigo'}</span><code>${escapeHtml(item.barcode_value)}</code></div>` : ''}

                <div class="item-card__footer">
                    <small>
                        ${t('modified_by_label', 'Modificado por')}
                        ${escapeHtml(
            item.modified_by ||
            item.created_by ||
            '-'
        )}
                        ·
                        ${formatDate(
            item.modified_at ||
            item.created_at
        )}
                    </small>

                    <div class="item-actions">
                        <button type="button" class="icon-button" data-action="edit-item"
                            data-id="${item.id}" aria-label="${escapeAttribute(
            currentLangData.edit || 'Editar'
        )}" title="${escapeAttribute(currentLangData.edit || 'Editar')}">
                            ✎
                        </button>

                        <button type="button" class="icon-button danger" data-action="delete-item"
                            data-id="${item.id}" aria-label="${escapeAttribute(
            currentLangData.delete || 'Eliminar'
        )}" title="${escapeAttribute(currentLangData.delete || 'Eliminar')}">
                            ✕
                        </button>
                    </div>
                </div>
            </div>
        `;

        grid.appendChild(card);
    });

    grid
        .querySelectorAll('[data-action="edit-item"]')
        .forEach(button => {
            button.addEventListener('click', () => {
                editItem(Number(button.dataset.id));
            });
        });

    grid
        .querySelectorAll('[data-action="delete-item"]')
        .forEach(button => {
            button.addEventListener('click', () => {
                deleteItem(Number(button.dataset.id));
            });
        });

    container.appendChild(grid);
}

function renderItemsTable(container, items) {
    const wrapper = document.createElement('div');
    wrapper.className = 'data-table-card';

    const table = document.createElement('table');
    table.className = 'items-table';

    table.innerHTML = `
        <thead>
            <tr>
                <th>Ítem</th>
                <th>Cantidad</th>
                <th>Categoría</th>
                <th>Grupo</th>
                <th>Creado por</th>
                <th>Modificado</th>
                <th>Acciones</th>
            </tr>
        </thead>

        <tbody>
            ${items.map(item => `
                <tr>
                    <td>
                        <div class="table-item">
                            <div class="table-thumb">
                                ${escapeHtml(
        String(item.name || '?')
            .charAt(0)
            .toUpperCase()
    )}
                            </div>

                            <div>
                                <strong>
                                    ${escapeHtml(item.name)}
                                </strong>

                                <small>
                                    ${escapeHtml(
                        item.description ||
        t('no_description', 'Sin descripción')
    )}
                                </small>
                            </div>
                        </div>
                    </td>

                    <td>
                        <span class="quantity-badge">
                            ${Number(item.quantity)}
                        </span>
                    </td>

                    <td>
                        ${escapeHtml(
        item.category_name || t('no_category', 'Sin categoría')
    )}
                    </td>

                    <td>
                        ${escapeHtml(
        item.group_name || t('public', 'Público')
    )}
                    </td>

                    <td>
                        ${escapeHtml(item.created_by || '-')}
                    </td>

                    <td>
                        ${formatDate(
        item.modified_at ||
        item.created_at
    )}
                    </td>

                    <td>
                        <div class="row-actions">
                            <button type="button" class="btn btn-secondary btn-small"
                                data-action="edit-item" data-id="${item.id}">
                                ${currentLangData.edit || 'Editar'}
                            </button>

                            <button type="button" class="btn btn-danger btn-small"
                                data-action="delete-item" data-id="${item.id}">
                                ${currentLangData.delete || 'Eliminar'}
                            </button>
                        </div>
                    </td>
                </tr>
            `).join('')}
        </tbody>
    `;

    wrapper.appendChild(table);
    container.appendChild(wrapper);

    wrapper
        .querySelectorAll('[data-action="edit-item"]')
        .forEach(button => {
            button.addEventListener('click', () => {
                editItem(Number(button.dataset.id));
            });
        });

    wrapper
        .querySelectorAll('[data-action="delete-item"]')
        .forEach(button => {
            button.addEventListener('click', () => {
                deleteItem(Number(button.dataset.id));
            });
        });
}

async function editItem(itemId) {
    const item = currentItems.find(
        currentItem => Number(currentItem.id) === Number(itemId)
    );

    if (!item) {
        alert('No se ha podido localizar el ítem');
        return;
    }

    await togglePanel('item');

    document.getElementById('edit-item-id').value =
        String(item.id);

    document.getElementById('item-name').value =
        item.name || '';

    document.getElementById('item-desc').value =
        item.description || '';

    document.getElementById('item-qty').value =
        Number.isInteger(Number(item.quantity))
            ? String(item.quantity)
            : '1';

    document.getElementById('item-category').value =
        item.category_id
            ? String(item.category_id)
            : '';

    document.getElementById('item-group').value =
        item.group_id
            ? String(item.group_id)
            : '';

    document.getElementById('item-barcode').value =
        item.barcode_value || '';

    document.getElementById('panel-title').innerText =
        'Editar Ítem';

    document.getElementById('item-form-title').innerText =
        'Editar Ítem';

    document.getElementById('btn-save-item').innerText =
        'Guardar Cambios';

    document
        .getElementById('btn-cancel-item')
        .classList
        .remove('hidden');

    await loadTagsToSelect(String(item.tags || '').split(',').filter(Boolean));
    await loadExistingItemPhotos(item.id);
}

async function loadExistingItemPhotos(itemId) {
    const section = document.getElementById('item-existing-media');
    const gallery = document.getElementById('item-existing-photos');

    if (!section || !gallery) return;

    gallery.innerHTML = '<span class="text-muted">Cargando...</span>';
    section.classList.remove('hidden');

    try {
        const response = await fetch(`/api/items/${itemId}/photos`);
        if (!response.ok) {
            gallery.innerHTML = '<span class="text-danger">No se pudieron cargar las fotos.</span>';
            return;
        }

        const photos = await readApiResponse(response);
        gallery.innerHTML = photos.length
            ? photos.map(photo => `
                <div class="photo-preview-item">
                    <img src="${escapeAttribute(photo.url)}" alt="${escapeAttribute(photo.filename)}">
                    <button type="button" class="icon-button danger" data-photo-id="${photo.id}"
                        aria-label="${escapeAttribute(currentLangData.delete || 'Eliminar')}">✕</button>
                </div>
            `).join('')
            : `<span class="text-muted">${currentLangData.no_photos || 'Este articulo no tiene fotos.'}</span>`;

        gallery.querySelectorAll('[data-photo-id]').forEach(button => {
            button.addEventListener('click', () => {
                deleteItemPhoto(itemId, Number(button.dataset.photoId));
            });
        });
    } catch (error) {
        console.error('Error cargando fotos existentes:', error);
        gallery.innerHTML = '<span class="text-danger">No se pudieron cargar las fotos.</span>';
    }
}

async function deleteItemPhoto(itemId, photoId) {
    if (!confirm(currentLangData.confirm_delete_photo || '¿Eliminar esta foto?')) return;

    try {
        const response = await fetch(`/api/items/${itemId}/photos/${photoId}`, {
            method: 'DELETE'
        });
        if (!response.ok) {
            await handleApiFailure(response, 'No se pudo eliminar la foto');
            return;
        }
        await loadExistingItemPhotos(itemId);
        await loadItems();
    } catch (error) {
        console.error('Error eliminando foto:', error);
        alert('No se pudo conectar con el servidor');
    }
}

function resetItemForm() {
    const form = document.getElementById('item-form');

    if (!form) {
        return;
    }

    form.reset();

    document.getElementById('edit-item-id').value = '';
    document.getElementById('item-qty').value = '1';
    document.getElementById('item-barcode').value = '';
    selectedTagNames = [];
    renderSelectedTags();
    document.getElementById('item-tags-list').innerHTML = '';
    document.getElementById('item-photos').value = '';
    document.getElementById('item-photo-preview').innerHTML = '';
    document.getElementById('item-existing-media').classList.add('hidden');
    document.getElementById('item-existing-photos').innerHTML = '';
    const existingPhotoCount = document.getElementById('item-existing-photo-count');
    if (existingPhotoCount) existingPhotoCount.innerText = '';

    document.getElementById('panel-title').innerText =
        t('create_item', 'Crear ítem');

    document.getElementById('item-form-title').innerText =
        t('new_item', 'Nuevo ítem');

    document.getElementById('btn-save-item').innerText =
        t('create_item', 'Crear ítem');

    document
        .getElementById('btn-cancel-item')
        .classList
        .add('hidden');
}

async function saveItem(event) {
    event.preventDefault();

    const editId =
        document.getElementById('edit-item-id').value;

    const name =
        document.getElementById('item-name').value.trim();

    const description =
        document.getElementById('item-desc').value.trim();

    const quantity =
        document.getElementById('item-qty').value;

    const categoryId =
        document.getElementById('item-category').value;

    const groupId =
        document.getElementById('item-group').value;

    const tagNames = getSelectedTags();

    const barcodeValue =
        document.getElementById('item-barcode').value.trim();

    const photoInput = document.getElementById('item-photos');

    if (!name) {
        alert('Introduce un nombre para el ítem');
        return;
    }

    const url = editId
        ? `/api/items/${editId}`
        : '/api/items';

    const method = editId ? 'PUT' : 'POST';

    try {
        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name,
                description,
                quantity,
                category_id: categoryId || null,
                group_id: groupId || null,
                tag_names: tagNames,
                barcode_value: barcodeValue
            })
        });

        if (!response.ok) {
            await handleApiFailure(
                response,
                editId
                    ? 'No se pudo actualizar el ítem'
                    : 'No se pudo crear el ítem'
            );
            return;
        }

        const savedItem = await response.json();
        const itemId = editId || savedItem.item.id;

        if (photoInput.files.length > 0) {
            await uploadItemPhotos(itemId, photoInput.files);
        }

        resetItemForm();
        closePanel();

        await Promise.all([
            loadItems(),
            loadCategoriesList(),
            loadGroupsList()
        ]);
    } catch (error) {
        console.error('Error guardando el ítem:', error);
        alert('No se pudo conectar con el servidor');
    }
}

async function uploadItemPhotos(itemId, files) {
    const formData = new FormData();
    Array.from(files).forEach(file => formData.append('photos', file));

    const response = await fetch(`/api/items/${itemId}/photos`, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        await handleApiFailure(response, 'No se pudieron guardar las fotos');
        throw new Error('No se pudieron guardar las fotos');
    }
}

async function deleteItem(itemId) {
    const item = currentItems.find(
        currentItem => Number(currentItem.id) === Number(itemId)
    );

    const itemName = item
        ? item.name
        : `Ítem ${itemId}`;

    const confirmed = confirm(
        `¿Seguro que deseas eliminar "${itemName}"?\n\n` +
        'Esta operación no se puede deshacer.'
    );

    if (!confirmed) {
        return;
    }

    try {
        const response = await fetch(
            `/api/items/${itemId}`,
            {
                method: 'DELETE'
            }
        );

        if (!response.ok) {
            await handleApiFailure(
                response,
                'No se pudo eliminar el ítem'
            );
            return;
        }

        const editingId =
            document.getElementById('edit-item-id').value;

        if (Number(editingId) === Number(itemId)) {
            resetItemForm();
            closePanel();
        }

        await Promise.all([
            loadItems(),
            loadCategoriesList(),
            loadGroupsList()
        ]);
    } catch (error) {
        console.error('Error eliminando el ítem:', error);
        alert('No se pudo conectar con el servidor');
    }
}

// Formato y seguridad de salida
function previewItemPhotos(files) {
    const preview = document.getElementById('item-photo-preview');
    preview.innerHTML = '';

    Array.from(files).forEach(file => {
        const image = document.createElement('img');
        image.alt = file.name;
        image.src = URL.createObjectURL(file);
        image.onload = () => URL.revokeObjectURL(image.src);
        preview.appendChild(image);
    });
}

async function scanItemCode() {
    if (!window.ZXingBrowser?.BrowserMultiFormatReader) {
        const manualValue = prompt(
            currentLangData.barcode_prompt ||
            'No se ha podido cargar el lector. Introduce el valor:'
        );
        if (manualValue) document.getElementById('item-barcode').value = manualValue.trim();
        return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
        document.getElementById('barcode-camera-input').click();
        return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'scanner-overlay';
    overlay.innerHTML = `
        <div class="scanner-dialog">
            <video autoplay playsinline></video>
            <p>${escapeHtml(currentLangData.scan_hint || 'Apunta la camara al codigo')}</p>
            <button type="button" class="btn btn-secondary">${escapeHtml(currentLangData.cancel || 'Cancelar')}</button>
        </div>
    `;
    document.body.appendChild(overlay);

    const video = overlay.querySelector('video');
    const reader = new ZXingBrowser.BrowserMultiFormatReader(
        new Map([[3, true]])
    );
    let controls = null;

    const closeScanner = () => {
        controls?.stop();
        scannerStream?.getTracks().forEach(track => track.stop());
        scannerStream = null;
        overlay.remove();
    };

    overlay.querySelector('button').addEventListener('click', closeScanner);

    try {
        controls = await reader.decodeFromConstraints(
            {
                video: { facingMode: { ideal: 'environment' } },
                audio: false
            },
            video,
            (result, error) => {
                if (!result) return;
                document.getElementById('item-barcode').value = result.getText();
                closeScanner();
            }
        );
    } catch (error) {
        closeScanner();
        document.getElementById('barcode-camera-input').click();
    }
}

async function decodeBarcodeImage(file) {
    if (!file || !window.ZXingBrowser?.BrowserMultiFormatReader) return;

    const url = URL.createObjectURL(file);
    try {
        const reader = new ZXingBrowser.BrowserMultiFormatReader(
            new Map([[3, true]])
        );
        const image = new Image();
        image.src = url;
        await new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = reject;
        });

        let result;
        try {
            result = await reader.decodeFromImageElement(image);
        } catch (imageError) {
            result = await reader.decodeFromImageUrl(url);
        }
        document.getElementById('item-barcode').value = result.getText();
    } catch (error) {
        alert(currentLangData.code_not_found || 'No se encontro ningun codigo en la imagen');
    } finally {
        URL.revokeObjectURL(url);
        document.getElementById('barcode-camera-input').value = '';
    }
}

function formatDate(isoString) {
    if (!isoString) return '-';

    const normalized = /Z$|[+-]\d\d:\d\d$/.test(isoString)
        ? isoString
        : `${isoString.replace(' ', 'T')}Z`;
    const date = new Date(normalized);

    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString();
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeAttribute(value) {
    return escapeHtml(value);
}
