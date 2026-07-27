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
let isPremium = false;

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

// Custom Select — body-appended dropdowns (never clipped by overflow)
let activeSelect = null;

function initCustomSelects() {
    document.querySelectorAll('.custom-select').forEach(select => {
        const trigger = select.querySelector('.custom-select-trigger');
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            if (activeSelect === select) {
                closeAllSelects();
            } else {
                closeAllSelects();
                openSelect(select);
            }
        });
    });
}

function openSelect(select) {
    const trigger = select.querySelector('.custom-select-trigger');
    const optionsPanel = select.querySelector('.custom-select-options');
    const rect = trigger.getBoundingClientRect();

    // Create a fixed-position dropdown on the body
    let dropdown = document.createElement('div');
    dropdown.className = 'cs-dropdown';
    dropdown.style.cssText = `position:fixed;top:${rect.bottom + 4}px;left:${rect.left}px;min-width:${rect.width}px;max-height:280px;overflow-y:auto;z-index:9999;`;

    // Copy options
    optionsPanel.querySelectorAll('.cs-option').forEach(opt => {
        const clone = opt.cloneNode(true);
        clone.addEventListener('click', (e) => {
            e.stopPropagation();
            const value = clone.dataset.value;
            select.dataset.value = value;
            trigger.querySelector('span').textContent = clone.textContent;
            // Update original options active state
            optionsPanel.querySelectorAll('.cs-option').forEach(o => o.classList.remove('active'));
            const orig = optionsPanel.querySelector(`.cs-option[data-value="${value}"]`);
            if (orig) orig.classList.add('active');
            closeAllSelects();
            select.dispatchEvent(new CustomEvent('change', { detail: { value } }));
        });
        dropdown.appendChild(clone);
    });

    // Mark active
    const val = select.dataset.value;
    dropdown.querySelectorAll('.cs-option').forEach(o => {
        if (o.dataset.value === val) o.classList.add('active');
    });

    document.body.appendChild(dropdown);

    // Flip up if needed
    const ddRect = dropdown.getBoundingClientRect();
    if (ddRect.bottom > window.innerHeight - 8) {
        dropdown.style.top = (rect.top - ddRect.height - 4) + 'px';
    }
    if (rect.left + ddRect.width > window.innerWidth - 8) {
        dropdown.style.left = (window.innerWidth - ddRect.width - 8) + 'px';
    }
    if (rect.left < 8) {
        dropdown.style.left = '8px';
    }

    select.classList.add('open');
    activeSelect = select;

    requestAnimationFrame(() => dropdown.classList.add('open'));
}

function closeAllSelects() {
    document.querySelectorAll('.custom-select.open').forEach(s => s.classList.remove('open'));
    document.querySelectorAll('.cs-dropdown').forEach(d => d.remove());
    activeSelect = null;
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.custom-select') && !e.target.closest('.cs-dropdown')) {
        closeAllSelects();
    }
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllSelects();
});

function getCustomSelectValue(id) {
    const el = document.getElementById(id);
    return el ? el.dataset.value : '';
}

function setCustomSelectValue(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.dataset.value = value;
    el.querySelectorAll('.cs-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.value === value);
        if (opt.dataset.value === value) {
            el.querySelector('.custom-select-trigger span').textContent = opt.textContent;
        }
    });
}

