import json
import re
import zipfile
import webbrowser
import os
import time
import tkinter as tk
from tkinter import filedialog, messagebox, ttk
from urllib.parse import urlparse
from openpyxl import Workbook

# ==========================================
# UI/UX PRO MAX - THEME PALETTES
# ==========================================
THEMES = {
    "dark": {
        "bg_main": "#000000",       
        "bg_sec": "#16181c",        
        "fg_main": "#e7e9ea",       
        "fg_sec": "#71767b",        
        "accent": "#1d9bf0",        
        "btn_bg": "#2f3336",        # رنگ جدید دکمه در دارک مود (خاکستری تیره)
        "btn_fg": "#e7e9ea",        
        "btn_hover": "#3e4144",     
        "border": "#2f3336",
        "row_even": "#16181c",
        "row_odd": "#1c1f23"
    },
    "light": {
        "bg_main": "#ffffff",       
        "bg_sec": "#f7f9f9",        
        "fg_main": "#0f1419",       
        "fg_sec": "#536471",        
        "accent": "#1d9bf0",        
        "btn_bg": "#0f1419",        # رنگ جدید دکمه در لایت مود (مشکی تیره)
        "btn_fg": "#ffffff",        
        "btn_hover": "#272c30",     
        "border": "#eff3f4",
        "row_even": "#ffffff",
        "row_odd": "#f7f9f9"
    }
}

HISTORY_FILE = "processed_history.json"


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


def parse_archive_object(data, filename, followers, following):
    if not isinstance(data, list): return
    lower = filename.lower()
    is_follower_file = "follower" in lower and "following" not in lower
    is_following_file = "following" in lower

    for item in data:
        if not isinstance(item, dict): continue
        if is_follower_file:
            obj = item.get("follower", item)
            if not isinstance(obj, dict): continue
            account_id = obj.get("accountId") or obj.get("id")
            username = extract_username(obj)
            if account_id: followers[str(account_id)] = username
        elif is_following_file:
            obj = item.get("following", item)
            if not isinstance(obj, dict): continue
            account_id = obj.get("accountId") or obj.get("id")
            username = extract_username(obj)
            if account_id: following[str(account_id)] = username


def load_x_archive(zip_path):
    followers = {}
    following = {}
    main_username = ""  # یوزرنیم صاحب فایل
    
    with zipfile.ZipFile(zip_path, "r") as z:
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
            
            # پیدا کردن یوزرنیم اکانت اصلی
            if is_profile and not main_username:
                try:
                    if "account.js" in lower:
                        main_username = data[0]["account"]["username"]
                    elif "profile.js" in lower:
                        main_username = data[0]["profile"]["screenName"]
                except Exception:
                    pass

            if is_conn:
                parse_archive_object(data, filename, followers, following)
                
    return followers, following, main_username


