const STORAGE_KEY = 'spendwise_expenses';
const BUDGET_KEY = 'spendwise_budget';
const THEME_KEY = 'spendwise_theme';
const CURRENCY_KEY = 'spendwise_currency';

const CURRENCIES = {
    USD: { symbol: '$', name: 'US Dollar', locale: 'en-US', code: 'USD' },
    EUR: { symbol: '€', name: 'Euro', locale: 'de-DE', code: 'EUR' },
    GBP: { symbol: '£', name: 'British Pound', locale: 'en-GB', code: 'GBP' },
    INR: { symbol: '₹', name: 'Indian Rupee', locale: 'en-IN', code: 'INR' },
    JPY: { symbol: '¥', name: 'Japanese Yen', locale: 'ja-JP', code: 'JPY' },
    CAD: { symbol: '$', name: 'Canadian Dollar', locale: 'en-CA', code: 'CAD' },
    AUD: { symbol: '$', name: 'Australian Dollar', locale: 'en-AU', code: 'AUD' },
    CNY: { symbol: '¥', name: 'Chinese Yuan', locale: 'zh-CN', code: 'CNY' },
    KRW: { symbol: '₩', name: 'Korean Won', locale: 'ko-KR', code: 'KRW' },
    BRL: { symbol: 'R$', name: 'Brazilian Real', locale: 'pt-BR', code: 'BRL' },
    MXN: { symbol: '$', name: 'Mexican Peso', locale: 'es-MX', code: 'MXN' },
    NGN: { symbol: '₦', name: 'Nigerian Naira', locale: 'en-NG', code: 'NGN' },
    AED: { symbol: 'د.إ', name: 'UAE Dirham', locale: 'ar-AE', code: 'AED' },
    SAR: { symbol: '﷼', name: 'Saudi Riyal', locale: 'ar-SA', code: 'SAR' },
    ZAR: { symbol: 'R', name: 'South African Rand', locale: 'en-ZA', code: 'ZAR' },
    SGD: { symbol: '$', name: 'Singapore Dollar', locale: 'en-SG', code: 'SGD' },
    HKD: { symbol: '$', name: 'Hong Kong Dollar', locale: 'zh-HK', code: 'HKD' },
    SEK: { symbol: 'kr', name: 'Swedish Krona', locale: 'sv-SE', code: 'SEK' },
    NOK: { symbol: 'kr', name: 'Norwegian Krone', locale: 'nb-NO', code: 'NOK' },
    CHF: { symbol: 'Fr.', name: 'Swiss Franc', locale: 'de-CH', code: 'CHF' }
};

const CATEGORIES = {
    food: { label: 'Food & Dining', icon: '🍔', color: '#f59e0b' },
    transport: { label: 'Transport', icon: '🚗', color: '#3b82f6' },
    shopping: { label: 'Shopping', icon: '🛍️', color: '#ec4899' },
    bills: { label: 'Bills & Utilities', icon: '📄', color: '#6366f1' },
    entertainment: { label: 'Entertainment', icon: '🎬', color: '#10b981' },
    health: { label: 'Health', icon: '💊', color: '#ef4444' },
    education: { label: 'Education', icon: '📚', color: '#8b5cf6' },
    other: { label: 'Other', icon: '📌', color: '#6b7280' }
};