function populateCustomMonthFilter() {
    const months = new Set();
    expenses.forEach(e => months.add(getMonthKey(e.date)));

    const select = document.getElementById('filterMonthSelect');
    if (!select) return;
    const current = select.dataset.value;
    const optionsContainer = select.querySelector('.custom-select-options');
    optionsContainer.innerHTML = '<div class="cs-option" data-value="all">All Time</div>';

    [...months].sort().reverse().forEach(m => {
        const [y, mo] = m.split('-');
        const label = new Date(y, mo - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        const div = document.createElement('div');
        div.className = 'cs-option';
        div.dataset.value = m;
        div.textContent = label;
        optionsContainer.appendChild(div);
    });

    // Restore selection
    const matchOpt = optionsContainer.querySelector('[data-value="' + current + '"]');
    if (matchOpt) {
        matchOpt.classList.add('active');
        select.querySelector('.custom-select-trigger span').textContent = matchOpt.textContent;
        select.dataset.value = current;
    } else {
        optionsContainer.querySelector('[data-value="all"]').classList.add('active');
        select.querySelector('.custom-select-trigger span').textContent = 'All Time';
        select.dataset.value = 'all';
    }
}

initCustomSelects();

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
    const category = getCustomSelectValue('filterCategorySelect');
    const month = getCustomSelectValue('filterMonthSelect');

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
    populateCustomMonthFilter();
}

function openModal(editMode = false) {
    $('#expenseModal').classList.add('active');
    $('#modalTitle').textContent = editMode ? 'Edit Expense' : 'Add Expense';
    if (!editMode) {
        $('#expenseForm').reset();
        $('#expenseDate').value = new Date().toISOString().slice(0, 10);
        setCustomSelectValue('expenseCategorySelect', '');
        const catSelect = document.getElementById('expenseCategorySelect');
        if (catSelect) {
            catSelect.querySelector('.custom-select-trigger span').textContent = 'Select category';
        }
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
    setCustomSelectValue('expenseCategorySelect', e.category);
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
    const map = { light: 'themeLight', dark: 'themeDark', system: 'themeSystem', ocean: 'themeOcean', sunset: 'themeSunset', neon: 'themeNeon', rose: 'themeRose', forest: 'themeForest' };
    if (map[current]) $(`#${map[current]}`).classList.add('active');
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getStoredTheme() === 'system') applyTheme('dark');
});

// Settings Modal
function openSettings() {
    const modal = $('#settingsModal');
    modal.classList.add('active');
    setCustomSelectValue('settingsCurrencySelect', selectedCurrency);
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
    const category = getCustomSelectValue('expenseCategorySelect');
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
document.getElementById('filterCategorySelect').addEventListener('change', renderExpenses);
document.getElementById('filterMonthSelect').addEventListener('change', renderExpenses);

// Settings Events
$('#settingsBtn').addEventListener('click', openSettings);
$('#closeSettings').addEventListener('click', closeSettings);
$('#settingsModal').addEventListener('click', (e) => {
    if (e.target === $('#settingsModal')) closeSettings();
});

$('#themeLight').addEventListener('click', () => setTheme('light'));
$('#themeDark').addEventListener('click', () => setTheme('dark'));
$('#themeSystem').addEventListener('click', () => setTheme('system'));
$('#themeOcean').addEventListener('click', () => setTheme('ocean'));
$('#themeSunset').addEventListener('click', () => setTheme('sunset'));
$('#themeNeon').addEventListener('click', () => setTheme('neon'));
$('#themeRose').addEventListener('click', () => setTheme('rose'));
$('#themeForest').addEventListener('click', () => setTheme('forest'));

document.getElementById('settingsCurrencySelect').addEventListener('change', (e) => {
    selectedCurrency = e.detail.value;
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
    // Keyboard shortcuts (only when app is visible and not typing)
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if ($('#appMain').style.display === 'none') return;
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openModal(); }
    if (e.key === 's' || e.key === 'S') { e.preventDefault(); openSettings(); }
    if (e.key === '/' || e.key === '?') { e.preventDefault(); $('#searchInput').focus(); }
    if (e.key === 'e' || e.key === 'E') { e.preventDefault(); exportCSV(); }
    if (e.key === 't' || e.key === 'T') { e.preventDefault(); toggleTheme(); }
});

function toggleTheme() {
    const themes = ['light', 'dark', 'ocean', 'sunset', 'neon', 'rose', 'forest'];
    const current = getStoredTheme();
    const idx = themes.indexOf(current);
    const next = themes[(idx + 1) % themes.length];
    setTheme(next);
}

