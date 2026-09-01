/**
 * ================================================================
 * 设备运行监控系统 - 管理员功能模块
 * 功能：设备/用户/类型 的增删改管理
 * ================================================================
 */

import {
    get, post, put, del,
    showToast, openModal, closeModal,
    isAdmin, formatTimestamp
} from './utils.js';
import { loadDevices, renderAll, renderTypeTabs } from './devices.js';
import { loadStatistics, renderTypeSummary, renderRankTable } from './statistics.js';

// ================================================================
// 1. 权限检查
// ================================================================

async function requireAdmin() {
    const admin = await isAdmin();
    if (!admin) {
        showToast('需要管理员权限', 'error');
        return false;
    }
    return true;
}

// ================================================================
// 2. 管理面板
// ================================================================

export async function renderAdminPanel() {
    if (!await requireAdmin()) return;

    const html = `
        <div class="admin-panel">
            <div class="admin-tabs">
                <button class="admin-tab active" data-tab="devices">📟 设备管理</button>
                <button class="admin-tab" data-tab="users">👥 用户管理</button>
                <button class="admin-tab" data-tab="types">🏷️ 类型管理</button>
            </div>
            <div class="admin-content">
                <div id="adminTabContent">
                    <!-- 由 JS 动态渲染 -->
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn btn-secondary" onclick="window.closeModal()">关闭</button>
            </div>
        </div>
    `;

    openModal(html);

    renderDeviceManagement();

    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const tabName = tab.dataset.tab;
            switch (tabName) {
                case 'devices':
                    renderDeviceManagement();
                    break;
                case 'users':
                    renderUserManagement();
                    break;
                case 'types':
                    renderTypeManagement();
                    break;
            }
        });
    });
}

// ================================================================
// 3. 设备管理
// ================================================================

export async function renderDeviceManagement() {
    const container = document.getElementById('adminTabContent');
    if (!container) return;

    const devices = window.__devices || [];

    const html = `
        <div style="margin-bottom:16px;display:flex;gap:10px;flex-wrap:wrap;">
            <button class="btn btn-primary" onclick="window._adminAddDevice()">➕ 添加设备</button>
            <span style="font-size:14px;color:var(--gray-500);align-self:center;">
                共 ${devices.filter(d => !d.is_deleted).length} 台设备
            </span>
        </div>
        <div style="overflow-x:auto;">
            <table class="admin-list">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>设备名称</th>
                        <th>位号</th>
                        <th>类型</th>
                        <th>状态</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody>
                    ${devices.filter(d => !d.is_deleted).map(d => `
                        <tr>
                            <td>${d.id}</td>
                            <td><strong>${escapeHtml(d.name)}</strong></td>
                            <td>${escapeHtml(d.tag || '-')}</td>
                            <td>${escapeHtml(d.type || '-')}</td>
                            <td>${d.status === 1 ? '🟢 运行中' : '⚪ 已停机'}</td>
                            <td>
                                <div class="actions">
                                    <button class="btn-edit" onclick="window._adminEditDevice(${d.id})">✏️</button>
                                    <button class="btn-delete" onclick="window._adminDeleteDevice(${d.id})">🗑️</button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                    ${devices.filter(d => !d.is_deleted).length === 0 ? `
                        <tr><td colspan="6" class="text-center text-muted">暂无设备</td></tr>
                    ` : ''}
                </tbody>
            </table>
        </div>
    `;

    container.innerHTML = html;

    window._adminAddDevice = showAddDeviceModal;
    window._adminEditDevice = showEditDeviceModal;
    window._adminDeleteDevice = deleteDevice;
}

// ================================================================
// 4. 设备 CRUD
// ================================================================

export async function showAddDeviceModal() {
    if (!await requireAdmin()) return;

    const types = await getDeviceTypes();

    const html = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>➕ 添加设备</h2>
                <button class="modal-close" onclick="window.closeModal()">✕</button>
            </div>
            <form id="addDeviceForm">
                <div class="form-group">
                    <label>设备名称 *</label>
                    <input type="text" id="devName" placeholder="如：空压机05" required />
                </div>
                <div class="form-group">
                    <label>位号 *</label>
                    <input type="text" id="devTag" placeholder="如：A-005" required />
                    <div class="hint">设备位号，需唯一</div>
                </div>
                <div class="form-group">
                    <label>设备类型 *</label>
                    <select id="devType">
                        ${types.map(t => `<option value="${escapeHtml(t.name)}">${escapeHtml(t.name)}</option>`).join('')}
                        ${types.length === 0 ? '<option value="">请先添加类型</option>' : ''}
                    </select>
                </div>
                <div class="form-group">
                    <label>位置</label>
                    <input type="text" id="devLocation" placeholder="如：车间A" />
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="window.closeModal()">取消</button>
                    <button type="submit" class="btn btn-primary">确认添加</button>
                </div>
            </form>
        </div>
    `;

    openModal(html);

    document.getElementById('addDeviceForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('devName').value.trim();
        const tag = document.getElementById('devTag').value.trim();
        const type = document.getElementById('devType').value;
        const location = document.getElementById('devLocation').value.trim();

        if (!name || !tag || !type) {
            showToast('请填写完整信息', 'warning');
            return;
        }

        const result = await post('/devices', { name, tag, type, location });
        if (result.success) {
            showToast('✅ 设备添加成功', 'success');
            closeModal();
            await refreshAll();
        } else {
            showToast(result.error || '添加失败', 'error');
        }
    });
}

