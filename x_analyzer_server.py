import json
import zipfile
import io
import webbrowser
import threading
import time
from fastapi import FastAPI, File, UploadFile
from fastapi.responses import HTMLResponse
import uvicorn
from urllib.parse import urlparse

app = FastAPI(title="X Follow Analyzer Pro Max")

# ==========================================
# 1. CORE LOGIC (BACKEND)
# ==========================================
def extract_username(obj):
    if not isinstance(obj, dict): return ""
    user_link = obj.get("userLink") or obj.get("profileLink") or obj.get("url")
    if isinstance(user_link, str) and user_link:
        try:
            path = urlparse(user_link).path.strip("/")
            if path:
                username = path.split("/")[0]
                if username.lower() not in {"i", "home", "intent", "search"}:
                    return username.lstrip("@")
        except Exception: pass
    username = obj.get("screenName") or obj.get("username") or obj.get("userName") or ""
    if isinstance(username, str): return username.lstrip("@")
    return ""

def process_archive(file_bytes):
    followers = {}
    following = {}
    main_username = ""
    
    with zipfile.ZipFile(io.BytesIO(file_bytes), "r") as z:
        for filename in z.namelist():
            lower = filename.lower()
            if not (lower.endswith(".js") or lower.endswith(".json")): continue
            is_conn = "follower" in lower or "following" in lower
            is_profile = "profile.js" in lower or "account.js" in lower
            if not (is_conn or is_profile): continue
            
            try: raw = z.read(filename).decode("utf-8-sig")
            except Exception: continue
            
            start = raw.find("[")
            if start == -1: continue
            raw_json = raw[start:].strip()
            if raw_json.endswith(";"): raw_json = raw_json[:-1].strip()
            
            try: data = json.loads(raw_json)
            except Exception: continue
            
            if is_profile and not main_username:
                try:
                    if "account.js" in lower: main_username = data[0]["account"]["username"]
                    elif "profile.js" in lower: main_username = data[0]["profile"]["screenName"]
                except Exception: pass

            if is_conn:
                is_follower_file = "follower" in lower and "following" not in lower
                is_following_file = "following" in lower
                for item in data:
                    if not isinstance(item, dict): continue
                    if is_follower_file:
                        obj = item.get("follower", item)
                        if not isinstance(obj, dict): continue
                        aid = obj.get("accountId") or obj.get("id")
                        if aid: followers[str(aid)] = extract_username(obj)
                    elif is_following_file:
                        obj = item.get("following", item)
                        if not isinstance(obj, dict): continue
                        aid = obj.get("accountId") or obj.get("id")
                        if aid: following[str(aid)] = extract_username(obj)
                        
    return followers, following, main_username

@app.post("/api/analyze")
async def analyze_archive(file: UploadFile = File(...)):
    contents = await file.read()
    followers, following, main_username = process_archive(contents)
    
    not_following_ids = set(following.keys()) - set(followers.keys())
    not_following_list = []
    
    for aid in not_following_ids:
        username = following.get(aid, "")
        not_following_list.append({
            "account_id": aid,
            "username": username,
            "url": f"https://x.com/{username}" if username else f"https://x.com/i/user/{aid}"
        })
        
    not_following_list.sort(key=lambda x: (x["username"] or "").lower())
    
    mutuals = len(set(following.keys()).intersection(set(followers.keys())))
    total_following = len(following)
    win_rate = (mutuals / total_following * 100) if total_following > 0 else 0
    ratio = (len(followers) / total_following) if total_following > 0 else 0

    return {
        "account_username": main_username,
        "stats": {
            "followers": len(followers),
            "following": total_following,
            "remaining": len(not_following_list),
            "mutuals": mutuals,
            "win_rate": round(win_rate, 1),
            "ratio": round(ratio, 2)
        },
        "not_following": not_following_list
    }