// PWA Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// Screen management
function showScreen(screen) {
    $('#landingPage').style.display = 'none';
    $('#authScreen').style.display = 'none';
    $('#appMain').style.display = 'none';
    if (screen === 'landing') $('#landingPage').style.display = 'block';
    else if (screen === 'auth') { $('#authScreen').style.display = 'flex'; }
    else if (screen === 'app') $('#appMain').style.display = 'block';
}

function switchToRegister() {
    $('#loginForm').style.display = 'none';
    $('#registerForm').style.display = 'block';
}

function switchToLogin() {
    $('#registerForm').style.display = 'none';
    $('#loginForm').style.display = 'block';
}

// Skip auth - use locally
let isLocalMode = false;

function enterLocalMode() {
    isLocalMode = true;
    authToken = null;
    currentUser = { name: 'Guest', email: 'Local Mode' };
    selectedCurrency = localStorage.getItem(CURRENCY_KEY) || 'USD';
    budget = parseFloat(localStorage.getItem(BUDGET_KEY)) || 0;
    const saved = localStorage.getItem(STORAGE_KEY);
    expenses = saved ? JSON.parse(saved) : [];
    showScreen('app');
    updateUserInfo();
    updatePremiumUI();
    initTheme();
    initCurrency();
    updateModalLabels();
    refreshAll();
}

// Auth
function showAuth() {
    showScreen('auth');
}

function showApp() {
    isLocalMode = false;
    showScreen('app');
}

function updateUserInfo() {
    if (currentUser) {
        $('#userName').textContent = currentUser.name;
        $('#userAvatar').textContent = currentUser.name.charAt(0).toUpperCase();
        $('#settingsEmail').textContent = currentUser.email;
        // Mobile menu
        const mobileName = $('#mobileName');
        const mobileEmail = $('#mobileEmail');
        const mobileAvatar = $('#mobileAvatar');
        if (mobileName) mobileName.textContent = currentUser.name;
        if (mobileEmail) mobileEmail.textContent = currentUser.email;
        if (mobileAvatar) mobileAvatar.textContent = currentUser.name.charAt(0).toUpperCase();
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
        updatePremiumUI();
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
        updatePremiumUI();
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
    isLocalMode = false;
    localStorage.removeItem('spendwise_token');
    expenses = [];
    budget = 0;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(BUDGET_KEY);
    showScreen('landing');
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
    switchToRegister();
});

$('#showLogin').addEventListener('click', (e) => {
    e.preventDefault();
    switchToLogin();
});

// Skip auth
$('#skipAuth').addEventListener('click', (e) => {
    e.preventDefault();
    enterLocalMode();
});

$('#logoutBtn').addEventListener('click', logout);
$('#settingsLogoutBtn').addEventListener('click', logout);

// Mobile menu
$('#hamburgerBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = $('#mobileMenu');
    menu.classList.toggle('open');
});

$('#mobileSettingsBtn').addEventListener('click', () => {
    $('#mobileMenu').classList.remove('open');
    openSettings();
});

$('#mobileLogoutBtn').addEventListener('click', () => {
    $('#mobileMenu').classList.remove('open');
    logout();
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('#mobileMenu') && !e.target.closest('#hamburgerBtn')) {
        $('#mobileMenu').classList.remove('open');
    }
});
$('#closeUpgrade').addEventListener('click', closeUpgradeModal);
$('#upgradeModal').addEventListener('click', (e) => {
    if (e.target === $('#upgradeModal')) closeUpgradeModal();
});

// Micro-interactions
function animateValue(el, start, end, duration = 600) {
    const startTime = performance.now();
    const isNeg = end < 0;
    const absEnd = Math.abs(end);

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = start + (absEnd - start) * eased;
        el.textContent = formatCurrency(isNeg ? -current : current);
        if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
}