class App:
    def __init__(self, root):
        self.root = root
        self.root.title("X Follow Analyzer - Pro Max")
        self.root.geometry("1200x750")
        self.root.minsize(950, 650)
        
        self.current_theme = "dark"
        
        self.followers = {}
        self.following = {}
        self.not_following = []
        self.processed_users = []
        self.saved_processed_ids = self.load_history()
        self.account_username = ""

        self.dynamic_widgets = {'bg_main': [], 'bg_sec': [], 'fg_main': [], 'fg_sec': [], 'buttons': []}

        self.build_ui()
        self.apply_theme() 

    def build_ui(self):
        # ================= HEADER =================
        self.header_frame = tk.Frame(self.root)
        self.header_frame.pack(fill="x", padx=20, pady=(20, 10))
        self.dynamic_widgets['bg_main'].append(self.header_frame)

        logo_label = tk.Label(self.header_frame, text="𝕏", font=("Segoe UI", 32, "bold"))
        logo_label.pack(side="left", padx=(0, 10))
        self.dynamic_widgets['bg_main'].append(logo_label)
        self.dynamic_widgets['fg_main'].append(logo_label)

        self.title_label = tk.Label(self.header_frame, text="Follow Analyzer", font=("Segoe UI", 18, "bold"))
        self.title_label.pack(side="left")
        self.dynamic_widgets['bg_main'].append(self.title_label)
        self.dynamic_widgets['fg_main'].append(self.title_label)

        self.theme_btn = tk.Button(self.header_frame, text="☀️ Light Mode", font=("Segoe UI", 10, "bold"), 
                                   command=self.toggle_theme, cursor="hand2", relief="flat", borderwidth=0, padx=15, pady=5)
        self.theme_btn.pack(side="right")
        self.dynamic_widgets['buttons'].append(self.theme_btn)

        # ================= CONTROLS & STATS =================
        controls_frame = tk.Frame(self.root)
        controls_frame.pack(fill="x", padx=20, pady=5)
        self.dynamic_widgets['bg_main'].append(controls_frame)

        self.create_button(controls_frame, "📂 انتخاب X Archive", self.select_zip).pack(side="left", padx=(0, 5))
        self.create_button(controls_frame, "🔗 باز کردن ۱۰ پروفایل اول", self.open_top_10).pack(side="left", padx=5)
        self.create_button(controls_frame, "🗑️ پاک کردن تاریخچه", self.clear_history).pack(side="left", padx=5)

        self.stats_frame = tk.Frame(controls_frame, padx=15, pady=8)
        self.stats_frame.pack(side="right")
        self.dynamic_widgets['bg_sec'].append(self.stats_frame)
        
        self.stats_lbl = tk.Label(self.stats_frame, text="Followers: 0   |   Following: 0   |   Remaining: 0   |   Processed: 0", 
                                  font=("Segoe UI", 11, "bold"))
        self.stats_lbl.pack()
        self.dynamic_widgets['bg_sec'].append(self.stats_lbl)
        self.dynamic_widgets['fg_main'].append(self.stats_lbl)

        # ================= NOTEBOOK (TABS) =================
        self.notebook = ttk.Notebook(self.root)
        self.notebook.pack(fill="both", expand=True, padx=20, pady=15)

        self.tab_main = tk.Frame(self.notebook)
        self.tab_processed = tk.Frame(self.notebook)
        self.dynamic_widgets['bg_main'].extend([self.tab_main, self.tab_processed])

        self.notebook.add(self.tab_main, text=" 📊 لیست اصلی (فالوبک نداده‌ها) ")
        self.notebook.add(self.tab_processed, text=" ✅ بررسی شده‌ها (ذخیره شده) ")

        columns = ("username", "user_id", "url")

        self.table = ttk.Treeview(self.tab_main, columns=columns, show="headings", selectmode="browse")
        self.setup_treeview(self.table)
        scroll_m = ttk.Scrollbar(self.tab_main, orient="vertical", command=self.table.yview)
        self.table.configure(yscrollcommand=scroll_m.set)
        self.table.pack(side="left", fill="both", expand=True)
        scroll_m.pack(side="right", fill="y")
        self.table.bind("<Double-1>", lambda e: self.open_selected_profile())

        self.processed_table = ttk.Treeview(self.tab_processed, columns=columns, show="headings", selectmode="browse")
        self.setup_treeview(self.processed_table)
        scroll_p = ttk.Scrollbar(self.tab_processed, orient="vertical", command=self.processed_table.yview)
        self.processed_table.configure(yscrollcommand=scroll_p.set)
        self.processed_table.pack(side="left", fill="both", expand=True)
        scroll_p.pack(side="right", fill="y")
        self.processed_table.bind("<Double-1>", lambda e: self.open_processed_profile())

        # ================= FOOTER =================
        footer_frame = tk.Frame(self.root)
        footer_frame.pack(fill="x", padx=20, pady=(0, 20))
        self.dynamic_widgets['bg_main'].append(footer_frame)

        self.create_button(footer_frame, "📊 Export Excel", self.export_excel).pack(side="left")

        self.info_lbl = tk.Label(footer_frame, text="وضعیت: منتظر دریافت فایل زیپ...", font=("Segoe UI", 10))
        self.info_lbl.pack(side="right")
        self.dynamic_widgets['bg_main'].append(self.info_lbl)
        self.dynamic_widgets['fg_sec'].append(self.info_lbl)

    def create_button(self, parent, text, command):
        btn = tk.Button(parent, text=text, font=("Segoe UI", 10, "bold"), command=command,
                        cursor="hand2", relief="flat", borderwidth=0, padx=15, pady=8)
        self.dynamic_widgets['buttons'].append(btn)
        return btn

    def setup_treeview(self, tree):
        tree.heading("username", text="Username")
        tree.heading("user_id", text="Account ID")
        tree.heading("url", text="X Profile URL")
        tree.column("username", width=250, anchor="w")
        tree.column("user_id", width=200, anchor="w")
        tree.column("url", width=500, anchor="w")
        
        tree.tag_configure("evenrow", font=("Segoe UI", 10))
        tree.tag_configure("oddrow", font=("Segoe UI", 10))

    def toggle_theme(self):
        self.current_theme = "light" if self.current_theme == "dark" else "dark"
        btn_text = "🌙 Dark Mode" if self.current_theme == "light" else "☀️ Light Mode"
        self.theme_btn.config(text=btn_text)
        self.apply_theme()

    def apply_theme(self):
        t = THEMES[self.current_theme]
        
        self.root.configure(bg=t['bg_main'])
        for w in self.dynamic_widgets['bg_main']: w.configure(bg=t['bg_main'])
        for w in self.dynamic_widgets['bg_sec']: w.configure(bg=t['bg_sec'])
        for w in self.dynamic_widgets['fg_main']: w.configure(fg=t['fg_main'])
        for w in self.dynamic_widgets['fg_sec']: w.configure(fg=t['fg_sec'])
        
        for btn in self.dynamic_widgets['buttons']:
            btn.configure(bg=t['btn_bg'], fg=t['btn_fg'], activebackground=t['btn_hover'], activeforeground=t['btn_fg'])

        style = ttk.Style()
        style.theme_use("clam")
        
        style.configure("TNotebook", background=t['bg_main'], borderwidth=0)
        style.configure("TNotebook.Tab", background=t['bg_main'], foreground=t['fg_sec'], 
                        padding=[20, 8], font=("Segoe UI", 10, "bold"), borderwidth=0)
        style.map("TNotebook.Tab", background=[("selected", t['bg_sec'])], foreground=[("selected", t['accent'])])

        style.configure("Treeview", background=t['bg_sec'], foreground=t['fg_main'], fieldbackground=t['bg_sec'], 
                        rowheight=35, borderwidth=0, font=("Segoe UI", 10))
        style.map("Treeview", background=[("selected", t['accent'])], foreground=[("selected", "#ffffff")])
        
        style.configure("Treeview.Heading", background=t['bg_main'], foreground=t['fg_sec'], 
                        font=("Segoe UI", 10, "bold"), borderwidth=0, padding=[0, 8])
        style.map("Treeview.Heading", background=[("active", t['bg_sec'])])

        style.configure("Vertical.TScrollbar", background=t['bg_sec'], troughcolor=t['bg_main'], 
                        arrowcolor=t['fg_main'], borderwidth=0, relief="flat")

        self.table.tag_configure("evenrow", background=t['row_even'])
        self.table.tag_configure("oddrow", background=t['row_odd'])
        self.processed_table.tag_configure("evenrow", background=t['row_even'])
        self.processed_table.tag_configure("oddrow", background=t['row_odd'])

    def load_history(self):
        if os.path.exists(HISTORY_FILE):
            try:
                with open(HISTORY_FILE, "r", encoding="utf-8") as f: return set(json.load(f))
            except: return set()
        return set()

    def save_history(self):
        try:
            with open(HISTORY_FILE, "w", encoding="utf-8") as f: json.dump(list(self.saved_processed_ids), f)
        except Exception as e: print(f"Error saving history: {e}")

    def clear_history(self):
        if messagebox.askyesno("تایید", "آیا مطمئن هستید که می‌خواهید تاریخچه بررسی‌شده‌ها پاک شود؟"):
            self.saved_processed_ids.clear()
            self.save_history()
            messagebox.showinfo("انجام شد", "تاریخچه پاک شد. لطفا فایل ZIP را دوباره انتخاب کنید.")

    def update_stats_label(self):
        self.stats_lbl.config(
            text=f"👥 Followers: {len(self.followers):,}   |   👤 Following: {len(self.following):,}   |   "
                 f"⏳ Remaining: {len(self.not_following):,}   |   ✅ Processed: {len(self.processed_users):,}"
        )

    def select_zip(self):
        path = filedialog.askopenfilename(title="Select X Archive", filetypes=[("X Archive ZIP", "*.zip")])
        if not path: return

        self.info_lbl.config(text="در حال پردازش فایل، لطفا صبر کنید...")
        self.root.update()

        try:
            self.followers, self.following, self.account_username = load_x_archive(path)
            not_following_ids = set(self.following.keys()) - set(self.followers.keys())
            
            # تغییر عنوان هدر در صورتی که یوزرنیم پیدا شود
            title_text = f"Follow Analyzer - @{self.account_username}" if self.account_username else "Follow Analyzer"
            self.title_label.config(text=title_text)

            self.not_following.clear()
            self.processed_users.clear()
            self.table.delete(*self.table.get_children())
            self.processed_table.delete(*self.processed_table.get_children())

            missing_usernames = 0

            for account_id in not_following_ids:
                username = self.following.get(account_id, "")
                if account_id in self.saved_processed_ids: self.processed_users.append((account_id, username))
                else: self.not_following.append((account_id, username))

            self.not_following.sort(key=lambda x: (x[1] or "").lower())
            self.processed_users.sort(key=lambda x: (x[1] or "").lower())

            for i, (account_id, username) in enumerate(self.not_following):
                url = f"https://x.com/{username}" if username else f"https://x.com/i/user/{account_id}"
                if not username: missing_usernames += 1
                tag = "evenrow" if i % 2 == 0 else "oddrow"
                self.table.insert("", "end", values=(f"@{username}" if username else "N/A", account_id, url), tags=(tag,))

            for i, (account_id, username) in enumerate(self.processed_users):
                url = f"https://x.com/{username}" if username else f"https://x.com/i/user/{account_id}"
                tag = "evenrow" if i % 2 == 0 else "oddrow"
                self.processed_table.insert("", "end", values=(f"@{username}" if username else "N/A", account_id, url), tags=(tag,))

            self.update_stats_label()
            
            if missing_usernames:
                self.info_lbl.config(text=f"✅ تحلیل انجام شد ({missing_usernames:,} آیدی بدون یوزرنیم)")
            else:
                self.info_lbl.config(text="✅ تحلیل با موفقیت انجام شد.")

            self.notebook.select(self.tab_main)

        except zipfile.BadZipFile:
            messagebox.showerror("Error", "فایل انتخاب‌شده ZIP معتبر نیست.")
            self.info_lbl.config(text="❌ خطا در خواندن فایل")
        except Exception as e:
            messagebox.showerror("Error", f"مشکلی در خواندن آرشیو ایجاد شد:\n\n{e}")
            self.info_lbl.config(text="❌ خطا در پردازش")

    def _move_row_to_processed(self, item_id, values):
        """تابع کمکی برای جابجایی یک ردیف از لیست اصلی به بررسی شده‌ها"""
        account_id = str(values[1])
        self.table.delete(item_id)
        
        tag = "evenrow" if len(self.processed_table.get_children()) % 2 == 0 else "oddrow"
        self.processed_table.insert("", "end", values=values, tags=(tag,))

        self.saved_processed_ids.add(account_id)

        for i, user in enumerate(self.not_following):
            if str(user[0]) == account_id:
                self.processed_users.append(self.not_following.pop(i))
                break

    def open_top_10(self):
        children = self.table.get_children()
        if not children:
            messagebox.showinfo("خالی", "لیست اصلی خالی است و کسی برای بررسی وجود ندارد.")
            return

        top_10 = children[:10]
        
        self.info_lbl.config(text="⏳ در حال باز کردن ۱۰ پروفایل...")
        self.root.update()

        for item_id in top_10:
            values = self.table.item(item_id, "values")
            if len(values) < 3: continue
            url = values[2]
            
            webbrowser.open_new_tab(url)
            time.sleep(0.1) # مکث کوتاه برای جلوگیری از هنگ کردن مرورگر
            
            self._move_row_to_processed(item_id, values)

        self.save_history()
        self.update_stats_label()
        
        # اصلاح رنگ‌های لیست اصلی
        for i, child in enumerate(self.table.get_children()):
            self.table.item(child, tags=("evenrow" if i % 2 == 0 else "oddrow",))
            
        self.info_lbl.config(text="✅ ۱۰ پروفایل باز شده و به تاریخچه اضافه شدند.")

    def open_selected_profile(self):
        selection = self.table.selection()
        if not selection: return

        for item_id in selection:
            values = self.table.item(item_id, "values")
            if len(values) < 3: continue

            webbrowser.open_new_tab(values[2])
            self._move_row_to_processed(item_id, values)

        self.save_history()
        self.update_stats_label()
        
        for i, child in enumerate(self.table.get_children()):
            self.table.item(child, tags=("evenrow" if i % 2 == 0 else "oddrow",))

    def open_processed_profile(self):
        selection = self.processed_table.selection()
        if not selection: return
        for item_id in selection:
            values = self.processed_table.item(item_id, "values")
            if len(values) >= 3: webbrowser.open_new_tab(values[2])

    def export_excel(self):
        if not self.not_following and not self.processed_users:
            messagebox.showwarning("هشدار", "ابتدا یک فایل آرشیو وارد کنید.")
            return

        path = filedialog.asksaveasfilename(title="Save Excel", defaultextension=".xlsx", filetypes=[("Excel", "*.xlsx")])
        if not path: return

        wb = Workbook()
        ws_main = wb.active
        ws_main.title = "Remaining Not Following"
        self._populate_excel_sheet(ws_main, self.not_following)

        ws_proc = wb.create_sheet(title="Processed Users")
        self._populate_excel_sheet(ws_proc, self.processed_users)

        wb.save(path)
        messagebox.showinfo("موفق", f"فایل با موفقیت ذخیره شد:\n{path}")

    def _populate_excel_sheet(self, ws, data_list):
        ws.append(["Username", "Account ID", "X Profile URL"])
        for account_id, username in data_list:
            profile = f"https://x.com/{username}" if username else f"https://x.com/i/user/{account_id}"
            ws.append([f"@{username}" if username else "N/A", account_id, profile])
        ws.column_dimensions["A"].width = 25
        ws.column_dimensions["B"].width = 25
        ws.column_dimensions["C"].width = 50

if __name__ == "__main__":
    root = tk.Tk()
    app = App(root)
    root.mainloop()