let expenses = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
let budget = parseFloat(localStorage.getItem(BUDGET_KEY)) || 0;
let selectedCurrency = localStorage.getItem(CURRENCY_KEY) || 'USD';
let editingId = null;
let categoryChart = null;
let dailyChart = null;
let authToken = localStorage.getItem('spendwise_token') || null;
let currentUser = null;
let syncTimeout = null;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// API Helpers
async function api(endpoint, options = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    const res = await fetch(endpoint, { ...options, headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
}

function setSyncStatus(status) {
    const el = $('#syncStatus');
    if (!el) return;
    el.className = 'sync-status' + (status === 'syncing' ? ' syncing' : status === 'error' ? ' error' : '');
    el.textContent = status === 'syncing' ? 'Syncing...' : status === 'error' ? 'Sync failed' : 'Synced';
}

async function syncExpenses() {
    if (!authToken) return;
    setSyncStatus('syncing');
    try {
        await api('/api/expenses/sync', {
            method: 'POST',
            body: JSON.stringify({ expenses })
        });
        setSyncStatus('synced');
    } catch (err) {
        setSyncStatus('error');
    }
}

function debouncedSync() {
    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(syncExpenses, 1000);
}

async function loadExpensesFromServer() {
    if (!authToken) return;
    try {
        const data = await api('/api/expenses');
        if (data.expenses && data.expenses.length > 0) {
            expenses = data.expenses;
            save();
        } else if (expenses.length > 0) {
            await syncExpenses();
        }
    } catch (err) {
        console.error('Failed to load expenses:', err);
    }
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
    debouncedSync();
}

function saveBudget() {
    localStorage.setItem(BUDGET_KEY, budget.toString());
    if (authToken) {
        api('/api/auth/settings', { method: 'PUT', body: JSON.stringify({ budget }) }).catch(() => {});
    }
}

function formatCurrency(amount) {
    const cur = CURRENCIES[selectedCurrency];
    const decimals = selectedCurrency === 'JPY' || selectedCurrency === 'KRW' ? 0 : 2;
    try {
        return new Intl.NumberFormat(cur.locale, {
            style: 'currency',
            currency: cur.code,
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(amount);
    } catch {
        return cur.symbol + amount.toFixed(decimals);
    }
}

function getCurrencySymbol() {
    return CURRENCIES[selectedCurrency].symbol;
}

function formatDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getMonthKey(dateStr) {
    return dateStr.slice(0, 7);
}

function getCurrentMonthKey() {
    return new Date().toISOString().slice(0, 7);
}

function getFilteredExpenses() {
    const search = $('#searchInput').value.toLowerCase();
    const category = $('#filterCategory').value;
    const month = $('#filterMonth').value;

    return expenses.filter(e => {
        const matchSearch = !search || e.note.toLowerCase().includes(search) || CATEGORIES[e.category].label.toLowerCase().includes(search);
        const matchCategory = category === 'all' || e.category === category;
        const matchMonth = month === 'all' || getMonthKey(e.date) === month;
        return matchSearch && matchCategory && matchMonth;
    }).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

function getCurrentMonthExpenses() {
    const currentMonth = getCurrentMonthKey();
    return expenses.filter(e => getMonthKey(e.date) === currentMonth);
}

function updateSummary() {
    const current = getCurrentMonthExpenses();
    const total = current.reduce((sum, e) => sum + e.amount, 0);

    $('#totalSpent').textContent = formatCurrency(total);
    $('#expenseCount').textContent = `${current.length} expense${current.length !== 1 ? 's' : ''} this month`;

    if (budget > 0) {
        const remaining = budget - total;
        const pct = Math.min((total / budget) * 100, 100);
        $('#budgetRemaining').textContent = formatCurrency(Math.max(remaining, 0));
        $('#budgetBar').style.width = pct + '%';
        $('#currentBudgetLabel').textContent = `Current budget: ${formatCurrency(budget)}`;

        $('#budgetBar').className = 'budget-bar';
        if (pct >= 90) $('#budgetBar').classList.add('danger');
        else if (pct >= 70) $('#budgetBar').classList.add('warning');

        $('#budgetRemaining').style.color = remaining < 0 ? 'var(--danger)' : '';
    } else {
        $('#budgetRemaining').textContent = formatCurrency(0);
        $('#budgetBar').style.width = '0%';
        $('#currentBudgetLabel').textContent = 'Set a budget to track';
        $('#budgetRemaining').style.color = '';
    }

    const catTotals = {};
    current.forEach(e => {
        catTotals[e.category] = (catTotals[e.category] || 0) + e.amount;
    });

    const topCat = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0];
    if (topCat) {
        $('#topCategory').textContent = CATEGORIES[topCat[0]].icon + ' ' + CATEGORIES[topCat[0]].label;
        $('#topCategoryAmount').textContent = formatCurrency(topCat[1]) + ' spent';
    } else {
        $('#topCategory').textContent = '-';
        $('#topCategoryAmount').textContent = 'No data';
    }
}

function renderExpenses() {
    const filtered = getFilteredExpenses();
    const list = $('#expensesList');

    if (filtered.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2"></rect>
                    <line x1="2" y1="10" x2="22" y2="10"></line>
                </svg>
                <p>${expenses.length === 0 ? 'No expenses yet. Click "Add Expense" to get started.' : 'No expenses match your filters.'}</p>
            </div>`;
        return;
    }

    list.innerHTML = filtered.map(e => `
        <div class="expense-row" data-id="${e.id}">
            <div class="expense-icon cat-${e.category}">${CATEGORIES[e.category].icon}</div>
            <div class="expense-info">
                <div class="name">${CATEGORIES[e.category].label}</div>
                <div class="meta">${formatDate(e.date)}${e.note ? ' · ' + escapeHtml(e.note) : ''}</div>
            </div>
            <div class="expense-amount">-${formatCurrency(e.amount)}</div>
            <div class="expense-actions">
                <button class="btn-sm edit" onclick="editExpense('${e.id}')" title="Edit">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                </button>
                <button class="btn-sm delete" onclick="deleteExpense('${e.id}')" title="Delete">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            </div>
        </div>
    `).join('');
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function updateCategoryChart() {
    const current = getCurrentMonthExpenses();
    const catTotals = {};
    current.forEach(e => {
        catTotals[e.category] = (catTotals[e.category] || 0) + e.amount;
    });

    const labels = [];
    const data = [];
    const colors = [];

    Object.entries(catTotals)
        .sort((a, b) => b[1] - a[1])
        .forEach(([cat, total]) => {
            labels.push(CATEGORIES[cat].label);
            data.push(total);
            colors.push(CATEGORIES[cat].color);
        });

    if (categoryChart) categoryChart.destroy();

    if (data.length === 0) {
        const ctx = $('#categoryChart').getContext('2d');
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        return;
    }

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#e2e8f0' : '#1a1a2e';

    categoryChart = new Chart($('#categoryChart'), {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{ data, backgroundColor: colors, borderWidth: 0, hoverOffset: 6 }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: textColor, padding: 12, font: { size: 11, family: 'Inter' }, usePointStyle: true, pointStyleWidth: 8 }
                }
            }
        }
    });
}

function updateDailyChart() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const dailyTotals = new Array(daysInMonth).fill(0);
    getCurrentMonthExpenses().forEach(e => {
        const day = new Date(e.date + 'T00:00:00').getDate();
        dailyTotals[day - 1] += e.amount;
    });

    const labels = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    if (dailyChart) dailyChart.destroy();

    dailyChart = new Chart($('#dailyChart'), {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                data: dailyTotals,
                backgroundColor: isDark ? 'rgba(129,140,248,0.6)' : 'rgba(99,102,241,0.6)',
                borderRadius: 4,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: isDark ? '#64748b' : '#9ca3af', font: { size: 10 }, maxTicksLimit: 10 }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: isDark ? '#2d2d4a' : '#e5e7eb' },
                    ticks: { color: isDark ? '#64748b' : '#9ca3af', font: { size: 10 }, callback: v => getCurrencySymbol() + v }
                }
            }
        }
    });
}

function populateMonthFilter() {
    const months = new Set();
    expenses.forEach(e => months.add(getMonthKey(e.date)));

    const select = $('#filterMonth');
    const current = select.value;
    select.innerHTML = '<option value="all">All Time</option>';

    [...months].sort().reverse().forEach(m => {
        const [y, mo] = m.split('-');
        const label = new Date(y, mo - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = label;
        select.appendChild(opt);
    });

    select.value = current;
}

function refreshAll() {
    updateSummary();
    renderExpenses();
    updateCategoryChart();
    updateDailyChart();
    populateMonthFilter();
}

function openModal(editMode = false) {
    $('#expenseModal').classList.add('active');
    $('#modalTitle').textContent = editMode ? 'Edit Expense' : 'Add Expense';
    if (!editMode) {
        $('#expenseForm').reset();
        $('#expenseDate').value = new Date().toISOString().slice(0, 10);
    }
    $('#expenseAmount').focus();
}

function closeModal() {
    $('#expenseModal').classList.remove('active');
    editingId = null;
}

function editExpense(id) {
    const e = expenses.find(x => x.id === id);
    if (!e) return;
    editingId = id;
    $('#expenseAmount').value = e.amount;
    $('#expenseCategory').value = e.category;
    $('#expenseDate').value = e.date;
    $('#expenseNote').value = e.note || '';
    openModal(true);
}

function deleteExpense(id) {
    if (!confirm('Delete this expense?')) return;
    expenses = expenses.filter(x => x.id !== id);
    save();
    refreshAll();
}

function exportCSV() {
    if (expenses.length === 0) {
        alert('No expenses to export.');
        return;
    }

    const header = 'Date,Category,Amount,Note';
    const rows = expenses
        .sort((a, b) => b.date.localeCompare(a.date))
        .map(e => `${e.date},${CATEGORIES[e.category].label},${e.amount},"${(e.note || '').replace(/"/g, '""')}"`);

    const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spendwise_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// Theme
function getSystemTheme() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getStoredTheme() {
    return localStorage.getItem(THEME_KEY) || 'system';
}

function getActiveTheme() {
    const stored = getStoredTheme();
    return stored === 'system' ? getSystemTheme() : stored;
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    updateCategoryChart();
    updateDailyChart();
}

function initTheme() {
    applyTheme(getActiveTheme());
    updateThemeButtons();
}

function setTheme(mode) {
    localStorage.setItem(THEME_KEY, mode);
    applyTheme(getActiveTheme());
    updateThemeButtons();
    if (authToken) {
        api('/api/auth/settings', { method: 'PUT', body: JSON.stringify({ theme: mode }) }).catch(() => {});
    }
}

function updateThemeButtons() {
    const current = getStoredTheme();
    $$('.theme-option').forEach(btn => btn.classList.remove('active'));
    if (current === 'light') $('#themeLight').classList.add('active');
    else if (current === 'dark') $('#themeDark').classList.add('active');
    else $('#themeSystem').classList.add('active');
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getStoredTheme() === 'system') applyTheme('dark');
});

// Settings Modal
function openSettings() {
    const modal = $('#settingsModal');
    modal.classList.add('active');
    $('#settingsCurrency').value = selectedCurrency;
    $('#settingsBudgetInput').value = budget > 0 ? budget : '';
    updateBudgetHint();
}

function closeSettings() {
    $('#settingsModal').classList.remove('active');
}

function updateBudgetHint() {
    $('#settingsBudgetHint').textContent = budget > 0 ? `Current budget: ${formatCurrency(budget)}` : 'No budget set';
}

// Event Listeners
$('#addExpenseBtn').addEventListener('click', () => openModal());
$('#closeModal').addEventListener('click', closeModal);
$('#cancelModal').addEventListener('click', closeModal);
$('#expenseModal').addEventListener('click', (e) => {
    if (e.target === $('#expenseModal')) closeModal();
});

$('#expenseForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const amount = parseFloat($('#expenseAmount').value);
    const category = $('#expenseCategory').value;
    const date = $('#expenseDate').value;
    const note = $('#expenseNote').value.trim();

    if (!amount || !category || !date) return;

    if (editingId) {
        const exp = expenses.find(x => x.id === editingId);
        if (exp) {
            exp.amount = amount;
            exp.category = category;
            exp.date = date;
            exp.note = note;
        }
    } else {
        expenses.push({ id: generateId(), amount, category, date, note, createdAt: Date.now() });
    }

    save();
    refreshAll();
    closeModal();
});

$('#searchInput').addEventListener('input', renderExpenses);
$('#filterCategory').addEventListener('change', renderExpenses);
$('#filterMonth').addEventListener('change', renderExpenses);

// Settings Events
$('#settingsBtn').addEventListener('click', openSettings);
$('#closeSettings').addEventListener('click', closeSettings);
$('#settingsModal').addEventListener('click', (e) => {
    if (e.target === $('#settingsModal')) closeSettings();
});

$('#themeLight').addEventListener('click', () => setTheme('light'));
$('#themeDark').addEventListener('click', () => setTheme('dark'));
$('#themeSystem').addEventListener('click', () => setTheme('system'));

$('#settingsCurrency').addEventListener('change', (e) => {
    selectedCurrency = e.target.value;
    localStorage.setItem(CURRENCY_KEY, selectedCurrency);
    refreshAll();
    updateModalLabels();
    if (authToken) {
        api('/api/auth/settings', { method: 'PUT', body: JSON.stringify({ currency: selectedCurrency }) }).catch(() => {});
    }
});

$('#settingsSetBudgetBtn').addEventListener('click', () => {
    const val = parseFloat($('#settingsBudgetInput').value);
    if (val >= 0) {
        budget = val;
        saveBudget();
        refreshAll();
        updateBudgetHint();
    }
});

$('#settingsExportBtn').addEventListener('click', exportCSV);

$('#settingsClearBtn').addEventListener('click', () => {
    if (!confirm('This will delete ALL your expenses. This cannot be undone. Continue?')) return;
    if (!confirm('Are you absolutely sure?')) return;
    expenses = [];
    budget = 0;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(BUDGET_KEY);
    refreshAll();
    updateBudgetHint();
    $('#settingsBudgetInput').value = '';
    syncExpenses();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeModal();
        closeSettings();
    }
});