function initRipple() {
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn, .btn-icon');
        if (!btn) return;
        const rect = btn.getBoundingClientRect();
        btn.style.setProperty('--ripple-x', ((e.clientX - rect.left) / rect.width * 100) + '%');
        btn.style.setProperty('--ripple-y', ((e.clientY - rect.top) / rect.height * 100) + '%');
    });
}

initRipple();

// Override updateSummary to use animated counter
const _origUpdateSummary = updateSummary;
updateSummary = function() {
    const current = getCurrentMonthExpenses();
    const total = current.reduce((sum, e) => sum + e.amount, 0);

    const countEl = $('#expenseCount');
    countEl.textContent = `${current.length} expense${current.length !== 1 ? 's' : ''} this month`;

    const totalEl = $('#totalSpent');
    const prevText = totalEl.textContent;
    const prevVal = parseFloat(prevText.replace(/[^0-9.-]/g, '')) || 0;
    animateValue(totalEl, prevVal, total);

    if (budget > 0) {
        const remaining = budget - total;
        const pct = Math.min((total / budget) * 100, 100);
        const remEl = $('#budgetRemaining');
        const prevRem = parseFloat(remEl.textContent.replace(/[^0-9.-]/g, '')) || 0;
        animateValue(remEl, prevRem, Math.max(remaining, 0));
        $('#budgetBar').style.width = pct + '%';

        $('#budgetBar').className = 'budget-bar';
        if (pct >= 90) $('#budgetBar').classList.add('danger');
        else if (pct >= 70) $('#budgetBar').classList.add('warning');

        remEl.style.color = remaining < 0 ? 'var(--danger)' : '';
    } else {
        $('#budgetRemaining').textContent = formatCurrency(0);
        $('#budgetBar').style.width = '0%';
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
};

function updateModalLabels() {
    const sym = getCurrencySymbol();
    $('label[for="expenseAmount"]').textContent = `Amount (${sym})`;
}

function updatePremiumUI() {
    const statusEl = $('#premiumStatus');
    const upgradeBtn = $('#upgradeBtn');
    const premiumBadge = document.querySelector('.premium-badge');

    if (!currentUser) return;
    isPremium = !!currentUser.premium;

    if (isPremium) {
        statusEl.innerHTML = `<p class="premium-active">Premium Active</p>`;
        if (upgradeBtn) upgradeBtn.style.display = 'none';
        if (!premiumBadge) {
            const badge = document.createElement('span');
            badge.className = 'premium-badge';
            badge.textContent = 'PRO';
            document.querySelector('.user-badge').appendChild(badge);
        }
    } else {
        statusEl.innerHTML = `<p class="premium-expired">Free Plan — 50 expenses, current month only</p>`;
        if (upgradeBtn) upgradeBtn.style.display = '';
        if (premiumBadge) premiumBadge.remove();
    }
}

function openUpgradeModal() {
    $('#upgradeModal').classList.add('active');
}

function closeUpgradeModal() {
    $('#upgradeModal').classList.remove('active');
}

async function startCheckout() {
    const errEl = $('#checkoutError');
    errEl.classList.remove('visible');
    const btn = $('#checkoutBtn');
    btn.disabled = true;
    btn.textContent = 'Redirecting...';

    try {
        const data = await api('/api/checkout', { method: 'POST' });
        if (data.url) {
            window.location.href = data.url;
        } else {
            throw new Error(data.error || 'Failed to start checkout');
        }
    } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.add('visible');
        btn.disabled = false;
        btn.textContent = 'Subscribe Now';
    }
}

function initCurrency() {
    setCustomSelectValue('settingsCurrencySelect', selectedCurrency);
}