# ==========================================
# 2. FRONTEND (HTML + Tailwind + Chart.js + i18n + Dark/Light Mode)
# ==========================================
HTML_CONTENT = """
<!DOCTYPE html>
<!-- تغییر جهت به LTR ثابت برای جلوگیری از بهم ریختن دکمه‌ها و لوگو -->
<html lang="fa" dir="ltr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>𝕏 Follow Analyzer</title>
    
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = { darkMode: 'class' }
    </script>
    <script>
        if (localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    </script>
    
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;700;900&display=swap');
        body { font-family: 'Vazirmatn', sans-serif; }
        
        .glass-panel { 
            backdrop-filter: blur(16px); 
            -webkit-backdrop-filter: blur(16px);
        }
        
        .dark .neon-border:hover {
            border-color: rgba(6, 182, 212, 0.5);
            box-shadow: 0 0 15px rgba(6, 182, 212, 0.2);
        }
        .neon-border:hover {
            border-color: rgba(14, 165, 233, 0.5);
            box-shadow: 0 0 15px rgba(14, 165, 233, 0.2);
        }

        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { border-radius: 10px; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #27272a; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #3f3f46; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        
        .tab-active { border-bottom: 2px solid #0ea5e9; color: #0284c7; }
        .dark .tab-active { border-bottom: 2px solid #06b6d4; color: #22d3ee; }
    </style>
</head>
<body class="min-h-screen p-4 md:p-8 transition-colors duration-300 bg-slate-50 dark:bg-[#050505] text-slate-900 dark:text-slate-200">

    <div class="max-w-7xl mx-auto space-y-6">
        
        <!-- Header -->
        <header class="flex justify-between items-center glass-panel p-4 md:p-6 rounded-2xl relative z-20 bg-white/70 dark:bg-[#0f0f0f]/60 border border-slate-200 dark:border-white/5 shadow-xl dark:shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
            <div class="flex items-center gap-4">
                <span class="text-4xl font-black text-slate-800 dark:text-white dark:drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">𝕏</span>
                <div>
                    <h1 class="text-xl md:text-2xl font-bold text-slate-900 dark:text-white tracking-wide" id="main-title">
                        <span data-i18n="appTitle" dir="auto">Follow Analyzer</span> <span class="text-sky-500 dark:text-cyan-400">Pro</span>
                    </h1>
                    <p class="text-xs md:text-sm text-slate-500 dark:text-zinc-500" data-i18n="appSubtitle" dir="auto">Secure & Offline Analysis</p>
                </div>
            </div>
            
            <div class="hidden md:flex items-center gap-4">
                <button onclick="toggleTheme()" id="theme-btn" class="text-xl p-2 rounded-full hover:bg-slate-200 dark:hover:bg-zinc-800 transition-all">
                    🌙
                </button>
                <button onclick="toggleLanguage()" id="lang-btn" class="text-sm font-bold text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-800 transition-all">
                    EN / FA
                </button>
                <label class="cursor-pointer bg-sky-500 hover:bg-sky-600 dark:bg-cyan-600 dark:hover:bg-cyan-500 transition-all text-white px-5 py-2.5 rounded-xl font-bold shadow-[0_4px_15px_rgba(14,165,233,0.3)] dark:shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                    <span data-i18n="uploadBtn" dir="auto">📂 انتخاب X Archive</span>
                    <input type="file" id="fileInput" accept=".zip" class="hidden" onchange="uploadArchive(event)">
                </label>
            </div>

            <button onclick="toggleMenu()" class="md:hidden text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white p-2">
                <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
            </button>
        </header>

        <!-- Mobile Drawer -->
        <div id="mobile-menu" class="fixed inset-y-0 right-0 w-64 glass-panel z-50 transform translate-x-full transition-transform duration-300 md:hidden flex flex-col p-6 gap-6 bg-white/95 dark:bg-[#0f0f0f]/95 border-l border-slate-200 dark:border-zinc-800 shadow-2xl">
            <div class="flex justify-between items-center border-b border-slate-200 dark:border-zinc-800 pb-4">
                <span class="font-bold text-slate-900 dark:text-white" data-i18n="menuTitle" dir="auto">منو</span>
                <button onclick="toggleMenu()" class="text-slate-500 dark:text-zinc-400">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
            <button onclick="toggleTheme();" class="flex items-center gap-3 font-bold text-slate-600 dark:text-zinc-300">
                <span id="mobile-theme-icon">🌙</span> <span data-i18n="switchTheme" dir="auto">تغییر تم</span>
            </button>
            <button onclick="toggleLanguage(); toggleMenu();" class="flex items-center gap-3 font-bold text-slate-600 dark:text-zinc-300">
                🌍 <span data-i18n="switchLang" dir="auto">تغییر زبان (EN/FA)</span>
            </button>
            <label class="cursor-pointer bg-sky-500 dark:bg-cyan-600 flex justify-center items-center text-white px-4 py-3 rounded-xl font-bold">
                <span data-i18n="uploadBtn" dir="auto">📂 انتخاب فایل</span>
                <input type="file" accept=".zip" class="hidden" onchange="uploadArchive(event); toggleMenu();">
            </label>
            <button onclick="clearHistory(); toggleMenu();" class="flex items-center gap-3 text-rose-500 font-bold mt-auto border-t border-slate-200 dark:border-zinc-800 pt-4">
                <span data-i18n="clearHistory" dir="auto">🗑️ پاک کردن تاریخچه</span>
            </button>
        </div>

        <!-- Loading -->
        <div id="loading" class="hidden flex-col items-center justify-center py-20">
            <div class="animate-spin rounded-full h-14 w-14 border-t-2 border-b-2 border-sky-500 dark:border-cyan-500 mb-6 drop-shadow-md dark:shadow-[0_0_15px_rgba(6,182,212,0.5)]"></div>
            <p class="text-sky-600 dark:text-cyan-400 font-bold tracking-widest animate-pulse" data-i18n="loadingText" dir="auto">در حال پردازش...</p>
        </div>

        <!-- Dashboard -->
        <div id="dashboard" class="hidden space-y-6 animate-fade-in">
            <!-- KPIs -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                <div class="glass-panel p-5 rounded-2xl text-center neon-border transition-all bg-white/70 dark:bg-[#0f0f0f]/60 border border-slate-200 dark:border-white/5 shadow-md">
                    <p class="text-slate-500 dark:text-zinc-400 text-xs md:text-sm mb-2" data-i18n="kpiMutuals" dir="auto">دوستان دوطرفه</p>
                    <p class="text-2xl md:text-4xl font-black text-slate-800 dark:text-white" id="kpi-mutuals">0</p>
                </div>
                <div class="glass-panel p-5 rounded-2xl text-center neon-border transition-all bg-white/70 dark:bg-[#0f0f0f]/60 border border-slate-200 dark:border-white/5 shadow-md">
                    <p class="text-slate-500 dark:text-zinc-400 text-xs md:text-sm mb-2" data-i18n="kpiWinrate" dir="auto">نرخ موفقیت</p>
                    <p class="text-2xl md:text-4xl font-black text-emerald-500 dark:text-emerald-400" id="kpi-winrate">0%</p>
                </div>
                <div class="glass-panel p-5 rounded-2xl text-center neon-border transition-all bg-white/70 dark:bg-[#0f0f0f]/60 border border-slate-200 dark:border-white/5 shadow-md">
                    <p class="text-slate-500 dark:text-zinc-400 text-xs md:text-sm mb-2" data-i18n="kpiRatio" dir="auto">نسبت فالوور</p>
                    <p class="text-2xl md:text-4xl font-black text-indigo-500 dark:text-indigo-400" id="kpi-ratio">0.0</p>
                </div>
                <div class="glass-panel p-5 rounded-2xl text-center neon-border transition-all bg-white/70 dark:bg-[#0f0f0f]/60 border border-slate-200 dark:border-white/5 shadow-md">
                    <p class="text-slate-500 dark:text-zinc-400 text-xs md:text-sm mb-2" data-i18n="kpiRemaining" dir="auto">باقیمانده</p>
                    <p class="text-2xl md:text-4xl font-black text-rose-500" id="kpi-remaining">0</p>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <!-- Charts -->
                <div class="lg:col-span-1 space-y-6">
                    <div class="glass-panel p-6 rounded-2xl neon-border transition-all bg-white/70 dark:bg-[#0f0f0f]/60 border border-slate-200 dark:border-white/5 shadow-md">
                        <h3 class="text-slate-700 dark:text-zinc-300 font-bold mb-4 text-center text-sm" data-i18n="chartDist" dir="auto">توزیع ارتباطات</h3>
                        <div class="relative h-48 w-full"><canvas id="donutChart"></canvas></div>
                    </div>
                    <div class="glass-panel p-6 rounded-2xl neon-border transition-all bg-white/70 dark:bg-[#0f0f0f]/60 border border-slate-200 dark:border-white/5 shadow-md">
                        <h3 class="text-slate-700 dark:text-zinc-300 font-bold mb-4 text-center text-sm" data-i18n="chartBalance" dir="auto">تراز حساب</h3>
                        <div class="relative h-40 w-full"><canvas id="barChart"></canvas></div>
                    </div>
                </div>

                <!-- Data Table -->
                <div class="lg:col-span-2 glass-panel rounded-2xl flex flex-col h-[550px] overflow-hidden bg-white/70 dark:bg-[#0f0f0f]/60 border border-slate-200 dark:border-white/5 shadow-md">
                    <!-- Tabs -->
                    <div class="flex border-b border-slate-200 dark:border-zinc-800">
                        <button onclick="switchTab('main')" id="tab-main" class="flex-1 py-4 font-bold tab-active transition-all text-sm">
                            <span data-i18n="tabMain" dir="auto">📊 لیست اصلی</span>
                        </button>
                        <button onclick="switchTab('processed')" id="tab-processed" class="flex-1 py-4 font-bold text-slate-500 dark:text-zinc-500 hover:text-slate-900 dark:hover:text-zinc-300 transition-all text-sm">
                            <span data-i18n="tabProc" dir="auto">✅ بررسی شده‌ها</span> (<span id="proc-count">0</span>)
                        </button>
                    </div>
                    
                    <div class="p-4 flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-100/50 dark:bg-zinc-900/30">
                        <button onclick="openTop10()" class="bg-sky-100 dark:bg-cyan-500/10 text-sky-600 dark:text-cyan-400 border border-sky-300 dark:border-cyan-500/30 hover:bg-sky-500 hover:text-white dark:hover:bg-cyan-500 dark:hover:text-black transition-all px-4 py-2 rounded-lg text-sm font-bold w-full sm:w-auto">
                            <span data-i18n="openTenBtn" dir="auto">🔗 باز کردن ۱۰ پروفایل در مرورگر</span>
                        </button>
                        <button onclick="clearHistory()" class="hidden md:block text-xs text-rose-500 hover:text-rose-600 dark:text-rose-500/70 dark:hover:text-rose-400 transition-colors">
                            <span data-i18n="clearHistory" dir="auto">🗑️ پاک کردن تاریخچه</span>
                        </button>
                    </div>

                    <!-- Table Container -->
                    <div class="flex-1 overflow-y-auto custom-scrollbar p-2">
                        <table class="w-full text-left" dir="ltr">
                            <thead class="text-xs text-slate-500 dark:text-zinc-500 uppercase bg-slate-100 dark:bg-zinc-900/50 sticky top-0 z-10">
                                <tr>
                                    <th class="px-4 py-3 rounded-tl-lg" data-i18n="thUser" dir="auto">Username</th>
                                    <th class="px-4 py-3" data-i18n="thId" dir="auto">Account ID</th>
                                    <th class="px-4 py-3 rounded-tr-lg text-right" data-i18n="thAction" dir="auto">Action</th>
                                </tr>
                            </thead>
                            <tbody id="table-body" class="divide-y divide-slate-100 dark:divide-zinc-800/50 text-sm">
                                <!-- Rows -->
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        const i18n = {
            fa: {
                appTitle: "Follow Analyzer", appSubtitle: "تحلیل کاملاً آفلاین و امن", uploadBtn: "📂 انتخاب X Archive",
                menuTitle: "منوی ابزارها", switchLang: "تغییر زبان به انگلیسی", switchTheme: "تغییر تم (تاریک/روشن)",
                clearHistory: "🗑️ پاک کردن تاریخچه", loadingText: "در حال پردازش فایل زیپ...",
                kpiMutuals: "دوستان دوطرفه (Mutuals)", kpiWinrate: "نرخ موفقیت (Win Rate)",
                kpiRatio: "نسبت فالوور/فالویینگ", kpiRemaining: "لیست باقیمانده",
                chartDist: "توزیع وضعیت ارتباطات", chartBalance: "تراز حساب (Balance)",
                tabMain: "📊 لیست اصلی", tabProc: "✅ بررسی شده‌ها", openTenBtn: "🔗 باز کردن ۱۰ پروفایل اول",
                thUser: "یوزرنیم", thId: "آیدی عددی", thAction: "عملیات", openBtn: "باز کردن ↗",
                chartLblMutual: "دوطرفه", chartLblNotFollowing: "فالوبک نداده"
            },
            en: {
                appTitle: "Follow Analyzer", appSubtitle: "Secure & Offline Analysis", uploadBtn: "📂 Select X Archive",
                menuTitle: "Menu", switchLang: "Switch to Persian", switchTheme: "Toggle Theme (Dark/Light)",
                clearHistory: "🗑️ Clear History", loadingText: "Processing Archive ZIP...",
                kpiMutuals: "Mutual Friends", kpiWinrate: "Win Rate", kpiRatio: "Follower Ratio",
                kpiRemaining: "Remaining Users", chartDist: "Connections Distribution", chartBalance: "Account Balance",
                tabMain: "📊 Main List", tabProc: "✅ Processed", openTenBtn: "🔗 Open Top 10 Profiles",
                thUser: "Username", thId: "Account ID", thAction: "Action", openBtn: "Open ↗",
                chartLblMutual: "Mutuals", chartLblNotFollowing: "Not Following Back"
            }
        };

        let currentLang = 'fa';
        let allUnfollowers = [];
        let processedIds = JSON.parse(localStorage.getItem('x_processed_ids')) || [];
        let currentTab = 'main';
        let donutChartObj = null;
        let barChartObj = null;
        let lastStats = null;

        function toggleTheme() {
            const isDark = document.documentElement.classList.toggle('dark');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            document.getElementById('theme-btn').innerText = isDark ? '☀️' : '🌙';
            document.getElementById('mobile-theme-icon').innerText = isDark ? '☀️' : '🌙';
            if (lastStats) renderCharts(lastStats);
        }
        
        if (document.documentElement.classList.contains('dark')) {
            document.getElementById('theme-btn').innerText = '☀️';
            document.getElementById('mobile-theme-icon').innerText = '☀️';
        }

        function toggleLanguage() {
            currentLang = currentLang === 'fa' ? 'en' : 'fa';
            document.documentElement.lang = currentLang;
            
            document.querySelectorAll('[data-i18n]').forEach(el => {
                const key = el.getAttribute('data-i18n');
                if (i18n[currentLang][key]) {
                    if (el.tagName === 'INPUT' && el.type === 'button') el.value = i18n[currentLang][key];
                    else el.innerText = i18n[currentLang][key];
                }
            });
            if (lastStats) renderCharts(lastStats);
            renderTable();
        }

        function toggleMenu() {
            const menu = document.getElementById('mobile-menu');
            menu.classList.toggle('translate-x-full');
            menu.classList.toggle('translate-x-0');
        }

        async function uploadArchive(event) {
            const file = event.target.files[0];
            if (!file) return;

            document.getElementById('dashboard').classList.add('hidden');
            document.getElementById('loading').classList.remove('hidden');
            document.getElementById('loading').classList.add('flex');

            const formData = new FormData();
            formData.append("file", file);

            try {
                const response = await fetch('/api/analyze', { method: 'POST', body: formData });
                const data = await response.json();
                
                if (data.account_username) {
                    const titleBase = i18n[currentLang]['appTitle'];
                    document.getElementById('main-title').innerHTML = `<span data-i18n="appTitle" dir="auto">${titleBase}</span> <span class="text-sky-500 dark:text-cyan-400">@${data.account_username}</span>`;
                }

                allUnfollowers = data.not_following;
                lastStats = data.stats;
                updateDashboard(data.stats);
                renderTable();

                document.getElementById('loading').classList.add('hidden');
                document.getElementById('loading').classList.remove('flex');
                document.getElementById('dashboard').classList.remove('hidden');
            } catch (error) {
                alert(currentLang === 'fa' ? "خطا در پردازش فایل." : "Error processing file.");
                document.getElementById('loading').classList.add('hidden');
                document.getElementById('loading').classList.remove('flex');
            }
            event.target.value = ''; 
        }

        function updateDashboard(stats) {
            document.getElementById('kpi-mutuals').innerText = stats.mutuals.toLocaleString();
            document.getElementById('kpi-winrate').innerText = stats.win_rate + '%';
            document.getElementById('kpi-ratio').innerText = stats.ratio;
            const remaining = allUnfollowers.filter(u => !processedIds.includes(u.account_id)).length;
            document.getElementById('kpi-remaining').innerText = remaining.toLocaleString();
            document.getElementById('proc-count').innerText = processedIds.length;
            renderCharts(stats);
        }

        function renderCharts(stats) {
            const isDark = document.documentElement.classList.contains('dark');
            Chart.defaults.color = isDark ? '#71717a' : '#64748b'; 
            Chart.defaults.font.family = 'Vazirmatn';

            const donutColors = isDark ? ['#06b6d4', '#18181b'] : ['#0ea5e9', '#e2e8f0'];
            const donutBorders = isDark ? ['#0891b2', '#27272a'] : ['#0284c7', '#cbd5e1'];
            const barColors = isDark ? ['#06b6d4', '#3f3f46'] : ['#0ea5e9', '#94a3b8'];
            const gridColor = isDark ? '#27272a' : '#e2e8f0';

            if(donutChartObj) donutChartObj.destroy();
            const ctx1 = document.getElementById('donutChart').getContext('2d');
            donutChartObj = new Chart(ctx1, {
                type: 'doughnut',
                data: {
                    labels: [i18n[currentLang]['chartLblMutual'], i18n[currentLang]['chartLblNotFollowing']],
                    datasets: [{
                        data: [stats.mutuals, stats.following - stats.mutuals],
                        backgroundColor: donutColors,
                        borderColor: donutBorders,
                        borderWidth: 1, hoverOffset: 4
                    }]
                },
                options: { cutout: '75%', maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
            });

            if(barChartObj) barChartObj.destroy();
            const ctx2 = document.getElementById('barChart').getContext('2d');
            barChartObj = new Chart(ctx2, {
                type: 'bar',
                data: {
                    labels: ['Followers', 'Following'],
                    datasets: [{ data: [stats.followers, stats.following], backgroundColor: barColors, borderRadius: 4 }]
                },
                options: {
                    maintainAspectRatio: false, plugins: { legend: { display: false } },
                    scales: { 
                        y: { grid: { color: gridColor }, border: { display: false } },
                        x: { grid: { display: false }, border: { display: false } }
                    }
                }
            });
        }

        function switchTab(tab) {
            currentTab = tab;
            const mainBtn = document.getElementById('tab-main');
            const procBtn = document.getElementById('tab-processed');
            
            if(tab === 'main') {
                mainBtn.className = "flex-1 py-4 font-bold tab-active transition-all text-sm";
                procBtn.className = "flex-1 py-4 font-bold text-slate-500 dark:text-zinc-500 hover:text-slate-900 dark:hover:text-zinc-300 transition-all text-sm";
            } else {
                procBtn.className = "flex-1 py-4 font-bold tab-active transition-all text-sm";
                mainBtn.className = "flex-1 py-4 font-bold text-slate-500 dark:text-zinc-500 hover:text-slate-900 dark:hover:text-zinc-300 transition-all text-sm";
            }
            renderTable();
        }

        function renderTable() {
            const tbody = document.getElementById('table-body');
            tbody.innerHTML = '';
            
            let displayData = [];
            if (currentTab === 'main') {
                displayData = allUnfollowers.filter(u => !processedIds.includes(u.account_id));
                document.getElementById('kpi-remaining').innerText = displayData.length.toLocaleString();
            } else {
                displayData = allUnfollowers.filter(u => processedIds.includes(u.account_id));
            }
            document.getElementById('proc-count').innerText = processedIds.length;

            displayData.forEach(user => {
                const displayName = user.username ? `@${user.username}` : '<span class="text-slate-400 dark:text-zinc-600 italic">N/A</span>';
                const tr = document.createElement('tr');
                tr.className = "hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors group";
                tr.innerHTML = `
                    <td class="px-4 py-3 font-medium text-slate-800 dark:text-zinc-200">${displayName}</td>
                    <td class="px-4 py-3 text-slate-500 dark:text-zinc-500 font-mono text-xs">${user.account_id}</td>
                    <td class="px-4 py-3 text-right">
                        <button onclick="openProfile('${user.url}', '${user.account_id}')" class="bg-slate-200 dark:bg-zinc-800 group-hover:bg-sky-500 dark:group-hover:bg-cyan-600 text-slate-700 dark:text-zinc-300 group-hover:text-white px-3 py-1.5 rounded text-xs font-bold transition-all" dir="auto">
                            ${i18n[currentLang]['openBtn']}
                        </button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }

        function openProfile(url, accountId) {
            window.open(url, '_blank');
            if (!processedIds.includes(accountId)) {
                processedIds.push(accountId);
                localStorage.setItem('x_processed_ids', JSON.stringify(processedIds));
                renderTable();
            }
        }

        function openTop10() {
            if (currentTab !== 'main') return;
            const top10 = allUnfollowers.filter(u => !processedIds.includes(u.account_id)).slice(0, 10);
            if (top10.length === 0) return;
            
            top10.forEach((user, index) => {
                setTimeout(() => {
                    window.open(user.url, '_blank');
                    if (!processedIds.includes(user.account_id)) {
                        processedIds.push(user.account_id);
                    }
                    if (index === top10.length - 1) {
                        localStorage.setItem('x_processed_ids', JSON.stringify(processedIds));
                        renderTable();
                    }
                }, index * 200); 
            });
        }

        function clearHistory() {
            const msg = currentLang === 'fa' ? "آیا از پاک کردن تاریخچه اطمینان دارید؟" : "Are you sure you want to clear history?";
            if(confirm(msg)) {
                processedIds = [];
                localStorage.removeItem('x_processed_ids');
                renderTable();
            }
        }
        
        toggleLanguage(); toggleLanguage();
    </script>
</body>
</html>
"""

@app.get("/", response_class=HTMLResponse)
async def serve_frontend():
    return HTMLResponse(content=HTML_CONTENT, status_code=200)

# ==========================================
# 3. AUTO-LAUNCHER
# ==========================================
def open_browser():
    time.sleep(1.5)
    webbrowser.open("http://127.0.0.1:8000")

if __name__ == "__main__":
    print("🚀 Starting X Follow Analyzer Server with Light/Dark Modes...")
    threading.Thread(target=open_browser, daemon=True).start()
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="warning")