// Auth
function showAuth() {
    $('#authScreen').style.display = 'flex';
    $('#appMain').style.display = 'none';
}

function showApp() {
    $('#authScreen').style.display = 'none';
    $('#appMain').style.display = 'block';
}

function updateUserInfo() {
    if (currentUser) {
        $('#userName').textContent = currentUser.name;
        $('#userAvatar').textContent = currentUser.name.charAt(0).toUpperCase();
        $('#settingsEmail').textContent = currentUser.email;
    }
}

async function handleLogin(email, password) {
    const errEl = $('#loginError');
    errEl.classList.remove('visible');
    try {
        const data = await api('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        authToken = data.token;
        currentUser = data.user;
        localStorage.setItem('spendwise_token', authToken);
        selectedCurrency = currentUser.currency || 'USD';
        budget = currentUser.budget || 0;
        localStorage.setItem(CURRENCY_KEY, selectedCurrency);
        localStorage.setItem(BUDGET_KEY, budget.toString());
        if (currentUser.theme) {
            localStorage.setItem(THEME_KEY, currentUser.theme);
        }
        showApp();
        updateUserInfo();
        initTheme();
        initCurrency();
        updateModalLabels();
        await loadExpensesFromServer();
        refreshAll();
    } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.add('visible');
    }
}