async function init() {
    initTheme();
    initChatbot();

    // Handle Stripe checkout success redirect
    const params = new URLSearchParams(window.location.search);
    if (params.get('upgraded') === 'true') {
        window.history.replaceState({}, '', '/');
    }

    if (authToken) {
        try {
            const data = await api('/api/auth/me');
            currentUser = data.user;
            selectedCurrency = currentUser.currency || 'USD';
            budget = currentUser.budget || 0;
            if (currentUser.theme) localStorage.setItem(THEME_KEY, currentUser.theme);
            showApp();
            updateUserInfo();
            updatePremiumUI();
            initTheme();
            initCurrency();
            updateModalLabels();
            await loadExpensesFromServer();
            refreshAll();

            if (params.get('upgraded') === 'true' && currentUser.premium) {
                setTimeout(() => alert('Premium activated! You now have unlimited access.'), 500);
            }
        } catch (err) {
            if (err.message === 'Invalid token' || err.message === 'No token provided') {
                logout();
            } else {
                showApp();
                refreshAll();
            }
        }
    } else {
        showScreen('landing');
    }
}

// AI Money Assistant Chatbot
const CHAT_RESPONSES = {
    'save money|saving|savings': [
        "Here are proven ways to save more money:",
        "1. The 50/30/20 Rule: 50% needs, 30% wants, 20% savings",
        "2. Automate savings - set up auto-transfers on payday",
        "3. Track every expense (that's what PennyLens helps with!)",
        "4. Cancel unused subscriptions",
        "5. Use the 24-hour rule before big purchases",
        "6. Cook at home more - eating out is the #1 budget killer",
        "7. Shop with a list and never browse without one"
    ],
    'budget|budgeting': [
        "Budgeting is the foundation of financial health:",
        "1. Start by tracking ALL expenses for a month",
        "2. Categorize spending (food, bills, transport, etc.)",
        "3. Set realistic limits per category",
        "4. Use PennyLens's built-in budget tracker!",
        "5. Review and adjust your budget monthly",
        "6. The envelope system works great for variable expenses",
        "7. Always budget for unexpected costs (add 10% buffer)"
    ],
    'invest|investing|stocks|mutual fund': [
        "Investing basics everyone should know:",
        "1. Start early - compound interest is powerful",
        "2. Build an emergency fund first (3-6 months expenses)",
        "3. Index funds are great for beginners (low fees, diversified)",
        "4. Never invest money you'll need within 5 years",
        "5. Diversify - don't put all eggs in one basket",
        "6. Automate investments with SIPs (Systematic Investment Plans)",
        "7. Stay consistent - don't panic during market dips"
    ],
    'debt|loan|credit card': [
        "Debt management strategies:",
        "1. Avalanche method: Pay highest interest rate first",
        "2. Snowball method: Pay smallest balance first (motivational)",
        "3. Never pay just the minimum on credit cards",
        "4. Consider balance transfer for high-interest cards",
        "5. Avoid lifestyle inflation when income increases",
        "6. Negotiate lower interest rates with your bank",
        "7. Stop using credit cards while paying off debt"
    ],
    'income|side hustle|earn more|make money': [
        "Ways to increase your income:",
        "1. Freelancing - leverage your existing skills",
        "2. Start a side business (online services are easiest)",
        "3. Sell unused items around your home",
        "4. Ask for a raise (prepare with evidence of your value)",
        "5. Learn high-income skills (coding, design, sales)",
        "6. Rent out a room or parking space",
        "7. Create digital products (courses, templates, ebooks)"
    ],
    'tax|taxes': [
        "Smart tax strategies:",
        "1. Keep receipts for all business expenses",
        "2. Maximize retirement contributions (tax benefits)",
        "3. Use tax-advantaged accounts (401k, IRA, etc.)",
        "4. Track deductible expenses throughout the year",
        "5. Consider consulting a tax professional for complex situations",
        "6. Don't wait until last minute to file",
        "7. Use PennyLens to export CSV for easy tax reporting!"
    ],
    'emergency fund|emergency': [
        "Emergency fund essentials:",
        "1. Goal: 3-6 months of essential living expenses",
        "2. Keep it in a high-yield savings account",
        "3. Don't invest your emergency fund",
        "4. Build it gradually - even $50/month helps",
        "5. Only use it for TRUE emergencies (job loss, medical)",
        "6. Replenish it immediately after using it",
        "7. Your emergency fund is your #1 financial priority"
    ],
    'hello|hi|hey|help|what can you do': [
        "Hi there! I'm your Money Assistant. Here's what I can help with:",
        "- Saving money tips and strategies",
        "- Budgeting advice",
        "- Investment basics",
        "- Debt management",
        "- Ways to increase income",
        "- Tax planning tips",
        "- Emergency fund guidance",
        "Just ask me anything about personal finance!"
    ],
    'thanks|thank you|thx': [
        "You're welcome! Remember, small steps lead to big financial changes. You've got this!"
    ],
    'tip|advice|suggest': [
        "Here's a quick money tip: Pay yourself first! Before paying bills or spending, transfer at least 10% of your income to savings. It's the simplest wealth-building habit."
    ],
    'retirement|401k|pension': [
        "Retirement planning basics:",
        "1. Start NOW - even small amounts compound over decades",
        "2. Max out employer 401k match (it's free money!)",
        "3. Consider a Roth IRA for tax-free growth",
        "4. Aim to save 15-20% of income for retirement",
        "5. Don't withdraw early - penalties are steep",
        "6. Rebalance your portfolio annually",
        "7. Use a retirement calculator to set targets"
    ]
};

