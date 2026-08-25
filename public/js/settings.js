let currentUser = null;
let groupsCache = [];
let usersCache = [];
let editingGroupId = null;
let editingUserId = null;
let settingsLang = {};

document.addEventListener('DOMContentLoaded', initializeSettings);
async function api(url, options = {}) {
    const res = await fetch(url, options);
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) { window.location.replace('/login.html'); throw new Error('Sesión caducada'); }
    if (!res.ok) throw new Error(data.error || `Error HTTP ${res.status}`);
    return data;
}
async function initializeSettings() {
    try {
        const lang = localStorage.getItem('lang') || 'es-ES';
        settingsLang = await fetch(`/api/loc/${lang}`).then(response => response.json());
        document.documentElement.lang = lang;
        applySettingsLanguage();
        const session = await api('/api/session');
        currentUser = session.user;
        changeTheme(localStorage.getItem('theme') || 'light', false);
        changeAccent(localStorage.getItem('accent') || 'blue', false);
        document.getElementById('theme-select').value = localStorage.getItem('theme') || 'light';
        document.getElementById('lang-select').value = localStorage.getItem('lang') || 'es-ES';
        if (currentUser.is_superuser) document.getElementById('tab-admin').classList.remove('hidden');
    } catch (error) { console.error(error); }
}
function applySettingsLanguage() {
    const text = (key, fallback) => settingsLang[key] || fallback;
    const heading = document.querySelector('.app-header h1');
    if (heading) heading.textContent = text('settings', 'Ajustes');
    const subtitle = document.querySelector('.header-subtitle');
    if (subtitle) subtitle.textContent = text('settings_administration_desc', 'Personaliza la aplicación y administra accesos.');
    document.querySelector('.header-actions .btn')?.replaceChildren(document.createTextNode(text('back_to_inventory', 'Volver al inventario')));
    document.getElementById('settings-preferences').textContent = text('settings_preferences', 'Preferencias');
    document.getElementById('tab-appearance').textContent = text('settings_appearance', 'Aspecto');
    document.querySelector('[onclick*="language"]').textContent = text('settings_language', 'Idioma');
    document.querySelector('[onclick*="administration"]').textContent = text('settings_administration', 'Administración');
    document.getElementById('appearance-title').textContent = text('settings_appearance', 'Aspecto');
    document.getElementById('language-title').textContent = text('settings_language', 'Idioma');
    document.getElementById('admin-title').textContent = text('settings_administration', 'Administración');
    document.getElementById('theme-label').textContent = text('theme', 'Tema');
    document.getElementById('accent-label').textContent = text('accent_color', 'Color de acento');
    document.getElementById('language-label').textContent = text('language', 'Idioma de la aplicación');
    document.getElementById('admin-subtitle').textContent = text('settings_administration_desc', 'Organiza grupos y usuarios desde un único lugar.');
    document.getElementById('admin-only').textContent = text('admin_only', 'Solo superusuario');
    document.getElementById('groups-title').textContent = text('groups_existing', 'Grupos existentes');
    document.getElementById('new-group-button').textContent = `+ ${text('new_group_button', 'Nuevo grupo')}`;
    document.getElementById('users-title').textContent = text('existing_users', 'Usuarios existentes');
    document.getElementById('new-user-button').textContent = `+ ${text('new_user', 'Nuevo usuario')}`;
    document.getElementById('group-name-label').textContent = text('name', 'Nombre del grupo');
    document.getElementById('user-name-label').textContent = text('username', 'Nombre de usuario');
    document.getElementById('user-password-label').textContent = text('password', 'Contraseña');
    document.getElementById('user-group-label').textContent = text('user_group', 'Grupo asignado');
    document.getElementById('cancel-group-button').textContent = text('cancel', 'Cancelar');
    document.getElementById('cancel-user-button').textContent = text('cancel', 'Cancelar');
}
function switchTab(name, button) {
    document.querySelectorAll('.settings-panel-section').forEach(section => section.classList.add('hidden'));
    document.querySelectorAll('.settings-nav-item').forEach(tab => tab.classList.remove('active'));
    document.getElementById(`section-${name}`).classList.remove('hidden');
    button?.classList.add('active');
    if (name === 'administration') loadAdministration();
}
function changeTheme(theme, save = true) { document.body.className = theme; document.getElementById('theme-select').value = theme; if (save) localStorage.setItem('theme', theme); }
function changeAccent(accent, save = true) { document.body.setAttribute('data-accent', accent); if (save) localStorage.setItem('accent', accent); }
function changeLanguage(lang) { localStorage.setItem('lang', lang); window.location.reload(); }
async function loadAdministration() { await loadGroups(); await loadUsers(); }
async function loadGroups() {
    try {
        groupsCache = await api('/api/groups');
        const text = (key, fallback) => settingsLang[key] || fallback;
        document.getElementById('groups-list').innerHTML = groupsCache.length ? groupsCache.map(g => `<article class="management-row"><div class="management-row__main"><span class="avatar group-avatar">${escapeHtml(g.name.slice(0, 2).toUpperCase())}</span><div><strong>${escapeHtml(g.name)}</strong><small>${text('group_visibility_help', 'Grupo de visibilidad')}</small></div></div><div class="row-actions"><button class="btn btn-secondary btn-small" onclick="editGroup(${g.id})">${text('edit', 'Editar')}</button><button class="btn btn-danger btn-small" onclick="deleteGroup(${g.id})">${text('delete', 'Eliminar')}</button></div></article>`).join('') : `<p>${text('no_groups', 'Sin grupos.')}</p>`;
        const select = document.getElementById('user-group');
        const previous = select.value;
        select.innerHTML = '<option value="">(Sin grupo)</option>';
        groupsCache.forEach(group => select.add(new Option(group.name, group.id)));
        select.value = previous;
    } catch (error) { alert(error.message); }
}
function editGroup(id) {
    const group = groupsCache.find(entry => entry.id === id);
    if (!group) return;
    editingGroupId = id;
    document.getElementById('group-name').value = group.name;
    document.getElementById('group-form-title').textContent = settingsLang.edit_group || 'Editar grupo';
    document.getElementById('btn-save-group').textContent = settingsLang.save_changes || 'Guardar cambios';
    document.getElementById('group-modal').classList.remove('hidden');
}
function openGroupModal() { resetGroupForm(); document.getElementById('group-modal').classList.remove('hidden'); document.getElementById('group-name').focus(); }
function closeGroupModal() { document.getElementById('group-modal').classList.add('hidden'); }
function resetGroupForm() { editingGroupId = null; document.getElementById('edit-group-id').value = ''; document.getElementById('group-name').value = ''; document.getElementById('group-form-title').textContent = settingsLang.new_group || 'Nuevo grupo'; document.getElementById('btn-save-group').textContent = settingsLang.create_group || 'Crear grupo'; }
async function saveGroup() {
    const name = document.getElementById('group-name').value.trim();
    if (!name) return alert('Introduce un nombre de grupo');
    try {
        await api(editingGroupId ? `/api/groups/${editingGroupId}` : '/api/groups', { method: editingGroupId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
        closeGroupModal(); resetGroupForm(); await Promise.all([loadGroups(), loadUsers()]);
    } catch (error) { alert(error.message); }
}
async function deleteGroup(id) {
    if (!confirm('¿Eliminar este grupo? Solo es posible si no tiene datos asociados.')) return;
    try { await api(`/api/groups/${id}`, { method: 'DELETE' }); await loadGroups(); } catch (error) { alert(error.message); }
}
async function loadUsers() {
    try {
        usersCache = await api('/api/users');
        const text = (key, fallback) => settingsLang[key] || fallback;
        document.getElementById('users-list').innerHTML = usersCache.map(u => `<article class="management-row"><div class="management-row__main"><span class="avatar">${escapeHtml(u.username.slice(0, 2).toUpperCase())}</span><div><strong>${escapeHtml(u.username)}</strong><small>${escapeHtml(u.group_name || text('none', 'Sin grupo'))}${u.is_superuser ? ` · ${text('superuser', 'Superuser')}` : ''}</small></div></div><div class="row-actions"><button class="btn btn-secondary btn-small" onclick="editUser(${u.id})">${text('edit', 'Editar')}</button>${u.is_superuser ? '' : `<button class="btn btn-danger btn-small" onclick="deleteUser(${u.id})">${text('delete', 'Eliminar')}</button>`}</div></article>`).join('');
    } catch (error) { alert(error.message); }
}
function editUser(id) {
    const user = usersCache.find(entry => entry.id === id);
    if (!user) return;
    editingUserId = id;
    document.getElementById('user-name').value = user.username;
    document.getElementById('user-password').value = '';
    document.getElementById('user-group').value = user.group_id || '';
    document.getElementById('user-form-title').textContent = settingsLang.edit_user || 'Editar usuario';
    document.getElementById('btn-save-user').textContent = settingsLang.save_changes || 'Guardar cambios';
    document.getElementById('user-modal').classList.remove('hidden');
}
function openUserModal() { resetUserForm(); document.getElementById('user-modal').classList.remove('hidden'); document.getElementById('user-name').focus(); }
function closeUserModal() { document.getElementById('user-modal').classList.add('hidden'); }
function resetUserForm() { editingUserId = null; document.getElementById('edit-user-id').value = ''; document.getElementById('user-name').value = ''; document.getElementById('user-password').value = ''; document.getElementById('user-group').value = ''; document.getElementById('user-form-title').textContent = settingsLang.new_user || 'Nuevo usuario'; document.getElementById('btn-save-user').textContent = settingsLang.new_user || 'Crear usuario'; }
async function saveUser() {
    const username = document.getElementById('user-name').value.trim();
    const password = document.getElementById('user-password').value;
    const group_id = document.getElementById('user-group').value || null;
    if (!username) return alert('Introduce un nombre de usuario');
    if (!editingUserId && password.length < 6) return alert('La contraseña debe tener al menos 6 caracteres');
    try {
        await api(editingUserId ? `/api/users/${editingUserId}` : '/api/users', { method: editingUserId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password, group_id }) });
        closeUserModal(); resetUserForm(); await loadUsers();
    } catch (error) { alert(error.message); }
}
async function deleteUser(id) {
    if (!confirm('¿Eliminar este usuario?')) return;
    try { await api(`/api/users/${id}`, { method: 'DELETE' }); await loadUsers(); } catch (error) { alert(error.message); }
}
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char])); }