async function handleRegister(name, email, password) {
    const errEl = $('#registerError');
    errEl.classList.remove('visible');
    try {
        const data = await api('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({ name, email, password })
        });
        authToken = data.token;
        currentUser = data.user;
        localStorage.setItem('spendwise_token', authToken);
        showApp();
        updateUserInfo();
        initTheme();
        initCurrency();
        updateModalLabels();
        refreshAll();
    } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.add('visible');
    }
}

function logout() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('spendwise_token');
    expenses = [];
    budget = 0;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(BUDGET_KEY);
    showAuth();
}

// Auth form events
$('#loginSubmit').addEventListener('submit', (e) => {
    e.preventDefault();
    handleLogin($('#loginEmail').value, $('#loginPassword').value);
});

$('#registerSubmit').addEventListener('submit', (e) => {
    e.preventDefault();
    handleRegister($('#registerName').value, $('#registerEmail').value, $('#registerPassword').value);
});

$('#showRegister').addEventListener('click', (e) => {
    e.preventDefault();
    $('#loginForm').style.display = 'none';
    $('#registerForm').style.display = 'block';
});

$('#showLogin').addEventListener('click', (e) => {
    e.preventDefault();
    $('#registerForm').style.display = 'none';
    $('#loginForm').style.display = 'block';
});

$('#logoutBtn').addEventListener('click', logout);
$('#settingsLogoutBtn').addEventListener('click', logout);

// Init
function updateModalLabels() {
    const sym = getCurrencySymbol();
    $('label[for="expenseAmount"]').textContent = `Amount (${sym})`;
}

function initCurrency() {
    $('#settingsCurrency').value = selectedCurrency;
}

async function init() {
    initTheme();
    if (authToken) {
        try {
            const data = await api('/api/auth/me');
            currentUser = data.user;
            selectedCurrency = currentUser.currency || 'USD';
            budget = currentUser.budget || 0;
            if (currentUser.theme) localStorage.setItem(THEME_KEY, currentUser.theme);
            showApp();
            updateUserInfo();
            initTheme();
            initCurrency();
            updateModalLabels();
            await loadExpensesFromServer();
            refreshAll();
        } catch {
            logout();
        }
    } else {
        showAuth();
    }
}

init();