function getChatResponse(input) {
    const lower = input.toLowerCase().trim();
    for (const [keywords, responses] of Object.entries(CHAT_RESPONSES)) {
        const patterns = keywords.split('|');
        if (patterns.some(p => lower.includes(p))) {
            return responses;
        }
    }
    const fallbacks = [
        "That's a great question! Here's some general advice: Track your spending first (PennyLens makes this easy!), set clear financial goals, and review your progress monthly. What specific area would you like help with?",
        "I'm not sure about that specific topic, but I can help with: saving money, budgeting, investing basics, debt management, increasing income, tax tips, and emergency funds. Try asking about any of these!",
        "Great question! While I may not have a specific answer for that, I recommend the 50/30/20 rule as a starting point: 50% on needs, 30% on wants, and 20% on savings. Want to know more about budgeting?"
    ];
    return [fallbacks[Math.floor(Math.random() * fallbacks.length)]];
}

function addChatMessage(text, isBot) {
    const container = $('#chatbotMessages');
    const div = document.createElement('div');
    div.className = `chat-msg ${isBot ? 'bot' : 'user'}`;
    if (isBot) {
        div.innerHTML = `<div class="chat-msg-avatar"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg></div><div class="chat-msg-bubble">${text}</div>`;
    } else {
        div.innerHTML = `<div class="chat-msg-bubble">${text}</div>`;
    }
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function handleChatInput() {
    const input = $('#chatbotInput');
    const text = input.value.trim();
    if (!text) return;
    addChatMessage(text, false);
    input.value = '';
    setTimeout(() => {
        const responses = getChatResponse(text);
        responses.forEach((line, i) => {
            setTimeout(() => addChatMessage(line, true), i * 300);
        });
    }, 500);
}

function initChatbot() {
    const toggle = $('#chatbotToggle');
    const chatWindow = $('#chatbotWindow');
    const close = $('#chatbotClose');
    const send = $('#chatbotSend');
    const input = $('#chatbotInput');
    if (!toggle) return;
    toggle.addEventListener('click', () => {
        chatWindow.classList.toggle('open');
        if (chatWindow.classList.contains('open')) input.focus();
    });
    close.addEventListener('click', () => chatWindow.classList.remove('open'));
    send.addEventListener('click', handleChatInput);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleChatInput(); });
    document.querySelectorAll('.chat-suggestion').forEach(btn => {
        btn.addEventListener('click', () => {
            input.value = btn.dataset.q;
            handleChatInput();
        });
    });
}

init();