export async function showEditDeviceModal(deviceId) {
    if (!await requireAdmin()) return;

    const devices = window.__devices || [];
    const device = devices.find(d => d.id === deviceId);
    if (!device) {
        showToast('设备不存在', 'error');
        return;
    }

    const types = await getDeviceTypes();

    const html = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>✏️ 编辑设备</h2>
                <button class="modal-close" onclick="window.closeModal()">✕</button>
            </div>
            <form id="editDeviceForm">
                <div class="form-group">
                    <label>设备名称 *</label>
                    <input type="text" id="devName" value="${escapeHtml(device.name)}" required />
                </div>
                <div class="form-group">
                    <label>位号 *</label>
                    <input type="text" id="devTag" value="${escapeHtml(device.tag || '')}" required />
                    <div class="hint">设备位号，需唯一</div>
                </div>
                <div class="form-group">
                    <label>设备类型 *</label>
                    <select id="devType">
                        ${types.map(t => `
                            <option value="${escapeHtml(t.name)}" ${t.name === device.type ? 'selected' : ''}>
                                ${escapeHtml(t.name)}
                            </option>
                        `).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>位置</label>
                    <input type="text" id="devLocation" value="${escapeHtml(device.location || '')}" />
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="window.closeModal()">取消</button>
                    <button type="submit" class="btn btn-primary">保存修改</button>
                </div>
            </form>
        </div>
    `;

    openModal(html);

    document.getElementById('editDeviceForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('devName').value.trim();
        const tag = document.getElementById('devTag').value.trim();
        const type = document.getElementById('devType').value;
        const location = document.getElementById('devLocation').value.trim();

        const result = await put(`/devices/${deviceId}`, { name, tag, type, location });
        if (result.success) {
            showToast('✅ 设备已更新', 'success');
            closeModal();
            await refreshAll();
        } else {
            showToast(result.error || '更新失败', 'error');
        }
    });
}

export async function deleteDevice(deviceId) {
    if (!await requireAdmin()) return;

    if (!confirm('确认要删除该设备吗？\n历史运行记录将保留。')) return;

    const result = await del(`/devices/${deviceId}`);
    if (result.success) {
        showToast('✅ 设备已删除', 'success');
        await refreshAll();
    } else {
        showToast(result.error || '删除失败', 'error');
    }
}

// ================================================================
// 5. 用户管理
// ================================================================

export async function renderUserManagement() {
    const container = document.getElementById('adminTabContent');
    if (!container) return;

    const result = await get('/users');
    const users = result.success ? (result.data || []) : [];

    const html = `
        <div style="margin-bottom:16px;display:flex;gap:10px;flex-wrap:wrap;">
            <button class="btn btn-primary" onclick="window._adminAddUser()">➕ 添加用户</button>
            <span style="font-size:14px;color:var(--gray-500);align-self:center;">
                共 ${users.length} 位用户
            </span>
        </div>
        <div style="overflow-x:auto;">
            <table class="admin-list">
                <thead>
                    <tr>
                        <th>用户名</th>
                        <th>昵称</th>
                        <th>角色</th>
                        <th>状态</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody>
                    ${users.map(u => `
                        <tr>
                            <td><strong>${escapeHtml(u.username)}</strong></td>
                            <td>${escapeHtml(u.nickname || u.username)}</td>
                            <td>${u.role === 'admin' ? '🔑 管理员' : '👤 普通用户'}</td>
                            <td>${u.is_active ? '🟢 启用' : '🔴 禁用'}</td>
                            <td>
                                <div class="actions">
                                    <button class="btn-edit" onclick="window._adminEditUser('${u.id}')">✏️</button>
                                    <button class="btn-toggle" onclick="window._adminToggleUser('${u.id}', ${u.is_active ? 0 : 1})">
                                        ${u.is_active ? '禁用' : '启用'}
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                    ${users.length === 0 ? `
                        <tr><td colspan="5" class="text-center text-muted">暂无用户</td></tr>
                    ` : ''}
                </tbody>
            </table>
        </div>
    `;

    container.innerHTML = html;

    window._adminAddUser = showAddUserModal;
    window._adminEditUser = showEditUserModal;
    window._adminToggleUser = toggleUser;
}

export async function showAddUserModal() {
    if (!await requireAdmin()) return;

    const html = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>➕ 添加用户</h2>
                <button class="modal-close" onclick="window.closeModal()">✕</button>
            </div>
            <form id="addUserForm">
                <div class="form-group">
                    <label>用户名 *</label>
                    <input type="text" id="userUsername" placeholder="仅限字母、数字、下划线" required />
                    <div class="hint">仅限字母、数字、下划线，如: zhangsan</div>
                </div>
                <div class="form-group">
                    <label>昵称 *</label>
                    <input type="text" id="userNickname" placeholder="如：张三" required />
                </div>
                <div class="form-group">
                    <label>初始密码 *</label>
                    <input type="text" id="userPassword" placeholder="设置初始密码" required />
                </div>
                <div class="form-group">
                    <label>角色</label>
                    <select id="userRole">
                        <option value="user">普通用户</option>
                        <option value="admin">管理员</option>
                    </select>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="window.closeModal()">取消</button>
                    <button type="submit" class="btn btn-primary">确认添加</button>
                </div>
            </form>
        </div>
    `;

    openModal(html);

    document.getElementById('addUserForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('userUsername').value.trim();
        const nickname = document.getElementById('userNickname').value.trim();
        const password = document.getElementById('userPassword').value;
        const role = document.getElementById('userRole').value;

        if (!username || !nickname || !password) {
            showToast('请填写完整信息', 'warning');
            return;
        }
        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            showToast('用户名仅限字母、数字、下划线', 'warning');
            return;
        }

        const result = await post('/users', { username, nickname, password, role });
        if (result.success) {
            showToast('✅ 用户添加成功', 'success');
            closeModal();
            renderUserManagement();
        } else {
            showToast(result.error || '添加失败', 'error');
        }
    });
}

export async function showEditUserModal(userId) {
    if (!await requireAdmin()) return;

    const result = await get('/users');
    const users = result.success ? (result.data || []) : [];
    const user = users.find(u => u.id === userId);
    if (!user) {
        showToast('用户不存在', 'error');
        return;
    }

    const html = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>✏️ 编辑用户</h2>
                <button class="modal-close" onclick="window.closeModal()">✕</button>
            </div>
            <form id="editUserForm">
                <div class="form-group">
                    <label>用户名</label>
                    <input type="text" value="${escapeHtml(user.username)}" disabled style="background:var(--gray-100);" />
                    <div class="hint">用户名不可修改</div>
                </div>
                <div class="form-group">
                    <label>昵称 *</label>
                    <input type="text" id="userNickname" value="${escapeHtml(user.nickname || user.username)}" required />
                </div>
                <div class="form-group">
                    <label>角色</label>
                    <select id="userRole">
                        <option value="user" ${user.role === 'user' ? 'selected' : ''}>普通用户</option>
                        <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>管理员</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>重置密码</label>
                    <input type="text" id="userPassword" placeholder="留空则不修改" />
                    <div class="hint">如需重置密码，请输入新密码</div>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="window.closeModal()">取消</button>
                    <button type="submit" class="btn btn-primary">保存修改</button>
                </div>
            </form>
        </div>
    `;

    openModal(html);

    document.getElementById('editUserForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const nickname = document.getElementById('userNickname').value.trim();
        const role = document.getElementById('userRole').value;
        const password = document.getElementById('userPassword').value.trim();

        const payload = { nickname, role };
        if (password) payload.password = password;

        const result = await put(`/users/${userId}`, payload);
        if (result.success) {
            showToast('✅ 用户已更新', 'success');
            closeModal();
            renderUserManagement();
        } else {
            showToast(result.error || '更新失败', 'error');
        }
    });
}

export async function toggleUser(userId, newStatus) {
    if (!await requireAdmin()) return;

    const action = newStatus === 1 ? '启用' : '禁用';
    if (!confirm(`确认要${action}该用户吗？`)) return;

    const result = await put(`/users/${userId}/toggle`, { is_active: newStatus });
    if (result.success) {
        showToast(`✅ 用户已${action}`, 'success');
        renderUserManagement();
    } else {
        showToast(result.error || '操作失败', 'error');
    }
}

// ================================================================
// 6. 设备类型管理
// ================================================================

async function getDeviceTypes() {
    const result = await get('/types');
    return result.success ? (result.data || []) : [];
}

export async function renderTypeManagement() {
    const container = document.getElementById('adminTabContent');
    if (!container) return;

    const types = await getDeviceTypes();

    const html = `
        <div style="margin-bottom:16px;display:flex;gap:10px;flex-wrap:wrap;">
            <button class="btn btn-primary" onclick="window._adminAddType()">➕ 添加类型</button>
            <span style="font-size:14px;color:var(--gray-500);align-self:center;">
                共 ${types.length} 种类型
            </span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
            ${types.map(t => `
                <span style="
                    display:inline-flex;align-items:center;gap:8px;
                    padding:6px 14px;border-radius:20px;
                    background:var(--gray-100);font-size:14px;
                ">
                    ${escapeHtml(t.name)}
                    <button onclick="window._adminDeleteType(${t.id})" style="
                        color:var(--gray-400);background:none;border:none;
                        cursor:pointer;font-size:16px;padding:0 4px;
                    ">✕</button>
                </span>
            `).join('')}
            ${types.length === 0 ? '<span class="text-muted">暂无类型，请添加</span>' : ''}
        </div>
    `;

    container.innerHTML = html;

    window._adminAddType = showAddTypeModal;
    window._adminDeleteType = deleteType;
}

export async function showAddTypeModal() {
    if (!await requireAdmin()) return;

    const html = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>➕ 添加设备类型</h2>
                <button class="modal-close" onclick="window.closeModal()">✕</button>
            </div>
            <form id="addTypeForm">
                <div class="form-group">
                    <label>类型名称 *</label>
                    <input type="text" id="typeName" placeholder="如：风机" required />
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="window.closeModal()">取消</button>
                    <button type="submit" class="btn btn-primary">确认添加</button>
                </div>
            </form>
        </div>
    `;

    openModal(html);

    document.getElementById('addTypeForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('typeName').value.trim();

        if (!name) {
            showToast('请输入类型名称', 'warning');
            return;
        }

        const result = await post('/types', { name });
        if (result.success) {
            showToast('✅ 类型添加成功', 'success');
            closeModal();
            renderTypeManagement();
            await loadDevices(true);
            renderTypeTabs();
        } else {
            showToast(result.error || '添加失败', 'error');
        }
    });
}

export async function deleteType(typeId) {
    if (!await requireAdmin()) return;

    if (!confirm('确认要删除该类型吗？\n如果有设备使用该类型，将无法删除。')) return;

    const result = await del(`/types/${typeId}`);
    if (result.success) {
        showToast('✅ 类型已删除', 'success');
        renderTypeManagement();
        await loadDevices(true);
        renderTypeTabs();
    } else {
        showToast(result.error || '删除失败', 'error');
    }
}

// ================================================================
// 7. 工具函数
// ================================================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function refreshAll() {
    await loadDevices(true);
    renderAll();
    renderTypeTabs();
    await loadStatistics();
    renderTypeSummary();
    renderRankTable();

    const totalHoursEl = document.getElementById('totalHours');
    const runningCountEl = document.getElementById('runningCount');
    if (totalHoursEl) {
        const total = window.__statTotalHours || 0;
        totalHoursEl.textContent = `${total} 小时`;
    }
    if (runningCountEl) {
        const running = window.__devices?.filter(d => d.status === 1 && !d.is_deleted).length || 0;
        runningCountEl.textContent = `${running} 台`;
    }
}

// ================================================================
// 8. 导出 - 只导出一份，没有重复
// ================================================================

export {
    renderAdminPanel,
    renderDeviceManagement,
    renderUserManagement,
    renderTypeManagement,
    showAddDeviceModal,
    showEditDeviceModal,
    deleteDevice,
    showAddUserModal,
    showEditUserModal,
    toggleUser,
    showAddTypeModal,
    deleteType,
};
